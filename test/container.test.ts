/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { Container } from "../src/util/Container";
import solidNamespace from "solid-namespace";
import * as rdf from "rdflib";
import fetchMock from "jest-fetch-mock";
import { UpdateManager } from "rdflib";
import { SolidNamespace } from "../src/types";
import { AliceProfile, AlicePreferencesFile, AlicePreferences, AlicePrivateTypeIndex, AlicePrivateTypes, AlicePublicTypeIndex, AlicePublicTypes, AlicePhotoFolder, AlicePhotos, BobProfile, club, ClubProfile, ClubPreferencesFile, ClubPreferences, ClubPrivateTypeIndex, ClubPrivateTypes, ClubPublicTypeIndex, ClubPublicTypes, alice, bob } from "./helpers/dataSetup";

const ns: SolidNamespace = solidNamespace(rdf);
const prefixes = Object.keys(ns).map(prefix => `@prefix ${prefix}: ${ns[prefix]('')}.\n`).join('') // In turtle


describe("Container", () => {
    let container;
    let store;
    let fetcher;
    let options;
    let web = {}
    let requests = []
    let statustoBeReturned  = 200
    beforeEach(() => {
        fetchMock.resetMocks();
        fetchMock.mockResponse("Not Found", {
        status: 404,
        });
        fetcher = { fetch: fetchMock };
        store = rdf.graph();
        store.fetcher = rdf.fetcher(store, fetcher);
        requests = []
        statustoBeReturned = 200
        const init = {headers: { "Content-Type": "text/turtle" }} // Fetch options tend to be called this

        fetchMock.mockIf(/^https?.*$/, async req => {

        if (req.method !== 'GET') {
            requests.push(req)
            if (req.method === 'PUT') {
            const contents = await req.text()
            web[req.url] = contents // Update our dummy web
            console.log(`Tetst: Updated ${req.url} on PUT to <<<${web[req.url]}>>>`)
            }
            return { status: statustoBeReturned }
        }
        const contents = web[req.url]
        if (contents !== undefined) { //
            return {
            body: prefixes + contents, // Add namespaces to anything
            status: 200,
            headers: {
                "Content-Type": "text/turtle",
                "WAC-Allow":    'user="write", public="read"',
                "Accept-Patch": "application/sparql-update"
            }
            }
        } // if contents
        return {
            status: 404,
            body: 'Not Found'
            }
        })
        web = {}
        web[alice.doc().uri] = AliceProfile
        web[AlicePreferencesFile.uri] = AlicePreferences
        web[AlicePrivateTypeIndex.uri] = AlicePrivateTypes
        web[AlicePublicTypeIndex.uri] = AlicePublicTypes
        web[AlicePhotoFolder.uri] = AlicePhotos
        web[bob.doc().uri] = BobProfile

        web[club.doc().uri] = ClubProfile
        web[ClubPreferencesFile.uri] = ClubPreferences
        web[ClubPrivateTypeIndex.uri] = ClubPrivateTypes
        web[ClubPublicTypeIndex.uri] = ClubPublicTypes
        
        options = { fetch: fetch };
        store = new rdf.Store()
        store.fetcher = new rdf.Fetcher (store, options);
        store.updater = new UpdateManager(store);
        container = new Container(store);
        requests = []
    });

    describe("getContainerMembers", () => {
        describe("When container is empty", () => {
        let result;
        beforeEach(async () => {
            containerIsEmpty();
            result = await container.getContainerMembers('https://container.com/');
        });
        it("Resolves to an empty array", () => {
            expect(result).toEqual([]);
        });
        });
        describe("When container has some containment triples", () => {
        let result;
        beforeEach(async () => {
            containerHasSomeContainmentTriples();
            result = await container.getContainerMembers('https://container.com/');
        });
        it("Resolves to an array with some URLs", () => {
            expect(result.sort()).toEqual([
            'https://container.com/foo.txt',
            'https://container.com/bar/'
            ].sort());
        });
        });
    });

    
    function containerIsEmpty() {
        fetchMock.mockOnceIf(
        "https://container.com/",
        " ", // FIXME: https://github.com/jefflau/jest-fetch-mock/issues/189
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
});