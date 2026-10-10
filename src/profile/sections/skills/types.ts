import { Node } from 'rdflib'
import { RowStatus } from '../shared/types'

export interface SkillFields {
  name: string
  publicId: string
}

export interface SkillDetails extends SkillFields {
  entryNode: Node
}

export interface SkillRow extends SkillFields {
  entryNode: string
  status: RowStatus
}
