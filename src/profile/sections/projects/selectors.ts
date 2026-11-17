import { LiveStore, NamedNode, Node, sym } from 'rdflib'
import { fallbackLabel, labelForNode } from '../../../directory/directoryHelpers'
import { ns } from '../../../util/ns'
import { expandCommunityNodes, linkedProjectNodeFromCommunityNode } from '../shared/projectCommunityNodes'
import type { ProjectDetails } from './types'

function communityNodesForSubject(subject: NamedNode, store: LiveStore, doc: NamedNode): Node[] {
  const inProfileDoc = store.each(subject, ns.solid('community'), null, doc) as Node[]
  const inAnyDoc = store.each(subject, ns.solid('community'), null, null) as Node[]
  const expandedNodes = [...inProfileDoc, ...inAnyDoc]
    .flatMap(node => expandCommunityNodes(store, node, doc))

  const seen = new Set<string>()
  return expandedNodes.filter(node => {
    const key = `${node.termType}:${node.value}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function clearStaleRequestedState(fetcher: unknown, docUrl: string): void {
  const requested = (fetcher as { requested?: Record<string, unknown> } | undefined)?.requested
  if (!requested || typeof requested !== 'object') return

  const previous = requested[docUrl]
  if (
    (typeof previous === 'string' && previous !== 'requested' && previous !== 'done') ||
    (typeof previous === 'number' && previous >= 400)
  ) {
    delete requested[docUrl]
  }
}

export async function ensureProjectDocumentsLoaded(subject: NamedNode, store: LiveStore): Promise<void> {
  const fetcher = (store as LiveStore & { fetcher?: { load?: (doc: NamedNode) => Promise<unknown> } }).fetcher
  if (!fetcher || typeof fetcher.load !== 'function') return

  const documents = new Map<string, NamedNode>()
  for (const node of communityNodesForSubject(subject, store, subject.doc())) {
    const project = linkedProjectNodeFromCommunityNode(node, store)
    if (project) documents.set(project.doc().value, project.doc())
  }

  await Promise.all(Array.from(documents.values()).map(async doc => {
    clearStaleRequestedState(fetcher, doc.value)
    try {
      await fetcher.load(doc)
    } catch {
      // A failed linked document must not prevent other projects from being shown.
    }
  }))
}

function projectNodeToUrl(node: Node): string {
  return node.termType === 'NamedNode' || node.termType === 'Literal' ? node.value : ''
}

function normalizeUrlKey(value: string): string {
  const text = value.trim()
  if (!text) return ''
  try {
    return new URL(text).href
  } catch {
    return text
  }
}

function toProjectNamedNode(node: Node, url: string): NamedNode | null {
  if (node.termType === 'NamedNode') return node as NamedNode
  try {
    return sym(url)
  } catch {
    return null
  }
}

function imageForProject(store: LiveStore, project: NamedNode, doc: NamedNode | null): string | undefined {
  return store.anyValue(project, ns.foaf('img'), null, doc) ||
    store.anyValue(project, ns.foaf('depiction'), null, doc) ||
    store.anyValue(project, ns.schema('image'), null, doc) ||
    undefined
}

export async function presentProjects(subject: NamedNode, store: LiveStore): Promise<ProjectDetails[]> {
  await ensureProjectDocumentsLoaded(subject, store)

  const seen = new Set<string>()
  return communityNodesForSubject(subject, store, subject.doc())
    .map<ProjectDetails | null>(communityNode => {
      const linkedProject = linkedProjectNodeFromCommunityNode(communityNode, store)
      const url = linkedProject?.value || projectNodeToUrl(communityNode)
      const key = normalizeUrlKey(url)
      if (!url || !key || seen.has(key)) return null
      seen.add(key)

      const project = linkedProject || toProjectNamedNode(communityNode, url)
      const projectDoc = project?.doc() ?? null
      const name = project
        ? store.anyValue(project, ns.foaf('name'), null, projectDoc) || undefined
        : undefined
      const orgName = project
        ? store.anyValue(project, ns.vcard('organization-name'), null, projectDoc) || undefined
        : undefined
      const types = project
        ? store.each(project, ns.rdf('type'), null, projectDoc) as NamedNode[]
        : []
      const categoryType = types.find(type =>
        type.termType === 'NamedNode' &&
        (type.value === ns.schema('Project').value || type.value === ns.schema('Community').value)
      )
      const category: ProjectDetails['category'] = categoryType?.value === ns.schema('Project').value
        ? 'project'
        : categoryType?.value === ns.schema('Community').value
          ? 'community'
          : 'unknown'

      return {
        url,
        title: name || (project ? labelForNode(store, project) : fallbackLabel(key)),
        name,
        orgName,
        imageUrl: project ? imageForProject(store, project, projectDoc) : undefined,
        category,
        sourceNode: communityNode
      }
    })
    .filter((project): project is ProjectDetails => project !== null)
}
