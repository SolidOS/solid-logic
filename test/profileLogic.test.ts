/**
* @jest-environment jsdom
* 
*/
import { UpdateManager, Store, Fetcher } from 'rdflib'
import { createProfileLogic } from '../src/profile/profileLogic'
import { createUtilityLogic } from '../src/util/utilityLogic'
import { ns } from '../src/util/ns'
import {
    alice, AlicePreferencesFile, AlicePrivateTypeIndex, AliceProfileFile, bob, boby, loadWebObject
} from './helpers/dataSetup'
import { createAclLogic } from '../src/acl/aclLogic'
import { createContainerLogic } from '../src/util/containerLogic'

const prefixes = Object.keys(ns).map(prefix => `@prefix ${prefix}: ${ns[prefix]('')}.\n`).join('') // In turtle
const user = alice
const profile = user.doc()
let requests: Request[] = []
let profileLogic

describe('Profile', () => {

    describe('loadProfile', () => {
        window.$SolidTestEnvironment = { username: alice.uri }
        let store
        requests = []
        const statustoBeReturned = 200
        let web = {}
        const authn = {
            currentUser: () => {
                return alice
            },
        }
        beforeEach(() => {
            fetchMock.resetMocks()
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
                        'Content-Type': 'text/turtle',
                        'WAC-Allow':    'user="write", public="read"',
                        'Accept-Patch': 'application/sparql-update'
                    }
                    }
                } // if contents
                return {
                    status: 404,
                    body: 'Not Found'
                    }
            })

            store = new Store()
            store.fetcher = new Fetcher(store, { fetch: fetch })
            store.updater = new UpdateManager(store)
            const util = createUtilityLogic(store, createAclLogic(store), createContainerLogic(store))
            profileLogic = createProfileLogic(store, authn, util)
        })
        it('exists', () => {
            expect(profileLogic.loadProfile).toBeInstanceOf(Function)
        })
        it('loads data', async () => {
            const result = await profileLogic.loadProfile(user)
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
                return alice
            },
        }
        beforeEach(() => {
            fetchMock.resetMocks()
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
                        'Content-Type': 'text/turtle',
                        'WAC-Allow':    'user="write", public="read"',
                        'Accept-Patch': 'application/sparql-update'
                    }
                    }
                } // if contents
                return {
                    status: 404,
                    body: 'Not Found'
                    }
            })

            store = new Store()
            store.fetcher = new Fetcher(store, { fetch: fetch })
            store.updater = new UpdateManager(store)
                const util = createUtilityLogic(store, createAclLogic(store), createContainerLogic(store))
            profileLogic = createProfileLogic(store, authn, util)
        })
        it('exists', () => {
            expect(profileLogic.silencedLoadPreferences).toBeInstanceOf(Function)
        })
        it('loads data', async () => {
            const result = await profileLogic.silencedLoadPreferences(alice)
            expect(result).toBeInstanceOf(Object)
            expect(result.uri).toEqual(AlicePreferencesFile.uri)
            expect(store.holds(user, ns.rdf('type'), ns.vcard('Individual'), profile)).toEqual(true)
            expect(store.statementsMatching(null, null, null, profile).length).toEqual(4)

            expect(store.statementsMatching(null, null, null, AlicePreferencesFile).length).toEqual(2)
            expect(store.holds(user, ns.solid('privateTypeIndex'), AlicePrivateTypeIndex, AlicePreferencesFile)).toEqual(true)
        })
        it('creates new file', async () => {
             await profileLogic.silencedLoadPreferences(bob)

            const profilePatch = requests.find(req => req.method === 'PATCH' && req.url === bob.doc().uri)
            expect(profilePatch).toBeDefined()
            const profilePatchText = await profilePatch.text()
            expect(profilePatchText).toContain('INSERT DATA { <https://bob.example.com/profile/card.ttl#me> <http://www.w3.org/ns/pim/space#preferencesFile> <https://bob.example.com/Settings/Preferences.ttl> .')

            const preferencesPatch = requests.find(req => req.method === 'PATCH' && req.url === 'https://bob.example.com/Settings/Preferences.ttl')
            expect(preferencesPatch).toBeDefined()
            const preferencesPatchText = await preferencesPatch.text()
            expect(preferencesPatchText).toContain('<https://bob.example.com/Settings/Preferences.ttl> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/ns/pim/space#ConfigurationFile> .')
            expect(preferencesPatchText).toContain('<https://bob.example.com/Settings/Preferences.ttl> <http://purl.org/dc/terms/title> "Preferences file" .')
            expect(preferencesPatchText).toContain('<https://bob.example.com/profile/card.ttl#me> <http://www.w3.org/ns/solid/terms#publicTypeIndex>')
            expect(preferencesPatchText).toContain('<https://bob.example.com/profile/card.ttl#me> <http://www.w3.org/ns/solid/terms#privateTypeIndex>')

            const putUrls = requests.filter(req => req.method === 'PUT').map(req => req.url)
            expect(putUrls).toContain('https://bob.example.com/Settings/Preferences.ttl')
            expect(putUrls).toContain('https://bob.example.com/Settings/publicTypeIndex.ttl')
            expect(putUrls).toContain('https://bob.example.com/Settings/privateTypeIndex.ttl')

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
                return boby
            },
        }
        beforeEach(() => {
            fetchMock.resetMocks()
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
                        'Content-Type': 'text/turtle',
                        'WAC-Allow':    'user="write", public="read"',
                        'Accept-Patch': 'application/sparql-update'
                    }
                    }
                } // if contents
                return {
                    status: 404,
                    body: 'Not Found'
                    }
            })

            store = new Store()
            store.fetcher = new Fetcher(store, { fetch: fetch })
            store.updater = new UpdateManager(store)
            const util = createUtilityLogic(store, createAclLogic(store), createContainerLogic(store))
            profileLogic = createProfileLogic(store, authn, util)
        })
        it('exists', () => {
            expect(profileLogic.loadPreferences).toBeInstanceOf(Function)
        })
        it('loads data', async () => {
            const result = await profileLogic.loadPreferences(alice)
            expect(result).toBeInstanceOf(Object)
            expect(result.uri).toEqual(AlicePreferencesFile.uri)
            expect(store.holds(user, ns.rdf('type'), ns.vcard('Individual'), profile)).toEqual(true)
            expect(store.statementsMatching(null, null, null, profile).length).toEqual(4)

            expect(store.statementsMatching(null, null, null, AlicePreferencesFile).length).toEqual(2)
            expect(store.holds(user, ns.solid('privateTypeIndex'), AlicePrivateTypeIndex, AlicePreferencesFile)).toEqual(true)
        })
        it('creates new file', async () => {
             await profileLogic.loadPreferences(boby)

            const profilePatch = requests.find(req => req.method === 'PATCH' && req.url === boby.doc().uri)
            expect(profilePatch).toBeDefined()
            const profilePatchText = await profilePatch.text()
            expect(profilePatchText).toContain('INSERT DATA { <https://boby.example.com/profile/card.ttl#me> <http://www.w3.org/ns/pim/space#preferencesFile> <https://boby.example.com/Settings/Preferences.ttl> .')

            const preferencesPatch = requests.find(req => req.method === 'PATCH' && req.url === 'https://boby.example.com/Settings/Preferences.ttl')
            expect(preferencesPatch).toBeDefined()
            const preferencesPatchText = await preferencesPatch.text()
            expect(preferencesPatchText).toContain('<https://boby.example.com/Settings/Preferences.ttl> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/ns/pim/space#ConfigurationFile> .')
            expect(preferencesPatchText).toContain('<https://boby.example.com/Settings/Preferences.ttl> <http://purl.org/dc/terms/title> "Preferences file" .')
            expect(preferencesPatchText).toContain('<https://boby.example.com/profile/card.ttl#me> <http://www.w3.org/ns/solid/terms#publicTypeIndex>')
            expect(preferencesPatchText).toContain('<https://boby.example.com/profile/card.ttl#me> <http://www.w3.org/ns/solid/terms#privateTypeIndex>')

            const putUrls = requests.filter(req => req.method === 'PUT').map(req => req.url)
            expect(putUrls).toContain('https://boby.example.com/Settings/Preferences.ttl')
            expect(putUrls).toContain('https://boby.example.com/Settings/publicTypeIndex.ttl')
            expect(putUrls).toContain('https://boby.example.com/Settings/privateTypeIndex.ttl')

        })
    })
})
