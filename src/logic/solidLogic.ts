import { Session } from '@inrupt/solid-client-authn-browser'
import * as rdf from 'rdflib'
import { LiveStore, NamedNode, Statement } from 'rdflib'
import { createAclLogic } from '../acl/aclLogic'
import { SolidAuthnLogic } from '../authn/SolidAuthnLogic'
import { createChatLogic } from '../chat/chatLogic'
import { createInboxLogic } from '../inbox/inboxLogic'
import { createProfileLogic } from '../profile/profileLogic'
import { createTypeIndexLogic } from '../typeIndex/typeIndexLogic'
import { createContainerLogic } from '../util/containerLogic'
import { createUtilityLogic } from '../util/utilityLogic'
import { AuthnLogic, SolidLogic } from '../types'
import * as debug from '../util/debug'
/*
** It is important to distinquish `fetch`, a function provided by the browser
** and `Fetcher`, a helper object for the rdflib Store which turns it
** into a `ConnectedStore` or a `LiveStore`.  A Fetcher object is
** available at store.fetcher, and `fetch` function at `store.fetcher._fetch`,
*/
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createSolidLogic(specialFetch: { fetch: (url: any, requestInit: any) => any }, session: Session): SolidLogic {

    debug.log('SolidLogic: Unique instance created.  There should only be one of these.')
    const store: LiveStore = rdf.graph() as LiveStore
    rdf.fetcher(store, {fetch: specialFetch.fetch}) // Attach a web I/O module, store.fetcher
    store.updater = new rdf.UpdateManager(store) // Add real-time live updates store.updater
    store.features = [] // disable automatic node merging on store load

    const authn: AuthnLogic = new SolidAuthnLogic(session)
    
    const acl = createAclLogic(store)
    const containerLogic = createContainerLogic(store)
    const utilityLogic = createUtilityLogic(store, acl, containerLogic)
    const profile = createProfileLogic(store, authn, utilityLogic)
    const chat = createChatLogic(store, profile)
    const inbox = createInboxLogic(store, profile, utilityLogic, containerLogic, acl)
    const typeIndex = createTypeIndexLogic(store, authn, profile, utilityLogic)
    debug.log('SolidAuthnLogic initialized')

    function load(doc: NamedNode | NamedNode[] | string) {
        return store.fetcher.load(doc)
    }

    // @@@@ use the one in rdflib.js when it is available and delete this
    function updatePromise(
        del: Array<Statement>,
        ins: Array<Statement> = []
    ): Promise<void> {
        return new Promise((resolve, reject) => {
        store.updater.update(del, ins, function (_uri, ok, errorBody) {
            if (!ok) {
            reject(new Error(errorBody))
            } else {
            resolve()
            }
        }) // callback
        }) // promise
    }

    function clearStore() {
        store.statements.slice().forEach(store.remove.bind(store))
    }

    return {
        store,
        authn,
        acl,
        inbox,
        chat,
        profile,
        typeIndex,
        load,
        updatePromise,
        clearStore
    }
}
