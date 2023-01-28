/**
* @jest-environment jsdom
* 
*/
import { UpdateManager, Store, Fetcher } from "rdflib";
import { createContainerLogic } from "../src/util/containerLogic";
import { alice } from "./helpers/dataSetup";

window.$SolidTestEnvironment = { username: alice.uri }

describe("Container", () => {
    let store
    let containerLogic
    beforeEach(() => {
        fetchMock.resetMocks()
        store = new Store()
        store.fetcher = new Fetcher(store, { fetch: fetch });
        store.updater = new UpdateManager(store);
        containerLogic = createContainerLogic(store)
    })

    it("getContainerMembers - When container has some containment triples", async () => {
            containerHasSomeContainmentTriples()
            const result = await containerLogic.getContainerMembers('https://com/');
            expect(result.sort()).toEqual([
                'https://com/foo.txt',
                'https://com/bar/'
            ].sort());
    });
    it.skip("getContainerMembers- When container is empty - Resolves to an empty array", async () => {
        jest.setTimeout(2000)
        containerIsEmpty();
        const result = await containerLogic.getContainerMembers('https://container.com/');
        expect(result).toEqual([]);
    });

    function containerIsEmpty() {
        fetchMock.mockOnceIf(
            "https://com/",
            "", // FIXME: https://github.com/jefflau/jest-fetch-mock/issues/189
            {
                headers: { "Content-Type": "text/turtle" },
            }
        );
    }
    
    function containerHasSomeContainmentTriples() {
        fetchMock.mockOnceIf(
            "https://com/",
            "<.> <http://www.w3.org/ns/ldp#contains> <./foo.txt>, <./bar/> .",
            {
                headers: { "Content-Type": "text/turtle" },
            }
        );
        
    }
})