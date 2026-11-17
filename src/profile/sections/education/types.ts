import { Node } from 'rdflib'
import { MutationOps } from '../shared/types'
import { RowStatus } from '../shared/types'

export interface EducationFields {
  school: string
  degree?: string
  location?: string
  startDate?: string
  endDate?: string
  description?: string
}

export interface EducationDetails extends EducationFields {
  sourceNode: Node
}

export interface EducationRow extends EducationFields {
  sourceNode: string
  status: RowStatus
}

export type EducationMutationPlan = MutationOps<EducationRow>
