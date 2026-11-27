import { beforeEach, describe, expect, it } from 'vitest'
import { UpdateManager, Store, Fetcher, sym } from 'rdflib'
import { createContainerLogic } from '../src/util/containerLogic'
import { alice } from './helpers/dataSetup'

window.$SolidTestEnvironment = { username: alice.uri }

describe('Container', () => {
    let store
    let containerLogic: ReturnType<typeof createContainerLogic>
    beforeEach(() => {
        fetchMock.resetMocks()
        store = new Store()
        store.fetcher = new Fetcher(store, { fetch: fetch })
        store.updater = new UpdateManager(store)
        containerLogic = createContainerLogic(store)
    })

    it('getContainerMembers - When container has some containment triples', async () => {
            containerHasSomeContainmentTriples()
            const containerMembers = await containerLogic.getContainerMembers(sym('https://container.com/'))
            const result = containerMembers.map((oneResult: { value: any }) => oneResult.value)
            expect(result.sort()).toEqual([
                'https://container.com/foo.txt',
                'https://container.com/bar/'
            ].sort())
    })
    it.skip('getContainerMembers- When container is empty - Resolves to an empty array', async () => {
        containerIsEmpty()
        const result = await containerLogic.getContainerMembers(sym('https://container.com/'))
        expect(result).toEqual([])
    })

    it('preserves idempotent creation for existing callers', async () => {
        fetchMock.mockResponseOnce('', { status: 409 })
        await expect(containerLogic.createContainer('https://container.com/')).resolves.toBeUndefined()
    })

    it.each([409, 412])('rejects an existing container in strict creation mode (HTTP %s)', async status => {
        fetchMock.mockResponseOnce('', { status })
        await expect(containerLogic.createContainer('https://container.com/', { allowExisting: false }))
            .rejects.toMatchObject({ status })
    })

    function containerIsEmpty() {
        fetchMock.mockOnceIf(
            'https://com/',
            '',
            {
                headers: { 'Content-Type': 'text/turtle' },
            }
        )
    }
    
    function containerHasSomeContainmentTriples() {
        fetchMock.mockOnceIf(
            'https://container.com/',
            '<.> <http://www.w3.org/ns/ldp#contains> <./foo.txt>, <./bar/> .',
            {
                headers: { 'Content-Type': 'text/turtle' },
            }
        )
        
    }
})