import fetchMock from "jest-fetch-mock";
import * as rdf from "rdflib";
import { UpdateManager } from "rdflib";
import solidNamespace from "solid-namespace";
import { loadOrCreateIfNotExists, followOrCreateLink, setSinglePeerAccess, getArchiveUrl, uniqueNodes } from '../src/util/utilityLogic'
import { SolidNamespace } from "../src/types";
import { alice, AlicePhotoFolder, AlicePhotos, AlicePreferences, AlicePreferencesFile, AlicePrivateTypeIndex, AlicePrivateTypes, AliceProfile, AlicePublicTypeIndex, AlicePublicTypes, bob, BobProfile, club, ClubPreferences, ClubPreferencesFile, ClubPrivateTypeIndex, ClubPrivateTypes, ClubProfile, ClubPublicTypeIndex, ClubPublicTypes } from "./helpers/dataSetup";
import { solidLogicSingleton } from "../src/logic/solidLogicSingleton";

const ns: SolidNamespace = solidNamespace(rdf);
const prefixes = Object.keys(ns).map(prefix => `@prefix ${prefix}: ${ns[prefix]('')}.\n`).join('') // In turtle

describe("utilityLogic", () => {
    let store;
    let options;
    let web = {}
    let requests = []
    let statustoBeReturned = 200
    beforeEach(() => {
        fetchMock.resetMocks();
        fetchMock.mockResponse("Not Found", {
            status: 404,
        });
        requests = []
        statustoBeReturned = 200
        const init = { headers: { "Content-Type": "text/turtle" } } // Fetch options tend to be called this

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
                        "WAC-Allow": 'user="write", public="read"',
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
        store.fetcher = new rdf.Fetcher(store, options);
        store.updater = new UpdateManager(store);
        requests = []
        solidLogicSingleton.store = store
    });
  
    describe('loadOrCreateIfNotExists', () => {
        it('exists', () => {
            expect(loadOrCreateIfNotExists).toBeInstanceOf(Function)
        })
        it('does nothing if existing file', async () => {
            const result = await loadOrCreateIfNotExists(alice.doc())
            expect(requests).toEqual([])

        })
        it('creates empty file if did not exist', async () => {
            const suggestion = 'https://bob.example.com/settings/prefsSuggestion.ttl'
            const result = await loadOrCreateIfNotExists(rdf.sym(suggestion))
            expect(requests[0].method).toEqual('PUT')
            expect(requests[0].url).toEqual(suggestion)
        })
    })

    describe('followOrCreateLink', () => {
        it('exists', () => {
            expect(followOrCreateLink).toBeInstanceOf(Function)
        })
        it('follows existing link', async () => {
            const suggestion = 'https://alice.example.com/settings/prefsSuggestion.ttl'
            const result = await followOrCreateLink(alice, ns.space('preferencesFile'), rdf.sym(suggestion), alice.doc())
            expect(result).toEqual(AlicePreferencesFile)

        })
        it('creates empty file if did not exist and new link', async () => {
            const suggestion = 'https://bob.example.com/settings/prefsSuggestion.ttl'
            const result = await followOrCreateLink(bob, ns.space('preferencesFile'), rdf.sym(suggestion), bob.doc())
            expect(result).toEqual(rdf.sym(suggestion))
            expect(requests[0].method).toEqual('PATCH')
            expect(requests[0].url).toEqual(bob.doc().uri)
            expect(requests[1].method).toEqual('PUT')
            expect(requests[1].url).toEqual(suggestion)
            expect(store.holds(bob, ns.space('preferencesFile'), rdf.sym(suggestion), bob.doc())).toEqual(true)
        })
        //
        it('returns null if it cannot create the new file', async () => {
            const suggestion = 'https://bob.example.com/settings/prefsSuggestion.ttl'
            statustoBeReturned = 403 // Unauthorized
            const result = await followOrCreateLink(bob, ns.space('preferencesFile'), rdf.sym(suggestion), bob.doc())
            expect(result).toEqual(null)
        })

    })
  describe("setSinglePeerAccess", () => {
    beforeEach(() => {
      fetchMock.mockOnceIf(
        "https://owner.com/some/resource",
        "hello", {
        headers: {
          Link: '<https://owner.com/some/acl>; rel="acl"'
        }
      });
      fetchMock.mockOnceIf(
        "https://owner.com/some/acl",
        "Created", {
        status: 201
      });
    });
    it("Creates the right ACL doc", async () => {
      await setSinglePeerAccess({
        ownerWebId: "https://owner.com/#me",
        peerWebId: "https://peer.com/#me",
        accessToModes: "acl:Read, acl:Control",
        defaultModes: "acl:Write",
        target: "https://owner.com/some/resource"
      });
      expect(fetchMock.mock.calls).toEqual([
        [ "https://owner.com/some/resource", fetchMock.mock.calls[0][1] ],
        [ "https://owner.com/some/acl", {
          body: '@prefix acl: <http://www.w3.org/ns/auth/acl#>.\n' +
            '\n' +
            '<#alice> a acl:Authorization;\n' +
            '  acl:agent <https://owner.com/#me>;\n' +
            '  acl:accessTo <https://owner.com/some/resource>;\n' +
            '  acl:default <https://owner.com/some/resource>;\n' +
            '  acl:mode acl:Read, acl:Write, acl:Control.\n' +
            '<#bobAccessTo> a acl:Authorization;\n' +
            '  acl:agent <https://peer.com/#me>;\n' +
            '  acl:accessTo <https://owner.com/some/resource>;\n' +
            '  acl:mode acl:Read, acl:Control.\n' +
            '<#bobDefault> a acl:Authorization;\n' +
            '  acl:agent <https://peer.com/#me>;\n' +
            '  acl:default <https://owner.com/some/resource>;\n' +
            '  acl:mode acl:Write.\n',
          headers: [
                ["Content-Type", "text/turtle"]
          ],
          method: "PUT"
        }]
      ]);
    });
  });

})