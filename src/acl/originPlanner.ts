import { ACL, RDF_TYPE, modeIRI, namedNode, quad, type ACLContext, type AccessMode, type Authorization, type PatchPlan, type Quad } from '@dokieli/web-access-control'

function normalizeOrigin(origin: string): string {
    const parsed = new URL(origin)
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
        throw new Error(`Invalid ACL origin: ${origin}. Enter an HTTP(S) origin without a path, credentials, query or fragment.`)
    }
    return parsed.origin
}

function authQuads(context: ACLContext, authorization: Authorization): Quad[] {
    return context.dataset.filter(item => item.subject.termType === 'NamedNode' && item.subject.value === authorization.id)
}

function hasOnlyOriginRecipient(authorization: Authorization, origin: string): boolean {
    return authorization.origin.length === 1 &&
        authorization.origin[0] === origin &&
        authorization.agent.length === 0 &&
        authorization.agentClass.length === 0 &&
        authorization.agentGroup.length === 0
}

function freshAuthorizationId(context: ACLContext, existing: Set<string>, suffix: string): string {
    let attempt = 0
    let id = `${context.defaultACLResource}#${suffix}`
    while (existing.has(id)) {
        attempt += 1
        id = `${context.defaultACLResource}#${suffix}-${attempt}`
    }
    existing.add(id)
    return id
}

function conditionDescriptions(context: ACLContext, authorization: Authorization): Quad[] {
    const deletes: Quad[] = []
    for (const condition of authorization.condition) {
        if (condition.blankNode) {
            continue
        }
        const shared = context.authorizations.some(other =>
            other.id !== authorization.id &&
            other.condition.some(existing => existing.id === condition.id))
        if (!shared) {
            deletes.push(...context.dataset.filter(item =>
                item.subject.termType === 'NamedNode' &&
                item.subject.value === condition.id))
        }
    }
    return deletes
}

function buildOriginGrant(context: ACLContext, origin: string, modes: AccessMode[]): PatchPlan {
    if (!modes.length) {
        throw new Error('An origin grant requires at least one mode; use planRevoke to remove access.')
    }

    const target = context.defaultACLResource
    const taken = new Set(context.dataset
        .filter(item => item.subject.termType === 'NamedNode')
        .map(item => item.subject.value))
    const deletes: Quad[] = []
    const inserts: Quad[] = []

    const matching = context.authorizations.filter(authorization => authorization.origin.includes(origin))
    if (!matching.length) {
        const id = freshAuthorizationId(context, taken, 'origin')
        inserts.push(
            quad(namedNode(id), namedNode(RDF_TYPE), namedNode(ACL + 'Authorization')),
            quad(namedNode(id), namedNode(ACL + 'accessTo'), namedNode(context.resource)),
            quad(namedNode(id), namedNode(ACL + 'origin'), namedNode(origin))
        )
        for (const mode of modes) {
            inserts.push(quad(namedNode(id), namedNode(ACL + 'mode'), namedNode(modeIRI(mode))))
        }
        return { target, deletes, inserts }
    }

    for (const authorization of matching) {
        if (hasOnlyOriginRecipient(authorization, origin)) {
            deletes.push(...authQuads(context, authorization).filter(item => item.predicate.value === ACL + 'mode'))
            for (const mode of modes) {
                inserts.push(quad(namedNode(authorization.id), namedNode(ACL + 'mode'), namedNode(modeIRI(mode))))
            }
            continue
        }

        const newId = freshAuthorizationId(context, taken, 'origin')
        deletes.push(quad(namedNode(authorization.id), namedNode(ACL + 'origin'), namedNode(origin)))
        if (authorization.condition.some(condition => condition.blankNode)) {
            throw new Error(`Cannot safely split origin authorization ${authorization.id}: blank-node conditions require a full ACL update.`)
        }
        inserts.push(
            quad(namedNode(newId), namedNode(RDF_TYPE), namedNode(ACL + 'Authorization')),
            ...authQuads(context, authorization)
                .filter(item =>
                    item.predicate.value !== ACL + 'origin' &&
                    item.predicate.value !== ACL + 'agent' &&
                    item.predicate.value !== ACL + 'agentClass' &&
                    item.predicate.value !== ACL + 'agentGroup' &&
                    item.predicate.value !== ACL + 'mode')
                .map(item => quad(namedNode(newId), item.predicate, item.object)),
            quad(namedNode(newId), namedNode(ACL + 'origin'), namedNode(origin))
        )
        for (const mode of modes) {
            inserts.push(quad(namedNode(newId), namedNode(ACL + 'mode'), namedNode(modeIRI(mode))))
        }
    }

    return { target, deletes, inserts }
}

function buildOriginRevoke(context: ACLContext, origin: string): PatchPlan {
    const target = context.defaultACLResource
    const deletes: Quad[] = []
    const inserts: Quad[] = []

    const matching = context.authorizations.filter(authorization => authorization.origin.includes(origin))
    if (!matching.length) {
        throw new Error(`No authorization found granting access to origin ${origin}.`)
    }

    for (const authorization of matching) {
        if (hasOnlyOriginRecipient(authorization, origin)) {
            deletes.push(...authQuads(context, authorization))
            deletes.push(...conditionDescriptions(context, authorization))
        } else {
            deletes.push(quad(namedNode(authorization.id), namedNode(ACL + 'origin'), namedNode(origin)))
        }
    }

    return { target, deletes, inserts }
}

export function planOriginGrant(context: ACLContext, originIri: string, modes: AccessMode[]): PatchPlan {
    return buildOriginGrant(context, normalizeOrigin(originIri), modes)
}

export function planOriginRevoke(context: ACLContext, originIri: string): PatchPlan {
    return buildOriginRevoke(context, normalizeOrigin(originIri))
}
