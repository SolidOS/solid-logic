import { LiveStore, NamedNode, Node } from 'rdflib'
import { ns } from '../../../util/ns'
import { ContactAddressRow, ContactMutationPlan, ContactPointRow } from './types'
import { MutationOps } from '../shared/types'
import { collectLinkedNodeStatements, collectNodeStatements, findExistingNode, runUpdateTransport, uniqueStatements } from '../shared/rdfMutationHelpers'
import { logAndThrowMutationError } from '../shared/mutationErrors'
import { createIdNode } from '../shared/idNodeFactory'
import { saveContactUpdatesFailedMessageText, updaterUnsupportedStoreErrorMessageText } from '../../texts'
import { buildAddressStatements, buildEmailStatements, buildPhoneStatements } from './rdfBuilders'

function collectOwnedNodeStatements(store: LiveStore, node: Node, doc: NamedNode, predicates: NamedNode[]) {
  return predicates.flatMap(predicate => store.statementsMatching(node as any, predicate, null, doc))
}

const pointValuePredicates = [ns.vcard('value'), ns.rdf('type')]
const addressValuePredicates = [
  ns.rdf('type'),
  ns.vcard('street-address'),
  ns.vcard('locality'),
  ns.vcard('region'),
  ns.vcard('postal-code'),
  ns.vcard('country-name')
]

function mutatePhoneEntries(store: LiveStore, subject: NamedNode, phoneOps: MutationOps<ContactPointRow>, deletions: any[], insertions: any[]) {
  const doc = subject.doc()
  const existingPhoneNodes = store.each(subject, ns.vcard('hasTelephone'), null, doc) as Node[]

  phoneOps.remove.forEach((phone) => {
    if (!phone.sourceNode) return
    const existingNode = findExistingNode(existingPhoneNodes, phone.sourceNode)
    if (existingNode) {
      const linkedPhoneStatements = collectLinkedNodeStatements(store, subject, ns.vcard('hasTelephone'), doc)
      const matchingLinkStatement = linkedPhoneStatements.linkStatements.find((statement) => statement.object?.value === existingNode.value)
      if (matchingLinkStatement) {
        deletions.push(matchingLinkStatement)
      }
      deletions.push(...collectNodeStatements(store, existingNode, doc))
    }
  })

  phoneOps.update.forEach((phone) => {
    if (!phone.sourceNode) return
    const existingNode = findExistingNode(existingPhoneNodes, phone.sourceNode)
    if (!existingNode) {
      insertions.push(...buildPhoneStatements(subject, doc, createIdNode(doc), phone))
      return
    }
    const isDirectPhoneValue = existingNode.termType === 'NamedNode' && /^tel:/i.test(existingNode.value)
    const targetNode = isDirectPhoneValue ? createIdNode(doc) : existingNode
    if (isDirectPhoneValue) {
      const linkedPhoneStatements = collectLinkedNodeStatements(store, subject, ns.vcard('hasTelephone'), doc)
      const matchingLinkStatement = linkedPhoneStatements.linkStatements.find((statement) => statement.object?.value === existingNode.value)
      if (matchingLinkStatement) deletions.push(matchingLinkStatement)
    } else {
      deletions.push(...collectOwnedNodeStatements(store, existingNode, doc, pointValuePredicates))
    }
    insertions.push(...buildPhoneStatements(subject, doc, targetNode, phone))
  })

  phoneOps.create.forEach((phone) => {
    insertions.push(...buildPhoneStatements(subject, doc, createIdNode(doc), phone))
  })

}

function mutateEmailEntries(store: LiveStore, subject: NamedNode, emailOps: MutationOps<ContactPointRow>, deletions: any[], insertions: any[]) {
  const doc = subject.doc()
  const existingEmailNodes = store.each(subject, ns.vcard('hasEmail'), null, doc) as Node[]

  emailOps.remove.forEach((email) => {
    if (!email.sourceNode) return
    const existingNode = findExistingNode(existingEmailNodes, email.sourceNode)
    if (existingNode) {
      const linkedEmailStatements = collectLinkedNodeStatements(store, subject, ns.vcard('hasEmail'), doc)
      const matchingLinkStatement = linkedEmailStatements.linkStatements.find((statement) => statement.object?.value === existingNode.value)
      if (matchingLinkStatement) {
        deletions.push(matchingLinkStatement)
      }
      deletions.push(...collectOwnedNodeStatements(store, existingNode, doc, pointValuePredicates))
    }
  })

  emailOps.update.forEach((email) => {
    if (!email.sourceNode) return
    const existingNode = findExistingNode(existingEmailNodes, email.sourceNode)
    if (!existingNode) {
      insertions.push(...buildEmailStatements(subject, doc, createIdNode(doc), email))
      return
    }
    deletions.push(...collectOwnedNodeStatements(store, existingNode, doc, pointValuePredicates))
    insertions.push(...buildEmailStatements(subject, doc, existingNode, email))
  })

  emailOps.create.forEach((email) => {
    insertions.push(...buildEmailStatements(subject, doc, createIdNode(doc), email))
  })

}

function mutateAddressEntries(store: LiveStore, subject: NamedNode, addressOps: MutationOps<ContactAddressRow>, deletions: any[], insertions: any[]) {
  const doc = subject.doc()
  const existingAddressNodes = store.each(subject, ns.vcard('hasAddress'), null, doc) as Node[]

  addressOps.remove.forEach((address) => {
    if (!address.sourceNode) return
    const existingNode = findExistingNode(existingAddressNodes, address.sourceNode)
    if (existingNode) {
      const linkedAddressStatements = collectLinkedNodeStatements(store, subject, ns.vcard('hasAddress'), doc)
      const matchingLinkStatement = linkedAddressStatements.linkStatements.find((statement) => statement.object?.value === existingNode.value)
      if (matchingLinkStatement) {
        deletions.push(matchingLinkStatement)
      }
      deletions.push(...collectNodeStatements(store, existingNode, doc))
    }
  })

  addressOps.update.forEach((address) => {
    if (!address.sourceNode) return
    const existingNode = findExistingNode(existingAddressNodes, address.sourceNode)
    if (!existingNode) {
      insertions.push(...buildAddressStatements(subject, doc, createIdNode(doc), address))
      return
    }
    deletions.push(...collectOwnedNodeStatements(store, existingNode, doc, addressValuePredicates))
    insertions.push(...buildAddressStatements(subject, doc, existingNode, address))
  })

  addressOps.create.forEach((address) => {
    insertions.push(...buildAddressStatements(subject, doc, createIdNode(doc), address))
  })

}

export async function processContactInfoMutations(store: LiveStore, subject: NamedNode, mutationPlan: ContactMutationPlan) {
  try {
    const doc = subject.doc()
    const deletions: any[] = []
    const insertions: any[] = []

    mutatePhoneEntries(store, subject, mutationPlan.phoneOps, deletions, insertions)
    mutateEmailEntries(store, subject, mutationPlan.emailOps, deletions, insertions)
    mutateAddressEntries(store, subject, mutationPlan.addressOps, deletions, insertions)

    await runUpdateTransport(store, doc, uniqueStatements(deletions), uniqueStatements(insertions), {
      unsupportedMessage: updaterUnsupportedStoreErrorMessageText,
      failureMessage: saveContactUpdatesFailedMessageText,
    })
  } catch (error) {
    logAndThrowMutationError(error, saveContactUpdatesFailedMessageText)
  }
} 
