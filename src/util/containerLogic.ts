import { NamedNode, Statement, sym } from 'rdflib'
import { ns } from './ns'

/**
 * Container-related class
 */
export function createContainerLogic(store) {
    const hiddenFileSuffixes = ['.acl', '~']

    function noHiddenFiles (obj) {
        // @@ This hiddenness should actually be server defined
        const parentUri = obj?.dir?.()?.uri
        const uri = obj?.uri

        if (typeof uri !== 'string' || typeof parentUri !== 'string') {
            return true
        }

        const pathEnd = uri.slice(parentUri.length)
        return !pathEnd.startsWith('.') && !hiddenFileSuffixes.some((suffix) => pathEnd.endsWith(suffix))
    }

    function getContainerIndexThing(containerNode: NamedNode): NamedNode {
        const folderUri = containerNode.uri.endsWith('/') ? containerNode.uri : containerNode.uri + '/'
        return store.sym(folderUri + 'index.ttl#this')
    }

    function getContainerMintClass(containerNode: NamedNode): NamedNode | undefined {
        if (!store) {
            return undefined
        }

        const indexThing = getContainerIndexThing(containerNode)
        const indexDoc = indexThing.doc()
        const mintClassPredicate = ns.ui('mintClass')
        const typePredicate = ns.rdf('type')

        return (
            store.any(indexThing, mintClassPredicate, undefined, indexDoc) ??
            store.any(indexDoc, mintClassPredicate, undefined, indexDoc) ??
            store.any(indexThing, typePredicate, undefined, indexDoc) ??
            store.any(indexDoc, typePredicate, undefined, indexDoc) ??
            undefined
        ) as NamedNode | undefined
    }

    function getContainerElements(containerNode: NamedNode): NamedNode[] {
        return store
            .statementsMatching(
                containerNode,
                sym('http://www.w3.org/ns/ldp#contains'),
                undefined
            )
            .map((st: Statement) => st.object as NamedNode)
    }

    function getContainerVisibleItemCount(containerNode: NamedNode): number {
        return store.each(containerNode, sym('http://www.w3.org/ns/ldp#contains')).filter(noHiddenFiles).length
    }

    function isContainer(url: NamedNode) {
        const typeUris = store.findTypeURIs(url)
        return Boolean(
            url.value.endsWith('/') ||
            typeUris[ns.ldp('Container').uri] ||
            typeUris[ns.ldp('BasicContainer').uri]
        )
    }

    function isStorageRoot(resourceStore, resource: NamedNode): boolean {
        if (!resourceStore) return false

        return resourceStore.holds(resource, ns.rdf('type'), ns.space('Storage'), resource.doc())
    }

    function hasMintClassIndexDocument(containerNode: NamedNode): boolean {
        return Boolean(getContainerMintClass(containerNode))
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
        if (result.status === 409) {
            return
        }
        if (result.status.toString()[0] !== '2') {
            throw new Error(`Not OK: got ${result.status} response while creating container at ${url}`)
        }
    }

    async function getContainerMembers(containerUrl: NamedNode): Promise<NamedNode[]> {
        await store.fetcher.load(containerUrl)
        return getContainerElements(containerUrl)
    }
    return {
        isContainer,
        createContainer,
        getContainerElements,
        getContainerMembers,
        getContainerIndexThing,
        noHiddenFiles,
        isStorageRoot,
        getContainerVisibleItemCount,
        getContainerMintClass,
        hasMintClassIndexDocument
    }
}
