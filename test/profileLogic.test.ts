/**
* @jest-environment jsdom
* 
*/
import * as rdf from "rdflib";
import { UpdateManager } from 'rdflib';
import { createProfileLogic } from "../src/profile/profileLogic";
import { ns } from "../src/util/ns";
import {
    alice, AlicePreferencesFile, AlicePrivateTypeIndex, AliceProfileFile, bob, boby, loadWebObject
} from './helpers/dataSetup';



const prefixes = Object.keys(ns).map(prefix => `@prefix ${prefix}: ${ns[prefix]('')}.\n`).join('') // In turtle
const user = alice
const profile = user.doc()
let requests = []

describe("Profile", () => {

    describe('loadProfile', () => {
        window.$SolidTestEnvironment = { username: alice.uri }
        let store
        requests = []
        const statustoBeReturned = 200
        let web = {}
        const authn = {
            currentUser: () => {
                return alice;
            },
        };
        beforeEach(() => {
            fetchMock.resetMocks();
            web = loadWebObject()
            requests = []
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

            store = rdf.graph();
            store.fetcher = rdf.fetcher(store, { fetch: fetch });
            store.updater = new UpdateManager(store);
            
            createProfileLogic(store, authn, ns)
        })
        it('exists', () => {
            expect(createProfileLogic(store, authn, ns).loadProfile).toBeInstanceOf(Function)
        })
        it('loads data', async () => {
            const result = await createProfileLogic(store, authn, ns).loadProfile(user)
            expect(result).toBeInstanceOf(Object)
            expect(result.uri).toEqual(AliceProfileFile.uri)
            expect(store.holds(user, ns.rdf('type'), ns.vcard('Individual'), profile)).toEqual(true)
            expect(store.holds(user, ns.space('preferencesFile'), AlicePreferencesFile, profile)).toEqual(true)
            expect(store.statementsMatching(null, null, null, profile).length).toEqual(4)
        })
    })
    
    describe('silencedLoadPreferences', () => {
        window.$SolidTestEnvironment = { username: alice.uri }
        let store
        requests = []
        const statustoBeReturned = 200
        let web = {}
        const authn = {
            currentUser: () => {
                return alice;
            },
        };
        beforeEach(() => {
            fetchMock.resetMocks();
            web = loadWebObject()
            requests = []
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

            store = rdf.graph();
            store.fetcher = rdf.fetcher(store, { fetch: fetch });
            store.updater = new UpdateManager(store);
            
            createProfileLogic(store, authn, ns)
        })
        it('exists', () => {
            expect(createProfileLogic(store, authn, ns).silencedLoadPreferences).toBeInstanceOf(Function)
        })
        it('loads data', async () => {
            const result = await createProfileLogic(store, authn, ns).silencedLoadPreferences(alice)
            expect(result).toBeInstanceOf(Object)
            expect(result.uri).toEqual(AlicePreferencesFile.uri)
            expect(store.holds(user, ns.rdf('type'), ns.vcard('Individual'), profile)).toEqual(true)
            expect(store.statementsMatching(null, null, null, profile).length).toEqual(4)

            expect(store.statementsMatching(null, null, null, AlicePreferencesFile).length).toEqual(2)
            expect(store.holds(user, ns.solid('privateTypeIndex'), AlicePrivateTypeIndex, AlicePreferencesFile)).toEqual(true)
        })
        it('creates new file', async () => {
            const result = await createProfileLogic(store, authn, ns).silencedLoadPreferences(bob)

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


    describe('loadPreferences', () => {
        window.$SolidTestEnvironment = { username: boby.uri }
        let store
        requests = []
        const statustoBeReturned = 200
        let web = {}
        const authn = {
            currentUser: () => {
                return boby;
            },
        };
        beforeEach(() => {
            fetchMock.resetMocks();
            web = loadWebObject()
            requests = []
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

            store = rdf.graph();
            store.fetcher = rdf.fetcher(store, { fetch: fetch });
            store.updater = new UpdateManager(store);
            
            createProfileLogic(store, authn, ns)
        })
        it('exists', () => {
            expect(createProfileLogic(store, authn, ns).loadPreferences).toBeInstanceOf(Function)
        })
        it('loads data', async () => {
            const result = await createProfileLogic(store, authn, ns).loadPreferences(alice)
            expect(result).toBeInstanceOf(Object)
            expect(result.uri).toEqual(AlicePreferencesFile.uri)
            expect(store.holds(user, ns.rdf('type'), ns.vcard('Individual'), profile)).toEqual(true)
            expect(store.statementsMatching(null, null, null, profile).length).toEqual(4)

            expect(store.statementsMatching(null, null, null, AlicePreferencesFile).length).toEqual(2)
            expect(store.holds(user, ns.solid('privateTypeIndex'), AlicePrivateTypeIndex, AlicePreferencesFile)).toEqual(true)
        })
        it('creates new file', async () => {
            const result = await createProfileLogic(store, authn, ns).loadPreferences(boby)

            const patchRequest = requests[0]
            expect(patchRequest.method).toEqual('PATCH')
            expect(patchRequest.url).toEqual(boby.doc().uri)
            const text = await patchRequest.text()
            expect(text).toContain('INSERT DATA { <https://boby.example.com/profile/card.ttl#me> <http://www.w3.org/ns/pim/space#preferencesFile> <https://boby.example.com/Settings/Preferences.ttl> .')

            const putRequest = requests[1]
            expect(putRequest.method).toEqual('PUT')
            expect(putRequest.url).toEqual('https://boby.example.com/Settings/Preferences.ttl')
            expect(web[putRequest.url]).toEqual('')

        })
    })
})