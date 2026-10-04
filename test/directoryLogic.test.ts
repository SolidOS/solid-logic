import { beforeEach, describe, expect, it } from 'vitest'
import { Fetcher, Store, UpdateManager, sym } from 'rdflib'
import { createAclLogic } from '../src/acl/aclLogic'
import { createDirectoryLogic, DEFAULT_DIRECTORY_CATALOG_URL } from '../src/directory/directoryLogic'
import { createProfileLogic } from '../src/profile/profileLogic'
import { createTypeIndexLogic } from '../src/typeIndex/typeIndexLogic'
import { createContainerLogic } from '../src/util/containerLogic'
import { createUtilityLogic } from '../src/util/utilityLogic'
import { matchesAnyLabel, mergeDirectoryEntry } from '../src/directory/directoryHelpers'
import type { DirectoryEntry, DirectoryLogic } from '../src/types'

const alice = sym('https://alice.example.com/profile/card.ttl#me')

window.$SolidTestEnvironment = { username: alice.uri }

describe('Directory logic', () => {
  let directoryLogic: DirectoryLogic
  let web: Record<string, string>

  beforeEach(() => {
    web = {
      'https://alice.example.com/profile/card.ttl': `
        @prefix foaf: <http://xmlns.com/foaf/0.1/>.
        @prefix solid: <http://www.w3.org/ns/solid/terms#>.
        @prefix space: <http://www.w3.org/ns/pim/space#>.
        @prefix vcard: <http://www.w3.org/2006/vcard/ns#>.

        <#me>
          a vcard:Individual;
          foaf:name "Alice";
          foaf:knows <https://bob.example.com/profile/card.ttl#me>;
          space:preferencesFile <https://alice.example.com/settings/prefs.ttl>;
          solid:publicTypeIndex <https://alice.example.com/profile/publicTypeIndex.ttl>.
      `,
      'https://alice.example.com/settings/prefs.ttl': `
        @prefix solid: <http://www.w3.org/ns/solid/terms#>.
        <https://alice.example.com/profile/card.ttl#me>
          solid:privateTypeIndex <https://alice.example.com/settings/privateTypeIndex.ttl>.
      `,
      'https://alice.example.com/profile/publicTypeIndex.ttl': `
        @prefix solid: <http://www.w3.org/ns/solid/terms#>.
        <> a solid:TypeIndex, solid:ListedDocument.
      `,
      'https://alice.example.com/settings/privateTypeIndex.ttl': `
        @prefix solid: <http://www.w3.org/ns/solid/terms#>.
        @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>.
        @prefix vcard: <http://www.w3.org/2006/vcard/ns#>.

        <> a solid:TypeIndex, solid:UnlistedDocument.

        <#address-book>
          rdf:type solid:TypeRegistration;
          solid:forClass vcard:AddressBook;
          solid:instance <https://alice.example.com/contacts/index.ttl#this>.
      `,
      'https://alice.example.com/contacts/index.ttl': `
        @prefix dc: <http://purl.org/dc/elements/1.1/>.
        @prefix vcard: <http://www.w3.org/2006/vcard/ns#>.

        <#this>
          a vcard:AddressBook;
          dc:title "Address Book";
          vcard:nameEmailIndex <people.ttl>;
          vcard:groupIndex <groups.ttl>.
      `,
      'https://alice.example.com/contacts/people.ttl': `
        @prefix vcard: <http://www.w3.org/2006/vcard/ns#>.

        <Person/bob/index.ttl#this>
          vcard:inAddressBook <https://alice.example.com/contacts/index.ttl#this>;
          vcard:fn "Bobby Contact".
      `,
      'https://alice.example.com/contacts/Person/bob/index.ttl': `
        @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>.
        @prefix vcard: <http://www.w3.org/2006/vcard/ns#>.

        <#this>
          a vcard:Individual;
          vcard:fn "Bobby Contact";
          vcard:url [
            rdf:type vcard:URL;
            vcard:value "https://bobby.example.com/"
          ];
          vcard:url [
            rdf:type vcard:WebID;
            vcard:value "https://bob.example.com/profile/card.ttl#me"
          ].
      `,
      'https://alice.example.com/contacts/groups.ttl': `
        @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>.
        @prefix vcard: <http://www.w3.org/2006/vcard/ns#>.

        <https://alice.example.com/contacts/index.ttl#this>
          vcard:includesGroup <Group/team.ttl#this>.

        <Group/team.ttl#this>
          rdf:type vcard:Group;
          vcard:fn "Team Access".
      `,
      'https://alice.example.com/contacts/Group/team.ttl': `
        @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>.
        @prefix vcard: <http://www.w3.org/2006/vcard/ns#>.

        <#this>
          rdf:type vcard:Group;
          vcard:fn "Team Access".
      `,
      'https://bob.example.com/profile/card.ttl': `
        @prefix foaf: <http://xmlns.com/foaf/0.1/>.
        @prefix vcard: <http://www.w3.org/2006/vcard/ns#>.

        <#me>
          a vcard:Individual;
          foaf:name "Bob Example";
          foaf:knows <https://charlie.example.com/profile/card.ttl#me>.
      `,
      'https://charlie.example.com/profile/card.ttl': `
        @prefix foaf: <http://xmlns.com/foaf/0.1/>.
        @prefix vcard: <http://www.w3.org/2006/vcard/ns#>.

        <#me>
          a vcard:Individual;
          foaf:name "Charlie Example".
      `
    }

    fetchMock.resetMocks()
    fetchMock.mockIf(/^https?.*$/, async (req: Request) => {
      if (req.method !== 'GET') {
        return { status: 200, body: '' }
      }

      if (req.url === DEFAULT_DIRECTORY_CATALOG_URL) {
        return {
          status: 200,
          body: `
            @prefix cat: <http://example.org#>.
            @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>.

            <#zoe>
              rdf:type cat:Person;
              cat:webid <https://zoe.example.com/profile/card.ttl#me>;
              cat:name "Zoe Catalog".
          `,
          headers: { 'Content-Type': 'text/turtle' }
        }
      }

      const contents = web[req.url]
      if (contents !== undefined) {
        return {
          status: 200,
          body: contents,
          headers: {
            'Content-Type': 'text/turtle',
            'WAC-Allow': 'user="write", public="read"',
            'Accept-Patch': 'application/sparql-update'
          }
        }
      }

      return { status: 404, body: 'Not Found' }
    })

    const store = new Store()
    store.fetcher = new Fetcher(store, { fetch })
    store.updater = new UpdateManager(store)
    const authn = {
      currentUser: () => alice
    }
    const utilityLogic = createUtilityLogic(store, createAclLogic(store), createContainerLogic(store))
    const profileLogic = createProfileLogic(store, authn, utilityLogic)
    const typeIndexLogic = createTypeIndexLogic(store, authn, profileLogic, utilityLogic)
    directoryLogic = createDirectoryLogic(store as any, authn as any, typeIndexLogic)
  })

  it('returns contact entries when searching contacts only', async () => {
    const entries = await directoryLogic.search({ query: 'bobby', sources: ['contacts'] })

    expect(entries).toEqual([
      expect.objectContaining({
        kind: 'person',
        uri: 'https://bob.example.com/profile/card.ttl#me',
        label: 'Bobby Contact',
        subjectType: 'agent',
        relationshipLabel: 'Contact',
        sources: ['contacts']
      })
    ])
  })

  it('ignores non-WebID vcard:url values when resolving contacts', async () => {
    const entries = await directoryLogic.search({ query: 'bobby', sources: ['contacts'] })

    expect(entries).toEqual([
      expect.objectContaining({
        uri: 'https://bob.example.com/profile/card.ttl#me'
      })
    ])
  })

  it('returns group entries when searching groups only', async () => {
    const entries = await directoryLogic.search({ query: 'team', sources: ['groups'] })

    expect(entries).toEqual([
      expect.objectContaining({
        kind: 'group',
        uri: 'https://alice.example.com/contacts/Group/team.ttl#this',
        label: 'Team Access',
        subjectType: 'agentGroup',
        relationshipLabel: 'Group',
        sources: ['groups']
      })
    ])
  })

  it('returns foaf friends when searching friends only', async () => {
    const entries = await directoryLogic.search({ query: 'bob', sources: ['friends'] })

    expect(entries).toEqual([
      expect.objectContaining({
        kind: 'person',
        uri: 'https://bob.example.com/profile/card.ttl#me',
        label: 'Bob Example',
        subjectType: 'agent',
        relationshipLabel: 'Friend',
        sources: ['friends']
      })
    ])
  })

  it('keeps merged person labels and sources deterministic across concurrent discoveries', () => {
    const contactEntry = {
      kind: 'person' as const,
      uri: 'https://bob.example.com/profile/card.ttl#me',
      label: 'Bobby Contact',
      subjectType: 'agent' as const,
      relationshipLabel: 'Contact' as const,
      sources: ['contacts' as const]
    }
    const friendEntry = {
      kind: 'person' as const,
      uri: 'https://bob.example.com/profile/card.ttl#me',
      label: 'Bob Example',
      subjectType: 'agent' as const,
      relationshipLabel: 'Friend' as const,
      sources: ['friends' as const]
    }

    const firstOrder = new Map<string, DirectoryEntry>()
    const secondOrder = new Map<string, DirectoryEntry>()

    mergeDirectoryEntry(firstOrder, contactEntry)
    mergeDirectoryEntry(firstOrder, friendEntry)
    mergeDirectoryEntry(secondOrder, friendEntry)
    mergeDirectoryEntry(secondOrder, contactEntry)

    const mergedContactFirst = firstOrder.get(contactEntry.kind + ':' + contactEntry.uri)
    const mergedFriendFirst = secondOrder.get(friendEntry.kind + ':' + friendEntry.uri)

    expect(mergedContactFirst).toBeDefined()
    expect(mergedFriendFirst).toBeDefined()
    if (!mergedContactFirst || !mergedFriendFirst) return

    expect(mergedContactFirst).toEqual(mergedFriendFirst)
    expect(mergedContactFirst).toEqual(expect.objectContaining({
      label: 'Bobby Contact',
      searchableLabels: expect.arrayContaining(['Bobby Contact', 'Bob Example']),
      sources: ['contacts', 'friends']
    }))
    expect(matchesAnyLabel([mergedContactFirst.label, ...(mergedContactFirst.searchableLabels ?? [])], 'bobby')).toBe(true)
    expect(matchesAnyLabel([mergedFriendFirst.label, ...(mergedFriendFirst.searchableLabels ?? [])], 'bobby')).toBe(true)
  })

  it('returns catalog people when searching catalog only', async () => {
    const entries = await directoryLogic.search({ query: 'zoe', sources: ['catalog'] })

    expect(entries).toEqual([
      expect.objectContaining({
        kind: 'person',
        uri: 'https://zoe.example.com/profile/card.ttl#me',
        label: 'Zoe Catalog',
        subjectType: 'agent',
        relationshipLabel: 'People',
        sources: ['catalog']
      })
    ])
  })

  it('returns no entries when sources are explicitly empty', async () => {
    const entries = await directoryLogic.search({ query: 'bob', sources: [] })

    expect(entries).toEqual([])
  })

  it('retries catalog fetches after a transient failure', async () => {
    const catalogUrl = 'https://catalog.example.com/catalog.ttl'
    let attempts = 0

    fetchMock.mockIf(catalogUrl, async () => {
      attempts += 1
      if (attempts === 1) {
        return { status: 500, body: 'Transient failure' }
      }

      return {
        status: 200,
        body: `
          @prefix cat: <http://example.org#>.
          @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>.

          <#zoe>
            rdf:type cat:Person;
            cat:webid <https://zoe.example.com/profile/card.ttl#me>;
            cat:name "Zoe Catalog".
        `,
        headers: { 'Content-Type': 'text/turtle' }
      }
    })

    const firstEntries = await directoryLogic.search({ query: 'zoe', sources: ['catalog'], catalogUrl })
    const secondEntries = await directoryLogic.search({ query: 'zoe', sources: ['catalog'], catalogUrl })

    expect(firstEntries).toEqual([])
    expect(secondEntries).toEqual([
      expect.objectContaining({
        kind: 'person',
        uri: 'https://zoe.example.com/profile/card.ttl#me',
        label: 'Zoe Catalog',
        subjectType: 'agent',
        relationshipLabel: 'People',
        sources: ['catalog']
      })
    ])
    expect(attempts).toBe(2)
  })
})
