import { LiveStore, NamedNode, Statement } from "rdflib";

/**
 * Container-related class
 */
export class Container {
    store: LiveStore;

    constructor(store: LiveStore) {
        this.store = store;
    }

    isContainer(url: string) {
        return url.charAt(url.length-1) === "/";
    }

    async createContainer(url: string) {
        if (!this.isContainer(url)) {
        throw new Error(`Not a container URL ${url}`);
        }
        // Copied from https://github.com/solidos/solid-crud-tests/blob/v3.1.0/test/surface/create-container.test.ts#L56-L64
        const result = await this.store.fetcher._fetch(url, {
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

    getContainerElements(containerNode: NamedNode): NamedNode[] {
        return this.store
        .statementsMatching(
            containerNode,
            this.store.sym("http://www.w3.org/ns/ldp#contains"),
            undefined,
            containerNode.doc()
        )
        .map((st: Statement) => st.object as NamedNode);
    }

    async getContainerMembers(containerUrl: string): Promise<string[]> {
        const containerNode = this.store.sym(containerUrl);
        await this.store.fetcher?.load(containerNode);
        const nodes = this.getContainerElements(containerNode);
        return nodes.map(node => node.value);
    }

}

