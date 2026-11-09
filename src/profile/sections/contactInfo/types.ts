import { Node } from 'rdflib'
import { MutationOps, RowStatus } from '../shared/types'
/* using Node instead of NamedNode because the data could
also be a blank node because it's coming from user-edited profile data */
export interface PointDetails {
  sourceNode: Node,
  type: Node | null,
  valueNode: Node
}
export interface AddressDetails {
  sourceNode: Node,
  type?: Node,
  streetAddress?: string,
  locality?: string,
  region?: string,
  postalCode?: string,
  countryName?: string
}

export interface ContactInfo {
  emails: PointDetails[],
  phones: PointDetails[],
  addresses: AddressDetails[]
}

export type ContactPointRow = {
  value: string
  type: string
  sourceNode: string
  status: RowStatus
}

export type ContactAddressRow = {
  streetAddress?: string,
  locality?: string,
  region?: string,
  postalCode?: string,
  countryName?: string
  type: string
  sourceNode: string
  status: RowStatus
}

export type ContactMutationPlan = {
  phoneOps: MutationOps<ContactPointRow>
  emailOps: MutationOps<ContactPointRow>
  addressOps: MutationOps<ContactAddressRow>
}
