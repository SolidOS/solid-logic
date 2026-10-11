import { Node } from 'rdflib'
import { MutationOps, RowStatus } from '../shared/types'

export interface SocialFields {
  name?: string
  icon?: string
  homepage?: string 
}

export interface Account extends SocialFields {
  sourceNode: Node
}

export interface SocialPresentation { 
  accounts: Account[]
}

export interface SocialRow extends SocialFields {
  sourceNode: string
  status: RowStatus
}

export type SocialAccountOption = {
  classUri: string
  label: string
  icon: string
  homepage?: string
  userProfilePrefix?: string
}

export type SocialMutationPlan = MutationOps<SocialRow>
