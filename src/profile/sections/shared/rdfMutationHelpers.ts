import { LiveStore, NamedNode, Node, st, literal } from 'rdflib'
import { RdfResourceNode, RdfStatement } from './types'
import { fallbackSaveUpdatesErrorMessageText, updaterUnsupportedStoreErrorMessageText } from '../../texts'
import { NotEditableError } from '../../../logic/CustomError'
import { trimText } from './text'

type UpdateTransportOptions = {
  unsupportedMessage?: string
  failureMessage?: string
}

export function uniqueStatements (statements: RdfStatement[]): RdfStatement[] {
  return [...new Map(statements.map(statement => [statement.toNT(), statement])).values()]
}

export function rdfNodeKey (node: Node): string {
  return `${node.termType}:${node.value}`
}

export function isNamedOrBlankNode (node: Node | null | undefined): node is RdfResourceNode {
  return Boolean(node && (node.termType === 'NamedNode' || node.termType === 'BlankNode'))
}

export function collectNodeStatements (store: LiveStore, node: Node, doc: NamedNode): RdfStatement[] {
  return store.statementsMatching(node as any, null, null, doc)
}

export function collectLinkedNodeStatements (store: LiveStore, sourceNode: Node, predicate: NamedNode, doc: NamedNode) {
  const linkedNodes = store.each(sourceNode as any, predicate, null, doc) as Node[]
  return {
    linkedNodes,
    linkedStatements: linkedNodes.flatMap(node => collectNodeStatements(store, node, doc)),
    linkStatements: store.statementsMatching(sourceNode as any, predicate, null, doc)
  }
}

export function findExistingNode (nodes: Node[], entryNode: string): Node | undefined {
  const normalized = entryNode.startsWith('_:') ? entryNode.slice(2) : entryNode
  return nodes.find(node => node.value === entryNode || node.value === normalized || node.value === `_:${normalized}`)
}

export function replacePredicateStatements (store: LiveStore, subject: NamedNode, predicate: NamedNode, doc: NamedNode, deletions: RdfStatement[], insertions: RdfStatement[], nextObject?: Node | null): void {
  deletions.push(...store.statementsMatching(subject, predicate, null, doc))
  if (nextObject) insertions.push(st(subject, predicate, nextObject, doc))
}

export function replaceLiteralPredicateStatements (
  store: LiveStore,
  subject: NamedNode,
  predicate: NamedNode,
  doc: NamedNode,
  deletions: RdfStatement[],
  insertions: RdfStatement[],
  value?: string
): void {
  const normalizedValue = trimText(value)
  replacePredicateStatements(
    store,
    subject,
    predicate,
    doc,
    deletions,
    insertions,
    normalizedValue ? literal(normalizedValue) : null
  )
}

function updateFailureError (
  message: string | undefined,
  response: unknown,
  fallbackMessage: string | undefined
): Error {
  if (response instanceof Error) return response

  const error = new Error(message || fallbackMessage || fallbackSaveUpdatesErrorMessageText)
  if (response && typeof response === 'object') {
    Object.assign(error, response)
  }
  return error
}

export async function runUpdateTransport (
  store: LiveStore,
  doc: NamedNode,
  deletions: RdfStatement[],
  insertions: RdfStatement[],
  options: UpdateTransportOptions = {}
): Promise<void> {
  if (!store.updater || typeof store.updater.update !== 'function') throw new Error(options.unsupportedMessage || updaterUnsupportedStoreErrorMessageText)
  if (!store.updater.editable(doc)) throw new NotEditableError(`Cannot edit profile document ${doc.value}`)
  if (!deletions.length && !insertions.length) return
  await new Promise<void>((resolve, reject) => {
    let settled = false
    const done = (fn: () => void) => { if (!settled) { settled = true; fn() } }
    const result = store.updater.update(deletions, insertions, (_uri, ok, message, response) => {
      if (ok) done(resolve)
      else done(() => reject(updateFailureError(message, response, options.failureMessage)))
    })
    if (result && typeof (result as Promise<void>).then === 'function') {
      ;(result as Promise<void>).then(() => done(resolve), error => done(() => reject(error)))
    }
  })
}
