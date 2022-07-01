// Make these variables directly accessible as it is what you need most of the time
// This also makes these variable globaly accesible in mashlib
//import { solidLogicSingleton } from './logic/solidLogicSingleton'
//const authn = solidLogicSingleton.authn
//const authSession = solidLogicSingleton.authn.authSession
//const store = solidLogicSingleton.store

export {
  ACL_LINK
} from './acl/aclLogic'

export {
  findAclDocUrl,
  setACLUserPublic,
  genACLText,
} from './logic/solidLogicSingleton'

export {
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
  //NEW function for discovery
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
} from './logic/solidLogicSingleton'

export {
  setAcl,
  addToPrivateTypeIndex,
  findChat,
  createChatThing,
  getChat,
  sendInvite,
  mintNew
} from './logic/solidLogicSingleton'

export { offlineTestID, appContext } from './authn/authUtil'
export { createInboxFor, getNewMessages, markAsRead } from './logic/solidLogicSingleton'
export {
  recursiveDelete,
  setSinglePeerAccess,
  createEmptyRdfDoc,
  //NEW function for discovery
  followOrCreateLink,
  loadOrCreateIfNotExists,
} from './logic/solidLogicSingleton'

export {
  ensureLoadedPreferences,
  loadMe,
  getPodRoot,
  getMainInbox,
  findStorage,
   //NEW content from discovery
  loadPreferences,
  loadProfile,
  //NEW function for discovery
  silencedLoadPreferences
} from './logic/solidLogicSingleton'

export { getSuggestedIssuers } from './issuer/issuerLogic'

export {
    isContainer,
    createContainer,
    getContainerElements,
    getContainerMembers
} from './logic/solidLogicSingleton'

export { authn, authSession, store } from './logic/solidLogicSingleton'

//export { SolidLogic } from './logic/SolidLogic'
export { AppDetails, SolidNamespace, AuthenticationContext } from './types'
// solidLogicSingleton is exported entirely because it is used in solid-panes
//export { solidLogicSingleton } from './logic/solidLogicSingleton'
export { UnauthorizedError, CrossOriginForbiddenError, SameOriginForbiddenError, NotFoundError, FetchError, NotEditableError, WebOperationError } from './logic/CustomError'

