import { literal, NamedNode, Node, st, sym } from 'rdflib'
import { ns } from '../../../util/ns'
import type { ContactAddressRow, ContactPointRow } from './types'
import type { RdfStatement } from '../shared/types'

function normalizeValue (value: string): string {
  return value.trim()
}

function normalizePhoneValue (value: string): string {
  const normalized = normalizeValue(value).replace(/^tel:/i, '').replace(/\s+/g, '')
  return `tel:${normalized}`
}

function normalizeEmailValue (value: string): string {
  const normalized = normalizeValue(value)
  return /^mailto:/i.test(normalized) ? `mailto:${normalized.slice(7)}` : `mailto:${normalized}`
}

function typeNode (type: string): NamedNode {
  const normalized = normalizeValue(type)
  if (/^https?:\/\//i.test(normalized)) return sym(normalized)
  const localName = normalized.replace(/^vcard:/i, '')
  return ns.vcard(localName)
}

export function buildPhoneStatements (
  subject: NamedNode,
  doc: NamedNode,
  node: Node,
  phone: ContactPointRow
): RdfStatement[] {
  const value = normalizePhoneValue(phone.value)
  const statements = [
    st(subject, ns.vcard('hasTelephone'), node as any, doc),
    st(node as any, ns.vcard('value'), sym(value), doc)
  ]

  if (phone.type) {
    statements.push(st(node as any, ns.rdf('type'), typeNode(phone.type), doc))
  }

  return statements
}

export function buildEmailStatements (
  subject: NamedNode,
  doc: NamedNode,
  node: Node,
  email: ContactPointRow
): RdfStatement[] {
  const value = normalizeEmailValue(email.value)
  const statements = [
    st(subject, ns.vcard('hasEmail'), node as any, doc),
    st(node as any, ns.vcard('value'), sym(value), doc)
  ]

  if (email.type) {
    statements.push(st(node as any, ns.rdf('type'), typeNode(email.type), doc))
  }

  return statements
}

export function buildAddressStatements (
  subject: NamedNode,
  doc: NamedNode,
  node: Node,
  address: ContactAddressRow
): RdfStatement[] {
  const statements = [st(subject, ns.vcard('hasAddress'), node as any, doc)]

  if (address.type) statements.push(st(node as any, ns.rdf('type'), typeNode(address.type), doc))
  if (address.streetAddress) statements.push(st(node as any, ns.vcard('street-address'), literal(normalizeValue(address.streetAddress)), doc))
  if (address.locality) statements.push(st(node as any, ns.vcard('locality'), literal(normalizeValue(address.locality)), doc))
  if (address.region) statements.push(st(node as any, ns.vcard('region'), literal(normalizeValue(address.region)), doc))
  if (address.postalCode) statements.push(st(node as any, ns.vcard('postal-code'), literal(normalizeValue(address.postalCode)), doc))
  if (address.countryName) statements.push(st(node as any, ns.vcard('country-name'), literal(normalizeValue(address.countryName)), doc))

  return statements
}
