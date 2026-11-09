import { LiveStore, NamedNode } from 'rdflib'
import { ns } from '../../../util/ns'
import type { BioDetails } from './types'

export function getBio (subject: NamedNode, store: LiveStore): BioDetails {
  return {
    description: store.anyJS(subject, ns.vcard('note')),
    sourceNode: subject
  }
}
