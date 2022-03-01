// Make these variables directly accessible as it is what you need most of the time
// This also makes these variable globaly accesible in mashlib
import { solidLogicSingleton } from './logic/solidLogicSingleton'
const authn = solidLogicSingleton.authn
const authSession = solidLogicSingleton.authn.authSession
const store = solidLogicSingleton.store

const chat = solidLogicSingleton.chat
const profile = solidLogicSingleton.profile

export {
  setACLUserPublic,
  genACLText
} from './acl/aclLogic'
export {
  ensureTypeIndexes,
  loadTypeIndexes,
  registerInTypeIndex,
  loadIndex
} from './typeIndex/typeIndexLogic'
export { SolidLogic } from './logic/SolidLogic'
export { offlineTestID, appContext } from './authn/authUtil'
export { ACL_LINK } from './util/UtilityLogic'
export { getSuggestedIssuers } from './issuer/issuerLogic'
export { AppDetails, SolidNamespace, AuthenticationContext } from './types'
// solidLogicSingleton is exported entirely because it is used in solid-panes
export { solidLogicSingleton } from './logic/solidLogicSingleton'
export { UnauthorizedError, CrossOriginForbiddenError, SameOriginForbiddenError, NotFoundError, FetchError } from './logic/CustomError'
export { authn, authSession, store, chat, profile }
