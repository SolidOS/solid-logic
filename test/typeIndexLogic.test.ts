import fetchMock from "jest-fetch-mock";
import * as rdf from "rdflib";
import { Fetcher, Store, sym, UpdateManager } from "rdflib";
import solidNamespace from "solid-namespace";
import { SolidAuthnLogic } from "../src/authn/SolidAuthnLogic";
import { uniqueNodes } from "../src/discovery/discoveryLogic";
import { AuthenticationContext, solidLogicSingleton, SolidNamespace } from "../src/index";
import { Profile } from "../src/profile/Profile";
import { TypeIndex } from "../src/typeIndex/TypeIndex";
import { getAppInstances, getScopedAppInstances, loadAllTypeIndexes, loadCommunityTypeIndexes, loadIndex, loadTypeIndexes, loadTypeIndexesFor, registerInTypeIndex } from "../src/typeIndex/typeIndexLogic";
import { Container } from "../src/util/Container";
import { alice, AlicePhotoFolder, AlicePhotos, AlicePreferences, AlicePreferencesFile, AlicePrivateTypeIndex, AlicePrivateTypes, AliceProfile, AlicePublicTypeIndex, AlicePublicTypes, bob, BobProfile, club, ClubPreferences, ClubPreferencesFile, ClubPrivateTypeIndex, ClubPrivateTypes, ClubProfile, ClubPublicTypeIndex, ClubPublicTypes } from "./helpers/dataSetup";

const ns: SolidNamespace = solidNamespace(rdf);
const prefixes = Object.keys(ns).map(prefix => `@prefix ${prefix}: ${ns[prefix]('')}.\n`).join('') // In turtle

const Tracker = ns.wf('Tracker')
const Image = ns.schema('Image')

describe('loadIndex', () => {
  it('loadIndex', async () => {
    const context = {
      index: {}
    }

    const result = await loadIndex(context, true)
    expect(result).toEqual({
      index: {
        private: [],
        public: []
      },
    })
  })
})

describe('loadTypeIndexes', () => {
  it('exists', () => {
    expect(loadTypeIndexes).toBeInstanceOf(Function)
  })
  it('runs', async () => {
    const result = await loadTypeIndexes({})
    expect(result).toBeInstanceOf(Object)
  })
})

describe('registerInTypeIndex', () => {
  it('exists', () => {
    expect(registerInTypeIndex).toBeInstanceOf(Function)
  })
  it('throws error', async () => {
    expect(registerInTypeIndex(
      {} as AuthenticationContext,
      sym('https://test.test#'),
      sym('https://test.test#'),
      false
    )).rejects
      .toThrow('@@ ensureLoadedPreferences: no user specified')
  })
})

describe("TypeIndex logic", () => {
  let store;
  let options;
  let util;
  let typeIndex;
  let profile;
  let container;
  let web = {}
  let requests = []
  let statustoBeReturned = 200
  beforeEach(() => {
    requests = []
    statustoBeReturned = 200
    fetchMock.resetMocks();
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
    const authn = {
          currentUser: () => {
            return alice;
          },
    };
    
    options = { fetch: fetchMock };
    store = new Store()
    store.fetcher = new Fetcher(store, options);
    store.updater = new UpdateManager(store);
    profile = new Profile(store, ns, authn)
    container = new Container(store)
    typeIndex = new TypeIndex(store, ns, authn, profile)
    solidLogicSingleton.authn = authn as SolidAuthnLogic
    solidLogicSingleton.store = store
    solidLogicSingleton.typeIndex = typeIndex
  });
  describe('loadAllTypeIndexes', () => {
    it('exists', () => {
      expect(loadAllTypeIndexes).toBeInstanceOf(Function)
    })
  })

  const AliceScopes = [{
    "agent": {
      "classOrder": 5,
      "termType": "NamedNode",
      "value": "https://alice.example.com/profile/card.ttl#me",
    },
    "index": {
      "classOrder": 5,
      "termType": "NamedNode",
      "value": "https://alice.example.com/profile/public-type-index.ttl",
    },
    "label": "public",
  },
  {
    "agent": {
      "classOrder": 5,
      "termType": "NamedNode",
      "value": "https://alice.example.com/profile/card.ttl#me",
    },
    "index": {
      "classOrder": 5,
      "termType": "NamedNode",
      "value": "https://alice.example.com/settings/private-type-index.ttl",
    },
    "label": "private",
  }
  ];

  describe('loadTypeIndexesFor', () => {
    it('exists', () => {
      expect(loadTypeIndexesFor).toBeInstanceOf(Function)
    })
    it('loads data', async () => {
      const result = await loadTypeIndexesFor(alice)
      expect(result).toEqual(AliceScopes)
      expect(store.statementsMatching(null, null, null, AlicePrivateTypeIndex).length).toEqual(8)
      expect(store.statementsMatching(null, null, null, AlicePublicTypeIndex).length).toEqual(8)
    })
  })

  const ClubScopes =
    [
      {
        "agent": {
          "classOrder": 5,
          "termType": "NamedNode",
          "value": "https://club.example.com/profile/card.ttl#it",
        },
        "index": {
          "classOrder": 5,
          "termType": "NamedNode",
          "value": "https://club.example.com/profile/public-type-index.ttl",
        },
        "label": "public",
      },
      {
        "agent": {
          "classOrder": 5,
          "termType": "NamedNode",
          "value": "https://club.example.com/profile/card.ttl#it",
        },
        "index": {
          "classOrder": 5,
          "termType": "NamedNode",
          "value": "https://club.example.com/settings/private-type-index.ttl",
        },
        "label": "private",
      }
    ]
  describe('loadCommunityTypeIndexes', () => {
    it('exists', () => {
      expect(loadCommunityTypeIndexes).toBeInstanceOf(Function)
    })
    it('loads data', async () => {
      const result = await loadCommunityTypeIndexes(alice)
      expect(result).toEqual(ClubScopes)
    })
  })

  const AliceAndClubScopes =
    [
      {
        "instance": {
          "classOrder": 5,
          "termType": "NamedNode",
          "value": "https://alice.example.com/publicStuff/actionItems.ttl#this",
        },
        "scope": {
          "agent": {
            "classOrder": 5,
            "termType": "NamedNode",
            "value": "https://alice.example.com/profile/card.ttl#me",
          },
          "index": {
            "classOrder": 5,
            "termType": "NamedNode",
            "value": "https://alice.example.com/profile/public-type-index.ttl",
          },
          "label": "public",
        },
      },
      {
        "instance": {
          "classOrder": 5,
          "termType": "NamedNode",
          "value": "https://alice.example.com/project4/issues.ttl#this",
        },
        "scope": {
          "agent": {
            "classOrder": 5,
            "termType": "NamedNode",
            "value": "https://alice.example.com/profile/card.ttl#me",
          },
          "index": {
            "classOrder": 5,
            "termType": "NamedNode",
            "value": "https://alice.example.com/profile/public-type-index.ttl",
          },
          "label": "public",
        },
      },
      {
        "instance": {
          "classOrder": 5,
          "termType": "NamedNode",
          "value": "https://alice.example.com/privateStuff/ToDo.ttl#this",
        },
        "scope": {
          "agent": {
            "classOrder": 5,
            "termType": "NamedNode",
            "value": "https://alice.example.com/profile/card.ttl#me",
          },
          "index": {
            "classOrder": 5,
            "termType": "NamedNode",
            "value": "https://alice.example.com/settings/private-type-index.ttl",
          },
          "label": "private",
        },
      },
      {
        "instance": {
          "classOrder": 5,
          "termType": "NamedNode",
          "value": "https://alice.example.com/privateStuff/Goals.ttl#this",
        },
        "scope": {
          "agent": {
            "classOrder": 5,
            "termType": "NamedNode",
            "value": "https://alice.example.com/profile/card.ttl#me",
          },
          "index": {
            "classOrder": 5,
            "termType": "NamedNode",
            "value": "https://alice.example.com/settings/private-type-index.ttl",
          },
          "label": "private",
        },
      },
      {
        "instance": {
          "classOrder": 5,
          "termType": "NamedNode",
          "value": "https://alice.example.com/privateStuff/workingOn.ttl#this",
        },
        "scope": {
          "agent": {
            "classOrder": 5,
            "termType": "NamedNode",
            "value": "https://alice.example.com/profile/card.ttl#me",
          },
          "index": {
            "classOrder": 5,
            "termType": "NamedNode",
            "value": "https://alice.example.com/settings/private-type-index.ttl",
          },
          "label": "private",
        },
      },
      {
        "instance": {
          "classOrder": 5,
          "termType": "NamedNode",
          "value": "https://club.example.com/publicStuff/actionItems.ttl#this",
        },
        "scope": {
          "agent": {
            "classOrder": 5,
            "termType": "NamedNode",
            "value": "https://club.example.com/profile/card.ttl#it",
          },
          "index": {
            "classOrder": 5,
            "termType": "NamedNode",
            "value": "https://club.example.com/profile/public-type-index.ttl",
          },
          "label": "public",
        },
      },
      {
        "instance": {
          "classOrder": 5,
          "termType": "NamedNode",
          "value": "https://club.example.com/project4/clubIssues.ttl#this",
        },
        "scope": {
          "agent": {
            "classOrder": 5,
            "termType": "NamedNode",
            "value": "https://club.example.com/profile/card.ttl#it",
          },
          "index": {
            "classOrder": 5,
            "termType": "NamedNode",
            "value": "https://club.example.com/profile/public-type-index.ttl",
          },
          "label": "public",
        },
      },
      {
        "instance": {
          "classOrder": 5,
          "termType": "NamedNode",
          "value": "https://club.example.com/privateStuff/ToDo.ttl#this",
        },
        "scope": {
          "agent": {
            "classOrder": 5,
            "termType": "NamedNode",
            "value": "https://club.example.com/profile/card.ttl#it",
          },
          "index": {
            "classOrder": 5,
            "termType": "NamedNode",
            "value": "https://club.example.com/settings/private-type-index.ttl",
          },
          "label": "private",
        },
      },
      {
        "instance": {
          "classOrder": 5,
          "termType": "NamedNode",
          "value": "https://club.example.com/privateStuff/Goals.ttl#this",
        },
        "scope": {
          "agent": {
            "classOrder": 5,
            "termType": "NamedNode",
            "value": "https://club.example.com/profile/card.ttl#it",
          },
          "index": {
            "classOrder": 5,
            "termType": "NamedNode",
            "value": "https://club.example.com/settings/private-type-index.ttl",
          },
          "label": "private",
        },
      },
      {
        "instance": {
          "classOrder": 5,
          "termType": "NamedNode",
          "value": "https://club.example.com/privateStuff/tasks.ttl#this",
        },
        "scope": {
          "agent": {
            "classOrder": 5,
            "termType": "NamedNode",
            "value": "https://club.example.com/profile/card.ttl#it",
          },
          "index": {
            "classOrder": 5,
            "termType": "NamedNode",
            "value": "https://club.example.com/settings/private-type-index.ttl",
          },
          "label": "private",
        },
      },
    ]

  describe('getScopedAppInstances', () => {
    it('exists', () => {
      expect(getScopedAppInstances).toBeInstanceOf(Function)
    })
    it('pulls in users scopes and also community ones', async () => {
      const result = await getScopedAppInstances(Tracker, alice)
      expect(result).toEqual(AliceAndClubScopes)
    })
    it('creates new preferenceFile and typeIndex files where they dont exist', async () => {
      const result = await getScopedAppInstances(Tracker, bob)

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
    [
      {
        "classOrder": 5,
        "termType": "NamedNode",
        "value": "https://alice.example.com/publicStuff/actionItems.ttl#this",
      },
      {
        "classOrder": 5,
        "termType": "NamedNode",
        "value": "https://alice.example.com/project4/issues.ttl#this",
      },
      {
        "classOrder": 5,
        "termType": "NamedNode",
        "value": "https://alice.example.com/privateStuff/ToDo.ttl#this",
      },
      {
        "classOrder": 5,
        "termType": "NamedNode",
        "value": "https://alice.example.com/privateStuff/Goals.ttl#this",
      },
      {
        "classOrder": 5,
        "termType": "NamedNode",
        "value": "https://alice.example.com/privateStuff/workingOn.ttl#this",
      },
      {
        "classOrder": 5,
        "termType": "NamedNode",
        "value": "https://club.example.com/publicStuff/actionItems.ttl#this",
      },
      {
        "classOrder": 5,
        "termType": "NamedNode",
        "value": "https://club.example.com/project4/clubIssues.ttl#this",
      },
      {
        "classOrder": 5,
        "termType": "NamedNode",
        "value": "https://club.example.com/privateStuff/ToDo.ttl#this",
      },
      {
        "classOrder": 5,
        "termType": "NamedNode",
        "value": "https://club.example.com/privateStuff/Goals.ttl#this",
      },
      {
        "classOrder": 5,
        "termType": "NamedNode",
        "value": "https://club.example.com/privateStuff/tasks.ttl#this",
      },
    ]

  describe('getAppInstances', () => {
    it('exists', () => {
      expect(getAppInstances).toBeInstanceOf(Function)
    })
    it('finds trackers', async () => {
      const result = await getAppInstances(Tracker)
      expect(result).toEqual(TRACKERS)
      expect(result).toEqual(uniqueNodes(result)) // shoud have no dups
    })
    it('finds images in containers', async () => {
      const result = await getAppInstances(Image)
      expect(result.length).toEqual(3)
      expect(result).toEqual(uniqueNodes(result)) // shoud have no dups
      expect(result.map(x => x.uri).join()).toEqual("https://alice.example.com/profile/Photos/photo1.png,https://alice.example.com/profile/Photos/photo2.png,https://alice.example.com/profile/Photos/photo3.png")
    })
  })
})
