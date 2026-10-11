import { Node } from 'rdflib'
import { RowStatus } from '../shared/types'

export interface LanguageFields {
  name: string
  publicId?: string
  proficiency?: string
}

export interface LanguageDetails extends LanguageFields {
  sourceNode: Node
}

export interface LanguageRow extends LanguageFields {
  sourceNode: string
  status: RowStatus
}
