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
import ns from '../util/ns'

const _fetch = async (url, requestInit) => {
    const omitCreds = requestInit && requestInit.credentials && requestInit.credentials == 'omit'
    if (authSession.info.webId && !omitCreds) { // see https://github.com/solidos/solidos/issues/114
        // In fact fetch should respect credentials omit itself
        return authSession.fetch(url, requestInit)
    } else {
        return window.fetch(url, requestInit)
    }
}

//this const makes solidLogicSingleton global accessible in mashlib
//const solidLogicSingleton = new SolidLogic({ fetch: _fetch }, authSession)

debug.log("SolidLogic: Unique instance created.  There should only be one of these.")
const store = rdf.graph() as rdf.LiveStore; // Make a Quad store
rdf.fetcher(store, { fetch: _fetch}); // Attach a web I/O module, store.fetcher
store.updater = new rdf.UpdateManager(store); // Add real-time live updates store.updater
store.features = [] // disable automatic node merging on store load

const authn = new SolidAuthnLogic(authSession)

debug.log('SolidAuthnLogic initialized')

const {
    findAclDocUrl,
    setACLUserPublic,
    genACLText
} = createAclLogic(store)


const {
    setAcl,
    addToPrivateTypeIndex,
    findChat,
    createChatThing,
    getChat,
    sendInvite,
    mintNew
} = createChatLogic(store, ns)

const {
    createInboxFor,
    getNewMessages,
    markAsRead
} = createInboxLogic(store)

const {
    ensureLoadedPreferences,
    loadMe,
    getPodRoot,
    getMainInbox,
    findStorage,
    loadPreferences,
    loadProfile,
    silencedLoadPreferences
} = createProfileLogic(store, authn, ns)

const {
    ensureTypeIndexes,
    loadTypeIndexes,
    registerInTypeIndex,
    loadIndex,
    ensureOneTypeIndex,
    putIndex,
    makeIndexIfNecessary,
    loadIndexes,
    getTypeIndex,
    getRegistrations,
    loadTypeIndexesFor,
    loadCommunityTypeIndexes,
    loadAllTypeIndexes,
    getScopedAppInstances,
    getAppInstances,
    suggestPublicTypeIndex,
    suggestPrivateTypeIndex,
    registerInstanceInTypeIndex,
    deleteTypeIndexRegistration,
    getScopedAppsFromIndex
} = createTypeIndexLogic(store, authn)

const {
    isContainer,
    createContainer,
    getContainerElements,
    getContainerMembers
} = createContainerLogic(store)

const {
    recursiveDelete,
    setSinglePeerAccess,
    createEmptyRdfDoc,
    followOrCreateLink,
    loadOrCreateIfNotExists
} = createUtilityLogic(store)

debug.log('Unique quadstore initialized.')

export {
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
    loadTypeIndexes,
    registerInTypeIndex,
    loadIndex,
    ensureOneTypeIndex,
    putIndex,
    makeIndexIfNecessary,
    loadIndexes,
    getTypeIndex,
    getRegistrations,
    loadTypeIndexesFor,
    loadCommunityTypeIndexes,
    loadAllTypeIndexes,
    getScopedAppInstances,
    getAppInstances,
    suggestPublicTypeIndex,
    suggestPrivateTypeIndex,
    registerInstanceInTypeIndex,
    deleteTypeIndexRegistration,
    getScopedAppsFromIndex,
    //profileLogic
    ensureLoadedPreferences,
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

