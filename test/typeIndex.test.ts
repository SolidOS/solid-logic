import * as rdf from "rdflib";
import { Fetcher, Store, sym, UpdateManager } from 'rdflib';
import solidNamespace from "solid-namespace";
import { Profile } from '../src/profile/Profile';
import { TypeIndex } from '../src/typeIndex/typeIndex';
import { SolidNamespace } from '../src/types';
import {
    alice, AlicePhotoFolder, AlicePhotos, AlicePreferences, AlicePreferencesFile, AlicePrivateTypeIndex, AlicePrivateTypes, AliceProfile, AlicePublicTypeIndex, AlicePublicTypes, bob, BobProfile, club, ClubPreferences, ClubPreferencesFile, ClubPrivateTypeIndex, ClubPrivateTypes, ClubProfile, ClubPublicTypeIndex, ClubPublicTypes
} from './helpers/dataSetup';

const ns: SolidNamespace = solidNamespace(rdf);
const klass = ns.wf('Tracker')

const user = alice
const userProfile = user.doc()

const prefixes = Object.keys(ns).map(prefix => `@prefix ${prefix}: ${ns[prefix]('')}.\n`).join('') // In turtle

const web = {}
web[userProfile.uri] = AliceProfile
web[AlicePreferencesFile.uri] = AlicePreferences
web[AlicePrivateTypeIndex.uri] = AlicePrivateTypes
web[AlicePublicTypeIndex.uri] = AlicePublicTypes
web[AlicePhotoFolder.uri] = AlicePhotos
web[bob.doc().uri] = BobProfile

web[club.doc().uri] = ClubProfile
web[ClubPreferencesFile.uri] = ClubPreferences
web[ClubPrivateTypeIndex.uri] = ClubPrivateTypes
web[ClubPublicTypeIndex.uri] = ClubPublicTypes

let requests = []
let statustoBeReturned = 200

describe("TypeIndex", () => {
    let store;
    let options;
    const authn = {
        currentUser: () => {
            return alice;
        },
    };
    let profile;
    let typeIndex;
    beforeEach(() => {
        requests = []
        statustoBeReturned = 200
        fetchMock.resetMocks();
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
        options = { fetch: fetch };
        store = new Store()
        store.fetcher = new Fetcher (store, options);
        store.updater = new UpdateManager(store);
        profile = new Profile(store, ns, authn);
        typeIndex = new TypeIndex(store, ns, authn, profile);
    });

    describe('registerInstanceInTypeIndex', () =>  {
        it('exists', () => {
            expect(typeIndex.registerInstanceInTypeIndex).toBeInstanceOf(Function)
        })
        it('adds a registration', async () => {
            const instance = sym(alice.doc().uri + 'trackers/myToDo.ttl#this')
            const index = AlicePublicTypeIndex
            const result = await typeIndex.registerInstanceInTypeIndex(store, instance, index, klass)
            expect(result.doc()).toEqual(index)
            expect(store.any(result, ns.solid('forClass'), null, index)).toEqual(klass)
            expect(store.any(result, ns.solid('instance'), null, index)).toEqual(instance)
            expect(store.holds(result, ns.rdf('type'), ns.solid('TypeRegistration'), index)).toEqual(true)
            expect(requests[0].url).toEqual(index.uri)
        })
    })
})