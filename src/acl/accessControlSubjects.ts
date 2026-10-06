import { LiveStore, sym } from 'rdflib'
import { ns } from '../util/ns'

export type AccessControlSubjectKind = 'agent' | 'agentGroup' | 'agentClass' | 'origin'

export type AccessControlSubject = {
    kind: AccessControlSubjectKind
    subjectValue: string
}

const ACCESS_CONTROL_SUBJECT_GROUPS = {
    agentClass: [ns.foaf('Agent'), ns.acl('AuthenticatedAgent'), ns.rdf('Resource'), ns.owl('Thing')],
    agent: [ns.vcard('WebID'), ns.vcard('Individual'), ns.foaf('Person'), ns.foaf('Agent')],
    agentGroup: [ns.vcard('Group')],
    origin: [ns.solid('AppProvider'), ns.solid('AppProviderClass')]
} as const

function hasKnownTypes (types: Record<string, unknown>): boolean {
    return Object.keys(types).length > 0
}

function isHttpUrl (value: string): boolean {
    return value.startsWith('http://') || value.startsWith('https://')
}

function isBareOriginUrl (value: string): boolean {
    try {
        const parsed = new URL(value)
        return (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
            parsed.pathname === '/' &&
            !parsed.search &&
            !parsed.hash
    } catch (_error) {
        return false
    }
}

function normalizeOriginUrl (value: string): string {
    try {
        const parsed = new URL(value)
        if (
            (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
            parsed.pathname === '/' &&
            !parsed.search &&
            !parsed.hash
        ) {
            return `${parsed.protocol}//${parsed.host}`
        }
    } catch (_error) {
        // Return the original value below when parsing fails.
    }

    return value
}

export async function classifyAccessControlSubject (store: LiveStore, principle: string): Promise<AccessControlSubject | undefined> {
    const subject = sym(principle)
    let types = store.findTypeURIs(subject)

    if (isBareOriginUrl(principle)) {
        return { kind: 'origin', subjectValue: normalizeOriginUrl(principle) }
    }

    if (!hasKnownTypes(types) && isHttpUrl(principle)) {
        try {
            await store.fetcher.load(subject.doc())
        } catch (error) {
            console.error(`Failed to load access target ${principle}`, error)
        }

        types = store.findTypeURIs(subject)
    }

    if (ACCESS_CONTROL_SUBJECT_GROUPS.origin.some(term => term.uri in types)) {
        return { kind: 'origin', subjectValue: principle }
    }

    if (ACCESS_CONTROL_SUBJECT_GROUPS.agent.some(term => term.uri in types)) {
        const preferredURI = store.any(subject, ns.foaf('preferredURI'))
        return {
            kind: 'agent',
            subjectValue: preferredURI?.value ?? principle
        }
    }

    if (ACCESS_CONTROL_SUBJECT_GROUPS.agentGroup.some(term => term.uri in types)) {
        return { kind: 'agentGroup', subjectValue: principle }
    }

    if (ACCESS_CONTROL_SUBJECT_GROUPS.agentClass.some(term => subject.sameTerm(term))) {
        return { kind: 'agentClass', subjectValue: principle }
    }

    return undefined
}
