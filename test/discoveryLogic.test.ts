/**
* @jest-environment jsdom
*
*/
import { Fetcher, Namespace, Store, sym, UpdateManager } from "rdflib";
import { AuthenticationContext } from '../src/types'
import { solidLogicSingleton } from "../src/logic/solidLogicSingleton"
import fetchMock from "jest-fetch-mock";

import { getAppInstances, getScopedAppInstances, loadTypeIndexesFor, loadPreferences  } from '../src/discovery/discoveryLogic.ts'

const {  getContainerMembers, authn, store } = solidLogicSingleton

/* Discovery Logic tests
*/

const ns ={
  rdf:   Namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#'),
  solid: Namespace('http://www.w3.org/ns/solid/terms#'),
  space: Namespace('http://www.w3.org/ns/pim/space#'),
  vcard: Namespace('http://www.w3.org/2006/vcard/ns#')
}
const prefixes = `@prefix solid: <http://www.w3.org/ns/solid/terms#>.
@prefix vcard: <http://www.w3.org/2006/vcard/ns#>.
@prefix space: <http://www.w3.org/ns/pim/space#>.
`

const Alice = sym('https://alice.example.com/profile/card.ttl#me')
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
console.log('AliceProfile: ' ,  AliceProfile)

const AlicePreferences =  prefixes + `
  ${Alice} solid:publicTypeIndex ${AlicePrivateTypeIndex} .
`
console.log('AlicePreferences: ' ,  AlicePreferences)

const AlicePublicTypes = prefixes + `
`;

const AlicePrivateTypes = prefixes + `
`;

describe("Discovery Logic", () => {
  let store;
  let options;
  beforeEach(() => {
    fetchMock.resetMocks();
    fetchMock.mockResponse("Not Found", {
      status: 200, // @@
    });

    const uri = user.doc().uri
    // console.log('uri', uri)
    fetchMock.doMockOnceIf(uri, AliceProfile, {headers: { "Content-Type": "text/turtle" }});
    fetchMock.doMockOnceIf(AlicePreferencesFile.uri, AlicePreferences, {headers: { "Content-Type": "text/turtle" }});

    options = { fetch: fetch };
    store = new Store()
    store.fetcher = new Fetcher (store, options);
    store.updater = new UpdateManager(store);
    // util = new UtilityLogic(store, ns, fetcher);
  });


  describe('loadPreferences', () => {
      it('exists', () => {
          expect(loadPreferences).toBeInstanceOf(Function)
      })
      it('loads data', async () => {
          const result = await loadPreferences(store, user)
          expect(result).toBeInstanceOf(Object)
          expect(result.uri).toEqual(AlicePreferencesFile.uri)
          expect(store.holds(user, ns.rdf('type'), ns.vcard('Individual'), profile)).toEqual(true)
      })
  })

  describe('getScopedAppInstances', () => {
      it('exists', () => {
          expect(getScopedAppInstances).toBeInstanceOf(Function)
      })
      it('runs', async () => {
          console.log('_fetch:' + store.fetcher._fetch)

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
