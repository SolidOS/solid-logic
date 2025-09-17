/**
* @jest-environment jsdom
*
*/
import { Fetcher, Store, sym, UpdateManager } from 'rdflib'
import { createAclLogic } from '../src/acl/aclLogic'
import { createProfileLogic } from '../src/profile/profileLogic'
import { createTypeIndexLogic} from '../src/typeIndex/typeIndexLogic'
import { createContainerLogic } from '../src/util/containerLogic'
import { ns } from '../src/util/ns'
import { createUtilityLogic } from '../src/util/utilityLogic'
import { uniqueNodes } from '../src/util/utils'
import { alice, AlicePhotoFolder, AlicePhotos, AlicePreferences, AlicePreferencesFile, AlicePrivateTypeIndex, AlicePrivateTypes, AliceProfile, AlicePublicTypeIndex, AlicePublicTypes, bob, BobProfile, club, ClubPreferences, ClubPreferencesFile, ClubPrivateTypeIndex, ClubPrivateTypes, ClubProfile, ClubPublicTypeIndex, ClubPublicTypes } from './helpers/dataSetup'

const prefixes = Object.keys(ns).map(prefix => `@prefix ${prefix}: ${ns[prefix]('')}.\n`).join('') // In turtle
window.$SolidTestEnvironment = { username: alice.uri }

const Tracker = ns.wf('Tracker')
const Image = ns.schema('Image')

//let web = {}
//web = loadWebObject()
const user = alice
const profile = user.doc()
const web = {}
web[profile.uri] = AliceProfile
web[AlicePreferencesFile.uri] = AlicePreferences
web[AlicePrivateTypeIndex.uri] = AlicePrivateTypes
web[AlicePublicTypeIndex.uri] = AlicePublicTypes
web[AlicePhotoFolder.uri] = AlicePhotos
web[bob.doc().uri] = BobProfile

web[club.doc().uri] = ClubProfile
web[ClubPreferencesFile.uri] = ClubPreferences
web[ClubPrivateTypeIndex.uri] = ClubPrivateTypes
web[ClubPublicTypeIndex.uri] = ClubPublicTypes
let requests: Request[] = []
let statustoBeReturned = 200
let typeIndexLogic

describe('TypeIndex logic NEW', () => {
    let store
    const authn = {
        currentUser: () => {
            return alice
        },
    }

    beforeEach(() => {
        fetchMock.resetMocks()
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
                'Content-Type': 'text/turtle',
                'WAC-Allow': 'user="write", public="read"',
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
        typeIndexLogic = createTypeIndexLogic(store, authn, createProfileLogic(store, authn, util), util)
    })

    describe('loadAllTypeIndexes', () => {
        it('exists', () => {
        expect(typeIndexLogic.loadAllTypeIndexes).toBeInstanceOf(Function)
        })
    })

    const AliceScopes = [{
        'agent': {
        'classOrder': 5,
        'termType': 'NamedNode',
        'value': 'https://alice.example.com/profile/card.ttl#me',
        },
        'index': {
        'classOrder': 5,
        'termType': 'NamedNode',
        'value': 'https://alice.example.com/profile/public-type-index.ttl',
        },
        'label': 'public',
    },
    {
        'agent': {
        'classOrder': 5,
        'termType': 'NamedNode',
        'value': 'https://alice.example.com/profile/card.ttl#me',
        },
        'index': {
        'classOrder': 5,
        'termType': 'NamedNode',
        'value': 'https://alice.example.com/settings/private-type-index.ttl',
        },
        'label': 'private',
    }
    ]

    describe('loadTypeIndexesFor', () => {
        it('exists', () => {
            expect(typeIndexLogic.loadTypeIndexesFor).toBeInstanceOf(Function)
        })
        it('loads data', async () => {
            const result = await typeIndexLogic.loadTypeIndexesFor(alice)
            expect(result).toEqual(AliceScopes)
            expect(store.statementsMatching(null, null, null, AlicePrivateTypeIndex).length).toEqual(8)
            expect(store.statementsMatching(null, null, null, AlicePublicTypeIndex).length).toEqual(8)
        })
    })

    const ClubScopes =
        [
        {
            'agent': {
            'classOrder': 5,
            'termType': 'NamedNode',
            'value': 'https://club.example.com/profile/card.ttl#it',
            },
            'index': {
            'classOrder': 5,
            'termType': 'NamedNode',
            'value': 'https://club.example.com/profile/public-type-index.ttl',
            },
            'label': 'public',
        },
        {
            'agent': {
            'classOrder': 5,
            'termType': 'NamedNode',
            'value': 'https://club.example.com/profile/card.ttl#it',
            },
            'index': {
            'classOrder': 5,
            'termType': 'NamedNode',
            'value': 'https://club.example.com/settings/private-type-index.ttl',
            },
            'label': 'private',
        }
        ]
    describe('loadCommunityTypeIndexes', () => {
        it('exists', () => {
        expect(typeIndexLogic.loadCommunityTypeIndexes).toBeInstanceOf(Function)
        })
        it('loads data', async () => {
        const result = await typeIndexLogic.loadCommunityTypeIndexes(alice)
        expect(result).toEqual(ClubScopes)
        })
    })

    const AliceAndClubScopes =  [{'instance': {'classOrder': 5, 'termType': 'NamedNode', 'value': 'https://alice.example.com/publicStuff/actionItems.ttl#this'}, 'scope': {'agent': {'classOrder': 5, 'termType': 'NamedNode', 'value': 'https://alice.example.com/profile/card.ttl#me'}, 'index': {'classOrder': 5, 'termType': 'NamedNode', 'value': 'https://alice.example.com/profile/public-type-index.ttl'}, 'label': 'public'}, 'type': {'classOrder': 5, 'termType': 'NamedNode', 'value': 'http://www.w3.org/2005/01/wf/flow#Tracker'}}, {'instance': {'classOrder': 5, 'termType': 'NamedNode', 'value': 'https://alice.example.com/project4/issues.ttl#this'}, 'scope': {'agent': {'classOrder': 5, 'termType': 'NamedNode', 'value': 'https://alice.example.com/profile/card.ttl#me'}, 'index': {'classOrder': 5, 'termType': 'NamedNode', 'value': 'https://alice.example.com/profile/public-type-index.ttl'}, 'label': 'public'}, 'type': {'classOrder': 5, 'termType': 'NamedNode', 'value': 'http://www.w3.org/2005/01/wf/flow#Tracker'}}, {'instance': {'classOrder': 5, 'termType': 'NamedNode', 'value': 'https://alice.example.com/privateStuff/ToDo.ttl#this'}, 'scope': {'agent': {'classOrder': 5, 'termType': 'NamedNode', 'value': 'https://alice.example.com/profile/card.ttl#me'}, 'index': {'classOrder': 5, 'termType': 'NamedNode', 'value': 'https://alice.example.com/settings/private-type-index.ttl'}, 'label': 'private'}, 'type': {'classOrder': 5, 'termType': 'NamedNode', 'value': 'http://www.w3.org/2005/01/wf/flow#Tracker'}}, {'instance': {'classOrder': 5, 'termType': 'NamedNode', 'value': 'https://alice.example.com/privateStuff/Goals.ttl#this'}, 'scope': {'agent': {'classOrder': 5, 'termType': 'NamedNode', 'value': 'https://alice.example.com/profile/card.ttl#me'}, 'index': {'classOrder': 5, 'termType': 'NamedNode', 'value': 'https://alice.example.com/settings/private-type-index.ttl'}, 'label': 'private'}, 'type': {'classOrder': 5, 'termType': 'NamedNode', 'value': 'http://www.w3.org/2005/01/wf/flow#Tracker'}}, {'instance': {'classOrder': 5, 'termType': 'NamedNode', 'value': 'https://alice.example.com/privateStuff/workingOn.ttl#this'}, 'scope': {'agent': {'classOrder': 5, 'termType': 'NamedNode', 'value': 'https://alice.example.com/profile/card.ttl#me'}, 'index': {'classOrder': 5, 'termType': 'NamedNode', 'value': 'https://alice.example.com/settings/private-type-index.ttl'}, 'label': 'private'}, 'type': {'classOrder': 5, 'termType': 'NamedNode', 'value': 'http://www.w3.org/2005/01/wf/flow#Tracker'}}, {'instance': {'classOrder': 5, 'termType': 'NamedNode', 'value': 'https://club.example.com/publicStuff/actionItems.ttl#this'}, 'scope': {'agent': {'classOrder': 5, 'termType': 'NamedNode', 'value': 'https://club.example.com/profile/card.ttl#it'}, 'index': {'classOrder': 5, 'termType': 'NamedNode', 'value': 'https://club.example.com/profile/public-type-index.ttl'}, 'label': 'public'}, 'type': {'classOrder': 5, 'termType': 'NamedNode', 'value': 'http://www.w3.org/2005/01/wf/flow#Tracker'}}, {'instance': {'classOrder': 5, 'termType': 'NamedNode', 'value': 'https://club.example.com/project4/clubIssues.ttl#this'}, 'scope': {'agent': {'classOrder': 5, 'termType': 'NamedNode', 'value': 'https://club.example.com/profile/card.ttl#it'}, 'index': {'classOrder': 5, 'termType': 'NamedNode', 'value': 'https://club.example.com/profile/public-type-index.ttl'}, 'label': 'public'}, 'type': {'classOrder': 5, 'termType': 'NamedNode', 'value': 'http://www.w3.org/2005/01/wf/flow#Tracker'}}, {'instance': {'classOrder': 5, 'termType': 'NamedNode', 'value': 'https://club.example.com/privateStuff/ToDo.ttl#this'}, 'scope': {'agent': {'classOrder': 5, 'termType': 'NamedNode', 'value': 'https://club.example.com/profile/card.ttl#it'}, 'index': {'classOrder': 5, 'termType': 'NamedNode', 'value': 'https://club.example.com/settings/private-type-index.ttl'}, 'label': 'private'}, 'type': {'classOrder': 5, 'termType': 'NamedNode', 'value': 'http://www.w3.org/2005/01/wf/flow#Tracker'}}, {'instance': {'classOrder': 5, 'termType': 'NamedNode', 'value': 'https://club.example.com/privateStuff/Goals.ttl#this'}, 'scope': {'agent': {'classOrder': 5, 'termType': 'NamedNode', 'value': 'https://club.example.com/profile/card.ttl#it'}, 'index': {'classOrder': 5, 'termType': 'NamedNode', 'value': 'https://club.example.com/settings/private-type-index.ttl'}, 'label': 'private'}, 'type': {'classOrder': 5, 'termType': 'NamedNode', 'value': 'http://www.w3.org/2005/01/wf/flow#Tracker'}}, {'instance': {'classOrder': 5, 'termType': 'NamedNode', 'value': 'https://club.example.com/privateStuff/tasks.ttl#this'}, 'scope': {'agent': {'classOrder': 5, 'termType': 'NamedNode', 'value': 'https://club.example.com/profile/card.ttl#it'}, 'index': {'classOrder': 5, 'termType': 'NamedNode', 'value': 'https://club.example.com/settings/private-type-index.ttl'}, 'label': 'private'}, 'type': {'classOrder': 5, 'termType': 'NamedNode', 'value': 'http://www.w3.org/2005/01/wf/flow#Tracker'}}]

    describe('getScopedAppInstances', () => {
        it('exists', () => {
        expect(typeIndexLogic.getScopedAppInstances).toBeInstanceOf(Function)
        })
        it('pulls in users scopes and also community ones', async () => {
        const result = await typeIndexLogic.getScopedAppInstances(Tracker, alice)
        expect(result).toEqual(AliceAndClubScopes) // @@ AliceAndClubScopes
        })
        it('creates new preferenceFile and typeIndex files where they dont exist', async () => {
        const result = await typeIndexLogic.getScopedAppInstances(Tracker, bob)

        expect(requests[0].method).toEqual('PATCH') // Add preferrencesFile link to profile
        expect(requests[0].url).toEqual('https://bob.example.com/profile/card.ttl')

        expect(requests[1].method).toEqual('PUT') // create publiTypeIndex
        expect(requests[1].url).toEqual('https://bob.example.com/profile/publicTypeIndex.ttl')

        expect(requests[2].method).toEqual('PATCH') // Add link of publiTypeIndex to profile
        expect(requests[2].url).toEqual('https://bob.example.com/profile/card.ttl')

        expect(requests[3].method).toEqual('PUT') // create preferenceFile
        expect(requests[3].url).toEqual('https://bob.example.com/Settings/Preferences.ttl')

        expect(requests[4].method).toEqual('PATCH') // Add privateTypeIndex link preference file
        expect(requests[4].url).toEqual('https://bob.example.com/Settings/Preferences.ttl')

        expect(requests[5].method).toEqual('PUT') //create privatTypeIndex
        expect(requests[5].url).toEqual('https://bob.example.com/Settings/privateTypeIndex.ttl')

        expect(requests.length).toEqual(6)

        })
    })

    const TRACKERS =
[{'classOrder': 5, 'termType': 'NamedNode', 'value': 'https://alice.example.com/publicStuff/actionItems.ttl#this'},
 {'classOrder': 5, 'termType': 'NamedNode', 'value': 'https://alice.example.com/project4/issues.ttl#this'},
 {'classOrder': 5, 'termType': 'NamedNode', 'value': 'https://alice.example.com/privateStuff/ToDo.ttl#this'},
 {'classOrder': 5, 'termType': 'NamedNode', 'value': 'https://alice.example.com/privateStuff/Goals.ttl#this'},
 {'classOrder': 5, 'termType': 'NamedNode', 'value': 'https://alice.example.com/privateStuff/workingOn.ttl#this'},
 {'classOrder': 5, 'termType': 'NamedNode', 'value': 'https://club.example.com/publicStuff/actionItems.ttl#this'},
 {'classOrder': 5, 'termType': 'NamedNode', 'value': 'https://club.example.com/project4/clubIssues.ttl#this'},
 {'classOrder': 5, 'termType': 'NamedNode', 'value': 'https://club.example.com/privateStuff/ToDo.ttl#this'},
 {'classOrder': 5, 'termType': 'NamedNode', 'value': 'https://club.example.com/privateStuff/Goals.ttl#this'},
 {'classOrder': 5, 'termType': 'NamedNode', 'value': 'https://club.example.com/privateStuff/tasks.ttl#this'} ]

    describe('getAppInstances', () => {
        it('exists', () => {
        expect(typeIndexLogic.getAppInstances).toBeInstanceOf(Function)
        })
        it('finds trackers', async () => {
        const result = await typeIndexLogic.getAppInstances(Tracker)
        expect(result).toEqual(TRACKERS) // TRACKERS @@
        expect(result).toEqual(uniqueNodes(result)) // shoud have no dups
        })
        it('finds containers', async () => {
        const result = await typeIndexLogic.getAppInstances(Image)
        expect(result.length).toEqual(1)
        expect(result).toEqual(uniqueNodes(result)) // shoud have no dups
        expect(result.map(x => x.uri).join()).toEqual('https://alice.example.com/profile/Photos/')
        })
    })

    describe('registerInTypeIndex', () => {
        it('exists', () => {
            expect(typeIndexLogic.registerInTypeIndex).toBeInstanceOf(Function)
        })
        it('throws error', async () => {
            const result = await typeIndexLogic.registerInTypeIndex(
                sym('https://test.test#'),
                sym('https://test.test#'),
                sym('https://test.test/TheClass')
            )
            console.log(result)
            expect(result).toEqual(null)
        })
    })
})
