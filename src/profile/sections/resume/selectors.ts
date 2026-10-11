import type { LiveStore, NamedNode, Node } from 'rdflib'
import { ns } from '../../../util/ns'
import { isNamedOrBlankNode } from '../shared/rdfMutationHelpers'
import type { RdfResourceNode } from '../shared/types'
import type { RoleDetails } from './types'

const educationMembershipType = ns.schema('EducationalOccupationalCredential')
const vcardOrganizationType = ns.vcard('Organization').value
const roleTypes = ['PastRole', 'CurrentRole', 'FutureRole']

function localNameFromUri (uri: string): string {
  const value = uri.trim()
  if (!value) return ''
  return value.match(/[#/]([^#/]+)$/)?.[1] || value
}

function nodeToDisplayText (store: LiveStore, node: Node | null | undefined, doc: NamedNode): string {
  if (!node) return ''
  if (node.termType === 'Literal') return node.value
  if (node.termType === 'NamedNode') {
    return (store.anyJS(node as NamedNode, ns.rdfs('label'), null, doc) as string | null) || localNameFromUri(node.value)
  }
  return ''
}

function roleTypeFromMembership (store: LiveStore, membership: RdfResourceNode, doc: NamedNode): string {
  const matchingTypes = store
    .each(membership, ns.rdf('type'), null, doc)
    .filter((node): node is NamedNode => node.termType === 'NamedNode' && node.value.startsWith(ns.solid('').value))
  const roleType = matchingTypes.find(node => roleTypes.includes(localNameFromUri(node.value))) || matchingTypes[0]
  return nodeToDisplayText(store, roleType, doc)
}

function organizationTypeFromNode (store: LiveStore, organization: RdfResourceNode, doc: NamedNode): string {
  const classification = store.any(organization, ns.org('classification'), null, doc)
  const classificationText = nodeToDisplayText(store, classification, doc)
  if (classificationText) return classificationText

  const organizationTypes = store
    .each(organization, ns.rdf('type'), null, doc)
    .filter((node): node is NamedNode => node.termType === 'NamedNode' && node.value !== vcardOrganizationType)
  const preferred = organizationTypes.find(node => node.value.startsWith(ns.schema('').value)) || organizationTypes[0]
  return nodeToDisplayText(store, preferred, doc)
}

function isEducationMembership (store: LiveStore, membership: RdfResourceNode, doc: NamedNode): boolean {
  return store.holds(membership, ns.rdf('type'), educationMembershipType, doc)
}

function roleDedupeKey (role: RoleDetails): string {
  return [role.title, role.orgName, role.startDate?.value || '', role.endDate?.value || ''].join('|')
}

function sortRoles (roles: RoleDetails[]): RoleDetails[] {
  return roles.sort((left, right) => {
    const leftCurrent = !left.endDate
    const rightCurrent = !right.endDate
    if (leftCurrent !== rightCurrent) return leftCurrent ? -1 : 1

    return (right.endDate?.value || '').localeCompare(left.endDate?.value || '') ||
      (right.startDate?.value || '').localeCompare(left.startDate?.value || '')
  })
}

export function presentCV (subject: NamedNode, store: LiveStore): RoleDetails[] {
  const doc = subject.doc()
  const deduped = new Map<string, RoleDetails>()
  const memberships = store
    .each(null, ns.org('member'), subject, doc)
    .filter(isNamedOrBlankNode)
    .filter(membership => !isEducationMembership(store, membership, doc))

  for (const membership of memberships) {
    const organization = store.any(membership, ns.org('organization'), null, doc)
    const organizationNode = isNamedOrBlankNode(organization) ? organization : undefined
    const publicId = organizationNode && store.any(organizationNode, ns.solid('publicId'), null, doc)
    const publicIdNode = isNamedOrBlankNode(publicId) ? publicId : undefined
    const escoRole = store.any(membership, ns.org('role'), null, doc)
    const roleName = isNamedOrBlankNode(escoRole)
      ? store.anyJS(escoRole, ns.schema('name'), null, doc) as string | null
      : null
    const roleText = store.anyJS(membership, ns.vcard('role'), null, doc) as string | null

    const item: RoleDetails = {
      title: roleText && roleName ? `${roleName} - ${roleText}` : roleText || roleName || '',
      roleType: roleTypeFromMembership(store, membership, doc),
      sourceNode: membership,
      startDate: store.any(membership, ns.schema('startDate'), null, doc) as RoleDetails['startDate'],
      endDate: store.any(membership, ns.schema('endDate'), null, doc) as RoleDetails['endDate'],
      isCurrentRole: !store.any(membership, ns.schema('endDate'), null, doc),
      orgName: (publicIdNode && store.anyJS(publicIdNode, ns.schema('name'), null, doc) as string | null) ||
        (organizationNode && store.anyJS(organizationNode, ns.schema('name'), null, doc) as string | null) || '',
      orgPublicId: publicIdNode?.value || '',
      orgType: organizationNode ? organizationTypeFromNode(store, organizationNode, doc) : '',
      orgLocation: organizationNode ? (store.any(organizationNode, ns.org('location'), null, doc)?.value || '') : '',
      orgHomePage: organizationNode ? (store.any(organizationNode, ns.schema('uri'), null, doc)?.value || '') : '',
      description: (store.anyJS(membership, ns.schema('description'), null, doc) as string | null) || undefined
    }

    const existing = deduped.get(roleDedupeKey(item))
    if (!existing || (existing.sourceNode.termType !== 'NamedNode' && item.sourceNode.termType === 'NamedNode')) {
      deduped.set(roleDedupeKey(item), item)
    }
  }

  return sortRoles([...deduped.values()])
}
