/**
* @jest-environment jsdom
*
*/
import { UpdateManager, Store, Fetcher } from 'rdflib'
import { createAclLogic } from '../src/acl/aclLogic'
import { createChatLogic } from '../src/chat/chatLogic'
import { createProfileLogic } from '../src/profile/profileLogic'
import { createContainerLogic } from '../src/util/containerLogic'
import { createUtilityLogic } from '../src/util/utilityLogic'
import { alice, bob } from './helpers/dataSetup'

declare global {
  interface Window {
    $SolidTestEnvironment?: { username: string }
  }
}

window.$SolidTestEnvironment = { username: alice.uri }

describe('Chat logic', () => {
  let chatLogic
  let store
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
    const util = createUtilityLogic(store, createAclLogic(store), createContainerLogic(store))
    chatLogic = createChatLogic(store, createProfileLogic(store, authn, util))
  })

  describe('get chat, without creating', () => {
    describe('when no chat exists yet', () => {
      let result
      beforeEach(async () => {
        aliceHasValidProfile()
        noChatWithBobExists()
        result = await chatLogic.getChat(bob, false)
      })
      it('does not return a chat', async () => {
        expect(result).toBeNull()
      })
      it('loaded the current user profile', () => {
        expect(fetchMock.mock.calls[0][0]).toBe(
          'https://alice.example.com/profile/card.ttl'
        )
      })
      it('tried to load the chat document', () => {
        expect(fetchMock.mock.calls[1][0]).toBe(
          'https://alice.example.com/IndividualChats/bob.example.com/index.ttl'
        )
      })
      it('has no additional fetch requests', () => {
        expect(fetchMock.mock.calls.length).toBe(2)
      })
    })
  })

  describe('get chat, create if missing', () => {
    describe('when no chat exists yet', () => {
      let result
      beforeEach(async () => {
        Date.now = jest.fn(() =>
          new Date(Date.UTC(2021, 1, 6, 10, 11, 12)).valueOf()
        )
        aliceHasValidProfile()
        noChatWithBobExists()
        chatWithBobCanBeCreated()
        bobHasAnInbox()
        invitationCanBeSent()
        chatContainerIsFound()
        chatContainerAclCanBeSet()
        editablePrivateTypeIndexIsFound()
        privateTypeIndexIsUpdated()
        result = await chatLogic.getChat(bob, true)
      })
      it('returns the chat URI based on the invitee\'s WebID', () => {
        expect(result.uri).toBe(
          'https://alice.example.com/IndividualChats/bob.example.com/index.ttl#this'
        )
      })
      it('created a chat document', () => {
        const request = getRequestTo(
          'PUT',
          'https://alice.example.com/IndividualChats/bob.example.com/index.ttl'
        )
        expect(request.body).toBe(`@prefix : <#>.
@prefix dc: <http://purl.org/dc/elements/1.1/>.
@prefix meeting: <http://www.w3.org/ns/pim/meeting#>.
@prefix xsd: <http://www.w3.org/2001/XMLSchema#>.
@prefix card: </profile/card.ttl#>.

:this
    a meeting:LongChat;
    dc:author card:me;
    dc:created "2021-02-06T10:11:12Z"^^xsd:dateTime;
    dc:title "Chat channel".
`)
      })
      it('allowed Bob to participate in the chat by adding an ACL', () => {
        const request = getRequestTo(
          'PUT',
          'https://alice.example.com/IndividualChats/bob.example.com/.acl'
        )
        expect(request.body).toBe(`
            @prefix acl: <http://www.w3.org/ns/auth/acl#>.
            <#owner>
            a acl:Authorization;
            acl:agent <https://alice.example.com/profile/card.ttl#me>;
            acl:accessTo <.>;
            acl:default <.>;
            acl:mode
                acl:Read, acl:Write, acl:Control.
            <#invitee>
            a acl:Authorization;
            acl:agent <https://bob.example.com/profile/card.ttl#me>;
            acl:accessTo <.>;
            acl:default <.>;
            acl:mode
                acl:Read, acl:Append.
            `)
      })
      it('sent an invitation to invitee inbox', () => {
        const request = getRequestTo('POST', 'https://bob.example.com/inbox')
        expect(request.body).toContain(`
        <> a <http://www.w3.org/ns/pim/meeting#LongChatInvite> ;
        <http://www.w3.org/1999/02/22-rdf-syntax-ns#seeAlso> <https://alice.example.com/IndividualChats/bob.example.com/index.ttl#this> .
        `)
      })
      it('added the new chat to private type index', () => {
        const request = getRequestTo(
          'PATCH',
          'https://alice.example.com/settings/privateTypeIndex.ttl'
        )
        expect(request.body)
          .toBe(`INSERT DATA { <https://alice.example.com/settings/privateTypeIndex.ttl#id1612606272000> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/ns/solid/terms#TypeRegistration> .
<https://alice.example.com/settings/privateTypeIndex.ttl#id1612606272000> <http://www.w3.org/ns/solid/terms#forClass> <http://www.w3.org/ns/pim/meeting#LongChat> .
<https://alice.example.com/settings/privateTypeIndex.ttl#id1612606272000> <http://www.w3.org/ns/solid/terms#instance> <https://alice.example.com/IndividualChats/bob.example.com/index.ttl#this> .
 }
`)
      })
      it('has no additional fetch requests', () => {
        expect(fetchMock.mock.calls.length).toBe(9)
      })
    })
  })

  describe('possible errors', () => {
    it('profile does not link to storage', async () => {
      fetchMock.mockOnceIf('https://alice.example.com/profile/card.ttl', '<><><>.', {
        headers: {
          'Content-Type': 'text/turtle',
        },
      })
      const expectedError = new Error('User pod root not found!')
      await expect(chatLogic.getChat(bob, false)).rejects.toEqual(expectedError)
    })

    it('invitee inbox not found', async () => {
      aliceHasValidProfile()
      noChatWithBobExists()
      chatWithBobCanBeCreated()
      bobDoesNotHaveAnInbox()
      const expectedError = new Error(
        'Invitee inbox not found! https://bob.example.com/profile/card.ttl#me'
      )
      await expect(chatLogic.getChat(bob, true)).rejects.toEqual(expectedError)
    })
  })

  function aliceHasValidProfile() {
    fetchMock.mockOnceIf(
      'https://alice.example.com/profile/card.ttl',
      `
            <https://alice.example.com/profile/card.ttl#me>
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

  function noChatWithBobExists() {
    return fetchMock.mockOnceIf(
      ({ url, method }) =>
        url === 'https://alice.example.com/IndividualChats/bob.example.com/index.ttl' &&
        method === 'GET',
      'Not found',
      {
        status: 404,
      }
    )
  }

  function chatWithBobCanBeCreated() {
    return fetchMock.mockOnceIf(
      ({ url, method }) =>
        url === 'https://alice.example.com/IndividualChats/bob.example.com/index.ttl' &&
        method === 'PUT',
      'Created',
      {
        status: 201,
      }
    )
  }

  function bobHasAnInbox() {
    fetchMock.mockOnceIf(
      'https://bob.example.com/profile/card.ttl',
      '<https://bob.example.com/profile/card.ttl#me><http://www.w3.org/ns/ldp#inbox><https://bob.example.com/inbox>.',
      {
        headers: { 'Content-Type': 'text/turtle' },
      }
    )
  }

  function bobDoesNotHaveAnInbox() {
    fetchMock.mockOnceIf('https://bob.example.com/profile/card.ttl', '<><><>.', {
      headers: {
        'Content-Type': 'text/turtle',
      },
    })
  }

  function invitationCanBeSent() {
    return fetchMock.mockOnceIf(
      ({ url, method }) =>
        url === 'https://bob.example.com/inbox' && method === 'POST',
      'Created',
      {
        status: 201,
        headers: {
          location:
            'https://bob.example.com/inbox/22373339-6cc0-49fc-b69e-0402edda6e4e.ttl',
        },
      }
    )
  }

  function chatContainerIsFound() {
    return fetchMock.mockOnceIf(
      ({ url, method }) =>
        url === 'https://alice.example.com/IndividualChats/bob.example.com/' &&
        method === 'GET',
      '<><><>.',
      {
        status: 200,
        headers: {
          'Content-Type': 'text/turtle',
          Link: '<.acl>; rel="acl"',
        },
      }
    )
  }

  function chatContainerAclCanBeSet() {
    return fetchMock.mockOnceIf(
      ({ url, method }) =>
        url === 'https://alice.example.com/IndividualChats/bob.example.com/.acl' &&
        method === 'PUT',
      'Created',
      {
        status: 201,
      }
    )
  }

  function editablePrivateTypeIndexIsFound() {
    return fetchMock.mockOnceIf(
      ({ url, method }) =>
        url === 'https://alice.example.com/settings/privateTypeIndex.ttl' &&
        method === 'GET',
      '<><><>.',
      {
        status: 200,
        headers: {
          'Content-Type': 'text/turtle',
          'wac-allow': 'user="read write append control",public=""',
          'ms-author-via': 'SPARQL',
        },
      }
    )
  }

  function privateTypeIndexIsUpdated() {
    return fetchMock.mockOnceIf(
      ({ url, method }) =>
        url === 'https://alice.example.com/settings/privateTypeIndex.ttl' &&
        method === 'PATCH',
      'OK',
      {
        status: 200,
      }
    )
  }

  function getRequestTo(
    method: 'GET' | 'PUT' | 'POST' | 'DELETE' | 'PATCH',
    url: string
  ): RequestInit {
    const call = fetchMock.mock.calls.find(
      (it) => it[0] === url && method === it[1]?.method
    )
    expect(call).not.toBeNull()
    const request = call?.[1]
    expect(request).not.toBeNull()
    return request!
  }
})
