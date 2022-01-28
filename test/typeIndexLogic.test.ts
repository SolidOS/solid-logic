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
    it.skip('runs', async () => {
        expect(await typeIndexLogic.registerInTypeIndex(
        {} as AuthenticationContext,
        sym('https://test.test#'),
        sym('https://test.test#'),
        false
        )).toEqual(undefined)
    })
})