/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { UtilityLogic } from "./UtilityLogic";
import solidNamespace from "solid-namespace";

import * as rdf from "rdflib";
import { ProfileLogic } from "../profile/ProfileLogic";
import fetchMock from "jest-fetch-mock";
import { UpdateManager } from "rdflib";

const ns = solidNamespace(rdf);

const alice = rdf.sym("https://alice.example/profile/card#me");
const bob = rdf.sym("https://bob.example/profile/card#me");

describe("Utility logic", () => {
  let Utility;
  let store;
  beforeEach(() => {
    fetchMock.resetMocks();
    fetchMock.mockResponse("Not Found", {
      status: 404,
    });
    store = rdf.graph();
    store.fetcher = rdf.fetcher(store, { fetch: fetchMock });
    store.updater = new UpdateManager(store);
    const authn = {
      currentUser: () => {
        return alice;
      },
    };
    const profile = new ProfileLogic(store, ns, authn);
    Utility = new UtilityLogic(store, ns, store.fetcher);
  });

  describe("getContainerMembers", () => {
    describe("When container is empty", () => {
      let result;
      beforeEach(async () => {
        containerIsEmpty();
        result = await Utility.getContainerMembers('http://container.com/');
      });
      it("Resolves to an empty array", () => {
        expect(result).toEqual([]);
      });
    });
    describe("When container has some containment triples", () => {
      let result;
      beforeEach(async () => {
        containerHasSomeContainmentTriples();
        result = await Utility.getContainerMembers('https://container.com/');
      });
      it("Resolves to an array with some URLs", () => {
        expect(result.sort()).toEqual([
          'https://container.com/foo.txt',
          'https://container.com/bar/'
        ].sort());
      });
    });
  });

  function containerIsEmpty() {
    fetchMock.mockOnceIf(
      "https://container.com/",
      "",
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