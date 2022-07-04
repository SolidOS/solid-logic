import * as rdf from "rdflib"
import { SolidAuthnLogic } from "../authn/SolidAuthnLogic"
import { authSession } from "../authSession/authSession"
import { createContainerLogic } from "../util/containerLogic"
import { createTypeIndexLogic } from "../typeIndex/typeIndexLogic"
import * as debug from "../util/debug"
import { createUtilityLogic } from "../util/utilityLogic"
import { createProfileLogic } from "../profile/profileLogic"
import { createInboxLogic } from "../inbox/inboxLogic"
import { createChatLogic } from "../chat/chatLogic"
import { createAclLogic } from "../acl/aclLogic"

export function solidLogicSingleton() {
    
    const _fetch = async (url, requestInit) => {
        const omitCreds = requestInit && requestInit.credentials && requestInit.credentials == 'omit'
        if (authSession.info.webId && !omitCreds) { // see https://github.com/solidos/solidos/issues/114
            // In fact fetch should respect credentials omit itself
            return authSession.fetch(url, requestInit)
        } else {
            return window.fetch(url, requestInit)
        }
    }

    debug.log("SolidLogicSingleton: Unique instance created.  There should only be one of these.")

    const store = rdf.graph() as rdf.LiveStore; // Make a Quad store
    rdf.fetcher(store, { fetch: _fetch }); // Attach a web I/O module, store.fetcher
    store.updater = new rdf.UpdateManager(store); // Add real-time live updates store.updater
    store.features = [] // disable automatic node merging on store load

    debug.log('SolidAuthnLogic initialized')
    const authn = new SolidAuthnLogic(authSession)

    const aclLogic = createAclLogic(store)
    const {
        findAclDocUrl,
        setACLUserPublic,
        genACLText
    } = aclLogic

    const containerLogic = createContainerLogic(store)
    const {
        isContainer,
        createContainer,
        getContainerElements,
        getContainerMembers
    } = containerLogic

    const utilityLogic = createUtilityLogic(store, aclLogic, containerLogic)
    const {
        recursiveDelete,
        setSinglePeerAccess,
        createEmptyRdfDoc,
        followOrCreateLink,
        loadOrCreateIfNotExists
    } = utilityLogic

    const profileLogic = createProfileLogic(store, authn, utilityLogic)
    const {
        loadMe,
        getPodRoot,
        getMainInbox,
        findStorage,
        loadPreferences,
        loadProfile,
        silencedLoadPreferences
    } = profileLogic

    const chatLogic = createChatLogic(store, profileLogic)
    const {
        setAcl,
        addToPrivateTypeIndex,
        findChat,
        createChatThing,
        getChat,
        sendInvite,
        mintNew
    } = chatLogic

    const inboxLogic = createInboxLogic(store, profileLogic, utilityLogic, containerLogic, aclLogic)
    const {
        createInboxFor,
        getNewMessages,
        markAsRead
    } = inboxLogic

    const typeIndexLogic = createTypeIndexLogic(store, authn, profileLogic, utilityLogic)
    const {
        registerInTypeIndex,
        getRegistrations,
        loadTypeIndexesFor,
        loadCommunityTypeIndexes,
        loadAllTypeIndexes,
        getScopedAppInstances,
        getAppInstances,
        suggestPublicTypeIndex,
        suggestPrivateTypeIndex,
        deleteTypeIndexRegistration,
        getScopedAppsFromIndex
    } = typeIndexLogic

    return {
        store,
        authn,
        authSession,
        //unilityLogic
        recursiveDelete,
        setSinglePeerAccess,
        createEmptyRdfDoc,
        followOrCreateLink,
        loadOrCreateIfNotExists,
        //containerLogic
        isContainer,
        createContainer,
        getContainerElements,
        getContainerMembers,
        //typeIndexLogic
        registerInTypeIndex,
        getRegistrations,
        loadTypeIndexesFor,
        loadCommunityTypeIndexes,
        loadAllTypeIndexes,
        getScopedAppInstances,
        getAppInstances,
        suggestPublicTypeIndex,
        suggestPrivateTypeIndex,
        deleteTypeIndexRegistration,
        getScopedAppsFromIndex,
        //profileLogic
        loadMe,
        getPodRoot,
        getMainInbox,
        findStorage,
        loadPreferences,
        loadProfile,
        silencedLoadPreferences,
        //inboxLogic
        createInboxFor,
        getNewMessages,
        markAsRead,
        //chatLogic
        setAcl,
        addToPrivateTypeIndex,
        findChat,
        createChatThing,
        getChat,
        sendInvite,
        mintNew,
        //aclLogic
        findAclDocUrl,
        setACLUserPublic,
        genACLText
    }
}

/*export {
    store,
    authn,
    authSession,
    //unilityLogic
    recursiveDelete,
    setSinglePeerAccess,
    createEmptyRdfDoc,
    followOrCreateLink,
    loadOrCreateIfNotExists,
    //containerLogic
    isContainer,
    createContainer,
    getContainerElements,
    getContainerMembers,
    //typeIndexLogic
    ensureTypeIndexes,
    registerInTypeIndex,
    getRegistrations,
    loadTypeIndexesFor,
    loadCommunityTypeIndexes,
    loadAllTypeIndexes,
    getScopedAppInstances,
    getAppInstances,
    suggestPublicTypeIndex,
    suggestPrivateTypeIndex,
    deleteTypeIndexRegistration,
    getScopedAppsFromIndex,
    //profileLogic
    loadMe,
    getPodRoot,
    getMainInbox,
    findStorage,
    loadPreferences,
    loadProfile,
    silencedLoadPreferences,
    //inboxLogic
    createInboxFor,
    getNewMessages,
    markAsRead,
    //chatLogic
    setAcl,
    addToPrivateTypeIndex,
    findChat,
    createChatThing,
    getChat,
    sendInvite,
    mintNew,
    //aclLogic
    findAclDocUrl,
    setACLUserPublic,
    genACLText
}
*/
