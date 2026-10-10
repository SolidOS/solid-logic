import { LiveStore, NamedNode, Node, literal, sym } from 'rdflib'
import { ns } from '../../../util/ns'
import { ProfileBasicRow, HeadingMutationPlan } from './types'
import { MutationOps } from '../shared/types'
import { collectLinkedNodeStatements, collectNodeStatements, findExistingNode, replaceLiteralPredicateStatements, replacePredicateStatements, runUpdateTransport } from '../shared/rdfMutationHelpers'
import { logAndThrowMutationError } from '../shared/mutationErrors'
import { createIdNode } from '../shared/idNodeFactory'
import { ContactAddressRow, ContactPointRow } from '../contactInfo/types'
import { buildAddressStatements, buildEmailStatements, buildPhoneStatements } from '../contactInfo/rdfBuilders'
import { headingUpdatesFailedMessageText, updaterUnsupportedStoreErrorMessageText } from '../../texts'
import { trimText } from '../shared/text'

function splitPronouns(value?: string): { subjectPronoun?: string, objectPronoun?: string } {
  const normalized = trimText(value)
  if (!normalized) return {}

  const [subjectPronounRaw, objectPronounRaw] = normalized.split('/').map((part) => part.trim())
  const subjectPronoun = subjectPronounRaw || undefined
  const objectPronoun = objectPronounRaw || undefined

  return { subjectPronoun, objectPronoun }
}

function findOpWithExistingEntry<T extends { entryNode: string }>(ops: T[], existingNodes: Node[]): T | undefined {
  return ops.find((op) => Boolean(op.entryNode) && Boolean(findExistingNode(existingNodes, op.entryNode)))
}

function findCreateOp<T extends { entryNode: string }>(ops: T[]): T | undefined {
  return ops.find((op) => !op.entryNode)
}

async function mutatePhoneEntry(store: LiveStore, subject: NamedNode, phoneOps: MutationOps<ContactPointRow>) {
  const doc = subject.doc()
  const existingPhoneNodes = store.each(subject, ns.vcard('hasTelephone'), null, doc) as Node[]
  const deletions: any[] = []
  const insertions: any[] = []

  const removePhone = findOpWithExistingEntry(phoneOps.remove, existingPhoneNodes)
  const updatePhone = findOpWithExistingEntry(phoneOps.update, existingPhoneNodes)
  const createPhone = findCreateOp(phoneOps.create) || phoneOps.create[0]

  if (removePhone?.entryNode) {
    const existingNode = findExistingNode(existingPhoneNodes, removePhone.entryNode)
    if (existingNode) {
      const linkedPhoneStatements = collectLinkedNodeStatements(store, subject, ns.vcard('hasTelephone'), doc)
      const matchingLinkStatement = linkedPhoneStatements.linkStatements.find((statement) => statement.object?.value === existingNode.value)
      if (matchingLinkStatement) {
        deletions.push(matchingLinkStatement)
      }
      deletions.push(...collectNodeStatements(store, existingNode, doc))
    }
  }

  if (updatePhone) {
    const existingNode = findExistingNode(existingPhoneNodes, updatePhone.entryNode)
    if (existingNode) {
      deletions.push(...collectNodeStatements(store, existingNode, doc))
      insertions.push(...buildPhoneStatements(subject, doc, existingNode, updatePhone))
    }
  }

  if (createPhone) {
    insertions.push(...buildPhoneStatements(subject, doc, createIdNode(doc), createPhone))
  }

  await runUpdateTransport(store, doc, deletions, insertions, {
    unsupportedMessage: updaterUnsupportedStoreErrorMessageText,
    failureMessage: headingUpdatesFailedMessageText,
  })
}

async function mutateEmailEntry(store: LiveStore, subject: NamedNode, emailOps: MutationOps<ContactPointRow>) {
  const doc = subject.doc()
  const existingEmailNodes = store.each(subject, ns.vcard('hasEmail'), null, doc) as Node[]
  const deletions: any[] = []
  const insertions: any[] = []

  const removeEmail = findOpWithExistingEntry(emailOps.remove, existingEmailNodes)
  const updateEmail = findOpWithExistingEntry(emailOps.update, existingEmailNodes)
  const createEmail = findCreateOp(emailOps.create) || emailOps.create[0]

  if (removeEmail?.entryNode) {
    const existingNode = findExistingNode(existingEmailNodes, removeEmail.entryNode)
    if (existingNode) {
      const linkedEmailStatements = collectLinkedNodeStatements(store, subject, ns.vcard('hasEmail'), doc)
      const matchingLinkStatement = linkedEmailStatements.linkStatements.find((statement) => statement.object?.value === existingNode.value)
      if (matchingLinkStatement) {
        deletions.push(matchingLinkStatement)
      }
      deletions.push(...collectNodeStatements(store, existingNode, doc))
    }
  }

  if (updateEmail) {
    const existingNode = findExistingNode(existingEmailNodes, updateEmail.entryNode)
    if (existingNode) {
      deletions.push(...collectNodeStatements(store, existingNode, doc))
      insertions.push(...buildEmailStatements(subject, doc, existingNode, updateEmail))
    }
  }

  if (createEmail) {
    insertions.push(...buildEmailStatements(subject, doc, createIdNode(doc), createEmail))
  }

  await runUpdateTransport(store, doc, deletions, insertions, {
    unsupportedMessage: updaterUnsupportedStoreErrorMessageText,
    failureMessage: headingUpdatesFailedMessageText,
  })
}

async function mutateAddressEntry(store: LiveStore, subject: NamedNode, addressOps: MutationOps<ContactAddressRow>) {
  const doc = subject.doc()
  const existingAddressNodes = store.each(subject, ns.vcard('hasAddress'), null, doc) as Node[]
  const deletions: any[] = []
  const insertions: any[] = []

  const removeAddress = findOpWithExistingEntry(addressOps.remove, existingAddressNodes)
  const updateAddress = findOpWithExistingEntry(addressOps.update, existingAddressNodes)
  const createAddress = findCreateOp(addressOps.create) || addressOps.create[0]

  if (removeAddress?.entryNode) {
    const existingNode = findExistingNode(existingAddressNodes, removeAddress.entryNode)
    if (existingNode) {
      const linkedAddressStatements = collectLinkedNodeStatements(store, subject, ns.vcard('hasAddress'), doc)
      const matchingLinkStatement = linkedAddressStatements.linkStatements.find((statement) => statement.object?.value === existingNode.value)
      if (matchingLinkStatement) {
        deletions.push(matchingLinkStatement)
      }
      deletions.push(...collectNodeStatements(store, existingNode, doc))
    }
  }

  if (updateAddress) {
    const existingNode = findExistingNode(existingAddressNodes, updateAddress.entryNode)
    if (existingNode) {
      deletions.push(...collectNodeStatements(store, existingNode, doc))
      insertions.push(...buildAddressStatements(subject, doc, existingNode, updateAddress))
    }
  }

  if (createAddress) {
    insertions.push(...buildAddressStatements(subject, doc, createIdNode(doc), createAddress))
  }

  await runUpdateTransport(store, doc, deletions, insertions, {
    unsupportedMessage: updaterUnsupportedStoreErrorMessageText,
    failureMessage: headingUpdatesFailedMessageText,
  })
}

async function mutateBasicProfileEntry(store: LiveStore, subject: NamedNode, basicOps: MutationOps<ProfileBasicRow>) {
  const doc = subject.doc()
  const deletions: any[] = []
  const insertions: any[] = []

  const replacePhotoField = (value?: string) => {
    const normalized = trimText(value)
    const nextObject = !normalized
      ? null
      : (normalized.startsWith('http://') || normalized.startsWith('https://'))
        ? sym(normalized)
        : literal(normalized)
    replacePredicateStatements(store, subject, ns.vcard('hasPhoto'), doc, deletions, insertions, nextObject)
  }

  const replacePronounFields = (value?: string) => {
    const { subjectPronoun, objectPronoun } = splitPronouns(value)

    replacePredicateStatements(
      store,
      subject,
      ns.solid('preferredSubjectPronoun'),
      doc,
      deletions,
      insertions,
      subjectPronoun ? literal(subjectPronoun) : null
    )
    replacePredicateStatements(
      store,
      subject,
      ns.solid('preferredObjectPronoun'),
      doc,
      deletions,
      insertions,
      objectPronoun ? literal(objectPronoun) : null
    )
    replacePredicateStatements(
      store,
      subject,
      ns.solid('preferredRelativePronoun'),
      doc,
      deletions,
      insertions,
      null
    )
  }

  const applyBasics = (basic: ProfileBasicRow, clearAll = false) => {
    const data = clearAll
      ? {
          name: '',
          nickname: '',
          pronouns: '',
          dateOfBirth: '',
          imageSrc: ''
        }
      : basic

    replaceLiteralPredicateStatements(store, subject, ns.vcard('fn'), doc, deletions, insertions, data.name)
    // Keep foaf:nick in sync where available in existing data.
    replaceLiteralPredicateStatements(store, subject, ns.foaf('nick'), doc, deletions, insertions, data.nickname)
    replaceLiteralPredicateStatements(store, subject, ns.vcard('nickname'), doc, deletions, insertions, data.nickname)
    replaceLiteralPredicateStatements(store, subject, ns.vcard('bday'), doc, deletions, insertions, data.dateOfBirth)
    replacePronounFields(data.pronouns)
    replacePhotoField(data.imageSrc)
  }

  const removeBasic = basicOps.remove[0]
  const updateBasic = basicOps.update[0]
  const createBasic = basicOps.create[0]

  const selectedBasic = updateBasic || createBasic || removeBasic
  if (selectedBasic) {
    applyBasics(selectedBasic, Boolean(removeBasic && !updateBasic && !createBasic))
  }

  await runUpdateTransport(store, doc, deletions, insertions, {
    unsupportedMessage: updaterUnsupportedStoreErrorMessageText,
    failureMessage: headingUpdatesFailedMessageText,
  })
}

export async function processHeadingMutations(store: LiveStore, subject: NamedNode, mutationPlan: HeadingMutationPlan) {
  try {
    await mutateBasicProfileEntry(store, subject, mutationPlan.basicOps)
    await mutatePhoneEntry(store, subject, mutationPlan.phoneOps)
    await mutateEmailEntry(store, subject, mutationPlan.emailOps)
    await mutateAddressEntry(store, subject, mutationPlan.addressOps)
  } catch (error) {
    logAndThrowMutationError(error)
  }
} 
