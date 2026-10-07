import { applyPlan as applyAuthorizationPlan, findEffectiveACL, planGrant as planAuthorizationGrant, planPublicRead as planAuthorizationPublicRead, planRevoke as planAuthorizationRevoke, type AccessMode, type ACLContext, type Authorization, type PatchPlan } from '@dokieli/web-access-control'
import { graph, NamedNode, Namespace, serialize, sym } from 'rdflib'
import type { AccessSubject, AclLogic } from '../types'
import { ns as namespace } from '../util/ns'
import * as accessControlSubjects from './accessControlSubjects'
import { planOriginGrant, planOriginRevoke } from './originPlanner'

// Will remove the below comment when i'm done with the manage access work
// Helpers available from @dokieli/web-access-control:
// - Discovery: findEffectiveACL, parentContainer
// - ACL context and parsing: buildACLContext, authorizationsFromDataset, parseTurtle
// - Query helpers: agentsWithMode, hasControl, isPublic, modesFor, subjectsWithMode
// - Plan helpers: planContainerACL, planGrant, planOwnerControl, planPublicRead, planRevoke
// - Serialization and application: serializeTerm, toN3Patch, toSparqlUpdate, toTurtle, applyPlan, negotiatePatchContentType
// - Link and allow parsing: allows, parseWacAllow, linkTargets, parseLinkHeader
// - Terms and constants: ACCESS_MODES, ACL, Authenticated, FOAF, modeFromIRI, modeIRI, namedNode, Public, quad, RDF_TYPE, variable

export const ACCESS_ROLES = ['Owner', 'Editor', 'No Access', 'Viewer', 'Poster', 'Submitter'] as const

export type AccessRole = typeof ACCESS_ROLES[number]

export const ACL_LINK = sym(
    'http://www.iana.org/assignments/link-relations/acl'
)

export function createAclLogic(store): AclLogic {

    const ns = namespace
    const ACCESS_ROLE_RULES: Array<{ label: AccessRole, modes: AccessMode[] }> = [
        { label: 'Owner', modes: ['Read', 'Write', 'Control'] },
        { label: 'Editor', modes: ['Read', 'Write'] },
        { label: 'Poster', modes: ['Append', 'Read'] },
        { label: 'Submitter', modes: ['Append'] },
        { label: 'Viewer', modes: ['Read'] },
        { label: 'No Access', modes: [] }
    ]

    function roleFromModes (modes: Iterable<AccessMode>): AccessRole {
        const modeSet = new Set(modes)
        const matchingRule = ACCESS_ROLE_RULES.find(rule => rule.label !== 'No Access' && rule.modes.every(mode => modeSet.has(mode)))

        return matchingRule?.label ?? 'No Access'
    }

    function modesFromRole (role: AccessRole): AccessMode[] {
        return [...(ACCESS_ROLE_RULES.find(rule => rule.label === role)?.modes ?? [])]
    }

    function getFetch() {
        const fetcher = store.fetcher as {
            _fetch?: (url: string, init?: RequestInit) => Promise<Response>
            fetch?: (url: string, init?: RequestInit) => Promise<Response>
        } | undefined
        const fetch = fetcher?._fetch ?? fetcher?.fetch
        if (!fetch) {
            throw new Error('Cannot find effective ACL, store has no fetcher')
        }
        return fetch.bind(fetcher)
    }
    
    async function findAclDocUrl(url: NamedNode) {
        await store.fetcher.load(url)
        const docNode = store.any(url, ACL_LINK)
        if (!docNode) {
            throw new Error(`No ACL link discovered for ${url}`)
        }
        return docNode.value
    }

    async function findEffectiveAcl(resourceURL: string | NamedNode): Promise<ACLContext> {
        const url = typeof resourceURL === 'string' ? resourceURL : resourceURL.value
        return findEffectiveACL(url, { fetch: getFetch() })
    }

    async function findAccessGrants(resourceURL: string | NamedNode): Promise<Authorization[]> {
        const context = await findEffectiveAcl(resourceURL)
        return context.authorizations
    }

    async function planGrant(resourceURL: string | NamedNode, subject: AccessSubject, modes: AccessMode[]): Promise<PatchPlan> {
        const context = await findEffectiveAcl(resourceURL)
        if (subject.type === 'origin') return planOriginGrant(context, subject.iri, modes)
        return planAuthorizationGrant(context, subject, modes)
    }

    async function planRevoke(resourceURL: string | NamedNode, subject: AccessSubject): Promise<PatchPlan> {
        const context = await findEffectiveAcl(resourceURL)
        if (subject.type === 'origin') return planOriginRevoke(context, subject.iri)
        return planAuthorizationRevoke(context, subject)
    }

    async function planPublicRead(resourceURL: string | NamedNode, enabled: boolean): Promise<PatchPlan> {
        const context = await findEffectiveAcl(resourceURL)
        return planAuthorizationPublicRead(context, enabled)
    }

    async function applyPlan(plan: PatchPlan): Promise<Response> {
        return applyAuthorizationPlan(plan, { fetch: getFetch() })
    }

    async function classifyAccessControlSubject(principle: string) {
        return accessControlSubjects.classifyAccessControlSubject(store, principle)
    }
    /**
     * Simple Access Control
     *
     * This function sets up a simple default ACL for a resource, with
     * RWC for the owner, and a specified access (default none) for the public.
     * In all cases owner has read write control.
     * Parameter lists modes allowed to public
     *
     * @param options
     * @param options.public eg ['Read', 'Write']
     *
     * @returns Resolves with aclDoc uri on successful write
     */
    function setACLUserPublic ( 
    docURI: string,
    me: NamedNode,
    options: {
        defaultForNew?: boolean,
        public?: []
    }
    ): Promise<NamedNode> {
    const aclDoc = store.any(
        store.sym(docURI),
        ACL_LINK
    )

    return Promise.resolve()
        .then(() => {
        if (aclDoc) {
            return aclDoc as NamedNode
        }

        return fetchACLRel(docURI).catch(err => {
            throw new Error(`Error fetching rel=ACL header for ${docURI}: ${err}`)
        })
        })
        .then(aclDoc => {
        const aclText = genACLText(docURI, me, aclDoc.uri, options)
        if (!store.fetcher) {
            throw new Error('Cannot PUT this, store has no fetcher')
        }
        return store.fetcher
            .webOperation('PUT', aclDoc.uri, {
            data: aclText,
            contentType: 'text/turtle'
            })
            .then(result => {
            if (!result.ok) {
                throw new Error('Error writing ACL text: ' + result.error)
            }

            return aclDoc
            })
        })
    }

    /**
     * @param docURI
     * @returns
     */
    function fetchACLRel (docURI: string): Promise<NamedNode> {
        const fetcher = store.fetcher
        if (!fetcher) {
            throw new Error('Cannot fetch ACL rel, store has no fetcher')
        }

        return fetcher.load(docURI).then(result => {
            if (!result.ok) {
                throw new Error('fetchACLRel: While loading:' + (result as any).error)
            }

            const aclDoc = store.any(
            store.sym(docURI),
            ACL_LINK
            )

            if (!aclDoc) {
            throw new Error('fetchACLRel: No Link rel=ACL header for ' + docURI)
            }

            return aclDoc as NamedNode
        })
    }

    /**
     * @param docURI
     * @param me
     * @param aclURI
     * @param options
     *
     * @returns Serialized ACL
     */
    function genACLText (
    docURI: string,
    me: NamedNode,
    aclURI: string,
    options: {
            defaultForNew?: boolean,
            public?: []
        } = {}
    ): string | undefined {
        const optPublic = options.public || []
        const g = graph()
        const auth = Namespace('http://www.w3.org/ns/auth/acl#')
        let a = g.sym(`${aclURI}#a1`)
        const acl = g.sym(aclURI)
        const doc = g.sym(docURI)
        g.add(a, ns.rdf('type'), auth('Authorization'), acl)
        g.add(a, auth('accessTo'), doc, acl)
        if (options.defaultForNew) {
            g.add(a, auth('default'), doc, acl)
        }
        g.add(a, auth('agent'), me, acl)
        g.add(a, auth('mode'), auth('Read'), acl)
        g.add(a, auth('mode'), auth('Write'), acl)
        g.add(a, auth('mode'), auth('Control'), acl)

        if (optPublic.length) {
            a = g.sym(`${aclURI}#a2`)
            g.add(a, ns.rdf('type'), auth('Authorization'), acl)
            g.add(a, auth('accessTo'), doc, acl)
            g.add(a, auth('agentClass'), ns.foaf('Agent'), acl)
            for (let p = 0; p < optPublic.length; p++) {
            g.add(a, auth('mode'), auth(optPublic[p]), acl) // Like 'Read' etc
            }
        }
        return serialize(acl, g, aclURI)
    }
    return {
        findAclDocUrl,
        findEffectiveAcl,
        findAccessGrants,
        roleFromModes,
        modesFromRole,
        planGrant,
        planRevoke,
        planPublicRead,
        applyPlan,
        classifyAccessControlSubject,
        setACLUserPublic,
        genACLText
    }
}