import { sym } from "rdflib";
import { AuthenticationContext } from "../src/index";
import { loadIndex, loadTypeIndexes, registerInTypeIndex } from "../src/typeIndex/typeIndexLogic";


describe('typeIndexLogic', () => { 
  describe('loadIndex', () => {
    it('loadIndex', async () => {
      const context = {
        index: {}
      }

      const result = await loadIndex(context, true)
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
      expect(loadTypeIndexes).toBeInstanceOf(Function)
    })
    it('runs', async () => {
      const result = await loadTypeIndexes({})
      expect(result).toBeInstanceOf(Object)
    })
  })

  describe('registerInTypeIndex', () => {
    it('exists', () => {
      expect(registerInTypeIndex).toBeInstanceOf(Function)
    })
    it('throws error', async () => {
      expect(registerInTypeIndex(
        {} as AuthenticationContext,
        sym('https://test.test#'),
        sym('https://test.test#'),
        false
      )).rejects
        .toThrow('@@ ensureLoadedPreferences: no user specified')
    })
  })

})