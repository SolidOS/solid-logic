import { type AuthnLogic, type DirectoryEntry, type DirectoryLogic, type DirectorySearchOptions, type DirectorySource, type TypeIndexLogic } from '../types'
import { type LiveStore } from 'rdflib'
import { createContactsDirectoryDiscovery } from './contactsDirectory'
import { createFriendsDirectoryDiscovery } from './friendsDirectory'
import { createCatalogDirectoryDiscovery } from './catalogDirectory'
import { matchesAnyLabel, mergeDirectoryEntry, sortEntries } from './directoryHelpers'

const DEFAULT_FOAF_DISTANCE = 3

export const DEFAULT_DIRECTORY_CATALOG_URL = 'https://raw.githubusercontent.com/solid/catalog/refs/heads/main/catalog-data.ttl'
export const DEFAULT_DIRECTORY_SOURCES: DirectorySource[] = ['contacts', 'friends', 'catalog', 'groups']

export function createDirectoryLogic (
  store: LiveStore,
  authn: AuthnLogic,
  typeIndexLogic: TypeIndexLogic
): DirectoryLogic {
  const contactsDiscovery = createContactsDirectoryDiscovery(store, typeIndexLogic)
  const friendsDiscovery = createFriendsDirectoryDiscovery(store)
  const catalogDiscovery = createCatalogDirectoryDiscovery()

  async function discoverWithNormalizedOptions (
    normalized: ReturnType<typeof normalizeOptions>
  ): Promise<DirectoryEntry[]> {
    const discoveredEntries = new Map<string, DirectoryEntry>()
    const discoveryTasks: Promise<void>[] = []

    const mergeEntry = (entry: DirectoryEntry): void => {
      mergeDirectoryEntry(discoveredEntries, entry)
    }

    if (normalized.sources.includes('catalog')) {
      discoveryTasks.push(catalogDiscovery.discoverCatalogEntries(normalized.catalogUrl, mergeEntry))
    }

    if (normalized.user) {
      if (normalized.sources.includes('contacts')) {
        discoveryTasks.push(contactsDiscovery.discoverAddressBookContacts(normalized.user, mergeEntry))
      }

      if (normalized.sources.includes('groups')) {
        discoveryTasks.push(contactsDiscovery.discoverAddressBookGroups(normalized.user, mergeEntry))
      }

      if (normalized.sources.includes('friends')) {
        discoveryTasks.push(friendsDiscovery.discoverFoafPeople(normalized.user, normalized.maxFoafDistance, mergeEntry))
      }
    }

    if (!discoveryTasks.length) {
      return []
    }

    const results = await Promise.allSettled(discoveryTasks)
    if (results.every(result => result.status === 'rejected')) {
      throw new Error('Unable to load directory entries.')
    }

    return sortEntries(discoveredEntries.values())
  }

  async function search (options: DirectorySearchOptions = {}): Promise<DirectoryEntry[]> {
    const normalized = normalizeOptions(options)
    const entries = await discoverWithNormalizedOptions(normalized)
    return entries.filter(entry => matchesAnyLabel([entry.label, ...(entry.searchableLabels ?? [])], normalized.query))
  }

  return {
    search
  }

  function normalizeOptions (options: DirectorySearchOptions = {}) {
    const sources = options.sources === undefined ? [...DEFAULT_DIRECTORY_SOURCES] : [...options.sources]
    return {
      query: options.query ?? '',
      sources,
      catalogUrl: options.catalogUrl ?? DEFAULT_DIRECTORY_CATALOG_URL,
      user: options.user ?? authn.currentUser(),
      maxFoafDistance: options.maxFoafDistance ?? DEFAULT_FOAF_DISTANCE
    }
  }
}
