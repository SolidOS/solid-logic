import type { LiveStore, NamedNode } from 'rdflib'
import type { DirectoryEntry, DirectoryRelationshipLabel, DirectorySource } from '../types'
import { ns } from '../util/ns'

const DIRECTORY_SOURCE_PRIORITY: DirectorySource[] = ['contacts', 'groups', 'friends', 'catalog']

export function tokenizeQuery (query: string): string[] {
  return query
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

export function matchesQuery (label: string, query: string): boolean {
  return matchesAnyLabel([label], query)
}

export function matchesAnyLabel (labels: string[], query: string): boolean {
  const queryWords = tokenizeQuery(query)
  if (queryWords.length === 0) return true

  const labelWords = labels.flatMap(label => tokenizeQuery(label))
  const fallbackHaystack = labels.join(' ').toLowerCase()
  return queryWords.every(word =>
    labelWords.some(labelWord => labelWord.includes(word)) || fallbackHaystack.includes(word)
  )
}

export function sortEntries (entries: Iterable<DirectoryEntry>): DirectoryEntry[] {
  return Array.from(entries)
    .sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: 'base' }))
}

export function mergeDirectoryEntry (
  discoveredEntries: Map<string, DirectoryEntry>,
  entry: DirectoryEntry
): DirectoryEntry {
  const key = directoryEntryKey(entry)
  const existing = discoveredEntries.get(key)
  if (existing) {
    const preferred = preferredDirectoryEntry(existing, entry)
    const labels = canonicalizeSearchableLabels(
      preferred.label,
      [...(existing.searchableLabels ?? [existing.label]), ...(entry.searchableLabels ?? [entry.label])]
    )
    const merged = {
      ...existing,
      label: preferred.label,
      relationshipLabel: bestRelationshipLabel(existing.relationshipLabel, entry.relationshipLabel),
      sources: canonicalizeDirectorySources([...existing.sources, ...entry.sources]),
      searchableLabels: labels
    }
    discoveredEntries.set(key, merged)
    return merged
  }

  const normalized = {
    ...entry,
    sources: canonicalizeDirectorySources(entry.sources),
    searchableLabels: entry.searchableLabels ?? [entry.label]
  }
  discoveredEntries.set(key, normalized)
  return normalized
}

function preferredDirectoryEntry (current: DirectoryEntry, incoming: DirectoryEntry): DirectoryEntry {
  return directoryEntrySourcePriority(incoming) < directoryEntrySourcePriority(current) ? incoming : current
}

function directoryEntrySourcePriority (entry: DirectoryEntry): number {
  const priorities = entry.sources.map(source => DIRECTORY_SOURCE_PRIORITY.indexOf(source))
  return priorities.length ? Math.min(...priorities) : DIRECTORY_SOURCE_PRIORITY.length
}

export function canonicalizeDirectorySources (sources: DirectorySource[]): DirectorySource[] {
  return DIRECTORY_SOURCE_PRIORITY.filter(source => sources.includes(source))
}

function canonicalizeSearchableLabels (preferredLabel: string, labels: string[]): string[] {
  return uniqueStrings(labels).sort((left, right) => {
    if (left === preferredLabel) return -1
    if (right === preferredLabel) return 1
    return left.localeCompare(right, undefined, { sensitivity: 'base' })
  })
}

export function bestRelationshipLabel (
  current: DirectoryRelationshipLabel | undefined,
  incoming: DirectoryRelationshipLabel
): DirectoryRelationshipLabel {
  if (current === 'Contact' || incoming === 'Contact') return 'Contact'
  if (current === 'Friend' || incoming === 'Friend') return 'Friend'
  if (current === 'Group' || incoming === 'Group') return 'Group'
  return 'People'
}

export function directoryEntryKey (entry: DirectoryEntry): string {
  return `${entry.kind}:${entry.uri}`
}

export function uniqueNamedNodes (nodes: NamedNode[]): NamedNode[] {
  const seen = new Set<string>()
  return nodes.filter(node => {
    if (seen.has(node.value)) return false
    seen.add(node.value)
    return true
  })
}

export function uniqueStrings<T extends string> (values: T[]): T[] {
  return [...new Set(values)]
}

export function isHttpUri (value: string | null | undefined): boolean {
  return !!value && (value.startsWith('https://') || value.startsWith('http://'))
}

export function fallbackLabel (uri: string): string {
  const withoutFragment = uri.split('#')[0]
  const fragment = uri.includes('#') ? uri.slice(uri.indexOf('#') + 1) : ''
  const base = fragment && fragment !== 'this' && fragment !== 'me'
    ? fragment
    : withoutFragment.slice(withoutFragment.lastIndexOf('/') + 1)
  return decodeURIComponent(base || uri).replace(/[_-]+/g, ' ')
}

export function storedLabelForNode (store: LiveStore, node: NamedNode): string | null {
  return store.anyValue(node, ns.vcard('fn')) ||
    store.anyValue(node, ns.foaf('name')) ||
    store.anyValue(node, ns.schema('name')) ||
    store.anyValue(node, ns.rdfs('label')) ||
    null
}

export function labelForNode (store: LiveStore, node: NamedNode): string {
  return storedLabelForNode(store, node) || fallbackLabel(node.value)
}

export async function loadDocumentSilently (store: LiveStore, node: NamedNode): Promise<boolean> {
  try {
    await store.fetcher.load(node.doc())
    return true
  } catch (_error) {
    return false
  }
}
