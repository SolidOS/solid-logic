// Make these variables directly accessible as it is what you need most of the time
// This also makes these variable globaly accesible in mashlib
import { solidLogicSingleton } from './logic/solidLogicSingleton'

const authn = solidLogicSingleton.authn
const authSession = solidLogicSingleton.authn.authSession
const store = solidLogicSingleton.store

const aclLogic = solidLogicSingleton.aclLogic
const utilityLogic = solidLogicSingleton.utilityLogic
const containerLogic = solidLogicSingleton.containerLogic
const profileLogic = solidLogicSingleton.profileLogic
const inboxLogic = solidLogicSingleton.inboxLogic
const typeIndexLogic = solidLogicSingleton.typeIndexLogic
const chatLogic = solidLogicSingleton.chatLogic

const {
  findAclDocUrl,
  setACLUserPublic,
  genACLText,
} = aclLogic

const {
  registerInTypeIndex,
  getRegistrations,
  //NEW function for discovery
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

const {
  setAcl,
  addToPrivateTypeIndex,
  findChat,
  createChatThing,
  getChat,
  sendInvite,
  mintNew
} = chatLogic

const  { createInboxFor, getNewMessages, markAsRead } = inboxLogic
const {
  recursiveDelete,
  setSinglePeerAccess,
  createEmptyRdfDoc,
  //NEW function for discovery
  followOrCreateLink,
  loadOrCreateIfNotExists,
} = utilityLogic

const  {
  loadMe,
  getPodRoot,
  getMainInbox,
  findStorage,
   //NEW content from discovery
  loadPreferences,
  loadProfile,
  //NEW function for discovery
  silencedLoadPreferences
} = profileLogic

const {
  isContainer,
  createContainer,
  getContainerElements,
  getContainerMembers
} = containerLogic

export { ACL_LINK } from './acl/aclLogic'
export { offlineTestID, appContext } from './authn/authUtil'
export { getSuggestedIssuers } from './issuer/issuerLogic'
export { SolidLogic } from './logic/SolidLogic'
export { AppDetails, SolidNamespace, AuthenticationContext } from './types'
// solidLogicSingleton is exported entirely because it is used in solid-panes
export { solidLogicSingleton } from './logic/solidLogicSingleton'
export { UnauthorizedError, CrossOriginForbiddenError, SameOriginForbiddenError, NotFoundError, FetchError, NotEditableError, WebOperationError } from './logic/CustomError'

export {
  store,
  authn,
  authSession,
  aclLogic,
  utilityLogic,
  containerLogic,
  profileLogic,
  inboxLogic,
  typeIndexLogic,
  chatLogic,
  //aclLogic
  findAclDocUrl,
  setACLUserPublic,
  genACLText,
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
  setAcl,
  addToPrivateTypeIndex,
  findChat,
  createChatThing,
  getChat,
  sendInvite,
  //inboxLogic
  mintNew,
  createInboxFor,
  getNewMessages,
  markAsRead,
  //utilityLogic
  recursiveDelete,
  setSinglePeerAccess,
  createEmptyRdfDoc,
  followOrCreateLink,
  loadOrCreateIfNotExists,
  //profileLogic
  loadMe,
  getPodRoot,
  getMainInbox,
  findStorage,
  loadPreferences,
  loadProfile,
  silencedLoadPreferences,
  //containerLogic
  isContainer,
  createContainer,
  getContainerElements,
  getContainerMembers
}