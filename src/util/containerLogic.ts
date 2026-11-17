import { NamedNode, Statement, sym } from 'rdflib'
import { ns } from './ns'
import { isMissingError } from '../resource/resourceHttp'

/**
 * Container-related class
 */
export function createContainerLogic(store) {

    function getContainerElements(containerNode: NamedNode): NamedNode[] {
        return store
            .statementsMatching(
                containerNode,
                sym('http://www.w3.org/ns/ldp#contains'),
                undefined
            )
            .map((st: Statement) => st.object as NamedNode)
    }

    function isContainer(url: NamedNode) {
        const typeUris = store.findTypeURIs(url)
        return Boolean(
            url.value.charAt(url.value.length - 1) === '/' ||
            typeUris[ns.ldp('Container').uri] ||
            typeUris[ns.ldp('BasicContainer').uri]
        )
    }

    function getContainerMemberCount(containerNode: NamedNode): number {
        return getContainerElements(containerNode).length
    }

    async function createContainer(url: string) {
        const stringToNode = sym(url)
        if (!isContainer(stringToNode)) {
            throw new Error(`Not a container URL ${url}`)
        }
        // Copied from https://github.com/solidos/solid-crud-tests/blob/v3.1.0/test/surface/create-container.test.ts#L56-L64
        const result = await store.fetcher._fetch(url, {
            method: 'PUT',
            headers: {
                'Content-Type': 'text/turtle',
                'If-None-Match': '*',
                Link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"', // See https://github.com/solidos/node-solid-server/issues/1465
            },
            body: ' ', // work around https://github.com/michielbdejong/community-server/issues/4#issuecomment-776222863
        })
        // Treat 409 as idempotent success: another process/request already created the container.
        if (result.status === 409 || result.status === 412) {
            return
        }
        if (result.status.toString()[0] !== '2') {
            throw new Error(`Not OK: got ${result.status} response while creating container at ${url}`)
        }

    }

    async function ensureContainer(url: string): Promise<void> {
        const containerNode = sym(url)
        try {
            await store.fetcher.load(containerNode)
            return
        } catch (error) {
            if (!isMissingError(error)) throw error
        }
        await createContainer(url)
    }

    async function getContainerMembers(containerUrl: NamedNode): Promise<NamedNode[]> {
        await store.fetcher.load(containerUrl)
        return getContainerElements(containerUrl)
    }
    return {
        isContainer,
        createContainer,
        ensureContainer,
        getContainerElements,
        getContainerMembers,
        getContainerMemberCount
    }
}
