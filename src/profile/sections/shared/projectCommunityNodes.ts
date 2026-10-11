import { LiveStore, NamedNode, Node, sym } from 'rdflib'
import { ns } from '../../../util/ns'
import { expandRdfList, isRdfListNode } from './rdfList'

export function expandCommunityNodes(store: LiveStore, node: Node, doc?: NamedNode | null): Node[] {
	return isRdfListNode(store, node, doc) ? expandRdfList(store, node) : [node]
}

export function linkedProjectNodeFromCommunityNode(node: Node, store: LiveStore): NamedNode | null {
	if (!node) return null
	if (node.termType === 'NamedNode') return node as NamedNode
	if (node.termType === 'Literal') {
		try {
			return sym(node.value)
		} catch {
			return null
		}
	}
	if (node.termType !== 'BlankNode') return null

	const candidatePredicates = [
		ns.solid('publicId'),
		ns.schema('url'),
		ns.foaf('homepage'),
		ns.rdfs('seeAlso'),
		ns.schema('sameAs'),
		ns.schema('mainEntityOfPage')
	]

	for (const predicate of candidatePredicates) {
		const linked = store.any(node as NamedNode, predicate) as Node | null
		if (!linked?.value) continue

		if (linked.termType === 'NamedNode') {
			return linked as NamedNode
		}

		if (linked.termType === 'Literal') {
			try {
				return sym(linked.value)
			} catch {
				// Keep trying the next predicate.
			}
		}
	}

	const outgoing = store.statementsMatching(node as NamedNode, null, null, null)
	const firstNamedNode = outgoing.find((statement) => statement.object.termType === 'NamedNode')
	if (firstNamedNode?.object?.value) {
		return firstNamedNode.object as NamedNode
	}

	return null
}

export function projectUrlFromCommunityNode(node: Node, store: LiveStore): string {
	const linkedProjectNode = linkedProjectNodeFromCommunityNode(node, store)
	return linkedProjectNode?.value || node.value || ''
}
