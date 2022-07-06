import { Fetcher, Store, sym, UpdateManager } from 'rdflib';
import { createAclLogic } from '../src/acl/aclLogic';

describe('setACLUserPublic', () => {
    let aclLogic
    let store
    beforeAll(() => {
        const options = { fetch: fetch };
        store = new Store()
        store.fetcher = new Fetcher(store, options);
        store.updater = new UpdateManager(store);
        aclLogic = createAclLogic(store)
    })
    it('exists', () => {
        expect(aclLogic.setACLUserPublic).toBeInstanceOf(Function)
    })
    it.skip('runs', async () => {
        expect(await aclLogic.setACLUserPublic(
        'https://test.test#',
        sym('https://test.test#'),
        {}
        )).toEqual({})
    })
})