import { Node } from 'rdflib'
import { RowStatus } from '../shared/types'

export interface LanguageFields {
  name: string
  publicId?: string
  proficiency?: string
}

export interface LanguageDetails extends LanguageFields {
  entryNode: Node
}

export interface LanguageRow extends LanguageFields {
  entryNode: string
  status: RowStatus
}
