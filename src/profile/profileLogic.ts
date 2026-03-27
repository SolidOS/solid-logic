import { literal, NamedNode, st, sym } from 'rdflib'
import { ACL_LINK } from '../acl/aclLogic'
import { CrossOriginForbiddenError, FetchError, NotEditableError, SameOriginForbiddenError, UnauthorizedError, WebOperationError } from '../logic/CustomError'
import * as debug from '../util/debug'
import { ns as namespace } from '../util/ns'
import { differentOrigin, suggestPreferencesFile } from '../util/utils'
import { ProfileLogic } from '../types'

export function createProfileLogic(store, authn, utilityLogic): ProfileLogic {
    const ns = namespace

    function isAbsoluteHttpUri(uri: string | null | undefined): boolean {
        return !!uri && (uri.startsWith('https://') || uri.startsWith('http://'))
    }

    function docDirUri(node: NamedNode): string | null {
        const doc = node.doc()
        const dir = doc.dir()
        if (dir?.uri && isAbsoluteHttpUri(dir.uri)) return dir.uri
        const docUri = doc.uri
        if (!docUri || !isAbsoluteHttpUri(docUri)) return null
        const withoutFragment = docUri.split('#')[0]
        const lastSlash = withoutFragment.lastIndexOf('/')
        if (lastSlash === -1) return null
        return withoutFragment.slice(0, lastSlash + 1)
    }

    function suggestTypeIndexInPreferences(preferencesFile: NamedNode, filename: string): NamedNode {
        const dirUri = docDirUri(preferencesFile)
        if (!dirUri) throw new Error(`Cannot derive directory for preferences file ${preferencesFile.uri}`)
        return sym(dirUri + filename)
    }

    function isNotFoundError(err: any): boolean {
        if (err?.response?.status === 404) return true
        const text = `${err?.message || err || ''}`
        return text.includes('404') || text.includes('Not Found')
    }

    function ownerOnlyContainerAcl(webId: string): string {
        return [
            '@prefix acl: <http://www.w3.org/ns/auth/acl#>.',
            '',
            '<#owner>',
            'a acl:Authorization;',
            `acl:agent <${webId}>;`,
            'acl:accessTo <./>;',
            'acl:default <./>;',
            'acl:mode acl:Read, acl:Write, acl:Control.'
        ].join('\n')
    }

    function publicTypeIndexAcl(webId: string, publicTypeIndex: NamedNode): string {
        const fileName = new URL(publicTypeIndex.uri).pathname.split('/').pop() || 'publicTypeIndex.ttl'
        return [
            '# ACL resource for the Public Type Index',
            '',
            '@prefix acl: <http://www.w3.org/ns/auth/acl#>.',
            '@prefix foaf: <http://xmlns.com/foaf/0.1/>.',
            '',
            '<#owner>',
            '    a acl:Authorization;',
            '',
            '    acl:agent',
            `        <${webId}>;`,
            '',
            `    acl:accessTo <./${fileName}>;`,
            '',
            '    acl:mode',
            '        acl:Read, acl:Write, acl:Control.',
            '',
            '# Public-readable',
            '<#public>',
            '    a acl:Authorization;',
            '',
            '    acl:agentClass foaf:Agent;',
            '',
            `    acl:accessTo <./${fileName}>;`,
            '',
            '    acl:mode acl:Read.'
        ].join('\n')
    }

    async function ensureContainerExists(containerUri: string): Promise<void> {
        const containerNode = sym(containerUri)
        try {
            await store.fetcher.load(containerNode)
            return
        } catch (err) {
            if (!isNotFoundError(err)) throw err
        }
        const result = await store.fetcher._fetch(containerUri, {
            method: 'PUT',
            headers: {
                'Content-Type': 'text/turtle',
                'If-None-Match': '*',
                Link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
            },
            body: ' '
        })
        if (result.status.toString()[0] !== '2') {
            throw new Error(`Not OK: got ${result.status} response while creating container at ${containerUri}`)
        }
    }

    async function ensureOwnerOnlyAclForSettings(user: NamedNode, preferencesFile: NamedNode): Promise<void> {
        const dirUri = docDirUri(preferencesFile)
        if (!dirUri) throw new Error(`Cannot derive settings directory from ${preferencesFile.uri}`)
        await ensureContainerExists(dirUri)

        const containerNode = sym(dirUri)
        let aclDocUri: string | undefined
        try {
            await store.fetcher.load(containerNode)
            aclDocUri = store.any(containerNode, ACL_LINK)?.value
        } catch (err) {
            if (!isNotFoundError(err)) throw err
        }
        if (!aclDocUri) {
            // Fallback for servers/tests where rel=acl is not exposed in mocked headers.
            aclDocUri = `${dirUri}.acl`
        }
        const aclDoc = sym(aclDocUri)
        try {
            await store.fetcher.load(aclDoc)
            return
        } catch (err) {
            if (!isNotFoundError(err)) throw err
        }

        await store.fetcher.webOperation('PUT', aclDoc.uri, {
            data: ownerOnlyContainerAcl(user.uri),
            contentType: 'text/turtle'
        })
    }

    async function ensurePublicTypeIndexAclOnCreate(user: NamedNode, publicTypeIndex: NamedNode): Promise<void> {
        let created = false
        try {
            await store.fetcher.load(publicTypeIndex)
        } catch (err) {
            if (!isNotFoundError(err)) throw err
            await utilityLogic.loadOrCreateIfNotExists(publicTypeIndex)
            created = true
        }
        if (!created) return

        let aclDocUri: string | undefined
        try {
            await store.fetcher.load(publicTypeIndex)
            aclDocUri = store.any(publicTypeIndex, ACL_LINK)?.value
        } catch (err) {
            if (!isNotFoundError(err)) throw err
        }
        if (!aclDocUri) {
            aclDocUri = `${publicTypeIndex.uri}.acl`
        }

        const aclDoc = sym(aclDocUri)
        try {
            await store.fetcher.load(aclDoc)
            return
        } catch (err) {
            if (!isNotFoundError(err)) throw err
        }

        await store.fetcher.webOperation('PUT', aclDoc.uri, {
            data: publicTypeIndexAcl(user.uri, publicTypeIndex),
            contentType: 'text/turtle'
        })
    }

    async function initializePreferencesDefaults(user: NamedNode, preferencesFile: NamedNode): Promise<void> {
        const preferencesDoc = preferencesFile.doc() as NamedNode
        await store.fetcher.load(preferencesDoc)

        const publicTypeIndex =
            (store.any(user, ns.solid('publicTypeIndex'), null, preferencesDoc) as NamedNode | null) ||
            (store.any(user, ns.solid('publicTypeIndex'), null, user.doc()) as NamedNode | null) ||
            suggestTypeIndexInPreferences(preferencesFile, 'publicTypeIndex.ttl')
        const privateTypeIndex =
            (store.any(user, ns.solid('privateTypeIndex'), null, preferencesDoc) as NamedNode | null) ||
            suggestTypeIndexInPreferences(preferencesFile, 'privateTypeIndex.ttl')

        const toInsert: any[] = []
        if (!store.holds(preferencesDoc, ns.rdf('type'), ns.space('ConfigurationFile'), preferencesDoc)) {
            toInsert.push(st(preferencesDoc, ns.rdf('type'), ns.space('ConfigurationFile'), preferencesDoc))
        }
        if (!store.holds(preferencesDoc, ns.dct('title'), undefined, preferencesDoc)) {
            toInsert.push(st(preferencesDoc, ns.dct('title'), literal('Preferences file'), preferencesDoc))
        }
        if (!store.holds(user, ns.solid('publicTypeIndex'), publicTypeIndex, preferencesDoc)) {
            toInsert.push(st(user, ns.solid('publicTypeIndex'), publicTypeIndex, preferencesDoc))
        }
        if (!store.holds(user, ns.solid('privateTypeIndex'), privateTypeIndex, preferencesDoc)) {
            toInsert.push(st(user, ns.solid('privateTypeIndex'), privateTypeIndex, preferencesDoc))
        }

        if (toInsert.length > 0) {
            await store.updater.update([], toInsert)
            await store.fetcher.load(preferencesDoc)
        }

        await ensurePublicTypeIndexAclOnCreate(user, publicTypeIndex)
        await utilityLogic.loadOrCreateIfNotExists(privateTypeIndex)
    }

    async function ensurePreferencesDocExists(preferencesFile: NamedNode): Promise<boolean> {
        try {
            await store.fetcher.load(preferencesFile)
            return false
        } catch (err) {
            if (err.response?.status === 404) {
                await utilityLogic.loadOrCreateIfNotExists(preferencesFile)
                return true
            }
            if (err.response?.status === 401) {
                throw new UnauthorizedError()
            }
            if (err.response?.status === 403) {
                if (differentOrigin(preferencesFile)) {
                    throw new CrossOriginForbiddenError()
                }
                throw new SameOriginForbiddenError()
            }
            throw err
        }
    }

    /**
     * loads the preference without throwing errors - if it can create it it does so.
     * remark: it still throws error if it cannot load profile.
     * @param user
     * @returns undefined if preferenceFile cannot be returned or NamedNode if it can find it or create it
     */
    async function silencedLoadPreferences(user: NamedNode): Promise <NamedNode | undefined> {
        try {
            return await loadPreferences(user)
        } catch (err) {
            return undefined
        }
    }

    /**
     * loads the preference without returning different errors if it cannot create or load it.
     * remark: it also throws error if it cannot load profile.
     * @param user
     * @returns undefined if preferenceFile cannot be an Error or NamedNode if it can find it or create it
     */
    async function loadPreferences (user: NamedNode): Promise <NamedNode> {
        await loadProfile(user)

        const possiblePreferencesFile = suggestPreferencesFile(user)
        let preferencesFile
        try {
            const existingPreferencesFile = store.any(user, ns.space('preferencesFile'), null, user.doc()) as NamedNode | null
            if (existingPreferencesFile) {
                preferencesFile = existingPreferencesFile
            } else {
                preferencesFile = await utilityLogic.followOrCreateLink(user, ns.space('preferencesFile') as NamedNode, possiblePreferencesFile, user.doc())
            }

            await ensureOwnerOnlyAclForSettings(user, preferencesFile as NamedNode)

            const createdOrRepairedPreferencesDoc = await ensurePreferencesDocExists(preferencesFile as NamedNode)
            if (!existingPreferencesFile || createdOrRepairedPreferencesDoc) {
                await initializePreferencesDefaults(user, preferencesFile as NamedNode)
            }
        } catch (err) {
            const message = `User ${user} has no pointer in profile to preferences file.`
            debug.warn(message)
            // we are listing the possible errors
            if (err instanceof NotEditableError) { throw err }
            if (err instanceof WebOperationError) { throw err }
            if (err instanceof UnauthorizedError) { throw err }
            if (err instanceof CrossOriginForbiddenError) { throw err }
            if (err instanceof SameOriginForbiddenError) { throw err }
            if (err instanceof FetchError) { throw err }
            throw err
        }

        try {
            await store.fetcher.load(preferencesFile as NamedNode)
        } catch (err) { // Maybe a permission problem or origin problem
            const msg = `Unable to load preference of user ${user}: ${err}`
            debug.warn(msg)
            if (err.response.status === 401) {
                throw new UnauthorizedError()
            }
            if (err.response.status === 403) {
                if (differentOrigin(preferencesFile)) {
                throw new CrossOriginForbiddenError()
                }
                throw new SameOriginForbiddenError()
            }
            /*if (err.response.status === 404) {
                throw new NotFoundError();
            }*/
            throw new Error(msg)
        }
        return preferencesFile as NamedNode
    }

    async function loadProfile (user: NamedNode):Promise <NamedNode> {
        if (!user) {
            throw new Error('loadProfile: no user given.')
        }
        try {
            await store.fetcher.load(user.doc())
        } catch (err) {
            throw new Error(`Unable to load profile of user ${user}: ${err}`)
        }
        return user.doc()
    }

    async function loadMe(): Promise<NamedNode> {
        const me = authn.currentUser()
        if (me === null) {
            throw new Error('Current user not found! Not logged in?')
        }
        await store.fetcher.load(me.doc())
        return me
    }

    function getPodRoot(user: NamedNode): NamedNode {
        const podRoot = findStorage(user)
        if (!podRoot) {
            throw new Error('User pod root not found!')
        }
        return podRoot as NamedNode
    }

    async function getMainInbox(user: NamedNode): Promise<NamedNode> {
        await store.fetcher.load(user)
        const mainInbox = store.any(user, ns.ldp('inbox'), undefined, user.doc())
        if (!mainInbox) {
            throw new Error('User main inbox not found!')
        }
        return mainInbox as NamedNode
    }

    function findStorage(me: NamedNode) {
        return store.any(me, ns.space('storage'), undefined, me.doc())
    }

    return {
        loadMe,
        getPodRoot,
        getMainInbox,
        findStorage,
        loadPreferences,
        loadProfile,
        silencedLoadPreferences
    }
}
