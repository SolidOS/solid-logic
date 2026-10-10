import { Literal, Node } from 'rdflib'
import { RowStatus } from '../shared/types'

export interface ResumeDetails extends RoleDetails {}

export interface RoleDetails extends Role {
  entryNode: Node
}

export interface ResumeRow extends Role {
  entryNode: string
  status: RowStatus
}

export interface Role {
  title: string,
  roleType?: string,
  startDate?: Literal,
  endDate?: Literal,
  isCurrentRole?: boolean,
  orgName: string,
  orgPublicId?: string,
  orgType?: string,
  orgLocation?: string,
  orgHomePage?: string,
  description?: string
}

/* Presentation of CV data has changed do not need rolesbytype */
export const typesOfRole = ['PastRole', 'CurrentRole', 'FutureRole']

export interface CVPresentation { 
  roles: RoleDetails[];
}

export interface RolesByType {
  PastRole: RoleDetails[];
  CurrentRole: RoleDetails[];
  FutureRole: RoleDetails[];
}
