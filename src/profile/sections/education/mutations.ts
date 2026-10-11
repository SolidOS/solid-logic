import { LiveStore, NamedNode, Node, st, literal } from 'rdflib'
import { ns } from '../../../util/ns'
import { EducationMutationPlan, EducationRow } from './types'
import { MutationOps } from '../shared/types'
import { collectNodeStatements, findExistingNode, runUpdateTransport } from '../shared/rdfMutationHelpers'
import { logAndThrowMutationError } from '../shared/mutationErrors'
import { saveEducationUpdatesFailedMessageText, updaterUnsupportedStoreErrorMessageText } from '../../texts'

const educationMembershipType = ns.schema('EducationalOccupationalCredential')

function isEducationMembership(store: LiveStore, node: Node, doc: NamedNode): boolean {
  return store.holds(node as any, ns.rdf('type'), educationMembershipType, doc as any)
}

function buildEducationStatements(
  subject: NamedNode, 
  doc: NamedNode, 
  node: Node, 
  education: EducationRow,
  includeMembershipLink = true
) {
  const inserts = includeMembershipLink ? [st(node as any, ns.org('member'), subject, doc)] : []
  inserts.push(st(node as any, ns.rdf('type'), educationMembershipType, doc))

  if (education.school) inserts.push(st(node as any, ns.schema('name'), literal(education.school), doc))
  if (education.degree) inserts.push(st(node as any, ns.schema('educationalCredentialAwarded'), literal(education.degree), doc))
  if (education.location) inserts.push(st(node as any, ns.schema('location'), literal(education.location), doc))
  if (education.startDate) inserts.push(st(node as any, ns.schema('startDate'), literal(education.startDate), doc))
  if (education.endDate) inserts.push(st(node as any, ns.schema('endDate'), literal(education.endDate), doc))
  if (education.description) inserts.push(st(node as any, ns.schema('description'), literal(education.description), doc))

  return inserts
}

async function mutateEducationEntries(store: LiveStore, subject: NamedNode, educationOps: MutationOps<EducationRow>) {
  const doc = subject.doc()
  const existingEducationNodes = (store.each(null, ns.org('member'), subject, doc) as Node[])
    .filter((node) => isEducationMembership(store, node, doc))
  const deletions: any[] = []
  const insertions: any[] = []

  educationOps.remove.forEach((education) => {
    if (!education.sourceNode) return
    const existingNode = findExistingNode(existingEducationNodes, education.sourceNode)
    if (existingNode) {
      deletions.push(...collectNodeStatements(store, existingNode, doc))
    }
  })

  educationOps.update.forEach((education) => {
    if (!education.sourceNode) return
    const existingNode = findExistingNode(existingEducationNodes, education.sourceNode)
    if (!existingNode) {
      insertions.push(...buildEducationStatements(subject, doc, store.bnode(), education))
      return
    }
    deletions.push(...collectNodeStatements(store, existingNode, doc))
    insertions.push(...buildEducationStatements(subject, doc, existingNode, education))
  })

  educationOps.create.forEach((education) => {
    insertions.push(...buildEducationStatements(subject, doc, store.bnode(), education))
  })

  await runUpdateTransport(store, doc, deletions, insertions, {
    unsupportedMessage: updaterUnsupportedStoreErrorMessageText,
    failureMessage: saveEducationUpdatesFailedMessageText,
  })
}

export async function processEducationMutations(store: LiveStore, subject: NamedNode, mutationPlan: EducationMutationPlan) {
  try {
    await mutateEducationEntries(store, subject, mutationPlan)
  } catch (error) {
    logAndThrowMutationError(error, saveEducationUpdatesFailedMessageText)
  }
} 
