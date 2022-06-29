/**
* @jest-environment jsdom
* 
*/
import * as rdf from "rdflib";
import { LiveStore, UpdateManager } from "rdflib";
import { solidLogicSingleton } from "../src";
import { getContainerMembers } from "../src/util/containerLogic";
import { alice } from "./helpers/dataSetup";

window.$SolidTestEnvironment = { username: alice.uri }

describe("Container", () => {
    let store
    let options
    beforeEach(() => {
        fetchMock.resetMocks()
        options = { fetch: fetchMock };
        store = new rdf.Store()
        store.fetcher = new rdf.Fetcher(store, options);
        store.updater = new UpdateManager(store);
        solidLogicSingleton.store = store as LiveStore
    })

    it("getContainerMembers - When container has some containment triples", async () => {
            containerHasSomeContainmentTriples()
            const result = await getContainerMembers('https://com/');
            expect(result.sort()).toEqual([
                'https://com/foo.txt',
                'https://com/bar/'
            ].sort());
    });
    it("getContainerMembers- When container is empty - Resolves to an empty array", async () => {
        containerIsEmpty();
        const result = await getContainerMembers('https://container.com/');
        expect(result).toEqual([]);
    });

    function containerIsEmpty() {
        fetchMock.mockOnceIf(
            "https://com/",
            " ", // FIXME: https://github.com/jefflau/jest-fetch-mock/issues/189
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