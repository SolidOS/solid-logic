import { LiveStore, NamedNode, Node } from 'rdflib'
import { ns } from '../../../util/ns'
import { isNamedOrBlankNode } from '../shared/rdfMutationHelpers'
import type { RdfResourceNode } from '../shared/types'
import type { AddressDetails, ContactInfo, PointDetails } from './types'

function termValue (term: { value?: string } | string | null | undefined): string {
  if (!term) return ''
  return typeof term === 'string' ? term : term.value || ''
}

function isEmailValue (value: string): boolean {
  const normalized = value.trim()
  return /^mailto:/i.test(normalized) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
}

function isPhoneValue (value: string): boolean {
  const normalized = value.trim()
  return /^tel:/i.test(normalized) || /^[+()\-\s\d]{5,}$/.test(normalized)
}

function resolvePointValueNode (
  store: LiveStore,
  sourceNode: RdfResourceNode,
  doc: NamedNode,
  isExpectedValue: (value: string) => boolean
): Node | null {
  if (isExpectedValue(termValue(sourceNode))) return sourceNode

  const inDocument = store.statementsMatching(sourceNode, ns.vcard('value'), null, doc)
  const elsewhere = store.statementsMatching(sourceNode, ns.vcard('value'))
  for (const statement of [...inDocument, ...elsewhere]) {
    if (isRdfNode(statement.object) && isExpectedValue(termValue(statement.object))) return statement.object
  }
  return null
}

function selectPoints (
  subject: NamedNode,
  store: LiveStore,
  predicate: NamedNode,
  isExpectedValue: (value: string) => boolean
): PointDetails[] {
  const doc = subject.doc()
  return store.each(subject, predicate, null, doc).flatMap((sourceNode): PointDetails[] => {
    if (!isNamedOrBlankNode(sourceNode)) return []
    const valueNode = resolvePointValueNode(store, sourceNode, doc, isExpectedValue)
    if (!valueNode) return []
    const type = store.any(sourceNode, ns.rdf('type'), null, doc)
    return [{ sourceNode, type, valueNode }]
  })
}

function selectAddresses (subject: NamedNode, store: LiveStore): AddressDetails[] {
  const doc = subject.doc()
  return store.each(subject, ns.vcard('hasAddress'), null, doc)
    .filter(isNamedOrBlankNode)
    .map((sourceNode) => {
    const type = store.any(sourceNode, ns.rdf('type'), null, doc)
    return {
      sourceNode,
      ...(type ? { type } : {}),
      streetAddress: termValue(store.any(sourceNode, ns.vcard('street-address'), null, doc)),
      locality: termValue(store.any(sourceNode, ns.vcard('locality'), null, doc)),
      region: termValue(store.any(sourceNode, ns.vcard('region'), null, doc)),
      postalCode: termValue(store.any(sourceNode, ns.vcard('postal-code'), null, doc)),
      countryName: termValue(store.any(sourceNode, ns.vcard('country-name'), null, doc))
    }
    })
}

function isRdfNode (value: unknown): value is Node {
  return Boolean(value && typeof value === 'object' && 'termType' in value)
}

export function getContactInfo (subject: NamedNode, store: LiveStore): ContactInfo {
  return {
    emails: selectPoints(subject, store, ns.vcard('hasEmail'), isEmailValue),
    phones: selectPoints(subject, store, ns.vcard('hasTelephone'), isPhoneValue),
    addresses: selectAddresses(subject, store)
  }
}
