import { LiveStore, NamedNode } from 'rdflib'
import { ns } from '../../../util/ns'
import { isNamedOrBlankNode } from '../shared/rdfMutationHelpers'
import type { RdfResourceNode } from '../shared/types'
import type { EducationDetails } from './types'

const educationMembershipType = ns.schema('EducationalOccupationalCredential')

function isEducationMembership (store: LiveStore, membership: RdfResourceNode, doc: NamedNode): boolean {
  return store.holds(membership, ns.rdf('type'), educationMembershipType, doc)
}

export function getEducation (subject: NamedNode, store: LiveStore): EducationDetails[] {
  const doc = subject.doc()
  const deduped = new Map<string, EducationDetails>()
  const memberships = store
    .each(null, ns.org('member'), subject, doc)
    .filter(isNamedOrBlankNode)
    .filter((membership) => isEducationMembership(store, membership, doc))

  for (const membership of memberships) {
    const item: EducationDetails = {
      school: (store.anyJS(membership, ns.schema('name'), null, doc) as string | null) || '',
      degree: (store.anyJS(membership, ns.schema('educationalCredentialAwarded'), null, doc) as string | null) || undefined,
      location: (store.anyJS(membership, ns.schema('location'), null, doc) as string | null) || undefined,
      startDate: (store.anyJS(membership, ns.schema('startDate'), null, doc) as string | null) || undefined,
      endDate: (store.anyJS(membership, ns.schema('endDate'), null, doc) as string | null) || undefined,
      description: (store.anyJS(membership, ns.schema('description'), null, doc) as string | null) || undefined,
      sourceNode: membership
    }
    const key = [item.school, item.degree || '', item.location || '', item.startDate || '', item.endDate || ''].join('|')
    const existing = deduped.get(key)
    if (!existing || (existing.sourceNode.termType !== 'NamedNode' && item.sourceNode.termType === 'NamedNode')) {
      deduped.set(key, item)
    }
  }

  return [...deduped.values()].sort((left, right) => {
    const leftCurrent = !left.endDate
    const rightCurrent = !right.endDate
    if (leftCurrent !== rightCurrent) return leftCurrent ? -1 : 1
    return (right.endDate || '').localeCompare(left.endDate || '') ||
      (right.startDate || '').localeCompare(left.startDate || '')
  })
}
