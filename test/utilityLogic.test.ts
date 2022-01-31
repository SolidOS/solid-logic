/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { UtilityLogic } from "../src/util/UtilityLogic";
import solidNamespace from "solid-namespace";
import * as rdf from "rdflib";
import fetchMock from "jest-fetch-mock";
import { UpdateManager } from "rdflib";
import { SolidNamespace } from "../src/types";

const ns: SolidNamespace = solidNamespace(rdf);

const alice = rdf.sym("https://alice.example/profile/card#me");
const bob = rdf.sym("https://bob.example/profile/card#me");

describe("Utility logic", () => {
  let util;
  let store;
  let fetcher;
  beforeEach(() => {
    fetchMock.resetMocks();
    fetchMock.mockResponse("Not Found", {
      status: 404,
    });
    fetcher = { fetch: fetchMock };
    store = rdf.graph();
    store.fetcher = rdf.fetcher(store, fetcher);
    store.updater = new UpdateManager(store);
    util = new UtilityLogic(store, ns, fetcher);
  });

  describe("getArchiveUrl", () => {
    it("produces the right URL in February", () => {
      const url = util.getArchiveUrl('https://example.com/inbox/asdf-qwer-asdf-qwer', new Date('7 Feb 2062 UTC'));
      expect(url).toEqual('https://example.com/inbox/archive/2062/02/07/asdf-qwer-asdf-qwer');
    });
    it("produces the right URL in November", () => {
      const url = util.getArchiveUrl('https://example.com/inbox/asdf-qwer-asdf-qwer', new Date('12 Nov 2012 UTC'));
      expect(url).toEqual('https://example.com/inbox/archive/2012/11/12/asdf-qwer-asdf-qwer');
    });
  });
  describe("getContainerMembers", () => {
    describe("When container is empty", () => {
      let result;
      beforeEach(async () => {
        containerIsEmpty();
        result = await util.getContainerMembers('https://container.com/');
      });
      it("Resolves to an empty array", () => {
        expect(result).toEqual([]);
      });
    });
    describe("When container has some containment triples", () => {
      let result;
      beforeEach(async () => {
        containerHasSomeContainmentTriples();
        result = await util.getContainerMembers('https://container.com/');
      });
      it("Resolves to an array with some URLs", () => {
        expect(result.sort()).toEqual([
          'https://container.com/foo.txt',
          'https://container.com/bar/'
        ].sort());
      });
    });
  });
  describe("setSinglePeerAccess", () => {
    beforeEach(() => {
      fetchMock.mockOnceIf(
        "https://owner.com/some/resource",
        "hello", {
        headers: {
          Link: '<https://owner.com/some/acl>; rel="acl"'
        }
      });
      fetchMock.mockOnceIf(
        "https://owner.com/some/acl",
        "Created", {
        status: 201
      });
    });
    it("Creates the right ACL doc", async () => {
      await util.setSinglePeerAccess({
        ownerWebId: "https://owner.com/#me",
        peerWebId: "https://peer.com/#me",
        accessToModes: "acl:Read, acl:Control",
        defaultModes: "acl:Write",
        target: "https://owner.com/some/resource"
      });
      expect(fetchMock.mock.calls).toEqual([
        [ "https://owner.com/some/resource", fetchMock.mock.calls[0][1] ],
        [ "https://owner.com/some/acl", {
          body: '@prefix acl: <http://www.w3.org/ns/auth/acl#>.\n' +
            '\n' +
            '<#alice> a acl:Authorization;\n' +
            '  acl:agent <https://owner.com/#me>;\n' +
            '  acl:accessTo <https://owner.com/some/resource>;\n' +
            '  acl:default <https://owner.com/some/resource>;\n' +
            '  acl:mode acl:Read, acl:Write, acl:Control.\n' +
            '<#bobAccessTo> a acl:Authorization;\n' +
            '  acl:agent <https://peer.com/#me>;\n' +
            '  acl:accessTo <https://owner.com/some/resource>;\n' +
            '  acl:mode acl:Read, acl:Control.\n' +
            '<#bobDefault> a acl:Authorization;\n' +
            '  acl:agent <https://peer.com/#me>;\n' +
            '  acl:default <https://owner.com/some/resource>;\n' +
            '  acl:mode acl:Write.\n',
          headers: [
                ["Content-Type", "text/turtle"]
          ],
          method: "PUT"
        }]
      ]);
    });
  });
  function containerIsEmpty() {
    fetchMock.mockOnceIf(
      "https://container.com/",
      " ", // FIXME: https://github.com/jefflau/jest-fetch-mock/issues/189
      {
        headers: { "Content-Type": "text/turtle" },
      }
    );
  }

  function containerHasSomeContainmentTriples() {
    fetchMock.mockOnceIf(
      "https://container.com/",
      "<.> <http://www.w3.org/ns/ldp#contains> <./foo.txt>, <./bar/> .",
      {
        headers: { "Content-Type": "text/turtle" },
      }
    );
  }
});