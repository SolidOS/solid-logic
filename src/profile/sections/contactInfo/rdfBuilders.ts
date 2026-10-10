import { literal, NamedNode, Node, st, sym } from 'rdflib'
import { ns } from '../../../util/ns'
import type { ContactAddressRow, ContactPointRow } from './types'
import type { RdfStatement } from '../shared/types'

export function buildPhoneStatements (
  subject: NamedNode,
  doc: NamedNode,
  node: Node,
  phone: ContactPointRow
): RdfStatement[] {
  const value = phone.value.startsWith('tel:') ? phone.value : `tel:${phone.value}`
  const statements = [
    st(subject, ns.vcard('hasTelephone'), node as any, doc),
    st(node as any, ns.vcard('value'), sym(value), doc)
  ]

  if (phone.type) {
    statements.push(st(node as any, ns.rdf('type'), ns.vcard(phone.type), doc))
  }

  return statements
}

export function buildEmailStatements (
  subject: NamedNode,
  doc: NamedNode,
  node: Node,
  email: ContactPointRow
): RdfStatement[] {
  const value = email.value.startsWith('mailto:') ? email.value : `mailto:${email.value}`
  const statements = [
    st(subject, ns.vcard('hasEmail'), node as any, doc),
    st(node as any, ns.vcard('value'), sym(value), doc)
  ]

  if (email.type) {
    statements.push(st(node as any, ns.rdf('type'), ns.vcard(email.type), doc))
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

  if (address.type) statements.push(st(node as any, ns.rdf('type'), ns.vcard(address.type), doc))
  if (address.streetAddress) statements.push(st(node as any, ns.vcard('street-address'), literal(address.streetAddress), doc))
  if (address.locality) statements.push(st(node as any, ns.vcard('locality'), literal(address.locality), doc))
  if (address.region) statements.push(st(node as any, ns.vcard('region'), literal(address.region), doc))
  if (address.postalCode) statements.push(st(node as any, ns.vcard('postal-code'), literal(address.postalCode), doc))
  if (address.countryName) statements.push(st(node as any, ns.vcard('country-name'), literal(address.countryName), doc))

  return statements
}
