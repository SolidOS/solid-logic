import solidNamespace from "solid-namespace";
import * as rdf from "rdflib";
import { UpdateManager } from "rdflib";
import { Profile } from "../src/profile/Profile";
import { Inbox } from "../src/inbox/Inbox";
import { SolidNamespace } from "../src/types";
import fetchMock from "jest-fetch-mock";
import { Container } from "../src/util/Container";
import { solidLogicSingleton } from "../src";

const ns: SolidNamespace = solidNamespace(rdf);

const alice = rdf.sym("https://alice.example/profile/card#me");
const bob = rdf.sym("https://bob.example/profile/card#me");

describe("Inbox", () => {
  let store;
  let profile
  let inbox
  let container
  beforeEach(() => {
    fetchMock.resetMocks();
    fetchMock.mockResponse("Not Found", {
      status: 404,
    });
    const fetcher = { fetch: fetch };
    store = new rdf.Store();
    store.fetcher = new rdf.Fetcher(store, fetcher);
    store.updater = new UpdateManager(store);
    const authn = {
      currentUser: () => {
        return alice;
      },
    };
    container = new Container(store);
    profile = new Profile(store, ns, authn);
    inbox = new Inbox(store, ns, profile, container);
    solidLogicSingleton.store = store
    solidLogicSingleton.container = container
    solidLogicSingleton.profile = profile
    solidLogicSingleton.inbox = inbox
  });

  describe("getNewMessages", () => {
    describe("When inbox is empty", () => {
      let result;
      beforeEach(async () => {
        bobHasAnInbox();
        inboxIsEmpty();
        result = await inbox.getNewMessages(bob);
      });
      it("Resolves to an empty array", () => {
        expect(result).toEqual([]);
      });
    });
    describe("When container has some containment triples", () => {
      let result;
      beforeEach(async () => {
        bobHasAnInbox();
        inboxHasSomeContainmentTriples();
        result = await inbox.getNewMessages(bob);
      });
      it("Resolves to an array with URLs of non-container resources in inbox", () => {
        expect(result.sort()).toEqual([
          'https://container.com/foo.txt'
        ].sort());
      });
    });
  });
  
  describe('markAsRead', () => {
    beforeEach(async () => {
      fetchMock.mockOnceIf(
        "https://container.com/item.ttl",
        "<#some> <#inbox> <#item> .",
        {
          headers: { "Content-Type": "text/turtle" },
        }
      );
      fetchMock.mockOnceIf(
        "https://container.com/archive/2111/03/31/item.ttl",
        "Created",
        {
          status: 201,
          headers: { "Content-Type": "text/turtle" },
        }
      );
      await inbox.markAsRead("https://container.com/item.ttl", new Date('31 March 2111 UTC'));
    });
    it('moves the item to archive', async () => {
      expect(fetchMock.mock.calls).toEqual([
        [ "https://container.com/item.ttl" ],
        [
          "https://container.com/archive/2111/03/31/item.ttl",
          {
            "body": "<#some> <#inbox> <#item> .",
            "headers": [
              [
                "Content-Type",
                "text/turtle",
              ],
            ],
            "method": "PUT",
          },
        ],
        [ "https://container.com/item.ttl", { method: 'DELETE' } ],
      ]);
    });
  });

  

  function bobHasAnInbox() {
    fetchMock.mockOnceIf(
      "https://bob.example/profile/card",
      "<https://bob.example/profile/card#me><http://www.w3.org/ns/ldp#inbox><https://container.com/>.",
      {
        headers: { "Content-Type": "text/turtle" },
      }
    );
  }

  function inboxIsEmpty() {
    fetchMock.mockOnceIf(
      "https://container.com/",
      " ", // FIXME: https://github.com/jefflau/jest-fetch-mock/issues/189
      {
        headers: { "Content-Type": "text/turtle" },
      }
    );
  }

  function inboxHasSomeContainmentTriples() {
    fetchMock.mockOnceIf(
      "https://container.com/",
      "<.> <http://www.w3.org/ns/ldp#contains> <./foo.txt>, <./bar/> .",
      {
        headers: { "Content-Type": "text/turtle" },
      }
    );
  }

  function inboxItemExists() {
    fetchMock.mockOnceIf(
      "https://container.com/item.ttl",
      "<#some> <#inbox> <#item> .",
      {
        headers: { "Content-Type": "text/turtle" },
      }
    );
  }
});