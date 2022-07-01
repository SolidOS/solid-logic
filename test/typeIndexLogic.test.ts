import { Fetcher, Store, sym, UpdateManager } from "rdflib";
import { createAclLogic } from "../src/acl/aclLogic";
import { createProfileLogic } from "../src/profile/profileLogic";
import { createTypeIndexLogic } from "../src/typeIndex/typeIndexLogic";
import { AuthenticationContext } from "../src/types";
import { createContainerLogic } from "../src/util/containerLogic";
import { createUtilityLogic } from "../src/util/utilityLogic";
import { alice } from "./helpers/dataSetup";

let store;
let options;
let typeIndexLogic
const authn = {
    currentUser: () => {
        return alice;
    },
};
describe('typeIndexLogic', () => { 
  beforeEach(() => {
      options = { fetch: fetch };
      store = new Store()
      store.fetcher = new Fetcher(store, options);
      store.updater = new UpdateManager(store);
      const util = createUtilityLogic(store, createAclLogic(store), createContainerLogic(store))
      typeIndexLogic = createTypeIndexLogic(store, authn, createProfileLogic(store, authn, util), util)

  })
  describe('loadIndex', () => {
    it('loadIndex', async () => {
      const context = {
        index: {}
      }

      const result = await typeIndexLogic.loadIndex(context, true)
      expect(result).toEqual({
        index: {
          private: [],
          public: []
        },
      })
    })
  })

  describe('loadTypeIndexes', () => {
    it('exists', () => {
      expect(typeIndexLogic.loadTypeIndexes).toBeInstanceOf(Function)
    })
    it('runs', async () => {
      const result = await typeIndexLogic.loadTypeIndexes({})
      expect(result).toBeInstanceOf(Object)
    })
  })

  describe('registerInTypeIndex', () => {
    it('exists', () => {
      expect(typeIndexLogic.registerInTypeIndex).toBeInstanceOf(Function)
    })
    it('throws error', async () => {
      expect(typeIndexLogic.registerInTypeIndex(
        {} as AuthenticationContext,
        sym('https://test.test#'),
        sym('https://test.test#'),
        false
      )).rejects
        .toThrow('@@ ensureLoadedPreferences: no user specified')
    })
  })

})