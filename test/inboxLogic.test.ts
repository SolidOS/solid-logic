import fetchMock from "jest-fetch-mock";
import * as rdf from "rdflib";
import { Fetcher, Store, UpdateManager } from "rdflib";
import { createInboxFor } from '../src/inbox/inboxLogic';
import { solidLogicSingleton } from "../src/logic/solidLogicSingleton";
import { Profile } from "../src/profile/Profile";
import { SolidNamespace } from "../src/types";
import solidNamespace from "solid-namespace";
import { Container } from "../src/util/Container";
import { AliceProfile, BobProfile } from "./helpers/dataSetup";

const ns: SolidNamespace = solidNamespace(rdf);
const prefixes = Object.keys(ns).map(prefix => `@prefix ${prefix}: ${ns[prefix]('')}.\n`).join('') // In turtle


const alice = rdf.sym("https://alice.example/profile/card#me");
const bob = rdf.sym("https://bob.example/profile/card#me");

describe("Inbox", () => {
  let store;
  let container;
  let profile;
  let web = {}
  let requests = []
  let statustoBeReturned = 200
  beforeEach(() => {
    fetchMock.resetMocks();
    requests = []
    statustoBeReturned = 200
    const init = {headers: { "Content-Type": "text/turtle" }} // Fetch options tend to be called this

    web = {}
    web[alice.doc().uri] = AliceProfile
    web[bob.doc().uri] = BobProfile

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
    const authn = {
          currentUser: () => {
            return alice;
          },
    };
    const options = { fetch: fetch };
    store = new Store()
    store.fetcher = new Fetcher(store, options);
    store.updater = new UpdateManager(store);
    container = new Container(store)
    profile = new Profile(store, ns, authn)
    solidLogicSingleton.store = store
    solidLogicSingleton.container = container
    solidLogicSingleton.profile = profile

  });
  describe('createInboxFor', () => {
    beforeEach(async () => {
      aliceHasValidProfile();
      // First for the PUT:
      fetchMock.mockOnceIf(
        "https://alice.example/p2p-inboxes/Peer%20Person/",
        "Created", {
          status: 201
        }
      )
      // Then for the GET to read the ACL link:
      fetchMock.mockOnceIf(
        "https://alice.example/p2p-inboxes/Peer%20Person/",
        " ", {
          status: 200,
          headers: {
            Link: '<https://some/acl>; rel="acl"',
          }
        }
      )
      fetchMock.mockIf("https://some/acl", "Created", { status: 201 });

      await createInboxFor('https://peer.com/#me', 'Peer Person');
    });
    it("creates the inbox", () => {
      expect(fetchMock.mock.calls).toEqual([
        [ "https://alice.example/profile/card", fetchMock.mock.calls[0][1] ],
        [ "https://alice.example/p2p-inboxes/Peer%20Person/", {
          body: " ",
          headers: {
            "Content-Type": "text/turtle",
            "If-None-Match": "*",
            Link: "<http://www.w3.org/ns/ldp#BasicContainer>; rel=\"type\"",
          },
          method: "PUT"      
        }],
        [ "https://alice.example/p2p-inboxes/Peer%20Person/", fetchMock.mock.calls[2][1] ],
        [ "https://some/acl", {
          body: '@prefix acl: <http://www.w3.org/ns/auth/acl#>.\n' +
          '\n' +
          '<#alice> a acl:Authorization;\n' +
          '  acl:agent <https://alice.example/profile/card#me>;\n' +
          '  acl:accessTo <https://alice.example/p2p-inboxes/Peer%20Person/>;\n' +
          '  acl:default <https://alice.example/p2p-inboxes/Peer%20Person/>;\n' +
          '  acl:mode acl:Read, acl:Write, acl:Control.\n' +
          '<#bobAccessTo> a acl:Authorization;\n' +
          '  acl:agent <https://peer.com/#me>;\n' +
          '  acl:accessTo <https://alice.example/p2p-inboxes/Peer%20Person/>;\n' +
          '  acl:mode acl:Append.\n',
          headers: [
            [ 'Content-Type', 'text/turtle' ]
          ],
          method: 'PUT'
        }]
      ]);
    });

  });

  function aliceHasValidProfile() {
    fetchMock.mockOnceIf(
      "https://alice.example/profile/card",
      `
            <https://alice.example/profile/card#me>
              <http://www.w3.org/ns/pim/space#storage> <https://alice.example/> ;
              <http://www.w3.org/ns/solid/terms#privateTypeIndex> <https://alice.example/settings/privateTypeIndex.ttl> ;
            .`,
      {
        headers: {
          "Content-Type": "text/turtle",
        },
      }
    );
  }

});