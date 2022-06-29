// Make these variables directly accessible as it is what you need most of the time
// This also makes these variable globaly accesible in mashlib
import { solidLogicSingleton } from './logic/solidLogicSingleton'
const authn = solidLogicSingleton.authn
const authSession = solidLogicSingleton.authn.authSession
const store = solidLogicSingleton.store

export {
  findAclDocUrl,
  setACLUserPublic,
  genACLText,
  ACL_LINK
} from './acl/aclLogic'

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
} from './typeIndex/typeIndexLogic'

export { offlineTestID, appContext } from './authn/authUtil'
export { createInboxFor, getNewMessages, markAsRead } from './inbox/inboxLogic'
export {
  followOrCreateLink,
  loadOrCreateIfNotExists,
  recursiveDelete,
  setSinglePeerAccess,
  createEmptyRdfDoc
} from './util/utilityLogic'

export {
  ensureLoadedPreferences,
  loadPreferences,
  loadPreferencesThrowErrors,
  loadProfile,
  loadMe,
  getPodRoot,
  getMainInbox,
  findStorage
} from './profile/profileLogic'

export { getSuggestedIssuers } from './issuer/issuerLogic'

export { SolidLogic } from './logic/SolidLogic'
export { AppDetails, SolidNamespace, AuthenticationContext } from './types'
// solidLogicSingleton is exported entirely because it is used in solid-panes
export { solidLogicSingleton } from './logic/solidLogicSingleton'
export { UnauthorizedError, CrossOriginForbiddenError, SameOriginForbiddenError, NotFoundError, FetchError } from './logic/CustomError'
export { authn, authSession, store }
