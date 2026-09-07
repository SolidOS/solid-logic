import * as rdf from 'rdflib'
import { LiveStore, NamedNode, Statement } from 'rdflib'
import { createAclLogic } from '../acl/aclLogic'
import { SolidAuthnLogic } from '../authn/SolidAuthnLogic'
import type { SessionWithLegacyEvents } from '../authSession/authSession'
import { createChatLogic } from '../chat/chatLogic'
import { createInboxLogic } from '../inbox/inboxLogic'
import { createResourceLogic } from '../resource/resourceLogic'
import { createProfileLogic } from '../profile/profileLogic'
import { createTypeIndexLogic } from '../typeIndex/typeIndexLogic'
import { createContainerLogic } from '../util/containerLogic'
import { createUtilityLogic } from '../util/utilityLogic'
import type { AuthnLogic, SolidLogic } from '../types'
import * as debug from '../util/debug'
/*
** It is important to distinquish `fetch`, a function provided by the browser
** and `Fetcher`, a helper object for the rdflib Store which turns it
** into a `ConnectedStore` or a `LiveStore`.  A Fetcher object is
** available at store.fetcher, and `fetch` function at `store.fetcher._fetch`,
*/
export function createSolidLogic(specialFetch: { fetch: (url: any, requestInit: any) => any }, session: SessionWithLegacyEvents): SolidLogic {

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
    const resource = createResourceLogic(store, acl, containerLogic, typeIndex)
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

    // A session usually activates after documents have already been fetched
    // anonymously. Those cached responses carry no write metadata, and rdflib will
    // not re-request a document it has already marked done, so `editable()` stays
    // unknown and every PATCH is refused. Dropping both lets the next load record
    // authenticated headers, so rdflib's own reload path recovers on its own.
    function invalidateAnonymousFetches() {
        const updater = store.updater as any
        if (typeof updater?.flagAuthorizationMetadata !== 'function') {
            return
        }

        updater.flagAuthorizationMetadata(store)

        const fetcher = store.fetcher as any
        const requested = fetcher?.requested as Record<string, unknown> | undefined
        if (!requested) {
            return
        }

        Object.entries(requested).forEach(([uri, state]) => {
            // rdflib stores in-flight requests as `true`; completed ones as
            // 'done', 'redirected', or a numeric status such as 403. Every
            // completed entry holds pre-auth metadata, so drop them all.
            if (state !== true) {
                delete requested[uri]
            }
        })
    }

    session.events?.on('login', invalidateAnonymousFetches)
    session.events?.on('sessionRestore', invalidateAnonymousFetches)

    return {
        store,
        authn,
        acl,
        resource,
        inbox,
        chat,
        profile,
        typeIndex,
        load,
        updatePromise,
        clearStore
    }
}
