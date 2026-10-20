import { ACL, namedNode, quad, applyPlan as applyAuthorizationPlan, Authenticated, findEffectiveACL, planGrant as planAuthorizationGrant, planPublicRead as planAuthorizationPublicRead, planRevoke as planAuthorizationRevoke, Public, type AccessMode, type AccessSubject, type ACLContext, type Authorization, type PatchPlan } from '@dokieli/web-access-control'
import { graph, NamedNode, Namespace, serialize, sym } from 'rdflib'
import type { AclLogic } from '../types'
import { ns as namespace } from '../util/ns'
import * as accessControlSubjects from './accessControlSubjects'

export const ACCESS_ROLES = ['Owner', 'Editor', 'No Access', 'Viewer', 'Poster', 'Submitter'] as const
export const PUBLIC_ACCESS_ROLES = ['No Access', 'Viewer'] as const
export { Authenticated, Public } from '@dokieli/web-access-control'

export type AccessRole = typeof ACCESS_ROLES[number]
export type PublicAccessRole = typeof PUBLIC_ACCESS_ROLES[number]
export type ContainerAccessScope = 'folder+contents' | 'folder' | 'contents'
export interface ContainerAccessScopeAnalysis {
    distinctScopes: ContainerAccessScope[]
    primaryScope: ContainerAccessScope
    mixed: boolean
}

export function classifyAuthorizationScope (
    resource: string,
    authorization: Authorization,
    inherited = false
): ContainerAccessScope | undefined {
    // Effective ACL discovery keeps inherited `acl:default` targets on the
    // parent container. They govern both this container and its contents
    // (legacy adoptACLDefault copies them as accessTo + default).
    const inheritedDefault = inherited && (authorization.default?.length ?? 0) > 0
    const hasAccessTo = inheritedDefault || (authorization.accessTo?.includes(resource) ?? false)
    const hasDefault = inheritedDefault || (authorization.default?.includes(resource) ?? false)
    if (hasAccessTo && hasDefault) return 'folder+contents'
    if (hasAccessTo) return 'folder'
    if (hasDefault) return 'contents'
    return undefined
}

export function filterAuthorizationsByContainerScope (
    resource: string,
    authorizations: Authorization[],
    scope: ContainerAccessScope,
    inherited = false
): Authorization[] {
    return authorizations.filter(authorization =>
        classifyAuthorizationScope(resource, authorization, inherited) === scope
    )
}

/**
 * Classify the direct ACL predicates for a container. Mixed grants are
 * conservatively treated as covering both scopes.
 */
export function classifyContainerAccessScope (context: ACLContext): ContainerAccessScope {
    return analyzeContainerAccessScope(context).primaryScope
}

export function analyzeContainerAccessScope (context: ACLContext): ContainerAccessScopeAnalysis {
    const scopes = new Set<ContainerAccessScope>()
    for (const authorization of context.authorizations ?? []) {
        const scope = classifyAuthorizationScope(context.resource, authorization, context.inherited)
        if (scope) scopes.add(scope)
    }
    // Older callers may provide only the graph. Preserve their classification
    // while keeping the authorization-entry semantics for parsed contexts.
    if (!scopes.size) {
        const entries = new Map<string, { accessTo: boolean, default: boolean }>()
        for (const statement of context.dataset ?? []) {
            if (statement.object.value !== context.resource) continue
            if (statement.predicate.value !== ACL + 'accessTo' && statement.predicate.value !== ACL + 'default') continue
            const entry = entries.get(statement.subject.value) ?? { accessTo: false, default: false }
            entry.accessTo ||= statement.predicate.value === ACL + 'accessTo'
            entry.default ||= statement.predicate.value === ACL + 'default'
            entries.set(statement.subject.value, entry)
        }
        for (const entry of entries.values()) {
            if (entry.accessTo && entry.default) scopes.add('folder+contents')
            else if (entry.accessTo) scopes.add('folder')
            else if (entry.default) scopes.add('contents')
        }
    }
    const distinctScopes = [...scopes]
    const primaryScope = distinctScopes.includes('folder+contents')
        ? 'folder+contents'
        : distinctScopes.includes('contents')
          ? 'contents'
          : distinctScopes.includes('folder')
            ? 'folder'
            : 'folder+contents'
    return { distinctScopes, primaryScope, mixed: distinctScopes.length > 1 }
}

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
    const PUBLIC_ROLE_RULES: Array<{ label: PublicAccessRole, modes: AccessMode[] }> = [
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

    function publicRoleFromModes (modes: Iterable<AccessMode>): PublicAccessRole {
        const modeSet = new Set(modes)
        const matchingRule = PUBLIC_ROLE_RULES.find(rule => rule.label !== 'No Access' && rule.modes.every(mode => modeSet.has(mode)))

        return matchingRule?.label ?? 'No Access'
    }

    function modesFromPublicRole (role: PublicAccessRole): AccessMode[] {
        return [...(PUBLIC_ROLE_RULES.find(rule => rule.label === role)?.modes ?? [])]
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

    function classifyContainerScope(context: ACLContext): ContainerAccessScope {
        return classifyContainerAccessScope(context)
    }

    function isProtectedResource(resourceURL: string | NamedNode): boolean {
        const resource = sym(typeof resourceURL === 'string' ? resourceURL : resourceURL.value)
        return resource.value === resource.site().value ||
            (typeof store.holds === 'function' &&
                store.holds(resource, ns.rdf('type'), ns.space('Storage'), resource.doc()))
    }

    function subjectMatchesAuthorization(subject: AccessSubject, authorization: Authorization): boolean {
        const predicateByType = {
            agent: 'agent',
            agentGroup: 'agentGroup',
            agentClass: 'agentClass',
            origin: 'origin'
        } as const
        return authorization[predicateByType[subject.type]]?.includes(subject.iri) ?? false
    }

    function assertProtectedControlPreserved(context: ACLContext, subject: AccessSubject, modes?: AccessMode[]): void {
        if (!isProtectedResource(context.resource)) {
            return
        }

        const hasControl = context.authorizations.some(authorization =>
            authorization.mode.includes('Control') && subjectMatchesAuthorization(subject, authorization))
        const controlCount = context.authorizations.filter(authorization => authorization.mode.includes('Control')).length
        const keepsControl = modes?.includes('Control') ?? false

        if (hasControl && controlCount <= 1 && !keepsControl) {
            throw new Error('The protected storage resource must retain at least one Control authorization.')
        }
    }

    function withContainerDefaults(context: ACLContext, plan: PatchPlan): PatchPlan {
        if (!new URL(context.resource).pathname.endsWith('/')) {
            return plan
        }

        // Materializing an inherited container ACL must not cut off its contents.
        // The upstream resource planner emits accessTo only, even for containers.
        const defaults = plan.inserts
            .filter(statement => statement.predicate.value === ACL + 'accessTo' && statement.object.value === context.resource)
            .filter(statement => !plan.inserts.some(existing => existing.subject.equals(statement.subject) && existing.predicate.value === ACL + 'default' && existing.object.value === context.resource))
            .map(statement => quad(statement.subject, namedNode(ACL + 'default'), statement.object))

        return { ...plan, inserts: [...plan.inserts, ...defaults] }
    }

    async function planGrant(resourceURL: string | NamedNode, subject: AccessSubject, modes: AccessMode[]): Promise<PatchPlan> {
        const context = await findEffectiveAcl(resourceURL)
        assertProtectedControlPreserved(context, subject, modes)
        if (context.inherited && new URL(context.resource).pathname.endsWith('/')) {
            return materializeInheritedContainer(context, subject, modes, 'folder')
        }
        return planAuthorizationGrant(context, subject, modes)
    }

    function assertContainer(context: ACLContext): void {
        if (!new URL(context.resource).pathname.endsWith('/')) {
            throw new Error(`Expected a container URL ending in "/": ${context.resource}`)
        }
    }

    const subjectKeys = ['agent', 'agentClass', 'agentGroup', 'origin'] as const
    const rdfType = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
    const supportedConditionPredicates = new Set([
        rdfType,
        ACL + 'client',
        ACL + 'clientClass',
        ACL + 'clientGroup',
        ACL + 'issuer',
        ACL + 'issuerClass',
        ACL + 'issuerGroup',
        ACL + 'description',
        // Some older ACL contexts expose the condition type as a property key
        // rather than retaining it under rdf:type.
        ACL + 'ClientCondition',
        ACL + 'IssuerCondition'
    ])
    const supportedConditionTypes = new Set([
        ACL + 'ClientCondition',
        ACL + 'IssuerCondition'
    ])

    function createAuthorizationIdAllocator(context: ACLContext): (base: string) => string {
        const takenIds = new Set<string>([
            ...(context.dataset ?? []).map(statement => statement.subject.value),
            ...context.authorizations.flatMap(authorization => [
                authorization.id,
                ...(authorization.condition ?? []).map(condition => condition.id)
            ])
        ])

        return (base: string): string => {
            let id = base
            let suffix = 1
            while (takenIds.has(id)) {
                id = `${base}-${suffix++}`
            }
            takenIds.add(id)
            return id
        }
    }

    function assertSupportedConditions(context: ACLContext): void {
        for (const authorization of context.authorizations) {
            for (const condition of authorization.condition ?? []) {
                const conditionTypes = condition.properties[rdfType] ?? []
                if (conditionTypes.length > 1 ||
                    (conditionTypes.length === 1 && !supportedConditionTypes.has(conditionTypes[0]))) {
                    throw new Error(`Unsupported ACL condition type on ${condition.id}`)
                }
                for (const predicate of Object.keys(condition.properties)) {
                    if (!supportedConditionPredicates.has(predicate)) {
                        throw new Error(`Unsupported ACL condition property: ${predicate}`)
                    }
                }
            }
        }
    }

    function materializeInheritedContainer (
            context: ACLContext,
            subject: AccessSubject,
            modes: AccessMode[] | undefined,
            scope: ContainerAccessScope,
            revoke = false
        ): PatchPlan {
            const inserts: PatchPlan['inserts'] = []
            const subjectKey = subject.type
            const freshId = createAuthorizationIdAllocator(context)
            assertSupportedConditions(context)
            const addRule = (
                authorization: Authorization,
                baseId: string,
                targets: { accessTo: boolean, default: boolean },
                modeOverride?: AccessMode[]
            ) => {
                const subjects = subjectKeys.flatMap(key => authorization[key].map(iri => ({ key, iri })))
                if (!subjects.length || (!targets.accessTo && !targets.default)) return
                const id = freshId(baseId)
                const rule = namedNode(id)
                inserts.push(
                    quad(rule, namedNode(rdfType), namedNode(ACL + 'Authorization')),
                    ...(targets.accessTo ? [quad(rule, namedNode(ACL + 'accessTo'), namedNode(context.resource))] : []),
                    ...(targets.default ? [quad(rule, namedNode(ACL + 'default'), namedNode(context.resource))] : []),
                    ...(modeOverride ?? authorization.mode).map(mode => quad(rule, namedNode(ACL + 'mode'), namedNode(`http://www.w3.org/ns/auth/acl#${mode}`))),
                    ...subjects.map(({ key, iri }) => quad(rule, namedNode(ACL + key), namedNode(iri))),
                    ...(authorization.condition ?? []).flatMap(condition => {
                        const conditionId = freshId(`${id}-condition`)
                        const conditionNode = namedNode(conditionId)
                        return [
                            quad(rule, namedNode(ACL + 'condition'), conditionNode),
                            ...Object.entries(condition.properties).flatMap(([predicate, values]) =>
                                values.map(value => quad(conditionNode, namedNode(predicate), namedNode(value))))
                        ]
                    })
                )
            }
            const withoutSubject = (authorization: Authorization): Authorization => ({
                ...authorization,
                [subjectKey]: authorization[subjectKey].filter(iri => iri !== subject.iri)
            })
            const onlySubject = (authorization: Authorization): Authorization => ({
                ...authorization,
                agent: [], agentClass: [], agentGroup: [], origin: [],
                [subjectKey]: [subject.iri]
            })
            context.authorizations.forEach((authorization, index) => {
                const baseId = `${context.defaultACLResource}#inherited-${index + 1}`
                // Legacy adoptACLDefault parity: an inherited acl:default governs
                // this container itself and its contents, so it is copied as
                // accessTo + default. Parent accessTo-only rules do not apply here.
                const inheritedDefault = (authorization.default?.length ?? 0) > 0
                const targets = {
                    accessTo: inheritedDefault || authorization.accessTo.includes(context.resource),
                    default: inheritedDefault
                }
                const selected = authorization[subjectKey]?.includes(subject.iri) ?? false
                if (!selected) {
                    addRule(authorization, baseId, targets)
                    return
                }
                addRule(withoutSubject(authorization), baseId, targets)
                // Keep the subject's inherited access for the scope not being changed.
                addRule(onlySubject(authorization), `${baseId}-retained`, {
                    accessTo: targets.accessTo && scope === 'contents',
                    default: targets.default && scope === 'folder'
                })
            })
            if (!revoke) {
                const newAuthorization: Authorization = {
                    id: `${context.defaultACLResource}#inherited-new-source`,
                    blankNode: false,
                    accessTo: [], default: [], agent: [], agentClass: [], agentGroup: [], origin: [], mode: [], condition: []
                }
                addRule(onlySubject(newAuthorization), `${context.defaultACLResource}#inherited-new`, {
                    accessTo: scope !== 'contents',
                    default: scope !== 'folder'
                }, modes ?? [])
            }
            return { target: context.defaultACLResource, deletes: [], inserts }
    }

    async function planGrantContainer(containerURL: string | NamedNode, subject: AccessSubject, modes: AccessMode[]): Promise<PatchPlan> {
        const context = await findEffectiveAcl(containerURL)
        assertContainer(context)
        assertProtectedControlPreserved(context, subject, modes)
        if (context.inherited) return materializeInheritedContainer(context, subject, modes, 'folder')
        return planAuthorizationGrant(context, subject, modes)
    }

    async function planGrantContainerAndContents(containerURL: string | NamedNode, subject: AccessSubject, modes: AccessMode[]): Promise<PatchPlan> {
        const context = await findEffectiveAcl(containerURL)
        assertContainer(context)
        assertProtectedControlPreserved(context, subject, modes)
        if (context.inherited) return materializeInheritedContainer(context, subject, modes, 'folder+contents')
        return withContainerDefaults(context, planAuthorizationGrant(context, subject, modes))
    }

    async function planGrantContainerContents(containerURL: string | NamedNode, subject: AccessSubject, modes: AccessMode[]): Promise<PatchPlan> {
        const context = await findEffectiveAcl(containerURL)
        assertContainer(context)
        if (isProtectedResource(context.resource)) {
            throw new Error('Applying access to the contents of a protected storage resource is not allowed.')
        }
        if (context.inherited) return materializeInheritedContainer(context, subject, modes, 'contents')
        const sharedAuthorization = context.authorizations.find(authorization =>
            authorization.default?.includes(context.resource) &&
            subjectMatchesAuthorization(subject, authorization) &&
            ['agent', 'agentClass', 'agentGroup', 'origin'].reduce((count, key) =>
                count + authorization[key].length, 0) > 1)

        if (sharedAuthorization) {
            return splitDirectContainerContentsAuthorization(context, sharedAuthorization, subject, modes)
        }

        const existingDefaultOnly = context.authorizations.find(authorization =>
            authorization.default?.includes(context.resource) &&
            !authorization.accessTo?.includes(context.resource) &&
            authorization[subject.type]?.includes(subject.iri) &&
            (authorization.agent.length + authorization.agentClass.length + authorization.agentGroup.length + authorization.origin.length) === 1)

        if (existingDefaultOnly && !context.inherited) {
            // The upstream planner can safely update a default-only rule in
            // place; unlike a resource grant it will not add acl:accessTo.
            return planAuthorizationGrant(context, subject, modes)
        }

        const subjectKey = subject.type
        const id = createAuthorizationIdAllocator(context)(`${context.defaultACLResource}#contents-1`)
        const rule = namedNode(id)
        const subjectQuad = quad(rule, namedNode(ACL + subjectKey), namedNode(subject.iri))
        const fresh = [
            quad(rule, namedNode(rdfType), namedNode(ACL + 'Authorization')),
            quad(rule, namedNode(ACL + 'default'), namedNode(context.resource)),
            ...modes.map(mode => quad(rule, namedNode(ACL + 'mode'), namedNode(`http://www.w3.org/ns/auth/acl#${mode}`))),
            subjectQuad
        ]

        // A folder-only authorization is unrelated and must remain untouched.
        return { target: context.defaultACLResource, deletes: [], inserts: fresh }
    }

    async function planRevokeContainerContents(containerURL: string | NamedNode, subject: AccessSubject): Promise<PatchPlan> {
        const context = await findEffectiveAcl(containerURL)
        assertContainer(context)
        if (isProtectedResource(context.resource)) {
            throw new Error('Removing access from the contents of a protected storage resource is not allowed.')
        }

        const defaultPredicate = ACL + 'default'
        if (!context.inherited) {
            const sharedAuthorization = context.authorizations.find(authorization =>
                authorization.default?.includes(context.resource) &&
                subjectMatchesAuthorization(subject, authorization) &&
                ['agent', 'agentClass', 'agentGroup', 'origin'].reduce((count, key) =>
                    count + authorization[key].length, 0) > 1)

            if (sharedAuthorization) {
                return splitDirectContainerContentsAuthorization(context, sharedAuthorization, subject)
            }

            const deletes = context.dataset.filter(statement =>
                statement.predicate.value === defaultPredicate &&
                statement.object.value === context.resource &&
                context.authorizations.some(authorization =>
                    authorization.id === statement.subject.value &&
                    authorization[subject.type].includes(subject.iri)))
            if (!deletes.length) {
                throw new Error(`No default authorization found for ${subject.iri}`)
            }
            return { target: context.defaultACLResource, deletes, inserts: [] }
        }

        const plan = materializeInheritedContainer(context, subject, undefined, 'contents', true)
        if (!plan.inserts.length) {
            throw new Error(`No default authorization found for ${subject.iri}`)
        }
        return plan
    }

    function splitDirectContainerContentsAuthorization (
        context: ACLContext,
        authorization: Authorization,
        subject: AccessSubject,
        modes?: AccessMode[]
    ): PatchPlan {
        const freshId = createAuthorizationIdAllocator(context)
        const subjects = subjectKeys.flatMap(key =>
            authorization[key].map(iri => ({ key, iri }))
        )
        const remainingSubjects = subjects.filter(({ key, iri }) =>
            !(key === subject.type && iri === subject.iri))
        const target = namedNode(freshId(`${context.defaultACLResource}#split-1`))
        const retained = namedNode(freshId(`${context.defaultACLResource}#retained-1`))
        const inserts: PatchPlan['inserts'] = []
        const addRule = (
            rule: ReturnType<typeof namedNode>,
            ruleSubjects: Array<{ key: typeof subjectKeys[number], iri: string }>,
            ruleModes: AccessMode[],
            includeAccessTo: boolean,
            includeDefault: boolean
        ) => {
            if (!ruleSubjects.length || (!includeAccessTo && !includeDefault)) return
            inserts.push(
                quad(rule, namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'), namedNode(ACL + 'Authorization')),
                ...(includeAccessTo ? [quad(rule, namedNode(ACL + 'accessTo'), namedNode(context.resource))] : []),
                ...(includeDefault ? [quad(rule, namedNode(ACL + 'default'), namedNode(context.resource))] : []),
                ...ruleModes.map(mode => quad(rule, namedNode(ACL + 'mode'), namedNode(`http://www.w3.org/ns/auth/acl#${mode}`))),
                ...ruleSubjects.map(({ key, iri }) => quad(rule, namedNode(ACL + key), namedNode(iri)))
            )
        }

        const hasAccessTo = authorization.accessTo.includes(context.resource)
        const hasDefault = authorization.default.includes(context.resource)
        addRule(retained, remainingSubjects, authorization.mode, hasAccessTo, hasDefault)
        if (modes) {
            addRule(target, [{ key: subject.type, iri: subject.iri }], modes, hasAccessTo, hasDefault)
        }

        return {
            target: context.defaultACLResource,
            deletes: context.dataset.filter(statement => statement.subject.value === authorization.id),
            inserts
        }
    }

    async function planRevoke(resourceURL: string | NamedNode, subject: AccessSubject): Promise<PatchPlan> {
        const context = await findEffectiveAcl(resourceURL)
        assertProtectedControlPreserved(context, subject)
        if (context.inherited && new URL(context.resource).pathname.endsWith('/')) {
            return materializeInheritedContainer(context, subject, undefined, 'folder+contents', true)
        }
        return withContainerDefaults(context, planAuthorizationRevoke(context, subject))
    }

    async function planPublicRead(resourceURL: string | NamedNode, enabled: boolean): Promise<PatchPlan> {
        const context = await findEffectiveAcl(resourceURL)
        return planAuthorizationPublicRead(context, enabled)
    }

    async function resetToDefault(resourceURL: string | NamedNode): Promise<Response> {
        const context = await findEffectiveAcl(resourceURL)
        if (isProtectedResource(context.resource)) {
            throw new Error('The protected storage resource cannot be reset to a default ACL.')
        }
        const response = await getFetch()(context.defaultACLResource, { method: 'DELETE' })

        if (!response.ok && response.status !== 404) {
            throw new Error(`Unable to remove ACL ${context.defaultACLResource}: HTTP ${response.status}`)
        }

        return response
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
        classifyContainerScope,
        isProtectedResource,
        roleFromModes,
        modesFromRole,
        publicRoleFromModes,
        modesFromPublicRole,
        planGrant,
        planGrantContainer,
        planGrantContainerAndContents,
        planGrantContainerContents,
        planRevokeContainerContents,
        planRevoke,
        planPublicRead,
        resetToDefault,
        applyPlan,
        classifyAccessControlSubject,
        setACLUserPublic,
        genACLText,
        Authenticated,
        Public,
        PUBLIC_ACCESS_ROLES
    }
}