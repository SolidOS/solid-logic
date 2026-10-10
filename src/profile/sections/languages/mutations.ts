import { Collection, LiveStore, NamedNode, st, sym, literal } from 'rdflib'
import { ns } from '../../../util/ns'
import { LanguageRow } from './types'
import { MutationOps, RdfResourceNode, RdfStatement } from '../shared/types'
import { presentLanguages } from './selectors'
import { expandRdfList } from '../shared/rdfList'
import { createIdNode } from '../shared/idNodeFactory'
import { findExistingNode, isNamedOrBlankNode, rdfNodeKey, runUpdateTransport } from '../shared/rdfMutationHelpers'
import { logAndThrowMutationError } from '../shared/mutationErrors'
import { languageUpdatesFailedMessageText, languageUpdatesUnsupportedMessageText } from '../../texts'
import { trimText } from '../shared/text'
import { ianaLanguageVocabularyUri, languageCodeFromPublicId } from './normalization'

export type LanguageMutationPlan = MutationOps<LanguageRow>
// Language entries are serialized as an ordered rdf:List of id nodes, where
// each id node points to an IANA URI via solid:publicId.
function rowsFromOrderedInput(orderedRows: LanguageRow[]): LanguageRow[] {
  return (orderedRows || [])
    .filter((row) => row.status !== 'deleted')
    .filter((row) => Boolean(trimText(row.publicId) || trimText(row.name) || trimText(row.entryNode)))
    .map((row) => ({
      ...row,
      name: trimText(row.name),
      publicId: trimText(row.publicId),
      proficiency: trimText(row.proficiency),
      entryNode: trimText(row.entryNode)
    }))
}

function buildLanguageStatements(
  store: LiveStore,
  subject: NamedNode,
  doc: NamedNode,
  rows: LanguageRow[],
  existingLanguageNodes: RdfResourceNode[]
) {
  const languageRows = rows
    .map((row) => ({
      name: trimText(row.name),
      publicId: languageCodeFromPublicId(row.publicId),
      entryNode: trimText(row.entryNode)
    }))
    .filter((row) => Boolean(row.publicId))

  if (languageRows.length === 0) {
    return { statements: [] as RdfStatement[], entryNodes: [] as RdfResourceNode[] }
  }

  const entryNodes = languageRows.map<RdfResourceNode>((row) => {
    const existingNode = row.entryNode
      ? findExistingNode(existingLanguageNodes, row.entryNode)
      : null

    if (isNamedOrBlankNode(existingNode)) {
      return existingNode
    }

    return createIdNode(doc)
  })
  const statements: RdfStatement[] = []

  statements.push(st(subject, ns.schema('knowsLanguage'), new Collection(entryNodes), doc))

  entryNodes.forEach((entryNode, index) => {
    const publicIdNode = sym(`${ianaLanguageVocabularyUri}${languageRows[index].publicId}`)
    statements.push(st(entryNode, ns.solid('publicId'), publicIdNode, doc))
    const existingNameStatement = store.holds(publicIdNode, ns.schema('name'), literal(languageRows[index].name, 'en'), doc)
    if (languageRows[index].name && !existingNameStatement) {
      statements.push(st(publicIdNode, ns.schema('name'), literal(languageRows[index].name, 'en'), doc))
    }
  })

  return { statements, entryNodes }
}

function collectListChainNodes(store: LiveStore, listHead: NamedNode, doc: NamedNode): NamedNode[] {
  const visited = new Set<string>()
  const nodes: NamedNode[] = []
  let current: NamedNode | null = listHead

  while (current) {
    const key = `${current.termType}:${current.value}`
    if (visited.has(key)) break
    visited.add(key)
    nodes.push(current)

    const rest = store.any(current as any, ns.rdf('rest'), null, doc)
    if (!rest || (rest.termType === 'NamedNode' && rest.value === ns.rdf('nil').value)) {
      break
    }
    current = (rest.termType === 'NamedNode' || rest.termType === 'BlankNode') ? rest as NamedNode : null
  }

  return nodes
}

function mergeLanguageOps(existingRows: LanguageRow[], languageOps: MutationOps<LanguageRow>): LanguageRow[] {
  const byEntryNode = new Map<string, LanguageRow>()
  existingRows.forEach((row) => {
    byEntryNode.set(row.entryNode, row)
  })

  languageOps.remove.forEach((row) => {
    if (!row.entryNode) return
    byEntryNode.delete(row.entryNode)
  })

  languageOps.update.forEach((row) => {
    if (!row.entryNode) return
    if (!byEntryNode.has(row.entryNode)) return
    byEntryNode.set(row.entryNode, row)
  })

  languageOps.create.forEach((row) => {
    if (!trimText(row.publicId)) return
    byEntryNode.set(`new:${row.name}:${Math.random()}`, {
      ...row,
      publicId: trimText(row.publicId),
      proficiency: trimText(row.proficiency)
    })
  })

  const dedupedByLanguage = new Map<string, LanguageRow>()
  Array.from(byEntryNode.values()).forEach((row) => {
    const publicId = trimText(row.publicId)
    if (!publicId) return
    if (!dedupedByLanguage.has(publicId)) {
      dedupedByLanguage.set(publicId, {
        ...row,
        publicId,
        proficiency: trimText(row.proficiency)
      })
    }
  })

  return Array.from(dedupedByLanguage.values())
}

async function mutateLanguageEntries(
  store: LiveStore,
  subject: NamedNode,
  languageOps: MutationOps<LanguageRow>,
  orderedRows?: LanguageRow[]
) {
  const doc = subject.doc()
  const existingRows = presentLanguages(subject, store).map((detail) => ({
    name: trimText(detail.name),
    publicId: trimText(detail.publicId),
    proficiency: trimText(detail.proficiency),
    entryNode: detail.entryNode.value,
    status: 'existing' as const
  }))
  const nextRows = orderedRows && orderedRows.length
    ? rowsFromOrderedInput(orderedRows)
    : mergeLanguageOps(existingRows, languageOps)

  const listObjects = store.each(subject, ns.schema('knowsLanguage'), null, doc)
  const existingListHeads = listObjects.filter((node): node is NamedNode => node.termType === 'BlankNode' || node.termType === 'NamedNode')

  const existingListNodes = Array.from(new Map(
    existingListHeads
      .flatMap((node) => collectListChainNodes(store, node, doc))
      .map((node) => [rdfNodeKey(node), node])
  ).values())

  const existingLanguageNodes: RdfResourceNode[] = Array.from(new Set(
    listObjects
      .flatMap((node) => expandRdfList(store, node))
      .filter(isNamedOrBlankNode)
      .map(rdfNodeKey)
  )).map((key) => {
    const [termType, ...rest] = key.split(':')
    const value = rest.join(':')
    return termType === 'BlankNode' ? store.bnode(value) : store.sym(value)
  })

  const {
    statements: insertions,
    entryNodes: nextEntryNodes
  } = buildLanguageStatements(store, subject, doc, nextRows, existingLanguageNodes)

  const retainedEntryNodeKeys = new Set(nextEntryNodes.map(rdfNodeKey))
  const retainedLanguageNodes = existingLanguageNodes.filter((node) => retainedEntryNodeKeys.has(rdfNodeKey(node)))
  const removedLanguageNodes = existingLanguageNodes.filter((node) => !retainedEntryNodeKeys.has(rdfNodeKey(node)))

  const removedPublicIdNodes = Array.from(new Map(
    removedLanguageNodes
      .map((node) => store.any(node as NamedNode, ns.solid('publicId'), null, doc))
      .filter((node): node is NamedNode => Boolean(node && node.termType === 'NamedNode'))
      .map((node) => [rdfNodeKey(node), node])
  ).values())

  const deletions: RdfStatement[] = store.statementsMatching(subject, ns.schema('knowsLanguage'), null, doc)
  existingListNodes.forEach((node) => {
    deletions.push(...store.statementsMatching(node, null, null, doc))
  })
  removedLanguageNodes.forEach((node) => {
    deletions.push(...store.statementsMatching(node as NamedNode, null, null, doc))
  })
  retainedLanguageNodes.forEach((node) => {
    deletions.push(...store.statementsMatching(node as NamedNode, ns.solid('publicId'), null, doc))
  })
  removedPublicIdNodes.forEach((node) => {
    deletions.push(...store.statementsMatching(node as NamedNode, ns.schema('name'), null, doc))
  })

  await runUpdateTransport(store, doc, deletions, insertions, {
    unsupportedMessage: languageUpdatesUnsupportedMessageText,
    failureMessage: languageUpdatesFailedMessageText,
  })
}

export async function processLanguageMutations(
  store: LiveStore,
  subject: NamedNode,
  mutationPlan: LanguageMutationPlan,
  orderedRows?: LanguageRow[]
) {
  try {
    await mutateLanguageEntries(store, subject, mutationPlan, orderedRows)
  } catch (error) {
    logAndThrowMutationError(error)
  }
} 
