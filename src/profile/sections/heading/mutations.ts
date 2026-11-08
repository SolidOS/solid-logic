import { LiveStore, NamedNode, Node, literal, sym } from 'rdflib'
import { ns } from '../../../util/ns'
import { ProfileBasicRow, HeadingMutationPlan } from './types'
import { MutationOps } from '../shared/types'
import { collectLinkedNodeStatements, collectNodeStatements, findExistingNode, replaceLiteralPredicateStatements, replacePredicateStatements, runUpdateTransport, uniqueStatements } from '../shared/rdfMutationHelpers'
import { logAndThrowMutationError } from '../shared/mutationErrors'
import { createIdNode } from '../shared/idNodeFactory'
import { ContactAddressRow, ContactPointRow } from '../contactInfo/types'
import { buildAddressStatements, buildEmailStatements, buildPhoneStatements } from '../contactInfo/rdfBuilders'
import { saveHeadingUpdatesFailedMessageText, updaterUnsupportedStoreErrorMessageText } from '../../texts'
import { trimText } from '../shared/text'

const profileImagePredicates = [
  ns.sioc('avatar'),
  ns.foaf('img'),
  ns.vcard('logo'),
  ns.vcard('photo'),
  ns.foaf('depiction')
]

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

function splitPronouns(value?: string): { subjectPronoun?: string, objectPronoun?: string } {
  const normalized = trimText(value)
  if (!normalized) return {}

  const [subjectPronounRaw, objectPronounRaw] = normalized.split('/').map((part) => part.trim())
  const subjectPronoun = subjectPronounRaw || undefined
  const objectPronoun = objectPronounRaw || undefined

  return { subjectPronoun, objectPronoun }
}

function findOpWithExistingEntry<T extends { sourceNode: string }>(ops: T[], existingNodes: Node[]): T | undefined {
  return ops.find((op) => Boolean(op.sourceNode) && Boolean(findExistingNode(existingNodes, op.sourceNode)))
}

function findCreateOp<T extends { sourceNode: string }>(ops: T[]): T | undefined {
  return ops.find((op) => !op.sourceNode)
}

function mutatePhoneEntry(store: LiveStore, subject: NamedNode, phoneOps: MutationOps<ContactPointRow>, deletions: any[], insertions: any[]) {
  const doc = subject.doc()
  const existingPhoneNodes = store.each(subject, ns.vcard('hasTelephone'), null, doc) as Node[]

  const removePhone = findOpWithExistingEntry(phoneOps.remove, existingPhoneNodes)
  const updatePhone = findOpWithExistingEntry(phoneOps.update, existingPhoneNodes)
  const createPhone = findCreateOp(phoneOps.create) || phoneOps.create[0]

  if (removePhone?.sourceNode) {
    const existingNode = findExistingNode(existingPhoneNodes, removePhone.sourceNode)
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
    const existingNode = findExistingNode(existingPhoneNodes, updatePhone.sourceNode)
    if (existingNode) {
      const isDirectPhoneValue = existingNode.termType === 'NamedNode' && /^tel:/i.test(existingNode.value)
      const targetNode = isDirectPhoneValue ? createIdNode(doc) : existingNode
      if (isDirectPhoneValue) {
        const linkedPhoneStatements = collectLinkedNodeStatements(store, subject, ns.vcard('hasTelephone'), doc)
        const matchingLinkStatement = linkedPhoneStatements.linkStatements.find((statement) => statement.object?.value === existingNode.value)
        if (matchingLinkStatement) deletions.push(matchingLinkStatement)
      } else {
        deletions.push(...collectOwnedNodeStatements(store, existingNode, doc, pointValuePredicates))
      }
      insertions.push(...buildPhoneStatements(subject, doc, targetNode, updatePhone))
    }
  }

  if (createPhone) {
    insertions.push(...buildPhoneStatements(subject, doc, createIdNode(doc), createPhone))
  }

}

function mutateEmailEntry(store: LiveStore, subject: NamedNode, emailOps: MutationOps<ContactPointRow>, deletions: any[], insertions: any[]) {
  const doc = subject.doc()
  const existingEmailNodes = store.each(subject, ns.vcard('hasEmail'), null, doc) as Node[]

  const removeEmail = findOpWithExistingEntry(emailOps.remove, existingEmailNodes)
  const updateEmail = findOpWithExistingEntry(emailOps.update, existingEmailNodes)
  const createEmail = findCreateOp(emailOps.create) || emailOps.create[0]

  if (removeEmail?.sourceNode) {
    const existingNode = findExistingNode(existingEmailNodes, removeEmail.sourceNode)
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
    const existingNode = findExistingNode(existingEmailNodes, updateEmail.sourceNode)
    if (existingNode) {
      deletions.push(...collectOwnedNodeStatements(store, existingNode, doc, pointValuePredicates))
      insertions.push(...buildEmailStatements(subject, doc, existingNode, updateEmail))
    }
  }

  if (createEmail) {
    insertions.push(...buildEmailStatements(subject, doc, createIdNode(doc), createEmail))
  }

}

function mutateAddressEntry(store: LiveStore, subject: NamedNode, addressOps: MutationOps<ContactAddressRow>, deletions: any[], insertions: any[]) {
  const doc = subject.doc()
  const existingAddressNodes = store.each(subject, ns.vcard('hasAddress'), null, doc) as Node[]

  const removeAddress = findOpWithExistingEntry(addressOps.remove, existingAddressNodes)
  const updateAddress = findOpWithExistingEntry(addressOps.update, existingAddressNodes)
  const createAddress = findCreateOp(addressOps.create) || addressOps.create[0]

  if (removeAddress?.sourceNode) {
    const existingNode = findExistingNode(existingAddressNodes, removeAddress.sourceNode)
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
    const existingNode = findExistingNode(existingAddressNodes, updateAddress.sourceNode)
    if (existingNode) {
      deletions.push(...collectOwnedNodeStatements(store, existingNode, doc, addressValuePredicates))
      insertions.push(...buildAddressStatements(subject, doc, existingNode, updateAddress))
    }
  }

  if (createAddress) {
    insertions.push(...buildAddressStatements(subject, doc, createIdNode(doc), createAddress))
  }

}

function mutateBasicProfileEntry(store: LiveStore, subject: NamedNode, basicOps: MutationOps<ProfileBasicRow>, deletions: any[], insertions: any[]) {
  const doc = subject.doc()

  const replacePhotoField = (value?: string) => {
    const normalized = trimText(value)
    const nextObject = !normalized
      ? null
      : (normalized.startsWith('http://') || normalized.startsWith('https://'))
        ? sym(normalized)
        : literal(normalized)
    profileImagePredicates.forEach((predicate) => {
      replacePredicateStatements(store, subject, predicate, doc, deletions, insertions, null)
    })
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
    const dateOfBirth = trimText(data.dateOfBirth)
    replacePredicateStatements(
      store,
      subject,
      ns.vcard('bday'),
      doc,
      deletions,
      insertions,
      dateOfBirth ? literal(dateOfBirth, ns.xsd('date')) : null
    )
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

}

export async function processHeadingMutations(store: LiveStore, subject: NamedNode, mutationPlan: HeadingMutationPlan) {
  try {
    const doc = subject.doc()
    const deletions: any[] = []
    const insertions: any[] = []

    mutateBasicProfileEntry(store, subject, mutationPlan.basicOps, deletions, insertions)
    mutatePhoneEntry(store, subject, mutationPlan.phoneOps, deletions, insertions)
    mutateEmailEntry(store, subject, mutationPlan.emailOps, deletions, insertions)
    mutateAddressEntry(store, subject, mutationPlan.addressOps, deletions, insertions)

    await runUpdateTransport(store, doc, uniqueStatements(deletions), uniqueStatements(insertions), {
      unsupportedMessage: updaterUnsupportedStoreErrorMessageText,
      failureMessage: saveHeadingUpdatesFailedMessageText,
    })
  } catch (error) {
    logAndThrowMutationError(error, saveHeadingUpdatesFailedMessageText)
  }
} 
