import { type DirectoryEntry, type DirectorySource, type TypeIndexLogic } from '../types'
import { type LiveStore, NamedNode } from 'rdflib'
import { ns } from '../util/ns'
import { isHttpUri, labelForNode, loadDocumentSilently, uniqueNamedNodes } from './directoryHelpers'

const CONTACT_CARD_CONCURRENCY = 8

export function createContactsDirectoryDiscovery (
  store: LiveStore,
  typeIndexLogic: TypeIndexLogic
) {
  const personalAddressBooksCache = new Map<string, Promise<NamedNode[]>>()
  const contactWebIdCache = new Map<string, Promise<string | null>>()

  async function loadPersonalAddressBooks (user: NamedNode): Promise<NamedNode[]> {
    const cached = personalAddressBooksCache.get(user.value)
    if (cached) {
      return cached
    }

    const promise = (async () => {
      const scopes = await typeIndexLogic.loadTypeIndexesFor(user)
      let scopedApps = [] as Awaited<ReturnType<TypeIndexLogic['getScopedAppsFromIndex']>>

      for (const scope of scopes) {
        const apps = await typeIndexLogic.getScopedAppsFromIndex(scope, ns.vcard('AddressBook'))
        scopedApps = scopedApps.concat(apps)
      }

      return uniqueNamedNodes(scopedApps.map(app => app.instance))
    })().catch(error => {
      personalAddressBooksCache.delete(user.value)
      throw error
    })

    personalAddressBooksCache.set(user.value, promise)
    return promise
  }

  async function webIdForAddressBookContact (contact: NamedNode): Promise<string | null> {
    const cached = contactWebIdCache.get(contact.value)
    if (cached) {
      return cached
    }

    const promise = (async () => {
      if (!await loadDocumentSilently(store, contact)) {
        return null
      }

      const urlNodes = store.each(contact, ns.vcard('url'), null, contact.doc()) as NamedNode[]
      for (const urlNode of urlNodes) {
        const webId = resolveWebIdFromAddressBookUrlNode(urlNode, contact.doc())
        if (webId) {
          return webId
        }
      }

      return null
    })().catch(error => {
      contactWebIdCache.delete(contact.value)
      throw error
    })

    contactWebIdCache.set(contact.value, promise)
    return promise
  }

  function resolveWebIdFromAddressBookUrlNode (urlNode: NamedNode, doc: NamedNode): string | null {
    if (!store.holds(urlNode, ns.rdf('type'), ns.vcard('WebID'), doc)) {
      return null
    }

    const valueNode = store.any(urlNode, ns.vcard('value'), null, doc)
    const webId = valueNode?.value || ''
    return isHttpUri(webId) ? webId : null
  }

  async function discoverAddressBookContacts (
    user: NamedNode,
    onEntry: (entry: DirectoryEntry) => void | Promise<void>
  ): Promise<void> {
    const books = await loadPersonalAddressBooks(user)

    for (const book of books) {
      if (await loadDocumentSilently(store, book)) {
        const nameEmailIndex = store.any(book, ns.vcard('nameEmailIndex'), null, book.doc()) as NamedNode | null
        if (nameEmailIndex) {
          if (await loadDocumentSilently(store, nameEmailIndex)) {
            const contacts = store.each(undefined, ns.vcard('inAddressBook'), book, nameEmailIndex) as NamedNode[]
            for (let index = 0; index < contacts.length; index += CONTACT_CARD_CONCURRENCY) {
              const batch = contacts.slice(index, index + CONTACT_CARD_CONCURRENCY)
              const entries = await Promise.all(batch.map(async contact => {
                const webId = await webIdForAddressBookContact(contact)
                if (!webId) {
                  return null
                }

                return {
                  kind: 'person' as const,
                  uri: webId,
                  label: store.anyValue(contact, ns.vcard('fn'), null, nameEmailIndex) || labelForNode(store, contact),
                  subjectType: 'agent' as const,
                  relationshipLabel: 'Contact' as const,
                  sources: ['contacts'] as DirectorySource[]
                }
              }))

              for (const entry of entries.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))) {
                await onEntry(entry)
              }
            }
          }
        }
      }
    }
  }

  async function discoverAddressBookGroups (
    user: NamedNode,
    onEntry: (entry: DirectoryEntry) => void | Promise<void>
  ): Promise<void> {
    const books = await loadPersonalAddressBooks(user)

    for (const book of books) {
      if (await loadDocumentSilently(store, book)) {
        const groupIndex = store.any(book, ns.vcard('groupIndex'), null, book.doc()) as NamedNode | null
        if (groupIndex) {
          if (await loadDocumentSilently(store, groupIndex)) {
            const groups = uniqueNamedNodes([
              ...(store.each(book, ns.vcard('includesGroup'), null, groupIndex) as NamedNode[]),
              ...(store.each(book, ns.vcard('includesGroup'), null, book.doc()) as NamedNode[])
            ])

            for (const group of groups) {
              await loadDocumentSilently(store, group)

              await onEntry({
                kind: 'group',
                uri: group.value,
                label: labelForNode(store, group),
                subjectType: 'agentGroup',
                relationshipLabel: 'Group',
                sources: ['groups']
              })
            }
          }
        }
      }
    }
  }

  return {
    discoverAddressBookContacts,
    discoverAddressBookGroups
  }
}
