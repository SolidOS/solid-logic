import { NamedNode, Node, Store } from 'rdflib'
import { ns } from '../../../util/ns'
import { rdfNodeKey } from './rdfMutationHelpers'

export function isRdfListNode(store: Store, node: unknown, doc?: NamedNode | null): boolean {
  const candidate = node as Node & { elements?: Node[] }
  const collectionElements = candidate?.elements
  if (Array.isArray(collectionElements)) return true
  if (candidate?.termType !== 'BlankNode' && candidate?.termType !== 'NamedNode') return false
  return Boolean(store.any(candidate as NamedNode, ns.rdf('first'), null, doc || null))
}

export function expandRdfList(store: Store, node: Node): Node[] {
  const visited = new Set<string>()

  function inner(currentNode: Node): Node[] {
    const key = rdfNodeKey(currentNode)
    if (visited.has(key)) return []
    visited.add(key)

    const collectionElements = (currentNode as { termType?: string; elements?: Node[] }).elements
    if (Array.isArray(collectionElements)) {
      return collectionElements.flatMap((element) => inner(element))
    }

    const first = store.any(currentNode as NamedNode, ns.rdf('first'))
    if (!first) return [currentNode]

    const items: Node[] = []
    let listNode: Node | null = currentNode
    while (listNode) {
      const listValue = store.any(listNode as NamedNode, ns.rdf('first')) as Node | null
      if (listValue) items.push(...inner(listValue))
      const rest = store.any(listNode as NamedNode, ns.rdf('rest')) as Node | null
      if (!rest || (rest.termType === 'NamedNode' && rest.value === ns.rdf('nil').value)) break
      listNode = rest
    }

    return items
  }

  return inner(node)
}
