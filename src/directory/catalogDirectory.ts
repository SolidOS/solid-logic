import { type DirectoryEntry } from '../types'
import { graph, type LiveStore, NamedNode, parse } from 'rdflib'
import { ns } from '../util/ns'
import * as debug from '../util/debug'
import { isHttpUri } from './directoryHelpers'

const CATALOG_VOCAB = 'http://example.org#'

export function createCatalogDirectoryDiscovery () {
  const catalogEntriesCache = new Map<string, Promise<DirectoryEntry[]>>()

  async function discoverCatalogEntries (
    catalogUrl: string,
    onEntry: (entry: DirectoryEntry) => void | Promise<void>
  ): Promise<void> {
    const entries = await fetchCatalogEntries(catalogUrl)
    for (const entry of entries) {
      await onEntry(entry)
    }
  }

  async function fetchCatalogEntries (catalogUrl: string): Promise<DirectoryEntry[]> {
    const cached = catalogEntriesCache.get(catalogUrl)
    if (cached) {
      return cached
    }

    const promise = loadCatalogEntries(catalogUrl).catch(error => {
      catalogEntriesCache.delete(catalogUrl)
      throw error
    })

    catalogEntriesCache.set(catalogUrl, promise)
    try {
      return await promise
    } catch (error) {
      debug.warn('[Directory] Error fetching directory catalog:', error)
      return []
    }
  }

  async function loadCatalogEntries (catalogUrl: string): Promise<DirectoryEntry[]> {
    if (typeof fetch !== 'function') {
      throw new Error('Fetch API is unavailable')
    }

    const response = await fetch(catalogUrl, {
      headers: { accept: 'text/turtle' }
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch ${catalogUrl}: ${response.status}`)
    }

    const turtle = await response.text()
    const catalogStore = graph() as LiveStore
    parse(turtle, catalogStore, catalogUrl, 'text/turtle')

    const personType = new NamedNode(`${CATALOG_VOCAB}Person`)
    const webIdPredicate = new NamedNode(`${CATALOG_VOCAB}webid`)
    const namePredicate = new NamedNode(`${CATALOG_VOCAB}name`)
    const catalogPeople = new Map<string, DirectoryEntry>()

    const statements = catalogStore.statementsMatching(undefined, ns.rdf('type'), personType)
    for (const statement of statements) {
      const subject = statement.subject
      const webIdNode = catalogStore.any(subject, webIdPredicate)
      if (webIdNode && webIdNode.termType === 'NamedNode') {
        const webId = webIdNode.value
        const personName = catalogStore.anyValue(subject, namePredicate)
        if (isHttpUri(webId) && personName) {
          catalogPeople.set(webId, {
            kind: 'person',
            uri: webId,
            label: personName,
            subjectType: 'agent',
            relationshipLabel: 'People',
            sources: ['catalog']
          })
        }
      }
    }

    return Array.from(catalogPeople.values())
  }

  return {
    discoverCatalogEntries
  }
}
