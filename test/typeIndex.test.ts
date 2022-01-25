import { sym } from 'rdflib'
import { AuthenticationContext } from '../src'
import * as typeIndex from '../src/typeIndex/typeIndex'

describe('loadTypeIndexes', () => {
    it('exists', () => {
        expect(typeIndex.loadTypeIndexes).toBeInstanceOf(Function)
    })
    it('runs', () => {
        expect(typeIndex.loadTypeIndexes({})).toBeInstanceOf(Object)
    })
})

describe('registerInTypeIndex', () => {
    it('exists', () => {
        expect(typeIndex.registerInTypeIndex).toBeInstanceOf(Function)
    })
    it.skip('runs', async () => {
        expect(await typeIndex.registerInTypeIndex(
        {} as AuthenticationContext,
        sym('https://test.test#'),
        sym('https://test.test#'),
        false
        )).toEqual(undefined)
    })
})