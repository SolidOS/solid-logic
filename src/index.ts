// Make these variables directly accessible as it is what you need most of the time
// This also makes these variable globaly accesible in mashlib
import { solidLogicSingleton } from './logic/solidLogicSingleton'
const authn = solidLogicSingleton.authn
const authSession = solidLogicSingleton.authn.authSession
const store = solidLogicSingleton.store

const chat = solidLogicSingleton.chat
const profile = solidLogicSingleton.profile
const typeIndex = solidLogicSingleton.typeIndex
const inbox = solidLogicSingleton.inbox
const container = solidLogicSingleton.container

export {
  findAclDocUrl,
  setACLUserPublic,
  genACLText,
  ACL_LINK
} from './acl/aclLogic'

export {
  ensureTypeIndexes,
  loadTypeIndexes,
  getRegistrations,
  registerInTypeIndex,
  loadIndex,
  loadTypeIndexesFor,
  loadCommunityTypeIndexes,
  loadAllTypeIndexes,
  getScopedAppInstances,
  getAppInstances
} from './typeIndex/typeIndexLogic'

export { offlineTestID, appContext } from './authn/authUtil'
export { createInboxFor } from './inbox/inboxLogic'
export {
  followOrCreateLink,
  loadOrCreateIfNotExists,
  recursiveDelete,
  setSinglePeerAccess
} from './util/utilityLogic'

export {
  ensureLoadedPreferences,
  loadPreferences,
  loadPreferencesNEW,
  loadProfile,
  loadProfileNEW
} from './profile/profileLogic'

export { SolidLogic } from './logic/SolidLogic'
export { getSuggestedIssuers } from './issuer/issuerLogic'
export { AppDetails, SolidNamespace, AuthenticationContext } from './types'
// solidLogicSingleton is exported entirely because it is used in solid-panes
export { solidLogicSingleton } from './logic/solidLogicSingleton'
export { UnauthorizedError, CrossOriginForbiddenError, SameOriginForbiddenError, NotFoundError, FetchError } from './logic/CustomError'
export { authn, authSession, store, chat, profile, typeIndex, inbox, container }
