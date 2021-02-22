import * as rdf from "rdflib";
import { Fetcher, NamedNode, Statement, Store, UpdateManager } from "rdflib";
import solidNamespace from "solid-namespace";
import { AuthnLogic } from "./authn";
import { NoAuthnLogic } from "./authn/NoAuthnLogic";
import { SolidAuthClientAuthnLogic } from "./authn/SolidAuthClientAuthnLogic";

import { ChatLogic } from "./chat/ChatLogic";
import * as debug from "./debug";
import { ProfileLogic } from "./profile/ProfileLogic";

export const ACL_LINK = rdf.sym(
  "http://www.iana.org/assignments/link-relations/acl"
);

const ns: SolidNamespace = solidNamespace(rdf);

interface ConnectedStore extends Store {
  fetcher: Fetcher;
}

export interface LiveStore extends ConnectedStore {
  updater: UpdateManager;
}

export interface SolidAuthClient {
  trackSession: (session) => void;
}

export interface SolidNamespace {
  [key: string]: (term: string) => NamedNode;
}

export class SolidLogic {
  cache: {
    profileDocument: {
      [WebID: string]: NamedNode;
    };
    preferencesFile: {
      [WebID: string]: NamedNode;
    };
  };

  store: LiveStore;
  me: string | undefined;
  fetcher: { fetch: (url: string, options?: any) => any };

  chat: ChatLogic;
  profile: ProfileLogic;
  authn: AuthnLogic;

  constructor(fetcher: { fetch: () => any }, solidAuthClient: SolidAuthClient) {
    this.store = rdf.graph() as LiveStore; // Make a Quad store
    rdf.fetcher(this.store, fetcher); // Attach a web I/O module, store.fetcher
    this.store.updater = new rdf.UpdateManager(this.store); // Add real-time live updates store.updater
    this.cache = {
      profileDocument: {},
      preferencesFile: {},
    };
    this.fetcher = fetcher;
    if (solidAuthClient) {
      this.authn = new SolidAuthClientAuthnLogic(solidAuthClient);
    } else {
      this.authn = new NoAuthnLogic();
    }
    this.profile = new ProfileLogic(this.store, ns, this.authn);
    this.chat = new ChatLogic(this.store, ns, this.profile);
  }

  async findAclDocUrl (url: string) {
    const doc = this.store.sym(url)
    await this.load(doc)
    const docNode = this.store.any(doc, ACL_LINK)
    if (!docNode) {
      throw new Error(`No ACL link discovered for ${url}`);
    }
    return docNode.value;
  }

  async loadDoc(profileDocument: NamedNode): Promise<void> {
    // Load the profile into the knowledge base (fetcher.store)
    //   withCredentials: Web arch should let us just load by turning off creds helps CORS
    //   reload: Gets around a specific old Chrome bug caching/origin/cors
    // console.log('loading', profileDocument)
    if (!this.store.fetcher) {
      throw new Error("Cannot load doc, have no fetcher");
    }
    await this.store.fetcher.load(profileDocument, {
      withCredentials: false,
      cache: "reload",
    });
    // console.log('loaded', profileDocument, this.store)
  }

  async loadProfile(me: NamedNode): Promise<NamedNode> {
    // console.log('loadProfile', me)
    if (this.cache.profileDocument[me.value]) {
      return this.cache.profileDocument[me.value];
    }
    let profileDocument;
    try {
      profileDocument = me.doc();
      await this.loadDoc(profileDocument);
      return profileDocument;
    } catch (err) {
      const message = `Logged in but cannot load profile ${profileDocument} : ${err}`;
      throw new Error(message);
    }
  }

  async loadPreferences(me: NamedNode): Promise<NamedNode> {
    // console.log('loadPreferences', me)
    if (this.cache.preferencesFile[me.value]) {
      return this.cache.preferencesFile[me.value];
    }
    const preferencesFile = this.store.any(me, ns.space("preferencesFile"));

    // console.log('this.store.any()', this.store.any())
    /**
     * Are we working cross-origin?
     * Returns True if we are in a webapp at an origin, and the file origin is different
     */
    function differentOrigin(): boolean {
      if (!preferencesFile) {
        return true;
      }
      return (
        `${window.location.origin}/` !== new URL(preferencesFile.value).origin
      );
    }

    if (!preferencesFile) {
      throw new Error(
        `Can't find a preference file pointer in profile ${me.doc()}`
      );
    }

    if (!this.store.fetcher) {
      throw new Error("Cannot load doc, have no fetcher");
    }
    // //// Load preference file
    try {
      await this.store.fetcher.load(preferencesFile as NamedNode, {
        withCredentials: true,
      });
    } catch (err) {
      // Really important to look at why
      const status = err.status;
      debug.log(`HTTP status ${status} for preference file ${preferencesFile}`);
      if (status === 401) {
        throw new UnauthorizedError();
      }
      if (status === 403) {
        if (differentOrigin()) {
          throw new CrossOriginForbiddenError();
        }
        throw new SameOriginForbiddenError();
      }
      if (status === 404) {
        throw new NotFoundError(preferencesFile.value);
      }
      throw new FetchError(err.status, err.message);
    }
    return preferencesFile as NamedNode;
  }

  getTypeIndex(
    me: NamedNode | string,
    preferencesFile: NamedNode | string,
    isPublic: boolean
  ): NamedNode[] {
    // console.log('getTypeIndex', this.store.each(me, undefined, undefined, preferencesFile), isPublic, preferencesFile)
    return this.store.each(
      me as NamedNode,
      isPublic ? ns.solid("publicTypeIndex") : ns.solid("privateTypeIndex"),
      undefined,
      preferencesFile as NamedNode
    ) as NamedNode[];
  }

  getContainerElements(cont: NamedNode) {
    return this.store.each(cont, ns.ldp("contains"));
  }

  getRegistrations(instance, theClass) {
    return this.store
      .each(undefined, ns.solid("instance"), instance)
      .filter((r) => {
        return this.store.holds(r, ns.solid("forClass"), theClass);
      });
  }

  load (doc: NamedNode | NamedNode[] | string) {
    if (!this.store.fetcher) {
      throw new Error("Cannot load doc(s), have no fetcher");
    }
    return this.store.fetcher.load(doc)
  }

  async loadIndexes(
    me: NamedNode | string,
    publicProfile: NamedNode | string | null,
    preferencesFile: NamedNode | string | null,
    onWarning = async (_err: Error) => {
      return undefined;
    }
  ): Promise<{
    private: any;
    public: any;
  }> {
    let privateIndexes: any[] = [];
    let publicIndexes: any[] = [];
    if (publicProfile) {
      publicIndexes = this.getTypeIndex(me, publicProfile, true);
      try {
        await this.load(publicIndexes as NamedNode[]);
      } catch (err) {
        onWarning(new Error(`loadIndex: loading public type index(es) ${err}`));
      }
    }
    if (preferencesFile) {
      privateIndexes = this.getTypeIndex(me, preferencesFile, false);
      // console.log({ privateIndexes })
      if (privateIndexes.length === 0) {
        await onWarning(
          new Error(
            `Your preference file ${preferencesFile} does not point to a private type index.`
          )
        );
      } else {
        try {
          await this.load(privateIndexes);
        } catch (err) {
          onWarning(
            new Error(`loadIndex: loading private type index(es) ${err}`)
          );
        }
      }
      // } else {
      //   debug.log(
      //     'We know your preference file is not available, so we are not bothering with private type indexes.'
      //   )
    }

    return {
      private: privateIndexes,
      public: publicIndexes,
    };
  }

  async createEmptyRdfDoc(doc: NamedNode, comment: string) {
    if (!this.store.fetcher) {
      throw new Error("Cannot create empty rdf doc, have no fetcher");
    }
    await this.store.fetcher.webOperation("PUT", doc.uri, {
      data: `# ${new Date()} ${comment}
`,
      contentType: "text/turtle",
    });
  }

  // @@@@ use the one in rdflib.js when it is available and delete this
  updatePromise(
    del: Array<Statement>,
    ins: Array<Statement> = []
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.store.updater) {
        throw new Error("Cannot updatePromise, have no updater");
      }
      this.store.updater.update(del, ins, function (_uri, ok, errorBody) {
        if (!ok) {
          reject(new Error(errorBody));
        } else {
          resolve();
        }
      }); // callback
    }); // promise
  }

  isContainer(url: string) {
    return url.substr(-1) === "/";
  }

  async getContainerMembers(containerUrl) {
    // update to latest index.ttl content
    await this.store.fetcher.refresh(this.store.sym(containerUrl))
    return this.store.statementsMatching(this.store.sym(containerUrl), this.store.sym('http://www.w3.org/ns/ldp#contains')).map((st: Statement) => st.object.value);
  }

  async recursiveDelete(url: string) {
    try {
      if (this.isContainer(url)) {
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

  async fetch(url: string, options?: any) {
    return this.fetcher.fetch(url, options);
  }
}

class CustomError extends Error {
  constructor(message?: string) {
    super(message);
    // see: typescriptlang.org/docs/handbook/release-notes/typescript-2-2.html
    Object.setPrototypeOf(this, new.target.prototype); // restore prototype chain
    this.name = new.target.name; // stack traces display correctly now
  }
}

export class UnauthorizedError extends CustomError {}

export class CrossOriginForbiddenError extends CustomError {}

export class SameOriginForbiddenError extends CustomError {}

export class NotFoundError extends CustomError {}

export class FetchError extends CustomError {
  status: number;

  constructor(status: number, message?: string) {
    super(message);
    this.status = status;
  }
}
