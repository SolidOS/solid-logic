import { sym } from 'rdflib'
import { setACLUserPublic } from '../src/acl/aclLogic' 

describe('setACLUserPublic', () => {
    it('exists', () => {
        expect(setACLUserPublic).toBeInstanceOf(Function)
    })
    it.skip('runs', async () => {
        expect(await setACLUserPublic(
        'https://test.test#',
        sym('https://test.test#'),
        {}
        )).toEqual({})
    })
})