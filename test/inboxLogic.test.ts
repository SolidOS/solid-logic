/* eslint-disable @typescript-eslint/no-non-null-assertion */
import solidNamespace from "solid-namespace";
import * as rdf from "rdflib";
import { UpdateManager } from "rdflib";
import { ProfileLogic } from "../src/profile/ProfileLogic";
import { UtilityLogic } from "../src/util/UtilityLogic";
import { InboxLogic } from "../src/inbox/InboxLogic";
import { SolidNamespace } from "../src/types";

const ns: SolidNamespace = solidNamespace(rdf);

const alice = rdf.sym("https://alice.example/profile/card#me");
const bob = rdf.sym("https://bob.example/profile/card#me");

describe("Inbox logic", () => {
  let inbox;
  let store;
  beforeEach(() => {
    fetchMock.resetMocks();
    fetchMock.mockResponse("Not Found", {
      status: 404,
    });
    const fetcher = { fetch: fetchMock };
    store = rdf.graph();
    store.fetcher = rdf.fetcher(store, fetcher);
    store.updater = new UpdateManager(store);
    const authn = {
      currentUser: () => {
        return alice;
      },
    };
    const profile = new ProfileLogic(store, ns, authn);
    const util = new UtilityLogic(store, ns, fetcher);
    inbox = new InboxLogic(store, ns, profile, util);
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

      await inbox.createInboxFor('https://peer.com/#me', 'Peer Person');
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