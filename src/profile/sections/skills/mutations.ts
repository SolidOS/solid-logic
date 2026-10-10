import { blankNode, LiveStore, NamedNode, Node, st, literal, sym } from 'rdflib'
import { ns } from '../../../util/ns'
import { SkillRow } from './types'
import { MutationOps, RdfResourceNode, RdfStatement } from '../shared/types'
import { collectLinkedNodeStatements, collectNodeStatements, findExistingNode, runUpdateTransport } from '../shared/rdfMutationHelpers'
import { logAndThrowMutationError } from '../shared/mutationErrors'
import { createIdNode } from '../shared/idNodeFactory'
import { profileVocabularies } from '../shared/profileVocabularies'
import { skillUpdatesFailedMessageText, skillUpdatesUnsupportedMessageText } from '../../texts'
import { trimText } from '../shared/text'

export type SkillMutationPlan = MutationOps<SkillRow>

const skillVocabularyUri = profileVocabularies.escoSkill

function buildSkillPublicIdNode(publicId: string): RdfResourceNode {
  const normalized = trimText(publicId)
  if (!normalized) return blankNode()
  if (normalized.startsWith('_:')) {
    return blankNode(normalized.slice(2))
  }
  if (normalized.startsWith('skill:')) {
    return sym(`${skillVocabularyUri}${normalized.slice('skill:'.length)}`)
  }
  if (normalized.startsWith(skillVocabularyUri)) {
    return sym(normalized)
  }
  if (!normalized.includes(':')) {
    return blankNode(normalized)
  }
  return sym(normalized)
}

function collectSkillLinkStatementsByEntryValue(
  store: LiveStore,
  subject: NamedNode,
  doc: NamedNode,
  entryNode: string
) {
  const existingNode = findExistingNode(store.each(subject, ns.schema('skills'), null, doc) as Node[], entryNode)
  return existingNode
    ? store.statementsMatching(subject, ns.schema('skills'), existingNode, doc)
    : []
}

function buildSkillsStatements(subject: NamedNode, doc: NamedNode, node: NamedNode, skill: SkillRow) {
  if (!skill.name) return []
  const publicIdNode = buildSkillPublicIdNode(skill.publicId)

  return [
    st(subject, ns.schema('skills'), node, doc),
    st(node, ns.solid('publicId'), publicIdNode, doc),
    st(publicIdNode, ns.schema('name'), literal(skill.name), doc)
  ]
}

async function mutateSkillsEntries(store: LiveStore, subject: NamedNode, skillOps: MutationOps<SkillRow>) {
  const doc = subject.doc()
  const existingSkillNodes = store.each(subject, ns.schema('skills'))

  const deletions: RdfStatement[] = []
  const insertions: RdfStatement[] = []

  const collectLinkedPublicIdStatements = (skillNode: NamedNode) => {
    const linkedPublicIdStatements = collectLinkedNodeStatements(store, skillNode, ns.solid('publicId'), doc)
    deletions.push(...linkedPublicIdStatements.linkedStatements)
  }

  skillOps.remove.forEach((skill) => {
    if (!skill.entryNode) return
    const existingNode = findExistingNode(existingSkillNodes, skill.entryNode)
    deletions.push(...collectSkillLinkStatementsByEntryValue(store, subject, doc, skill.entryNode))
    if (existingNode) {
      if (existingNode.termType !== 'Literal') {
        deletions.push(...collectNodeStatements(store, existingNode, doc))
        if (existingNode.termType === 'NamedNode') {
          collectLinkedPublicIdStatements(existingNode as NamedNode)
        }
      }
    }
  })

  skillOps.update.forEach((skill) => {
    if (!skill.entryNode) return
    const existingNode = findExistingNode(existingSkillNodes, skill.entryNode)
    if (!existingNode) {
      insertions.push(...buildSkillsStatements(subject, doc, createIdNode(doc), skill))
      return
    }
    deletions.push(...collectSkillLinkStatementsByEntryValue(store, subject, doc, skill.entryNode))
    if (existingNode.termType !== 'Literal') {
      deletions.push(...collectNodeStatements(store, existingNode, doc))
      if (existingNode.termType === 'NamedNode') {
        collectLinkedPublicIdStatements(existingNode as NamedNode)
      }
    }
    if (existingNode.termType === 'NamedNode') {
      insertions.push(...buildSkillsStatements(subject, doc, existingNode as NamedNode, skill))
      return
    }
    insertions.push(...buildSkillsStatements(subject, doc, createIdNode(doc), skill))
  })

  skillOps.create.forEach((skill) => {
    insertions.push(...buildSkillsStatements(subject, doc, createIdNode(doc), skill))
  })

  await runUpdateTransport(store, doc, deletions, insertions, {
    unsupportedMessage: skillUpdatesUnsupportedMessageText,
    failureMessage: skillUpdatesFailedMessageText,
  })
}

export async function processSkillsMutations(store: LiveStore, subject: NamedNode, mutationPlan: SkillMutationPlan) {
  try {
    await mutateSkillsEntries(store, subject, mutationPlan)
  } catch (error) {
    logAndThrowMutationError(error)
  }
} 
