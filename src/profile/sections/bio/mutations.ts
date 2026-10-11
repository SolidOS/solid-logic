import { LiveStore, NamedNode } from 'rdflib'
import { ns } from '../../../util/ns'
import { BioMutationPlan, BioRow } from './types'
import { MutationOps } from '../shared/types'
import { replaceLiteralPredicateStatements, runUpdateTransport } from '../shared/rdfMutationHelpers'
import { logAndThrowMutationError } from '../shared/mutationErrors'
import { saveBioUpdatesFailedMessageText, updaterUnsupportedStoreErrorMessageText } from '../../texts'

async function mutateBioEntry(store: LiveStore, subject: NamedNode, bioOps: MutationOps<BioRow>) {
  const doc = subject.doc()
  const deletions: any[] = []
  const insertions: any[] = []

  const applyBasics = (bio: BioRow, clearAll = false) => {
    const data = clearAll
      ? {
          description: '',
        }
      : bio

    replaceLiteralPredicateStatements(store, subject, ns.vcard('note'), doc, deletions, insertions, data.description)
  }

  const removeBio = bioOps.remove[0]
  const updateBio = bioOps.update[0]
  const createBio = bioOps.create[0]

  const selectedBio = updateBio || createBio || removeBio
  if (selectedBio) {
    applyBasics(selectedBio, Boolean(removeBio && !updateBio && !createBio))
  }

  await runUpdateTransport(store, doc, deletions, insertions, {
    unsupportedMessage: updaterUnsupportedStoreErrorMessageText,
    failureMessage: saveBioUpdatesFailedMessageText,
  })
}

export async function processBioMutations(store: LiveStore, subject: NamedNode, mutationPlan: BioMutationPlan) {
  try {
    await mutateBioEntry(store, subject, mutationPlan)
  } catch (error) {
    logAndThrowMutationError(error, saveBioUpdatesFailedMessageText)
  }
} 
