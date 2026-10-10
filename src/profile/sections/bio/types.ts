import { Node } from 'rdflib'
import { MutationOps } from '../shared/types'
import { RowStatus } from '../shared/types'

export interface BioFields {
  description?: string
}

export interface BioDetails extends BioFields {
  entryNode: Node
}

export interface BioRow extends BioFields {
  entryNode: string
  status: RowStatus
}

export type BioMutationPlan = MutationOps<BioRow>
