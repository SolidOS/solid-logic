// Make these variables directly accessible as it is what you need most of the time
// This also makes these variable globaly accesible in mashlib
import { solidLogicSingleton } from './logic/solidLogicSingleton'

const authn = solidLogicSingleton.authn
const authSession = solidLogicSingleton.authn.authSession
const store = solidLogicSingleton.store

export { ACL_LINK } from './acl/aclLogic'
export { offlineTestID, appContext } from './authn/authUtil'
export { getSuggestedIssuers } from './issuer/issuerLogic'
export { createTypeIndexLogic } from './typeIndex/typeIndexLogic'
export { AppDetails, SolidNamespace, AuthenticationContext, SolidLogic } from './types'
export { UnauthorizedError, CrossOriginForbiddenError, SameOriginForbiddenError, NotFoundError, FetchError, NotEditableError, WebOperationError } from './logic/CustomError'

export {
  solidLogicSingleton, // solidLogicSingleton is exported entirely because it is used in solid-panes
  store,
  authn,
  authSession
}

