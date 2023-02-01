/**
* @jest-environment jsdom
* 
*/
import { UpdateManager, Store, Fetcher, sym } from "rdflib";
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
            const containerMembers = await containerLogic.getContainerMembers(sym('https://container.com/'));
            const result = containerMembers.map(oneResult => oneResult.value)
            expect(result.sort()).toEqual([
                'https://container.com/foo.txt',
                'https://container.com/bar/'
            ].sort());
    });
    it.skip("getContainerMembers- When container is empty - Resolves to an empty array", async () => {
        jest.setTimeout(2000)
        containerIsEmpty();
        const result = await containerLogic.getContainerMembers(sym('https://container.com/'));
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
            "https://container.com/",
            "<.> <http://www.w3.org/ns/ldp#contains> <./foo.txt>, <./bar/> .",
            {
                headers: { "Content-Type": "text/turtle" },
            }
        );
        
    }
})