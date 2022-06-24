import fetchMock from "jest-fetch-mock";
import * as rdf from "rdflib";
import { UpdateManager } from 'rdflib';
import solidNamespace from "solid-namespace";
import { solidLogicSingleton } from "../src/logic/solidLogicSingleton";
import { loadPreferencesNEW, loadProfileNEW } from '../src/profile/profileLogic';
import { SolidNamespace } from '../src/types';
import {
    alice, AlicePhotoFolder, AlicePhotos, AlicePreferences, AlicePreferencesFile, AlicePrivateTypeIndex, AlicePrivateTypes, AliceProfile, AliceProfileFile, AlicePublicTypeIndex, AlicePublicTypes, bob, BobProfile
} from './helpers/dataSetup';


const ns: SolidNamespace = solidNamespace(rdf);
const prefixes = Object.keys(ns).map(prefix => `@prefix ${prefix}: ${ns[prefix]('')}.\n`).join('') // In turtle

const user = alice
const profile = user.doc()

const web = {}
web[alice.doc().uri] = AliceProfile
web[AlicePreferencesFile.uri] = AlicePreferences
web[AlicePrivateTypeIndex.uri] = AlicePrivateTypes
web[AlicePublicTypeIndex.uri] = AlicePublicTypes
web[AlicePhotoFolder.uri] = AlicePhotos
web[bob.doc().uri] = BobProfile

let requests = []
let statustoBeReturned = 200

describe("Profile", () => {

    let store;    
    requests = []
    statustoBeReturned = 200
    const authn = {
        currentUser: () => {
            return alice;
        },
    };
    beforeEach(() => {
        fetchMock.resetMocks();
        fetchMock.mockResponse("Not Found", {
            status: 404,
        });
        
        const init = { headers: { "Content-Type": "text/turtle" } } // Fetch options tend to be called this

        requests = []
        statustoBeReturned = 200
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
        const fetcher = { fetch: fetchMock };
        store = rdf.graph();
        store.fetcher = rdf.fetcher(store, fetcher);
        store.updater = new UpdateManager(store);
        
        solidLogicSingleton.store = store
    
        
    })

    describe('loadProfileNEW', () => {
        it('exists', () => {
            expect(loadProfileNEW).toBeInstanceOf(Function)
        })
        it('loads data', async () => {
            const result = await loadProfileNEW(user)
            expect(result).toBeInstanceOf(Object)
            expect(result.uri).toEqual(AliceProfileFile.uri)
            expect(store.holds(user, ns.rdf('type'), ns.vcard('Individual'), profile)).toEqual(true)
            expect(store.holds(user, ns.space('preferencesFile'), AlicePreferencesFile, profile)).toEqual(true)
            expect(store.statementsMatching(null, null, null, profile).length).toEqual(4)
        })
    })
    describe('loadPreferencesNEW', () => {
        it('exists', () => {
            expect(loadPreferencesNEW).toBeInstanceOf(Function)
        })
        it('loads data', async () => {
            const result = await loadPreferencesNEW(alice)
            expect(result).toBeInstanceOf(Object)
            expect(result.uri).toEqual(AlicePreferencesFile.uri)
            expect(store.holds(user, ns.rdf('type'), ns.vcard('Individual'), profile)).toEqual(true)
            expect(store.statementsMatching(null, null, null, profile).length).toEqual(4)

            expect(store.statementsMatching(null, null, null, AlicePreferencesFile).length).toEqual(2)
            expect(store.holds(user, ns.solid('privateTypeIndex'), AlicePrivateTypeIndex, AlicePreferencesFile)).toEqual(true)
        })
        it('creates new file', async () => {
            const result = await loadPreferencesNEW(bob)

            const patchRequest = requests[0]
            expect(patchRequest.method).toEqual('PATCH')
            expect(patchRequest.url).toEqual(bob.doc().uri)
            const text = await patchRequest.text()
            expect(text).toContain('INSERT DATA { <https://bob.example.com/profile/card.ttl#me> <http://www.w3.org/ns/pim/space#preferencesFile> <https://bob.example.com/Settings/Preferences.ttl> .')

            const putRequest = requests[1]
            expect(putRequest.method).toEqual('PUT')
            expect(putRequest.url).toEqual('https://bob.example.com/Settings/Preferences.ttl')
            expect(web[putRequest.url]).toEqual('')

        })
    })
})