import { LiveStore, NamedNode, Node, st, sym } from 'rdflib'
import { ns } from '../../../util/ns'
import { ProjectMutationPlan, ProjectRow } from './types'
import { MutationOps, RdfStatement } from '../shared/types'
import {
	projectUrlFromCommunityNode,
	expandCommunityNodes
} from '../shared/projectCommunityNodes'
import { isRdfListNode } from '../shared/rdfList'
import { rdfNodeKey } from '../shared/rdfMutationHelpers'
import { runUpdateTransport } from '../shared/rdfMutationHelpers'
import { logAndThrowMutationError } from '../shared/mutationErrors'
import { saveProjectsUpdatesFailedMessageText, projectUpdatesUnsupportedMessageText } from '../../texts'
import { trimText } from '../shared/text'

function parseProjectUrl(value: string | null | undefined): URL | null {
	const text = trimText(value)
	if (!text) return null
	try {
		return new URL(text)
	} catch {
		return null
	}
}

function toProjectUrlNode(project: ProjectRow): NamedNode | null {
	const parsed = parseProjectUrl(project.url)
	return parsed ? sym(parsed.href) : null
}

function normalizeProjectUrlKey(value: string): string {
	const parsed = parseProjectUrl(value)
	if (!parsed) return trimText(value)
	parsed.hash = ''
	return parsed.href
}

function collectListChainNodes(store: LiveStore, listHead: unknown, doc: NamedNode): Node[] {
	if (!store.any(listHead as NamedNode, ns.rdf('first'), null, doc)) return []

	const visited = new Set<string>()
	const nodes: Node[] = []
	let current = listHead as Node | null

	while (current) {
		const key = rdfNodeKey(current)
		if (visited.has(key)) break
		visited.add(key)
		nodes.push(current)

		const rest = store.any(current as NamedNode, ns.rdf('rest'), null, doc) as Node | null
		if (!rest || (rest.termType === 'NamedNode' && rest.value === ns.rdf('nil').value)) {
			break
		}
		current = rest
	}

	return nodes
}

function collectCommunityCleanupStatements(store: LiveStore, statement: RdfStatement, fallbackDoc: NamedNode): RdfStatement[] {
	const doc = (statement.why as NamedNode | null) || fallbackDoc
	const cleanup = [st(statement.subject, statement.predicate, statement.object, doc)]
	const objectNode = statement.object

	if (isRdfListNode(store, objectNode, doc)) {
		collectListChainNodes(store, objectNode, doc).forEach((listNode) => {
			cleanup.push(...store.statementsMatching(listNode as NamedNode, null, null, doc))
		})
		return cleanup
	}

	if (objectNode.termType === 'BlankNode') {
		cleanup.push(...store.statementsMatching(objectNode as unknown as NamedNode, null, null, doc))
	}

	return cleanup
}

async function mutateProjectEntries(store: LiveStore, subject: NamedNode, projectOps: MutationOps<ProjectRow>) {
	const doc = subject.doc()
	type DocBatch = {
		doc: NamedNode
		cleanupStatements: RdfStatement[]
		currentUrlsByKey: Map<string, string>
	}

	const existingLinks = store.statementsMatching(subject, ns.solid('community'), null, null)
	const batchesByDoc = new Map<string, DocBatch>()
	const docKeyByUrl = new Map<string, string>()
	const touchedDocs = new Set<string>()

	const getDocBatch = (targetDoc: NamedNode) => {
		const existing = batchesByDoc.get(targetDoc.value)
		if (existing) return existing
		const next: DocBatch = { doc: targetDoc, cleanupStatements: [], currentUrlsByKey: new Map() }
		batchesByDoc.set(targetDoc.value, next)
		return next
	}

	existingLinks.forEach((statement) => {
		const targetDoc = (statement.why as NamedNode | null) || doc
		const batch = getDocBatch(targetDoc)
		batch.cleanupStatements.push(...collectCommunityCleanupStatements(store, statement as RdfStatement, doc))

		const objectNode = statement.object
		const communityNodes = expandCommunityNodes(store, objectNode as Node, targetDoc)

		communityNodes.forEach((communityNode) => {
			const url = projectUrlFromCommunityNode(communityNode, store)
			const key = normalizeProjectUrlKey(url)
			if (!key || docKeyByUrl.has(key)) return
			docKeyByUrl.set(key, targetDoc.value)
			batch.currentUrlsByKey.set(key, url)
		})
	})

	const ensureDocTouched = (docKey: string) => {
		touchedDocs.add(docKey)
	}

	const removeExistingUrl = (key: string) => {
		const targetDocKey = docKeyByUrl.get(key)
		if (!targetDocKey) return null
		const batch = batchesByDoc.get(targetDocKey)
		if (!batch) return null
		batch.currentUrlsByKey.delete(key)
		docKeyByUrl.delete(key)
		ensureDocTouched(targetDocKey)
		return batch.doc
	}

	const addUrlToDoc = (targetDoc: NamedNode, url: string) => {
		const key = normalizeProjectUrlKey(url)
		if (!key || docKeyByUrl.has(key)) return
		const batch = getDocBatch(targetDoc)
		batch.currentUrlsByKey.set(key, url)
		docKeyByUrl.set(key, targetDoc.value)
		ensureDocTouched(targetDoc.value)
	}

	projectOps.remove.forEach((project) => {
		const entryKey = normalizeProjectUrlKey(project.sourceNode || '')
		const urlKey = normalizeProjectUrlKey(project.url)
		if (entryKey) {
			if (removeExistingUrl(entryKey) || !urlKey) return
		}
		if (urlKey) {
			removeExistingUrl(urlKey)
		}
	})

	projectOps.update.forEach((project) => {
		const newLink = toProjectUrlNode(project)
		const entryKey = normalizeProjectUrlKey(project.sourceNode || '')
		const urlKey = normalizeProjectUrlKey(project.url)
		const removedDoc = (entryKey && removeExistingUrl(entryKey)) || (urlKey && removeExistingUrl(urlKey)) || doc
		if (newLink) {
			addUrlToDoc(removedDoc, newLink.value)
		}
	})

	projectOps.create.forEach((project) => {
		const newLink = toProjectUrlNode(project)
		if (!newLink) return
		addUrlToDoc(doc, newLink.value)
	})

	for (const docKey of touchedDocs) {
		const batch = batchesByDoc.get(docKey)
		if (!batch) continue
		const insertions = Array.from(batch.currentUrlsByKey.values()).map((url) => st(subject, ns.solid('community'), sym(url), batch.doc))
		await runUpdateTransport(store, batch.doc, batch.cleanupStatements, insertions, {
			unsupportedMessage: projectUpdatesUnsupportedMessageText,
			failureMessage: saveProjectsUpdatesFailedMessageText,
		})
	}
}

export async function processProjectsMutations(store: LiveStore, subject: NamedNode, mutationPlan: ProjectMutationPlan) {
	try {
		await mutateProjectEntries(store, subject, mutationPlan)
	} catch (err) {
		logAndThrowMutationError(err, saveProjectsUpdatesFailedMessageText)
	}
}
