/**
* @jest-environment jsdom
*
*/
import { Fetcher, Namespace, Store, sym, UpdateManager } from "rdflib";
import { AuthenticationContext } from '../src/types'
import { solidLogicSingleton } from "../src/logic/solidLogicSingleton"
import fetchMock from "jest-fetch-mock";

import { getAppInstances, getScopedAppInstances, loadTypeIndexesFor, loadPreferences, loadProfile } from '../src/discovery/discoveryLogic.ts'

const {  getContainerMembers, authn, store } = solidLogicSingleton

/* Discovery Logic tests
*/

const ns ={
  rdf:   Namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#'),
  solid: Namespace('http://www.w3.org/ns/solid/terms#'),
  space: Namespace('http://www.w3.org/ns/pim/space#'),
  vcard: Namespace('http://www.w3.org/2006/vcard/ns#')
}
const prefixes = `@prefix mee: <http://www.w3.org/ns/pim/meeting#>.
@prefix solid: <http://www.w3.org/ns/solid/terms#>.
@prefix vcard: <http://www.w3.org/2006/vcard/ns#>.
@prefix wf: <http://www.w3.org/2005/01/wf/flow#>.
@prefix space: <http://www.w3.org/ns/pim/space#>.
`

const Alice = sym('https://alice.example.com/profile/card.ttl#me')
const AliceProfileFile = Alice.doc()
const AlicePreferencesFile = sym('https://alice.example.com/settings/prefs.ttl')
const AlicePublicTypeIndex = sym('https://alice.example.com/profle/public-type-index.ttl')
const AlicePrivateTypeIndex = sym('https://alice.example.com/settings/private-type-index.ttl')

const user = Alice
const profile = user.doc()

const klass = sym('http://www.w3.org/2006/vcard/ns#AddressBook')

const mockUser = jest.fn(() => Alice);
authn.currentUser = jest.fn(() => Alice)

const AliceProfile = prefixes + `

<#me> a vcard:Individual;
    space:preferencesFile ${AlicePreferencesFile};
    solid:publicTypeIndex ${AlicePublicTypeIndex};
    vcard:fn "Alice" .
`
// console.log('AliceProfile: ' ,  AliceProfile)

const AlicePreferences =  prefixes + `
  ${Alice} solid:privateTypeIndex ${AlicePrivateTypeIndex} .
`
// console.log('AlicePreferences: ' ,  AlicePreferences)

const AlicePublicTypes = prefixes + `

:chat1 solid:forClass mee:LongChat; solid:instance <../publicStuff/myChat.ttl#this> .

:todo solid:forClass wf:Tracker; solid:instance  <../publicStuff/actionItems.ttl#this>.

:issues solid:forClass wf:Tracker; solid:instance  <../project4/issues.ttl#this>.

# :bookmarks
#    a solid:TypeRegistration;
#    solid:forClass bookm:Bookmark;
#    solid:instance </public/poddit.ttl>.
`;

const AlicePrivateTypes = prefixes + `
:id1592319218311 solid:forClass wf:Tracker; solid:instance  <../privateStuff/ToDo.ttl#this>.

:id1592319391415 solid:forClass wf:Tracker; solid:instance <../privateStuff/Goals.ttl#this>.

:id1595595377864 solid:forClass wf:Tracker; solid:instance <../privateStuff/workingOn.ttl#this>.

:id1596123375929 solid:forClass meet:Meeting; solid:instance  <../project4/meeting1.ttl#this>..

`;

describe("Discovery Logic", () => {
  let store;
  let options;
  beforeEach(() => {
    fetchMock.resetMocks();

    const init = {headers: { "Content-Type": "text/turtle" }} // Fetch options tend to be called this

    if (true) fetchMock.mockIf(/^https?.*$/, async req => {
      console.log('  Mock req.url: ', req.url)

        if (req.url === profile.uri) {
          return {
            body: AliceProfile,
            status: 200,
            headers: {
              "Content-Type": "text/turtle"
            }
          }
        } else if (req.url === AlicePreferencesFile.uri) { //,
          return {
            body: AlicePreferences,
            status: 200,
            headers: {
              "Content-Type": "text/turtle"
            }
          }
        } else if (req.url === AlicePrivateTypeIndex.uri) { // ,
          return {
            body: AlicePrivateTypes,
            headers: {
              "Content-Type": "text/turtle"
            }
          }
        } else if (req.url === AlicePublicTypeIndex.uri) { // ,
          return {
            body: AlicePublicTypes,
            headers: {
              "Content-Type": "text/turtle"
            }
          }
        } else {
          return {
            status: 404,
            body: 'Not Found'
          }
        }
      })
    /*
    fetchMock.mockResponse("Not Found", {
      status: 404, // @@
    });
 */

    options = { fetch: fetch };
    store = new Store()
    store.fetcher = new Fetcher (store, options);
    store.updater = new UpdateManager(store);
    // util = new UtilityLogic(store, ns, fetcher);
  });


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
          const result = await loadPreferences(store, user)
          expect(result).toBeInstanceOf(Object)
          expect(result.uri).toEqual(AlicePreferencesFile.uri)
          expect(store.holds(user, ns.rdf('type'), ns.vcard('Individual'), profile)).toEqual(true)
          expect(store.statementsMatching(null, null, null, profile).length).toEqual(4)

          expect(store.statementsMatching(null, null, null, AlicePreferencesFile).length).toEqual(1)
          expect(store.holds(user, ns.solid('privateTypeIndex'), AlicePrivateTypeIndex, AlicePreferencesFile)).toEqual(true)
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
          expect(store.statementsMatching(null, null, null, AlicePrivateTypeIndex).length).toEqual(6)
          expect(store.statementsMatching(null, null, null, AlicePublicTypeIndex).length).toEqual(6)
      })
  })

// loadTypeIndexesFor


  describe('getScopedAppInstances', () => {
      it('exists', () => {
          expect(getScopedAppInstances).toBeInstanceOf(Function)
      })
      it.skip('runs', async () => {
          // console.log('_fetch:' + store.fetcher._fetch)

          const result = await getScopedAppInstances(store, klass, user)
          // const result = {}
          expect(result).toEqual([])
      })
  })

  describe('getAppInstances', () =>  {
      it('exists', () => {
          expect(getAppInstances).toBeInstanceOf(Function)
      })
      it.skip('runs', async () => {
          expect(await getAppInstances(store, user)).toEqual([])
      })
  })
})
