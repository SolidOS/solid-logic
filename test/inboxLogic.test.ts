/**
* @jest-environment jsdom
*
*/
import { UpdateManager, Store, Fetcher, sym } from 'rdflib'
import { createAclLogic } from '../src/acl/aclLogic'
import { createInboxLogic } from '../src/inbox/inboxLogic'
import { createProfileLogic } from '../src/profile/profileLogic'
import { createContainerLogic } from '../src/util/containerLogic'
import { createUtilityLogic } from '../src/util/utilityLogic'

const alice = sym('https://alice.example.com/profile/card#me')
const bob = sym('https://bob.example.com/profile/card#me')

describe('Inbox logic', () => {
  let store
  let inboxLogic
  beforeEach(() => {
    fetchMock.resetMocks()
    fetchMock.mockResponse('Not Found', {
      status: 404,
    })
    store = new Store()
    store.fetcher = new Fetcher(store, { fetch: fetch })
    store.updater = new UpdateManager(store)
    const authn = {
      currentUser: () => {
        return alice
      },
    }
    const containerLogic = createContainerLogic(store)
    const aclLogic = createAclLogic(store)
    const util = createUtilityLogic(store, aclLogic, containerLogic)
    const profile = createProfileLogic(store, authn, util)
    inboxLogic = createInboxLogic(store, profile, util, containerLogic, aclLogic)
  })

  describe('getNewMessages', () => {
    describe('When inbox is empty', () => {
      let result
      beforeEach(async () => {
        bobHasAnInbox()
        inboxIsEmpty()
        result = await inboxLogic.getNewMessages(bob)
      })
      it('Resolves to an empty array', () => {
        expect(result).toEqual([])
      })
    })
    describe('When container has some containment triples', () => {
      let result
      beforeEach(async () => {
        bobHasAnInbox()
        inboxHasSomeContainmentTriples()
        const messages = await inboxLogic.getNewMessages(bob)
        result = messages.map(oneMessage => oneMessage.value)
      })
      it('Resolves to an array with URLs of non-container resources in inbox', () => {
        expect(result.sort()).toEqual([
          'https://container.com/foo.txt'
        ].sort())
      })
    })
  })
  describe('createInboxFor', () => {
    beforeEach(async () => {
      aliceHasValidProfile()
      // First for the PUT:
      fetchMock.mockOnceIf(
        'https://alice.example.com/p2p-inboxes/Peer%20Person/',
        'Created', {
          status: 201
        }
      )
      // Then for the GET to read the ACL link:
      fetchMock.mockOnceIf(
        'https://alice.example.com/p2p-inboxes/Peer%20Person/',
        ' ', {
          status: 200,
          headers: {
            Link: '<https://some/acl>; rel="acl"',
          }
        }
      )
      fetchMock.mockIf('https://some/acl', 'Created', { status: 201 })

      await inboxLogic.createInboxFor('https://peer.com/#me', 'Peer Person')
    })
    it('creates the inbox', () => {
      expect(fetchMock.mock.calls).toEqual([
        [ 'https://alice.example.com/profile/card', fetchMock.mock.calls[0][1] ],
        [ 'https://alice.example.com/p2p-inboxes/Peer%20Person/', {
          body: ' ',
          headers: {
            'Content-Type': 'text/turtle',
            'If-None-Match': '*',
            Link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
          },
          method: 'PUT'      
        }],
        [ 'https://alice.example.com/p2p-inboxes/Peer%20Person/', fetchMock.mock.calls[2][1] ],
        [ 'https://some/acl', {
          body: '@prefix acl: <http://www.w3.org/ns/auth/acl#>.\n' +
          '\n' +
          '<#alice> a acl:Authorization;\n' +
          '  acl:agent <https://alice.example.com/profile/card#me>;\n' +
          '  acl:accessTo <https://alice.example.com/p2p-inboxes/Peer%20Person/>;\n' +
          '  acl:default <https://alice.example.com/p2p-inboxes/Peer%20Person/>;\n' +
          '  acl:mode acl:Read, acl:Write, acl:Control.\n' +
          '<#bobAccessTo> a acl:Authorization;\n' +
          '  acl:agent <https://peer.com/#me>;\n' +
          '  acl:accessTo <https://alice.example.com/p2p-inboxes/Peer%20Person/>;\n' +
          '  acl:mode acl:Append.\n',
          headers: [
            [ 'Content-Type', 'text/turtle' ]
          ],
          method: 'PUT'
        }]
      ])
    })

  })
  describe('markAsRead', () => {
    beforeEach(async () => {
      fetchMock.mockOnceIf(
        'https://container.com/item.ttl',
        '<#some> <#inbox> <#item> .',
        {
          headers: { 'Content-Type': 'text/turtle' },
        }
      )
      fetchMock.mockOnceIf(
        'https://container.com/archive/2111/03/31/item.ttl',
        'Created',
        {
          status: 201,
          headers: { 'Content-Type': 'text/turtle' },
        }
      )
      await inboxLogic.markAsRead('https://container.com/item.ttl', new Date('31 March 2111 UTC'))
    })
    it('moves the item to archive', async () => {
      expect(fetchMock.mock.calls).toEqual([
        [ 'https://container.com/item.ttl' ],
        [
          'https://container.com/archive/2111/03/31/item.ttl',
          {
            'body': '<#some> <#inbox> <#item> .',
            'headers': [
              [
                'Content-Type',
                'text/turtle',
              ],
            ],
            'method': 'PUT',
          },
        ],
        [ 'https://container.com/item.ttl', { method: 'DELETE' } ],
      ])
    })
  })

  function aliceHasValidProfile() {
    fetchMock.mockOnceIf(
      'https://alice.example.com/profile/card',
      `
            <https://alice.example.com/profile/card#me>
              <http://www.w3.org/ns/pim/space#storage> <https://alice.example.com/> ;
              <http://www.w3.org/ns/solid/terms#privateTypeIndex> <https://alice.example.com/settings/privateTypeIndex.ttl> ;
            .`,
      {
        headers: {
          'Content-Type': 'text/turtle',
        },
      }
    )
  }

  function bobHasAnInbox() {
    fetchMock.mockOnceIf(
      'https://bob.example.com/profile/card',
      '<https://bob.example.com/profile/card#me><http://www.w3.org/ns/ldp#inbox><https://container.com/>.',
      {
        headers: { 'Content-Type': 'text/turtle' },
      }
    )
  }

  function inboxIsEmpty() {
    fetchMock.mockOnceIf(
      'https://container.com/',
      ' ', // FIXME: https://github.com/jefflau/jest-fetch-mock/issues/189
      {
        headers: { 'Content-Type': 'text/turtle' },
      }
    )
  }

  function inboxHasSomeContainmentTriples() {
    fetchMock.mockOnceIf(
      'https://container.com/',
      '<.> <http://www.w3.org/ns/ldp#contains> <./foo.txt>, <./bar/> .',
      {
        headers: { 'Content-Type': 'text/turtle' },
      }
    )
  }

})