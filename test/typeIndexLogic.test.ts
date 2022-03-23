import { sym } from 'rdflib'
import { AuthenticationContext } from '../src/types'
import * as typeIndexLogic from '../src/typeIndex/typeIndexLogic'

describe('loadTypeIndexes', () => {
    it('exists', () => {
        expect(typeIndexLogic.loadTypeIndexes).toBeInstanceOf(Function)
    })
    it('runs', () => {
        expect(typeIndexLogic.loadTypeIndexes({})).toBeInstanceOf(Object)
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