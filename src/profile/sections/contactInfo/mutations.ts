import { LiveStore, NamedNode, Node } from 'rdflib'
import { ns } from '../../../util/ns'
import { ContactAddressRow, ContactMutationPlan, ContactPointRow } from './types'
import { MutationOps } from '../shared/types'
import { collectLinkedNodeStatements, collectNodeStatements, findExistingNode, runUpdateTransport } from '../shared/rdfMutationHelpers'
import { logAndThrowMutationError } from '../shared/mutationErrors'
import { createIdNode } from '../shared/idNodeFactory'
import { contactInfoUpdatesFailedMessageText, updaterUnsupportedStoreErrorMessageText } from '../../texts'
import { buildAddressStatements, buildEmailStatements, buildPhoneStatements } from './rdfBuilders'

async function mutatePhoneEntries(store: LiveStore, subject: NamedNode, phoneOps: MutationOps<ContactPointRow>) {
  const doc = subject.doc()
  const existingPhoneNodes = store.each(subject, ns.vcard('hasTelephone'), null, doc) as Node[]
  const deletions: any[] = []
  const insertions: any[] = []

  phoneOps.remove.forEach((phone) => {
    if (!phone.entryNode) return
    const existingNode = findExistingNode(existingPhoneNodes, phone.entryNode)
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
    if (!phone.entryNode) return
    const existingNode = findExistingNode(existingPhoneNodes, phone.entryNode)
    if (!existingNode) {
      insertions.push(...buildPhoneStatements(subject, doc, createIdNode(doc), phone))
      return
    }
    const linkedPhoneStatements = collectLinkedNodeStatements(store, subject, ns.vcard('hasTelephone'), doc)
    const matchingLinkStatement = linkedPhoneStatements.linkStatements.find((statement) => statement.object?.value === existingNode.value)
    if (matchingLinkStatement) {
      deletions.push(matchingLinkStatement)
    }
    deletions.push(...collectNodeStatements(store, existingNode, doc))
    insertions.push(...buildPhoneStatements(subject, doc, existingNode, phone))
  })

  phoneOps.create.forEach((phone) => {
    insertions.push(...buildPhoneStatements(subject, doc, createIdNode(doc), phone))
  })

  await runUpdateTransport(store, doc, deletions, insertions, {
    unsupportedMessage: updaterUnsupportedStoreErrorMessageText,
    failureMessage: contactInfoUpdatesFailedMessageText,
  })
}

async function mutateEmailEntries(store: LiveStore, subject: NamedNode, emailOps: MutationOps<ContactPointRow>) {
  const doc = subject.doc()
  const existingEmailNodes = store.each(subject, ns.vcard('hasEmail'), null, doc) as Node[]
  const deletions: any[] = []
  const insertions: any[] = []

  emailOps.remove.forEach((email) => {
    if (!email.entryNode) return
    const existingNode = findExistingNode(existingEmailNodes, email.entryNode)
    if (existingNode) {
      const linkedEmailStatements = collectLinkedNodeStatements(store, subject, ns.vcard('hasEmail'), doc)
      const matchingLinkStatement = linkedEmailStatements.linkStatements.find((statement) => statement.object?.value === existingNode.value)
      if (matchingLinkStatement) {
        deletions.push(matchingLinkStatement)
      }
      deletions.push(...collectNodeStatements(store, existingNode, doc))
    }
  })

  emailOps.update.forEach((email) => {
    if (!email.entryNode) return
    const existingNode = findExistingNode(existingEmailNodes, email.entryNode)
    if (!existingNode) {
      insertions.push(...buildEmailStatements(subject, doc, createIdNode(doc), email))
      return
    }
    deletions.push(...collectNodeStatements(store, existingNode, doc))
    insertions.push(...buildEmailStatements(subject, doc, existingNode, email))
  })

  emailOps.create.forEach((email) => {
    insertions.push(...buildEmailStatements(subject, doc, createIdNode(doc), email))
  })

  await runUpdateTransport(store, doc, deletions, insertions, {
    unsupportedMessage: updaterUnsupportedStoreErrorMessageText,
    failureMessage: contactInfoUpdatesFailedMessageText,
  })
}

async function mutateAddressEntries(store: LiveStore, subject: NamedNode, addressOps: MutationOps<ContactAddressRow>) {
  const doc = subject.doc()
  const existingAddressNodes = store.each(subject, ns.vcard('hasAddress'), null, doc) as Node[]
  const deletions: any[] = []
  const insertions: any[] = []

  addressOps.remove.forEach((address) => {
    if (!address.entryNode) return
    const existingNode = findExistingNode(existingAddressNodes, address.entryNode)
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
    if (!address.entryNode) return
    const existingNode = findExistingNode(existingAddressNodes, address.entryNode)
    if (!existingNode) {
      insertions.push(...buildAddressStatements(subject, doc, createIdNode(doc), address))
      return
    }
    deletions.push(...collectNodeStatements(store, existingNode, doc))
    insertions.push(...buildAddressStatements(subject, doc, existingNode, address))
  })

  addressOps.create.forEach((address) => {
    insertions.push(...buildAddressStatements(subject, doc, createIdNode(doc), address))
  })

  await runUpdateTransport(store, doc, deletions, insertions, {
    unsupportedMessage: updaterUnsupportedStoreErrorMessageText,
    failureMessage: contactInfoUpdatesFailedMessageText,
  })
}

export async function processContactInfoMutations(store: LiveStore, subject: NamedNode, mutationPlan: ContactMutationPlan) {
  try {
    await mutatePhoneEntries(store, subject, mutationPlan.phoneOps)
    await mutateEmailEntries(store, subject, mutationPlan.emailOps)
    await mutateAddressEntries(store, subject, mutationPlan.addressOps)
  } catch (error) {
    logAndThrowMutationError(error)
  }
} 
