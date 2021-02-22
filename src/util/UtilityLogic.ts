import { NamedNode, Node, st, term, sym, Statement } from "rdflib";
import { LiveStore, SolidNamespace } from "../index";
import { ProfileLogic } from "../profile/ProfileLogic";
import { newThing } from "../uri";

export const ACL_LINK = sym(
  "http://www.iana.org/assignments/link-relations/acl"
);

interface NewPaneOptions {
  me?: NamedNode;
  newInstance?: NamedNode;
  newBase: string;
}

interface CreatedPaneOptions {
  newInstance: NamedNode;
}

/**
 * Utility-related logic
 */
export class UtilityLogic {
  store: LiveStore;
  ns: SolidNamespace;
  fetcher: { fetch: (url: string, options?: any) => any };

  constructor(store: LiveStore, ns: SolidNamespace, fetcher: { fetch: (url: string, options?: any) => any }) {
    this.store = store;
    this.ns = ns;
    this.fetcher = fetcher;
  }

  async findAclDocUrl(url: string) {
    const doc = this.store.sym(url);
    await this.store.fetcher.load(doc);
    const docNode = this.store.any(doc, ACL_LINK);
    if (!docNode) {
      throw new Error(`No ACL link discovered for ${url}`);
    }
    return docNode.value;
  }

  async loadDoc(doc: NamedNode): Promise<void> {
    // Load a document into the knowledge base (fetcher.store)
    //   withCredentials: Web arch should let us just load by turning off creds helps CORS
    //   reload: Gets around a specific old Chrome bug caching/origin/cors
    // console.log('loading', profileDocument)
    if (!this.store.fetcher) {
      throw new Error("Cannot load doc, have no fetcher");
    }
    await this.store.fetcher.load(doc, {
      withCredentials: false,
      cache: "reload",
    });
    // console.log('loaded', profileDocument, this.store)
  }

  isContainer(url: string) {
    return url.substr(-1) === "/";
  }

  async getContainerMembers(containerUrl) {
    await this.store.fetcher.load(this.store.sym(containerUrl));
    return this.store
      .statementsMatching(
        this.store.sym(containerUrl),
        this.store.sym("http://www.w3.org/ns/ldp#contains"),
        undefined,
        this.store.sym(containerUrl).doc()
      )
      .map((st: Statement) => st.object.value);
  }

  async recursiveDelete(url: string) {
    try {
      if (this.isContainer(url)) {
        const aclDocUrl = await this.findAclDocUrl(url);
        await this.store.fetcher.fetch(aclDocUrl, { method: "DELETE" });
        const containerMembers = await this.getContainerMembers(url);
        await Promise.all(
          containerMembers.map((url) => this.recursiveDelete(url))
        );
      }
      return this.fetcher.fetch(url, { method: "DELETE" });
    } catch (e) {
      // console.log(`Please manually remove ${url} from your system under test.`, e);
    }
  }

  clearStore() {
    this.store.statements.slice().forEach(this.store.remove.bind(this.store));
  }

}
