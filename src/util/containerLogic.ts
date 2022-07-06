import { NamedNode, Statement, sym } from "rdflib";

/**
 * Container-related class
 */
export function createContainerLogic(store) {

    function getContainerElements(containerNode: NamedNode): NamedNode[] {
        return store
            .statementsMatching(
                containerNode,
                sym("http://www.w3.org/ns/ldp#contains"),
                undefined
            )
            .map((st: Statement) => st.object as NamedNode);
    }

    function isContainer(url: NamedNode) {
        const nodeToString = url.value;
        return nodeToString.charAt(nodeToString.length - 1) === "/";
    }

    async function createContainer(url: string) {
        const stringToNode = sym(url);
        if (!isContainer(stringToNode)) {
            throw new Error(`Not a container URL ${url}`);
        }
        // Copied from https://github.com/solidos/solid-crud-tests/blob/v3.1.0/test/surface/create-container.test.ts#L56-L64
        const result = await store.fetcher._fetch(url, {
            method: "PUT",
            headers: {
                "Content-Type": "text/turtle",
                "If-None-Match": "*",
                Link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"', // See https://github.com/solidos/node-solid-server/issues/1465
            },
            body: " ", // work around https://github.com/michielbdejong/community-server/issues/4#issuecomment-776222863
        });
        if (result.status.toString()[0] !== '2') {
            throw new Error(`Not OK: got ${result.status} response while creating container at ${url}`);
        }
    }

    async function getContainerMembers(containerUrl: NamedNode): Promise<NamedNode[]> {
        await store.fetcher.load(containerUrl);
        return getContainerElements(containerUrl);
    }
    return {
        isContainer,
        createContainer,
        getContainerElements,
        getContainerMembers
    }
}