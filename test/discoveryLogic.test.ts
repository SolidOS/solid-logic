/**
* @jest-environment jsdom
*
*/
import { Fetcher, Namespace, Store, sym, UpdateManager } from "rdflib";
import { AuthenticationContext } from '../src/types'
import { solidLogicSingleton } from "../src/logic/solidLogicSingleton"
import fetchMock from "jest-fetch-mock";

import { loadOrCreateIfNotExists, makePreferencesFileURI, followOrCreateLink, loadCommunityTypeIndexes,
        getAppInstances, getScopedAppInstances, loadTypeIndexesFor, loadPreferences,
        followOrCreateLink, uniqueNodes,
        loadProfile } from '../src/discovery/discoveryLogic.ts'

const {  getContainerMembers, authn, store } = solidLogicSingleton

/* global $SolidTestEnvironment  */

/* Discovery Logic tests
*/

const ns ={
  meeting: Namespace('http://www.w3.org/ns/pim/meeting#'),
  rdf:     Namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#'),
  solid:   Namespace('http://www.w3.org/ns/solid/terms#'),
  space:   Namespace('http://www.w3.org/ns/pim/space#'),
  vcard:   Namespace('http://www.w3.org/2006/vcard/ns#'),
  wf:      Namespace('http://www.w3.org/2005/01/wf/flow#')
}

const prefixes = Object.keys(ns).map(prefix => `@prefix ${prefix}: ${ns[prefix]('')}.\n`).join('') // In turtle

const Alice = sym('https://alice.example.com/profile/card.ttl#me')
const AliceProfileFile = Alice.doc()
const AlicePreferencesFile = sym('https://alice.example.com/settings/prefs.ttl')
const AlicePublicTypeIndex = sym('https://alice.example.com/profle/public-type-index.ttl')
const AlicePrivateTypeIndex = sym('https://alice.example.com/settings/private-type-index.ttl')

// the Club is a community which Alice is involved and so she gets to
// interact with things in its type indexes.

const Club = sym('https://club.example.com/profile/card.ttl#it')
const ClubProfileFile = Club.doc()
const ClubPreferencesFile = sym('https://club.example.com/settings/prefs.ttl')
const ClubPublicTypeIndex = sym('https://club.example.com/profle/public-type-index.ttl')
const ClubPrivateTypeIndex = sym('https://club.example.com/settings/private-type-index.ttl')

const Bob = sym('https://bob.example.com/profile/card.ttl#me')

window.$SolidTestEnvironment = { username: Alice.uri }

const user = Alice
const profile = user.doc()

// const klass = sym('http://www.w3.org/2006/vcard/ns#AddressBook')
const klass = ns.wf('Tracker')

//////////////////////////////////////////////////////////// User Alice
const AliceProfile = `
<#me> a vcard:Individual;
    space:preferencesFile ${AlicePreferencesFile};
    solid:publicTypeIndex ${AlicePublicTypeIndex};
    vcard:fn "Alice" .
`
const AlicePreferences =  `
  ${Alice} solid:privateTypeIndex ${AlicePrivateTypeIndex};
     solid:community ${Club} .

`
// console.log('AlicePreferences: ' ,  AlicePreferences)

const AlicePublicTypes = `

:chat1 solid:forClass meeting:LongChat; solid:instance <../publicStuff/myChat.ttl#this> .

:todo solid:forClass wf:Tracker; solid:instance  <../publicStuff/actionItems.ttl#this>.

:issues solid:forClass wf:Tracker; solid:instance  <../project4/issues.ttl#this>.

# :bookmarks
#    a solid:TypeRegistration;
#    solid:forClass bookm:Bookmark;
#    solid:instance </public/poddit.ttl>.
`;

const AlicePrivateTypes = `
:id1592319218311 solid:forClass wf:Tracker; solid:instance  <../privateStuff/ToDo.ttl#this>.

:id1592319391415 solid:forClass wf:Tracker; solid:instance <../privateStuff/Goals.ttl#this>.

:id1595595377864 solid:forClass wf:Tracker; solid:instance <../privateStuff/workingOn.ttl#this>.

:id1596123375929 solid:forClass meeting:Meeting; solid:instance  <../project4/meeting1.ttl#this>.

`;


//////////////////////////////////////////////////////////// User Bob
const BobProfile = `
<#me> a vcard:Individual;

    vcard:fn "Bob" .
`

//////////////////////////////////////////////////////////// User Club
const ClubProfile = `

<#it> a vcard:Organization;
    space:preferencesFile ${ClubPreferencesFile};
    solid:publicTypeIndex ${ClubPublicTypeIndex};
    vcard:fn "Card Club" .
`
const ClubPreferences =  `
  ${Club} solid:privateTypeIndex ${ClubPrivateTypeIndex} .
`
const ClubPublicTypes = `

:chat1 solid:forClass meeting:LongChat; solid:instance <../publicStuff/ourChat.ttl#this> .

:todo solid:forClass wf:Tracker; solid:instance  <../publicStuff/actionItems.ttl#this>.

:issues solid:forClass wf:Tracker; solid:instance  <../project4/clubIssues.ttl#this>.

# :bookmarks
#    a solid:TypeRegistration;
#    solid:forClass bookm:Bookmark;
#    solid:instance </public/poddit.ttl>.
`;

const ClubPrivateTypes = `
:id1592319218311 solid:forClass wf:Tracker; solid:instance  <../privateStuff/ToDo.ttl#this>.

:id1592319391415 solid:forClass wf:Tracker; solid:instance <../privateStuff/Goals.ttl#this>.

:id1595595377864 solid:forClass wf:Tracker; solid:instance <../privateStuff/tasks.ttl#this>.

:id1596123375929 solid:forClass meeting:Meeting; solid:instance  <../project4/clubMeeting.ttl#this>.

`;

////////////////////////////////////////////////////////////////////////////

const web = {}
web[profile.uri] = AliceProfile
web[AlicePreferencesFile.uri] = AlicePreferences
web[AlicePrivateTypeIndex.uri] = AlicePrivateTypes
web[AlicePublicTypeIndex.uri] = AlicePublicTypes

web[Bob.doc().uri] = BobProfile

web[Club.doc().uri] = ClubProfile
web[ClubPreferencesFile.uri] = ClubPreferences
web[ClubPrivateTypeIndex.uri] = ClubPrivateTypes
web[ClubPublicTypeIndex.uri] = ClubPublicTypes

let requests = []

describe("Discovery Logic", () => {
  let store;
  let options;
  beforeEach(() => {
    fetchMock.resetMocks();
    requests = []
    const init = {headers: { "Content-Type": "text/turtle" }} // Fetch options tend to be called this

    fetchMock.mockIf(/^https?.*$/, async req => {

      if (req.method !== 'GET') {
        // console.log('Not GET ' + req.url, req)
        requests.push(req)
        return { status: 200 }
      }
      const contents = web[req.url]
      if (contents) {
        return {
          body: prefixes + contents, // Add namespaces to anything
          status: 200,
          headers: {
            "Content-Type": "text/turtle",
            "WAC-Allow":    'user="write", public="read"',
            "Accept-Patch": "application/sparql-update"
          }
        }
      } // if contents
      return {
        status: 404,
        body: 'Not Found'
        }
      })


    options = { fetch: fetch };
    store = new Store()
    store.fetcher = new Fetcher (store, options);
    store.updater = new UpdateManager(store);
    // util = new UtilityLogic(store, ns, fetcher);
  });

// uniqueNodes

describe('uniqueNodes', () => {
    it('exists', () => {
        expect(uniqueNodes).toBeInstanceOf(Function)
    })
    it('removed duplicates', async () => {
        const input = [ sym('https://a.com/'), sym('https://b.com/'),sym('https://a.com/'), sym('https://a.com/'),  sym('https://c.com/'),  ]
        const expected = [ sym('https://a.com/'), sym('https://b.com/'), sym('https://c.com/'),  ]
        const result =  uniqueNodes(input)
        expect(result).toEqual(expected)

    })
    it('handles an empty array', async () => {
        const result = await uniqueNodes([])
        expect(result).toEqual([])
    })
})
 // loadOrCreateIfNotExists

   describe('loadOrCreateIfNotExists', () => {
       it('exists', () => {
           expect(loadOrCreateIfNotExists).toBeInstanceOf(Function)
       })
       it('does nothing if existing file', async () => {
           const result = await loadOrCreateIfNotExists(store, Alice.doc())
            expect(requests).toEqual([])

       })
       it.skip('creates empty file if did not exist', async () => {
           const result = await loadOrCreateIfNotExists(store, Bob.doc())
           // console.log('@@@@@ test requests', requests)
           expect(requests[0].method).toEqual('PUT')
           expect(requests[0].url).toEqual(Bob.doc().uri)
       })
   })

   // followOrCreateLink

   describe('followOrCreateLink', () => {
       it('exists', () => {
           expect(followOrCreateLink).toBeInstanceOf(Function)
       })
       it('follows existing link', async () => {
           const result = await loadOrCreateIfNotExists(store, Alice, ns.solid('preferencesFile'), 'blah', Alice.doc())
            expect(requests).toEqual(AlicePreferencesFile)

       })
       it('creates empty file if did not exist and new link', async () => {
           const suggestion = 'https://bob.example.com/settings/prefsSuggestion.ttl'
           const newFile = sym(suggestion)
           const result = await loadOrCreateIfNotExists(store, Bob, ns.solid('preferencesFile'), sym(suggestion), Bob.doc())
           expect(result).toEqual(sym(suggestion))
           expect(requests[0].method).toEqual('PATCH') // or patch first?
           expect(requests[0].url).toEqual(Bob.doc().uri)
           expect(requests[1].method).toEqual('PUT') // or patch first?
           expect(requests[1].url).toEqual(suggestion)
           expect(store.holds(Bob, ns.solid('preferencesFile'), sym(suggestion), Bob.doc())).toEqual(true)
       })
   })

   describe('loadProfile', () => {
       it('exists', () => {
           expect(loadProfile).toBeInstanceOf(Function)
       })
       it('loads data', async () => {
           const result = await loadProfile(store, user)
           expect(result).toBeInstanceOf(Object)
           expect(result.uri).toEqual(AliceProfileFile.uri)
           expect(store.holds(user, ns.rdf('type'), ns.vcard('Individual'), profile)).toEqual(true)
           expect(store.holds(user, ns.space('preferencesFile'), AlicePreferencesFile, profile)).toEqual(true)
           expect(store.statementsMatching(null, null, null, profile).length).toEqual(4)
       })
   })

  describe('loadPreferences', () => {
      it('exists', () => {
          expect(loadPreferences).toBeInstanceOf(Function)
      })
      it('loads data', async () => {
          const result = await loadPreferences(store, Alice)
          expect(result).toBeInstanceOf(Object)
          expect(result.uri).toEqual(AlicePreferencesFile.uri)
          expect(store.holds(user, ns.rdf('type'), ns.vcard('Individual'), profile)).toEqual(true)
          expect(store.statementsMatching(null, null, null, profile).length).toEqual(4)

          expect(store.statementsMatching(null, null, null, AlicePreferencesFile).length).toEqual(2)
          expect(store.holds(user, ns.solid('privateTypeIndex'), AlicePrivateTypeIndex, AlicePreferencesFile)).toEqual(true)
      })
      it('creates new file', async () => {
          const result = await loadPreferences(store, Bob)

          const patchRequest = requests[0]
          expect(patchRequest.method).toEqual('PATCH')
          expect(patchRequest.url).toEqual(Bob.doc().uri)
          const text = await patchRequest.text()
          expect(text).toContain('INSERT DATA { <https://bob.example.com/profile/card.ttl#me> <http://www.w3.org/ns/pim/space#preferencesFile> <https://bob.example.com/Settings/Preferences.ttl> .')

          const putRequest = requests[1]
          expect(putRequest.method).toEqual('PUT')
          expect(putRequest.url).toEqual('https://bob.example.com/Settings/Preferences.ttl')
          const text2 = await putRequest.text()
          expect(text2).toEqual('')

      })

  })

  const AliceScopes = [ {
         "agent":  {
           "classOrder": 5,
           "termType": "NamedNode",
           "value": "https://alice.example.com/profile/card.ttl#me",
         },
         "index": {
           "classOrder": 5,
           "termType": "NamedNode",
           "value": "https://alice.example.com/profle/public-type-index.ttl",
         },
         "label": "public",
       },
        {
         "agent": {
           "classOrder": 5,
           "termType": "NamedNode",
           "value": "https://alice.example.com/profile/card.ttl#me",
         },
         "index": {
           "classOrder": 5,
           "termType": "NamedNode",
           "value": "https://alice.example.com/settings/private-type-index.ttl",
         },
         "label": "private",
       }
    ];

    describe('loadTypeIndexesFor', () => {
        it('exists', () => {
            expect(loadTypeIndexesFor).toBeInstanceOf(Function)
        })
        it('loads data', async () => {
            const result = await loadTypeIndexesFor(store, user)
            expect(result).toEqual(AliceScopes)
            expect(store.statementsMatching(null, null, null, AlicePrivateTypeIndex).length).toEqual(8)
            expect(store.statementsMatching(null, null, null, AlicePublicTypeIndex).length).toEqual(6)
        })
    })

const ClubScopes =
  [
      {
       "agent":  {
         "classOrder": 5,
         "termType": "NamedNode",
          "value": "https://club.example.com/profile/card.ttl#it",
        },
        "index":  {
          "classOrder": 5,
          "termType": "NamedNode",
          "value": "https://club.example.com/profle/public-type-index.ttl",
        },
        "label": "public",
      },
       {
        "agent":  {
          "classOrder": 5,
          "termType": "NamedNode",
          "value": "https://club.example.com/profile/card.ttl#it",
        },
        "index":  {
          "classOrder": 5,
          "termType": "NamedNode",
          "value": "https://club.example.com/settings/private-type-index.ttl",
        },
        "label": "private",
      },
    ];
    describe('loadCommunityTypeIndexes', () => {
        it('exists', () => {
            expect(loadCommunityTypeIndexes).toBeInstanceOf(Function)
        })
        it('loads data', async () => {
            const result = await loadCommunityTypeIndexes(store, user) // @@ tbd
            expect(result).toEqual(ClubScopes)
        })
    })

const AliceAndClubScopes =
   [
      {
       "instance":  {
         "classOrder": 5,
         "termType": "NamedNode",
         "value": "https://alice.example.com/publicStuff/actionItems.ttl#this",
       },
       "scope":  {
         "agent":  {
           "classOrder": 5,
           "termType": "NamedNode",
           "value": "https://alice.example.com/profile/card.ttl#me",
         },
         "index":  {
           "classOrder": 5,
           "termType": "NamedNode",
           "value": "https://alice.example.com/profle/public-type-index.ttl",
         },
         "label": "public",
       },
     },
      {
       "instance":  {
         "classOrder": 5,
         "termType": "NamedNode",
         "value": "https://alice.example.com/project4/issues.ttl#this",
       },
       "scope": {
         "agent":  {
           "classOrder": 5,
           "termType": "NamedNode",
           "value": "https://alice.example.com/profile/card.ttl#me",
         },
         "index": {
           "classOrder": 5,
           "termType": "NamedNode",
           "value": "https://alice.example.com/profle/public-type-index.ttl",
         },
         "label": "public",
       },
     },
      {
       "instance":  {
         "classOrder": 5,
         "termType": "NamedNode",
         "value": "https://alice.example.com/privateStuff/ToDo.ttl#this",
       },
       "scope":  {
         "agent": {
           "classOrder": 5,
           "termType": "NamedNode",
           "value": "https://alice.example.com/profile/card.ttl#me",
         },
         "index":  {
           "classOrder": 5,
           "termType": "NamedNode",
           "value": "https://alice.example.com/settings/private-type-index.ttl",
         },
         "label": "private",
       },
     },
      {
       "instance":  {
         "classOrder": 5,
         "termType": "NamedNode",
         "value": "https://alice.example.com/privateStuff/Goals.ttl#this",
       },
       "scope": {
         "agent":  {
           "classOrder": 5,
           "termType": "NamedNode",
           "value": "https://alice.example.com/profile/card.ttl#me",
         },
         "index":  {
           "classOrder": 5,
           "termType": "NamedNode",
           "value": "https://alice.example.com/settings/private-type-index.ttl",
         },
         "label": "private",
       },
     },
      {
       "instance":  {
         "classOrder": 5,
         "termType": "NamedNode",
         "value": "https://alice.example.com/privateStuff/workingOn.ttl#this",
       },
       "scope":  {
         "agent":  {
           "classOrder": 5,
           "termType": "NamedNode",
           "value": "https://alice.example.com/profile/card.ttl#me",
         },
         "index":  {
           "classOrder": 5,
           "termType": "NamedNode",
           "value": "https://alice.example.com/settings/private-type-index.ttl",
         },
         "label": "private",
       },
     },
      {
       "instance":  {
         "classOrder": 5,
         "termType": "NamedNode",
         "value": "https://club.example.com/publicStuff/actionItems.ttl#this",
       },
       "scope": {
         "agent":  {
           "classOrder": 5,
           "termType": "NamedNode",
           "value": "https://club.example.com/profile/card.ttl#it",
         },
         "index":  {
           "classOrder": 5,
           "termType": "NamedNode",
           "value": "https://club.example.com/profle/public-type-index.ttl",
         },
         "label": "public",
       },
     },
      {
       "instance":  {
         "classOrder": 5,
         "termType": "NamedNode",
         "value": "https://club.example.com/project4/clubIssues.ttl#this",
       },
       "scope":  {
         "agent": {
           "classOrder": 5,
           "termType": "NamedNode",
           "value": "https://club.example.com/profile/card.ttl#it",
         },
         "index":  {
           "classOrder": 5,
           "termType": "NamedNode",
           "value": "https://club.example.com/profle/public-type-index.ttl",
         },
         "label": "public",
       },
     },
      {
       "instance": {
         "classOrder": 5,
         "termType": "NamedNode",
         "value": "https://club.example.com/privateStuff/ToDo.ttl#this",
       },
       "scope":  {
         "agent":  {
           "classOrder": 5,
           "termType": "NamedNode",
           "value": "https://club.example.com/profile/card.ttl#it",
         },
         "index":  {
           "classOrder": 5,
           "termType": "NamedNode",
           "value": "https://club.example.com/settings/private-type-index.ttl",
         },
         "label": "private",
       },
     },
      {
       "instance":  {
         "classOrder": 5,
         "termType": "NamedNode",
         "value": "https://club.example.com/privateStuff/Goals.ttl#this",
       },
       "scope":  {
         "agent":  {
           "classOrder": 5,
           "termType": "NamedNode",
           "value": "https://club.example.com/profile/card.ttl#it",
         },
         "index":  {
           "classOrder": 5,
           "termType": "NamedNode",
           "value": "https://club.example.com/settings/private-type-index.ttl",
         },
         "label": "private",
       },
     },
      {
       "instance":  {
         "classOrder": 5,
         "termType": "NamedNode",
         "value": "https://club.example.com/privateStuff/tasks.ttl#this",
       },
       "scope":  {
         "agent":  {
           "classOrder": 5,
           "termType": "NamedNode",
           "value": "https://club.example.com/profile/card.ttl#it",
         },
         "index":  {
           "classOrder": 5,
           "termType": "NamedNode",
           "value": "https://club.example.com/settings/private-type-index.ttl",
         },
         "label": "private",
       },
     },
   ]

  describe('getScopedAppInstances', () => {
      it('exists', () => {
          expect(getScopedAppInstances).toBeInstanceOf(Function)
      })
      it('runs', async () => {
          const result = await getScopedAppInstances(store, klass, user)
          expect(result).toEqual(AliceAndClubScopes)
          // expect(result.length).toEqual(4) // @@ @@@@@@@@@
      })
  })

const TRACKERS =
  [
     {
       "classOrder": 5,
       "termType": "NamedNode",
       "value": "https://alice.example.com/publicStuff/actionItems.ttl#this",
     },
     {
       "classOrder": 5,
       "termType": "NamedNode",
       "value": "https://alice.example.com/project4/issues.ttl#this",
     },
     {
       "classOrder": 5,
       "termType": "NamedNode",
       "value": "https://alice.example.com/privateStuff/ToDo.ttl#this",
     },
     {
       "classOrder": 5,
       "termType": "NamedNode",
       "value": "https://alice.example.com/privateStuff/Goals.ttl#this",
     },
     {
       "classOrder": 5,
       "termType": "NamedNode",
       "value": "https://alice.example.com/privateStuff/workingOn.ttl#this",
     },
     {
       "classOrder": 5,
       "termType": "NamedNode",
       "value": "https://club.example.com/publicStuff/actionItems.ttl#this",
     },
     {
       "classOrder": 5,
       "termType": "NamedNode",
       "value": "https://club.example.com/project4/clubIssues.ttl#this",
     },
     {
       "classOrder": 5,
       "termType": "NamedNode",
       "value": "https://club.example.com/privateStuff/ToDo.ttl#this",
     },
     {
       "classOrder": 5,
       "termType": "NamedNode",
       "value": "https://club.example.com/privateStuff/Goals.ttl#this",
     },
     {
       "classOrder": 5,
       "termType": "NamedNode",
       "value": "https://club.example.com/privateStuff/tasks.ttl#this",
     },
   ]

  describe('getAppInstances', () =>  {
      it('exists', () => {
          expect(getAppInstances).toBeInstanceOf(Function)
      })
      it('runs', async () => { // needs auth mock
          const result = await getAppInstances(store, klass)
          expect(result).toEqual(TRACKERS)
          expect(result).toEqual(uniqueNodes(result)) // shoud have no dups
      })
  })
})
