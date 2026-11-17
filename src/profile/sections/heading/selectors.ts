import { LiveStore, NamedNode, Node } from 'rdflib'
import { labelForNode } from '../../../directory/directoryHelpers'
import { ns } from '../../../util/ns'
import { getContactInfo } from '../contactInfo/selectors'
import type { AddressDetails, PointDetails } from '../contactInfo/types'
import { presentCV } from '../resume/selectors'
import type { RoleDetails } from '../resume/types'
import type { ProfileDetails } from './types'

function isWorkPoint (point: PointDetails): boolean {
  const type = point.type?.value.toLowerCase() || ''
  return type === 'work' || type.endsWith('#work') || type.endsWith('/work')
}

function selectHeadingRole (roles: RoleDetails[]): RoleDetails | undefined {
  const current = roles.find(role => role.isCurrentRole || role.roleType?.replace(/\s+/g, '').toLowerCase() === 'currentrole')
  return current || roles.find(role => {
    const type = role.roleType?.replace(/\s+/g, '').toLowerCase()
    return type !== 'currentrole' && type !== 'futurerole'
  })
}

function imageForProfile (store: LiveStore, subject: NamedNode): string | undefined {
  const imagePredicates = [
    ns.vcard('hasPhoto'),
    ns.sioc('avatar'),
    ns.foaf('img'),
    ns.vcard('logo'),
    ns.vcard('photo'),
    ns.foaf('depiction')
  ]
  return imagePredicates
    .map(predicate => store.any(subject, predicate))
    .find((image): image is Node => Boolean(image))?.value
}

function formatLocation (address: AddressDetails | undefined): string | undefined {
  if (!address) return undefined
  if (address.countryName && address.locality) return `${address.locality}, ${address.countryName}`
  return address.countryName || address.locality || undefined
}

export function getHeading (subject: NamedNode, store: LiveStore): ProfileDetails {
  const contact = getContactInfo(subject, store)
  const primaryPhone = contact.phones.find(isWorkPoint) || contact.phones[0]
  const primaryEmail = contact.emails.find(isWorkPoint) || contact.emails[0]
  const pronounSubject = store.anyValue(subject, ns.solid('preferredSubjectPronoun')) || ''
  const pronounObject = store.anyValue(subject, ns.solid('preferredObjectPronoun')) || ''
  const headingRole = selectHeadingRole(presentCV(subject, store))

  return {
    name: labelForNode(store, subject),
    nickname: store.anyValue(subject, ns.vcard('nickname')) || store.anyValue(subject, ns.foaf('nick')) || undefined,
    imageSrc: imageForProfile(store, subject),
    dateOfBirth: store.anyValue(subject, ns.vcard('bday')) || undefined,
    jobTitle: headingRole?.title || undefined,
    primaryPhone,
    primaryEmail,
    primaryAddress: contact.addresses[0],
    location: formatLocation(contact.addresses[0]),
    pronouns: pronounSubject ? `${pronounSubject}${pronounObject ? `/${pronounObject}` : ''}` : '',
    sourceNode: subject
  }
}
