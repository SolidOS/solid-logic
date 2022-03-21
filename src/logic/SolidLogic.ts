import { Session } from "@inrupt/solid-client-authn-browser";
import * as rdf from "rdflib";
import { NamedNode, Statement, LiveStore } from "rdflib";
import solidNamespace from "solid-namespace";
import { SolidAuthnLogic } from "../authn/SolidAuthnLogic";
import { ChatLogic } from "../chat/ChatLogic";
import { ProfileLogic } from "../profile/ProfileLogic";
import { AuthnLogic, SolidNamespace } from "../types";
import * as debug from "../util/debug";
import { UtilityLogic } from "../util/UtilityLogic";
import { CrossOriginForbiddenError, FetchError, NotFoundError, SameOriginForbiddenError, UnauthorizedError } from "./CustomError";
/*
** It is important to distinquish `fetch`, a function provided by the browser
** and `Fetcher`, a helper object for the rdflib Store which turns it
** into a `ConnectedStore` or a `LiveStore`.  A Fetcher object is
** available at store.fetcher, and `fetch` function at `store.fetcher._fetch`,
*/

const ns: SolidNamespace = solidNamespace(rdf);

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
    underlyingFetch: { fetch: (url: string, options?: any) => any };

    chat: ChatLogic;
    profile: ProfileLogic;
    authn: AuthnLogic;
    util: UtilityLogic;

    constructor(fetcher: { fetch: (url: any, requestInit: any) => any }, session: Session) {
  // would xpect to be able to do it this way: but get TypeError:  Failed to execute 'fetch' on 'Window': Illegal invocation status: 999
        // this.store = new rdf.LiveStore({})
        // this.store.fetcher._fetch = fetch

        this.store = rdf.graph() as LiveStore; // Make a Quad store
        rdf.fetcher(this.store, fetch); // Attach a web I/O module, store.fetcher
        this.store.updater = new rdf.UpdateManager(this.store); // Add real-time live updates store.updater

        this.store.features = [] // disable automatic node merging on store load
        this.cache = {
        profileDocument: {},
        preferencesFile: {},
        };
        this.underlyingFetch = { fetch: fetch };
        this.authn = new SolidAuthnLogic(session);
        debug.log('SolidAuthnLogic initialized')
        this.profile = new ProfileLogic(this.store, ns, this.authn);
        this.chat = new ChatLogic(this.store, ns, this.profile);
        this.util = new UtilityLogic(this.store, ns, this.underlyingFetch);
    }

    findAclDocUrl(url: string) {
        return this.util.findAclDocUrl(url);
    }

    async loadProfile(me: NamedNode): Promise<NamedNode> {
        /*
      // console.log('loadProfile cache ', this.cache)
        if (this.cache.profileDocument[me.value]) {
        return this.cache.profileDocument[me.value];
      }    @@ just use the cache in the store
        */
        console.log('loadProfile  me ', me)
        const profileDocument = me.doc()
        try {
          await this.store.fetcher.load(profileDocument);
          return profileDocument;
        } catch (err) {
        const message = `Cannot load profile ${profileDocument} : ${err}`;
        throw new Error(message);
        }
    }

    async loadPreferences(me: NamedNode): Promise<NamedNode> {
        console.log('loadPreferences cache ', this.cache)
        if (this.cache.preferencesFile[me.value]) {
        return this.cache.preferencesFile[me.value];
        }
        await this.loadProfile(me) // Load pointer to pref file
        const preferencesFile = this.store.any(me, ns.space('preferencesFile'), null, me.doc());

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

    getRegistrations(instance, theClass) {
        return this.store
        .each(undefined, ns.solid("instance"), instance)
        .filter((r) => {
            return this.store.holds(r, ns.solid("forClass"), theClass);
        });
    }

    load(doc: NamedNode | NamedNode[] | string) {
        return this.store.fetcher.load(doc);
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
        return this.util.isContainer(url);
    }

    getContainerElements(containerNode: NamedNode): NamedNode[] {
        return this.util.getContainerElements(containerNode);
    }

    getContainerMembers(containerUrl: string): Promise<string[]> {
        return this.util.getContainerMembers(containerUrl);
    }

    async recursiveDelete(url: string) {
        return this.util.recursiveDelete(url);
    }

    clearStore() {
        return this.util.clearStore();
    }

    async fetch(url: string, options?: any) {
        return this.underlyingFetch.fetch(url, options);
    }
}
