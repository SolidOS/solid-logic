import { type DirectoryEntry } from '../types'
import { type LiveStore, NamedNode } from 'rdflib'
import { ns } from '../util/ns'
import { loadDocumentSilently, storedLabelForNode } from './directoryHelpers'

const PEOPLE_SEARCH_CONCURRENCY = 6

export function createFriendsDirectoryDiscovery (store: LiveStore) {
  function relationshipLabelForDepth (depth: number) {
    return depth === 1 ? 'Friend' : 'People'
  }

  async function emitPersonEntry (
    person: NamedNode,
    depth: number,
    onEntry: (entry: DirectoryEntry) => void | Promise<void>
  ): Promise<void> {
    const personName = storedLabelForNode(store, person)
    if (!personName) return

    await onEntry({
      kind: 'person',
      uri: person.value,
      label: personName,
      subjectType: 'agent',
      relationshipLabel: relationshipLabelForDepth(depth),
      sources: ['friends']
    })
  }

  async function discoverFoafPeople (
    user: NamedNode,
    maxFoafDistance: number,
    onEntry: (entry: DirectoryEntry) => void | Promise<void>
  ): Promise<void> {
    const visited = new Set<string>([user.value])
    const emitted = new Set<string>()
    const loadedDocs = new Set<string>()
    let queue: Array<{ person: NamedNode, depth: number }> = [{ person: user, depth: 0 }]

    const processPerson = async (currentEntry: { person: NamedNode, depth: number }) => {
      const { person: current, depth } = currentEntry
      const currentDoc = current.doc().value
      if (!loadedDocs.has(currentDoc)) {
        loadedDocs.add(currentDoc)
        await loadDocumentSilently(store, current)
      }

      if (current.value !== user.value) {
        if (!emitted.has(current.value)) {
          emitted.add(current.value)
          await emitPersonEntry(current, depth, onEntry)
        }
      }

      if (depth >= maxFoafDistance) {
        return [] as Array<{ person: NamedNode, depth: number }>
      }

      const nextPeople: Array<{ person: NamedNode, depth: number }> = []
      const contacts = store.each(current, ns.foaf('knows')) as NamedNode[]
      for (const contact of contacts) {
        if (contact.termType === 'NamedNode') {
          const contactName = storedLabelForNode(store, contact)
          if (contact.value !== user.value && contactName && !emitted.has(contact.value)) {
            emitted.add(contact.value)
            await onEntry({
              kind: 'person',
              uri: contact.value,
              label: contactName,
              subjectType: 'agent',
              relationshipLabel: depth === 0 ? 'Friend' : 'People',
              sources: ['friends']
            })
          }

          if (!visited.has(contact.value)) {
            visited.add(contact.value)
            nextPeople.push({ person: contact, depth: depth + 1 })
          }
        }
      }

      return nextPeople
    }

    while (queue.length > 0) {
      const nextQueue: Array<{ person: NamedNode, depth: number }> = []

      for (let index = 0; index < queue.length; index += PEOPLE_SEARCH_CONCURRENCY) {
        const batch = queue.slice(index, index + PEOPLE_SEARCH_CONCURRENCY)
        const nested = await Promise.all(batch.map(processPerson))
        nested.forEach(entries => nextQueue.push(...entries))
      }

      queue = nextQueue
    }
  }

  return {
    discoverFoafPeople
  }
}
