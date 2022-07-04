import { Session } from "@inrupt/solid-client-authn-browser";
import * as rdf from "rdflib";
import { LiveStore, NamedNode, Statement } from "rdflib";
import { createAclLogic } from "../acl/aclLogic";
import { SolidAuthnLogic } from "../authn/SolidAuthnLogic";
import { createChatLogic } from "../chat/chatLogic";
import { createInboxLogic } from "../inbox/inboxLogic";
import { createProfileLogic } from "../profile/profileLogic";
import { createTypeIndexLogic } from "../typeIndex/typeIndexLogic";
import { createContainerLogic } from "../util/containerLogic";
import { createUtilityLogic } from "../util/utilityLogic";
import { AuthnLogic } from "../types";
import * as debug from "../util/debug";
/*
** It is important to distinquish `fetch`, a function provided by the browser
** and `Fetcher`, a helper object for the rdflib Store which turns it
** into a `ConnectedStore` or a `LiveStore`.  A Fetcher object is
** available at store.fetcher, and `fetch` function at `store.fetcher._fetch`,
*/
export class SolidLogic {

    store: LiveStore;
    me: string | undefined;
    authn: AuthnLogic;

    readonly acl
    readonly profile
    readonly inbox
    readonly typeIndex
    readonly chat
    private readonly containerLogic
    private readonly utilityLogic


    constructor(specialFetch: { fetch: (url: any, requestInit: any) => any }, session: Session) {
  // would xpect to be able to do it this way: but get TypeError:  Failed to execute 'fetch' on 'Window': Illegal invocation status: 999
        // this.store = new rdf.LiveStore({})
        // this.store.fetcher._fetch = fetch
        debug.log("SolidLogic: Unique instance created.  There should only be one of these.")
        this.store = rdf.graph() as LiveStore; // Make a Quad store
        rdf.fetcher(this.store, { fetch: specialFetch.fetch}); // Attach a web I/O module, store.fetcher
        this.store.updater = new rdf.UpdateManager(this.store); // Add real-time live updates store.updater
        this.store.features = [] // disable automatic node merging on store load
        
        this.authn = new SolidAuthnLogic(session)

        debug.log('SolidAuthnLogic initialized')

        this.acl = createAclLogic(this.store)
        this.containerLogic = createContainerLogic(this.store)
        this.utilityLogic = createUtilityLogic(this.store, this.acl, this.containerLogic)
        this.profile = createProfileLogic(this.store, this.authn, this.utilityLogic)
        this.chat = createChatLogic(this.store, this.profile)
        this.inbox = createInboxLogic(this.store, this.profile, this.utilityLogic, this.containerLogic, this.acl)
        this.typeIndex = createTypeIndexLogic(this.store, this.authn, this.profile, this.utilityLogic)
    }

    load(doc: NamedNode | NamedNode[] | string) {
        return this.store.fetcher.load(doc);
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

    clearStore() {
        this.store.statements.slice().forEach(this.store.remove.bind(this.store));
    }
}
