import { literal, NamedNode, st, sym } from 'rdflib'
import { ACL_LINK } from '../acl/aclLogic'
import { CrossOriginForbiddenError, FetchError, NotEditableError, SameOriginForbiddenError, UnauthorizedError, WebOperationError } from '../logic/CustomError'
import * as debug from '../util/debug'
import { ns } from '../util/ns'
import { privateTypeIndexDocument, publicTypeIndexDocument } from '../typeIndex/typeIndexDocuments'
import { publicTypeIndexAclDocument } from '../typeIndex/typeIndexAclDocuments'
import { preferencesFileDocument } from './profileDocuments'
import { ownerOnlyContainerAclDocument } from './profileAclDocuments'
import { createContainerLogic } from '../util/containerLogic'
import { differentOrigin, documentDirectoryUri, suggestPreferencesFile } from '../util/utils'
import { isMissingError } from '../resource/resourceHttp'
import { ProfileLogic } from '../types'
import { createProfileMutationService } from './profileMutationService'
import { getBio } from './sections/bio/selectors'
import { getContactInfo } from './sections/contactInfo/selectors'
import { getEducation } from './sections/education/selectors'
import { presentLanguages } from './sections/languages/selectors'
import { getSkillDetails, getSkills } from './sections/skills/selectors'
import { getHeading } from './sections/heading/selectors'
import { presentProjects } from './sections/projects/selectors'
import { presentCV } from './sections/resume/selectors'
import { getSocialAccounts } from './sections/social/read'

export function createProfileLogic(store, authn, utilityLogic): ProfileLogic {
    const containerLogic = createContainerLogic(store)
    const profileMutationService = createProfileMutationService(store)
    const loadPreferencesInFlight = new Map<string, Promise<NamedNode>>()
    const cachedPreferencesFileByWebId = new Map<string, NamedNode>()

    function suggestTypeIndexInPreferences(preferencesFile: NamedNode, filename: string): NamedNode {
        const dirUri = documentDirectoryUri(preferencesFile)
        if (!dirUri) throw new Error(`Cannot derive directory for preferences file ${preferencesFile.uri}`)
        return sym(dirUri + filename)
    }

    async function ensureOwnerOnlyAclForSettings(user: NamedNode, preferencesFile: NamedNode): Promise<void> {
        const dirUri = documentDirectoryUri(preferencesFile)
        if (!dirUri) throw new Error(`Cannot derive settings directory from ${preferencesFile.uri}`)
        await containerLogic.ensureContainer(dirUri)

        const containerNode = sym(dirUri)
        let aclDocUri: string | undefined
        try {
            await store.fetcher.load(containerNode)
            aclDocUri = store.any(containerNode, ACL_LINK)?.value
        } catch (err) {
            if (!isMissingError(err)) throw err
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
            if (!isMissingError(err)) throw err
        }

        await store.fetcher.webOperation('PUT', aclDoc.uri, {
            data: ownerOnlyContainerAclDocument(user.uri),
            contentType: 'text/turtle'
        })
    }

    async function ensurePublicTypeIndexAclOnCreate(user: NamedNode, publicTypeIndex: NamedNode, ensureAcl = false): Promise<void> {
        const created = await utilityLogic.loadOrCreateWithContentOnCreate(publicTypeIndex, publicTypeIndexDocument())
        if (!created && !ensureAcl) return

        let aclDocUri: string | undefined
        try {
            await store.fetcher.load(publicTypeIndex)
            aclDocUri = store.any(publicTypeIndex, ACL_LINK)?.value
        } catch (err) {
            if (!isMissingError(err)) throw err
        }
        if (!aclDocUri) {
            aclDocUri = `${publicTypeIndex.uri}.acl`
        }

        const aclDoc = sym(aclDocUri)
        try {
            await store.fetcher.webOperation('PUT', aclDoc.uri, {
                data: publicTypeIndexAclDocument(user.uri, publicTypeIndex.uri),
                contentType: 'text/turtle',
                headers: { 'If-None-Match': '*' }
            })
        } catch (err: any) {
            const status = err?.response?.status ?? err?.status
            if (status !== 412) throw err
        }
    }

    async function ensurePrivateTypeIndexOnCreate(privateTypeIndex: NamedNode): Promise<void> {
        await utilityLogic.loadOrCreateWithContentOnCreate(privateTypeIndex, privateTypeIndexDocument())
    }

    async function initializePreferencesDefaults(user: NamedNode, preferencesFile: NamedNode): Promise<void> {
        const preferencesDoc = preferencesFile.doc() as NamedNode
        const profileDoc = user.doc() as NamedNode
        await store.fetcher.load(preferencesDoc)

        const profilePublicTypeIndex =
            (store.any(user, ns.solid('publicTypeIndex'), null, profileDoc) as NamedNode | null)
        const preferencesPublicTypeIndex =
            (store.any(user, ns.solid('publicTypeIndex'), null, preferencesDoc) as NamedNode | null)
        const publicTypeIndex =
            profilePublicTypeIndex ||
            preferencesPublicTypeIndex ||
            suggestTypeIndexInPreferences(preferencesFile, 'publicTypeIndex.ttl')
        const privateTypeIndex =
            (store.any(user, ns.solid('privateTypeIndex'), null, preferencesDoc) as NamedNode | null) ||
            suggestTypeIndexInPreferences(preferencesFile, 'privateTypeIndex.ttl')

        // Keep discovery consistent with typeIndexLogic, which resolves publicTypeIndex from the profile doc.
        const createdProfilePublicTypeIndexLink = !profilePublicTypeIndex
        if (createdProfilePublicTypeIndexLink) {
            await utilityLogic.followOrCreateLinkWithContentOnCreate(
                user,
                ns.solid('publicTypeIndex') as NamedNode,
                publicTypeIndex,
                profileDoc,
                publicTypeIndexDocument()
            )
        }

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

        await ensurePublicTypeIndexAclOnCreate(user, publicTypeIndex, createdProfilePublicTypeIndexLink)
        await ensurePrivateTypeIndexOnCreate(privateTypeIndex)
    }

    async function ensurePreferencesDocExists(preferencesFile: NamedNode): Promise<boolean> {
        try {
            const created = await utilityLogic.loadOrCreateWithContentOnCreate(preferencesFile, preferencesFileDocument())
            if (created) {
                return true
            }
            return false
        } catch (err) {
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
        const cachedPreferencesFile = cachedPreferencesFileByWebId.get(user.uri)
        if (cachedPreferencesFile) {
            return cachedPreferencesFile
        }

        const inFlight = loadPreferencesInFlight.get(user.uri)
        if (inFlight) {
            return inFlight
        }

        const run = (async (): Promise<NamedNode> => {
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
            await ensurePreferencesDocExists(preferencesFile as NamedNode)
            await initializePreferencesDefaults(user, preferencesFile as NamedNode)
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
            if (err.response?.status === 404) {
                // Self-heal when a stale profile pointer references a missing preferences file.
                await ensureOwnerOnlyAclForSettings(user, preferencesFile as NamedNode)
                await ensurePreferencesDocExists(preferencesFile as NamedNode)
                await initializePreferencesDefaults(user, preferencesFile as NamedNode)
                await store.fetcher.load(preferencesFile as NamedNode)
                return preferencesFile as NamedNode
            }
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
        cachedPreferencesFileByWebId.set(user.uri, preferencesFile as NamedNode)
        return preferencesFile as NamedNode
        })()

        loadPreferencesInFlight.set(user.uri, run)
        try {
            return await run
        } finally {
            if (loadPreferencesInFlight.get(user.uri) === run) {
                loadPreferencesInFlight.delete(user.uri)
            }
        }
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
        ...profileMutationService,
        getBio: (subject: NamedNode) => getBio(subject, store),
        getContactInfo: (subject: NamedNode) => getContactInfo(subject, store),
        getEducation: (subject: NamedNode) => getEducation(subject, store),
        getLanguages: (subject: NamedNode) => presentLanguages(subject, store),
        getSkillDetails: (subject: NamedNode) => getSkillDetails(subject, store),
        getSkills: (subject: NamedNode) => getSkills(subject, store),
        getHeading: (subject: NamedNode) => getHeading(subject, store),
        getResume: (subject: NamedNode) => presentCV(subject, store),
        getProjects: (subject: NamedNode) => presentProjects(subject, store),
        getSocial: (subject: NamedNode) => getSocialAccounts(subject, store),
        loadMe,
        getPodRoot,
        getMainInbox,
        findStorage,
        loadPreferences,
        loadProfile,
        silencedLoadPreferences
    }
}
