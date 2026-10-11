import { Node } from 'rdflib'
import { MutationOps } from '../shared/types'
import { RowStatus } from '../shared/types'

export interface BioFields {
  description?: string
}

export interface BioDetails extends BioFields {
  sourceNode: Node
}

export interface BioRow extends BioFields {
  sourceNode: string
  status: RowStatus
}

export type BioMutationPlan = MutationOps<BioRow>
