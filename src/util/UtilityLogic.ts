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
  fetcher: { fetch: (url: string, options?: any) => any };

  constructor(store: LiveStore, ns: SolidNamespace, fetcher: { fetch: (url: string, options?: any) => any }) {
    this.store = store;
    this.ns = ns;
    this.fetcher = fetcher;
  }

  async findAclDocUrl(url: string) {
    const doc = this.store.sym(url);
    await this.store.fetcher?.load(doc);
    const docNode = this.store.any(doc, ACL_LINK);
    if (!docNode) {
      throw new Error(`No ACL link discovered for ${url}`);
    }
    return docNode.value;
  }

  // Copied from https://github.com/solid/web-access-control-tests/blob/v3.0.0/test/surface/delete.test.ts#L5
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
    const aclDocUrl = await this.findAclDocUrl(options.target);
    return this.fetcher.fetch(aclDocUrl, {
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
      withCredentials: false,
      cache: "reload",
    });
    // console.log('loaded', profileDocument, this.store)
  }

  isContainer(url: string) {
    return url.substr(-1) === "/";
  }

  async createContainer(url: string) {
    if (!this.isContainer(url)) {
      throw new Error(`Not a container URL ${url}`);
    }
    // Copied from https://github.com/solid/solid-crud-tests/blob/v3.1.0/test/surface/create-container.test.ts#L56-L64
    const result = await this.fetcher.fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "text/turtle",
        "If-None-Match": "*",
        Link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"', // See https://github.com/solid/node-solid-server/issues/1465
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
        containerNode.doc()
      )
      .map((st: Statement) => st.object as NamedNode);
  }

  async getContainerMembers(containerUrl: string): Promise<string[]> {
    const containerNode = this.store.sym(containerUrl);
    await this.store.fetcher?.load(containerNode);
    const nodes = this.getContainerElements(containerNode);
    return nodes.map(node => node.value);
  }

  async recursiveDelete(url: string) {
    try {
      if (this.isContainer(url)) {
        const aclDocUrl = await this.findAclDocUrl(url);
        await this.fetcher.fetch(aclDocUrl, { method: "DELETE" });
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

  getArchiveUrl(baseUrl: string, date: Date) {
    const year = date.getUTCFullYear();
    const month = ('0' + (date.getUTCMonth()+1)).slice(-2);
    const day = ('0' + (date.getUTCDate())).slice(-2);
    const parts = baseUrl.split('/');
    const filename = parts[parts.length -1 ];
    return new URL(`./archive/${year}/${month}/${day}/${filename}`, baseUrl).toString();
  }
}
