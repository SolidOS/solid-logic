import { NamedNode, Statement, sym, LiveStore } from "rdflib";
import { SolidNamespace } from "../types";

export const ACL_LINK = sym(
  "http://www.iana.org/assignments/link-relations/acl"
);

/**
 * Utility-related logic
 */
export class UtilityLogic {
  store: LiveStore;
  ns: SolidNamespace;
  underlyingFetch: { fetch: (url: string, options?: any) => any };

  constructor(store: LiveStore, ns: SolidNamespace, underlyingFetch: { fetch: (url: string, options?: any) => any }) {
    this.store = store;
    this.ns = ns;
    this.underlyingFetch = underlyingFetch;
  }

  async findAclDocUrl(url: NamedNode) {
    const nodeToStr = url.toString();
    const doc = this.store.sym(nodeToStr);
    await this.store.fetcher?.load(doc);
    const docNode = this.store.any(doc, ACL_LINK);
    if (!docNode) {
      throw new Error(`No ACL link discovered for ${url}`);
    }
    return docNode.value;
  }

  // Copied from https://github.com/solidos/web-access-control-tests/blob/v3.0.0/test/surface/delete.test.ts#L5
  async setSinglePeerAccess(options: {
    ownerWebId: string,
    peerWebId: string,
    accessToModes?: string,
    defaultModes?: string,
    target: string
  }) {
    let str = [
      '@prefix acl: <http://www.w3.org/ns/auth/acl#>.',
      '',
      `<#alice> a acl:Authorization;\n  acl:agent <${options.ownerWebId}>;`,
      `  acl:accessTo <${options.target}>;`,
      `  acl:default <${options.target}>;`,
      '  acl:mode acl:Read, acl:Write, acl:Control.',
      ''
    ].join('\n')
    if (options.accessToModes) {
      str += [
        '<#bobAccessTo> a acl:Authorization;',
        `  acl:agent <${options.peerWebId}>;`,
        `  acl:accessTo <${options.target}>;`,
        `  acl:mode ${options.accessToModes}.`,
        ''
      ].join('\n')
    }
    if (options.defaultModes) {
      str += [
        '<#bobDefault> a acl:Authorization;',
        `  acl:agent <${options.peerWebId}>;`,
        `  acl:default <${options.target}>;`,
        `  acl:mode ${options.defaultModes}.`,
        ''
      ].join('\n')
    }
    const toNode: NamedNode = sym(options.target);
    const aclDocUrl = await this.findAclDocUrl(toNode);
    return this.underlyingFetch.fetch(aclDocUrl, {
      method: 'PUT',
      body: str,
      headers: [
        [ 'Content-Type', 'text/turtle' ]
      ]
    });
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
      withCredentials: false, // @@ BUT this won't work when logged in an accessing private stuff!
      cache: "reload",
    });
    // console.log('loaded', profileDocument, this.store)
  }

  isContainer(url: NamedNode) {
    const nodeToString = url.value;
    return nodeToString.charAt(nodeToString.length-1) === "/";
  }

  async createContainer(url: string) {
    const stringToNode = new NamedNode (url);
    if (!this.isContainer(stringToNode)) {
      throw new Error(`Not a container URL ${url}`);
    }
    // Copied from https://github.com/solidos/solid-crud-tests/blob/v3.1.0/test/surface/create-container.test.ts#L56-L64
    const result = await this.underlyingFetch.fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "text/turtle",
        "If-None-Match": "*",
        Link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"', // See https://github.com/solidos/node-solid-server/issues/1465
      },
      body: " ", // work around https://github.com/michielbdejong/community-server/issues/4#issuecomment-776222863
    });
    if (result.status.toString()[0] !== '2') {
      throw new Error(`Not OK: got ${result.status} response while creating container at ${url}`);
    }
  }

  getContainerElements(containerNode: NamedNode): NamedNode[] {
    return this.store
      .statementsMatching(
        containerNode,
        this.store.sym("http://www.w3.org/ns/ldp#contains"),
        undefined,
      )
      .map((st: Statement) => st.object as NamedNode);
  }

  async getContainerMembers (containerNode: NamedNode): Promise<NamedNode[]> {
    await this.store.fetcher?.load(containerNode);
    return this.getContainerElements(containerNode);
  }

  async recursiveDelete(containerNode: NamedNode) {
    try {
      if (this.isContainer(containerNode)) {
        const aclDocUrl = await this.findAclDocUrl(containerNode);
        await this.underlyingFetch.fetch(aclDocUrl, { method: "DELETE" });
        const containerMembers = await this.getContainerMembers(containerNode);
        await Promise.all(
          containerMembers.map((url) => this.recursiveDelete(containerNode))
        );
      }
      const nodeToStringHere = containerNode.value;
      return this.underlyingFetch.fetch(nodeToStringHere, { method: "DELETE" });
    } catch (e) {
      // console.log(`Please manually remove ${url} from your system under test.`, e);
    }
  }

  clearStore() {
    this.store.statements.slice().forEach(this.store.remove.bind(this.store));
  }

  getArchiveUrl(baseUrl: string, date: Date) {
    const year = date.getUTCFullYear();
    const month = ('0' + (date.getUTCMonth()+1)).slice(-2);
    const day = ('0' + (date.getUTCDate())).slice(-2);
    const parts = baseUrl.split('/');
    const filename = parts[parts.length -1 ];
    return new URL(`./archive/${year}/${month}/${day}/${filename}`, baseUrl).toString();
  }
}
