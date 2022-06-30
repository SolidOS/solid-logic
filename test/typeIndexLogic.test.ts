import { Fetcher, Store, sym, UpdateManager } from "rdflib";
import { createTypeIndexLogic } from "../src/typeIndex/typeIndexLogic";
import { AuthenticationContext } from "../src/types";
import { alice } from "./helpers/dataSetup";

let store;
let options;
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
      createTypeIndexLogic(store, authn)
  })
  describe('loadIndex', () => {
    it('loadIndex', async () => {
      const context = {
        index: {}
      }

      const result = await createTypeIndexLogic(store, authn).loadIndex(context, true)
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
      expect(createTypeIndexLogic(store, authn).loadTypeIndexes).toBeInstanceOf(Function)
    })
    it('runs', async () => {
      const result = await createTypeIndexLogic(store, authn).loadTypeIndexes({})
      expect(result).toBeInstanceOf(Object)
    })
  })

  describe('registerInTypeIndex', () => {
    it('exists', () => {
      expect(createTypeIndexLogic(store, authn).registerInTypeIndex).toBeInstanceOf(Function)
    })
    it('throws error', async () => {
      expect(createTypeIndexLogic(store, authn).registerInTypeIndex(
        {} as AuthenticationContext,
        sym('https://test.test#'),
        sym('https://test.test#'),
        false
      )).rejects
        .toThrow('@@ ensureLoadedPreferences: no user specified')
    })
  })

})