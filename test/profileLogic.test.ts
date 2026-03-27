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

declare const fetchMock: any

declare global {
    interface Window {
        $SolidTestEnvironment?: { username: string }
    }
}

const prefixes = Object.keys(ns).map(prefix => `@prefix ${prefix}: ${ns[prefix]('')}.\n`).join('') // In turtle
const user = alice
const profile = user.doc()
let requests: Request[] = []
let profileLogic: ReturnType<typeof createProfileLogic>

describe('Profile', () => {

    describe('loadProfile', () => {
        window.$SolidTestEnvironment = { username: alice.uri }
        let store: Store
        requests = []
        const statustoBeReturned = 200
        let web: Record<string, string> = {}
        const authn = {
            currentUser: () => {
                return alice
            },
        }
        beforeEach(() => {
            fetchMock.resetMocks()
            web = loadWebObject()
            requests = []
            fetchMock.mockIf(/^https?.*$/, async (req: Request) => {

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
        let store: Store
        requests = []
        const statustoBeReturned = 200
        let web: Record<string, string> = {}
        const authn = {
            currentUser: () => {
                return alice
            },
        }
        beforeEach(() => {
            fetchMock.resetMocks()
            web = loadWebObject()
            requests = []
            fetchMock.mockIf(/^https?.*$/, async (req: Request) => {

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
            if (!result) {
                throw new Error('Expected preferences document for alice')
            }
            expect(result.uri).toEqual(AlicePreferencesFile.uri)
            expect(store.holds(user, ns.rdf('type'), ns.vcard('Individual'), profile)).toEqual(true)
            expect(store.statementsMatching(null, null, null, profile).length).toEqual(4)

            expect(store.statementsMatching(null, null, null, AlicePreferencesFile).length).toBeGreaterThanOrEqual(2)
            expect(store.holds(user, ns.solid('privateTypeIndex'), AlicePrivateTypeIndex, AlicePreferencesFile)).toEqual(true)
        })
        it('creates new file', async () => {
             await profileLogic.silencedLoadPreferences(bob)

            const profilePatch = requests.find(req => req.method === 'PATCH' && req.url === bob.doc().uri)
            expect(profilePatch).toBeDefined()
            if (!profilePatch) {
                throw new Error('Expected profile patch request for bob')
            }
            const profilePatchText = await profilePatch.text()
            expect(profilePatchText).toContain('INSERT DATA { <https://bob.example.com/profile/card.ttl#me> <http://www.w3.org/ns/pim/space#preferencesFile> <https://bob.example.com/Settings/Preferences.ttl> .')

            const preferencesPatch = requests.find(req => req.method === 'PATCH' && req.url === 'https://bob.example.com/Settings/Preferences.ttl')
            expect(preferencesPatch).toBeDefined()
            if (!preferencesPatch) {
                throw new Error('Expected preferences patch request for bob')
            }
            const preferencesPatchText = await preferencesPatch.text()
            expect(preferencesPatchText).toContain('<https://bob.example.com/Settings/Preferences.ttl> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/ns/pim/space#ConfigurationFile> .')
            expect(preferencesPatchText).toContain('<https://bob.example.com/Settings/Preferences.ttl> <http://purl.org/dc/terms/title> "Preferences file" .')
            expect(preferencesPatchText).toContain('<https://bob.example.com/profile/card.ttl#me> <http://www.w3.org/ns/solid/terms#publicTypeIndex>')
            expect(preferencesPatchText).toContain('<https://bob.example.com/profile/card.ttl#me> <http://www.w3.org/ns/solid/terms#privateTypeIndex>')

            const putUrls = requests.filter(req => req.method === 'PUT').map(req => req.url)
            expect(putUrls).toContain('https://bob.example.com/Settings/')
            expect(putUrls).toContain('https://bob.example.com/Settings/.acl')
            expect(putUrls).toContain('https://bob.example.com/Settings/Preferences.ttl')
            expect(putUrls).toContain('https://bob.example.com/Settings/publicTypeIndex.ttl')
            expect(putUrls).toContain('https://bob.example.com/Settings/publicTypeIndex.ttl.acl')
            expect(putUrls).toContain('https://bob.example.com/Settings/privateTypeIndex.ttl')

            const settingsAclPut = requests.find(req => req.method === 'PUT' && req.url === 'https://bob.example.com/Settings/.acl')
            expect(settingsAclPut).toBeDefined()
            const settingsAclBody = web['https://bob.example.com/Settings/.acl']
            expect(settingsAclBody).toBeDefined()
            expect(settingsAclBody).toContain('@prefix acl: <http://www.w3.org/ns/auth/acl#>.')
            expect(settingsAclBody).toContain('<#owner>')
            expect(settingsAclBody).toContain('acl:agent <https://bob.example.com/profile/card.ttl#me>;')
            expect(settingsAclBody).toContain('acl:accessTo <./>;')
            expect(settingsAclBody).toContain('acl:default <./>;')
            expect(settingsAclBody).toContain('acl:mode acl:Read, acl:Write, acl:Control.')

            const publicTypeIndexAclPut = requests.find(req => req.method === 'PUT' && req.url === 'https://bob.example.com/Settings/publicTypeIndex.ttl.acl')
            expect(publicTypeIndexAclPut).toBeDefined()
            const publicTypeIndexAclBody = web['https://bob.example.com/Settings/publicTypeIndex.ttl.acl']
            expect(publicTypeIndexAclBody).toBeDefined()
            expect(publicTypeIndexAclBody).not.toEqual('')
            expect(publicTypeIndexAclBody).toContain('@prefix acl: <http://www.w3.org/ns/auth/acl#>.')
            expect(publicTypeIndexAclBody).toContain('@prefix foaf: <http://xmlns.com/foaf/0.1/>.')
            expect(publicTypeIndexAclBody).toContain('<#owner>')
            expect(publicTypeIndexAclBody).toContain('acl:agent')
            expect(publicTypeIndexAclBody).toContain('<https://bob.example.com/profile/card.ttl#me>;')
            expect(publicTypeIndexAclBody).toContain('acl:accessTo <./publicTypeIndex.ttl>;')
            expect(publicTypeIndexAclBody).toContain('acl:mode')
            expect(publicTypeIndexAclBody).toContain('acl:Read, acl:Write, acl:Control.')
            expect(publicTypeIndexAclBody).toContain('<#public>')
            expect(publicTypeIndexAclBody).toContain('acl:agentClass foaf:Agent;')
            expect(publicTypeIndexAclBody).toContain('acl:mode acl:Read.')

        })
    })


    describe('loadPreferences', () => {
        window.$SolidTestEnvironment = { username: boby.uri }
        let store: Store
        requests = []
        const statustoBeReturned = 200
        let web: Record<string, string> = {}
        const authn = {
            currentUser: () => {
                return boby
            },
        }
        beforeEach(() => {
            fetchMock.resetMocks()
            web = loadWebObject()
            requests = []
            fetchMock.mockIf(/^https?.*$/, async (req: Request) => {

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

            expect(store.statementsMatching(null, null, null, AlicePreferencesFile).length).toBeGreaterThanOrEqual(2)
            expect(store.holds(user, ns.solid('privateTypeIndex'), AlicePrivateTypeIndex, AlicePreferencesFile)).toEqual(true)
        })
        it('creates new file', async () => {
             await profileLogic.loadPreferences(boby)

            const profilePatch = requests.find(req => req.method === 'PATCH' && req.url === boby.doc().uri)
            expect(profilePatch).toBeDefined()
            if (!profilePatch) {
                throw new Error('Expected profile patch request for boby')
            }
            const profilePatchText = await profilePatch.text()
            expect(profilePatchText).toContain('INSERT DATA { <https://boby.example.com/profile/card.ttl#me> <http://www.w3.org/ns/pim/space#preferencesFile> <https://boby.example.com/Settings/Preferences.ttl> .')

            const preferencesPatch = requests.find(req => req.method === 'PATCH' && req.url === 'https://boby.example.com/Settings/Preferences.ttl')
            expect(preferencesPatch).toBeDefined()
            if (!preferencesPatch) {
                throw new Error('Expected preferences patch request for boby')
            }
            const preferencesPatchText = await preferencesPatch.text()
            expect(preferencesPatchText).toContain('<https://boby.example.com/Settings/Preferences.ttl> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://www.w3.org/ns/pim/space#ConfigurationFile> .')
            expect(preferencesPatchText).toContain('<https://boby.example.com/Settings/Preferences.ttl> <http://purl.org/dc/terms/title> "Preferences file" .')
            expect(preferencesPatchText).toContain('<https://boby.example.com/profile/card.ttl#me> <http://www.w3.org/ns/solid/terms#publicTypeIndex>')
            expect(preferencesPatchText).toContain('<https://boby.example.com/profile/card.ttl#me> <http://www.w3.org/ns/solid/terms#privateTypeIndex>')

            const putUrls = requests.filter(req => req.method === 'PUT').map(req => req.url)
            expect(putUrls).toContain('https://boby.example.com/Settings/')
            expect(putUrls).toContain('https://boby.example.com/Settings/.acl')
            expect(putUrls).toContain('https://boby.example.com/Settings/Preferences.ttl')
            expect(putUrls).toContain('https://boby.example.com/Settings/publicTypeIndex.ttl')
            expect(putUrls).toContain('https://boby.example.com/Settings/publicTypeIndex.ttl.acl')
            expect(putUrls).toContain('https://boby.example.com/Settings/privateTypeIndex.ttl')

            const settingsAclPut = requests.find(req => req.method === 'PUT' && req.url === 'https://boby.example.com/Settings/.acl')
            expect(settingsAclPut).toBeDefined()
            const settingsAclBody = web['https://boby.example.com/Settings/.acl']
            expect(settingsAclBody).toBeDefined()
            expect(settingsAclBody).toContain('@prefix acl: <http://www.w3.org/ns/auth/acl#>.')
            expect(settingsAclBody).toContain('<#owner>')
            expect(settingsAclBody).toContain('acl:agent <https://boby.example.com/profile/card.ttl#me>;')
            expect(settingsAclBody).toContain('acl:accessTo <./>;')
            expect(settingsAclBody).toContain('acl:default <./>;')
            expect(settingsAclBody).toContain('acl:mode acl:Read, acl:Write, acl:Control.')

            const publicTypeIndexAclPut = requests.find(req => req.method === 'PUT' && req.url === 'https://boby.example.com/Settings/publicTypeIndex.ttl.acl')
            expect(publicTypeIndexAclPut).toBeDefined()
            const publicTypeIndexAclBody = web['https://boby.example.com/Settings/publicTypeIndex.ttl.acl']
            expect(publicTypeIndexAclBody).toBeDefined()
            expect(publicTypeIndexAclBody).not.toEqual('')
            expect(publicTypeIndexAclBody).toContain('@prefix acl: <http://www.w3.org/ns/auth/acl#>.')
            expect(publicTypeIndexAclBody).toContain('@prefix foaf: <http://xmlns.com/foaf/0.1/>.')
            expect(publicTypeIndexAclBody).toContain('<#owner>')
            expect(publicTypeIndexAclBody).toContain('acl:agent')
            expect(publicTypeIndexAclBody).toContain('<https://boby.example.com/profile/card.ttl#me>;')
            expect(publicTypeIndexAclBody).toContain('acl:accessTo <./publicTypeIndex.ttl>;')
            expect(publicTypeIndexAclBody).toContain('acl:mode')
            expect(publicTypeIndexAclBody).toContain('acl:Read, acl:Write, acl:Control.')
            expect(publicTypeIndexAclBody).toContain('<#public>')
            expect(publicTypeIndexAclBody).toContain('acl:agentClass foaf:Agent;')
            expect(publicTypeIndexAclBody).toContain('acl:mode acl:Read.')

        })
    })
})
