import { Node } from 'rdflib'
import { MutationOps } from '../shared/types'
import { RowStatus } from '../shared/types'
import { ns } from '../../../util/ns'

export const projectType = ns.schema('Project')

export interface ProjectFields {
  url: string
  title?: string
  name?: string
  orgName?: string
  imageUrl?: string
  category?: 'project' | 'community' | 'unknown'
}

export interface ProjectDetails extends ProjectFields {
  sourceNode: Node
}

export interface ProjectRow extends ProjectFields {
  sourceNode: string
  status: RowStatus
}

export type ProjectInputRowProps = {
  rows: ProjectRow[]
  index: number
  displayIndex: number
  onDelete: () => void
  onChange: () => void
}

export type ProjectMutationPlan = MutationOps<ProjectRow>
