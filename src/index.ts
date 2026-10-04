// Make these variables directly accessible as it is what you need most of the time
// This also makes these variable globaly accesible in mashlib
import { solidLogicSingleton } from './logic/solidLogicSingleton'

const authn = solidLogicSingleton.authn
const authSession = solidLogicSingleton.authn.authSession
const store = solidLogicSingleton.store

export { ACL_LINK, ACCESS_ROLES } from './acl/aclLogic'
export type { AccessRole } from './acl/aclLogic'
export { offlineTestID, appContext } from './authn/authUtil'
export { performServerSideLogout } from './authn/serverLogout'
export { reloadOnIdentityReplaced } from './authSession/identityState'
export { getSuggestedIssuers } from './issuer/issuerLogic'
export { createTypeIndexLogic } from './typeIndex/typeIndexLogic'
export { createDirectoryLogic, DEFAULT_DIRECTORY_CATALOG_URL, DEFAULT_DIRECTORY_SOURCES } from './directory/directoryLogic'
export type { AccessControlSubjectKind, AccessControlSubject } from './acl/accessControlSubjects'
export type { AppDetails, SolidNamespace, AuthenticationContext, SolidLogic, ChatLogic, DirectoryLogic, DirectoryEntry, DirectorySearchOptions, DirectoryRelationshipLabel, DirectorySource } from './types'
export { UnauthorizedError, CrossOriginForbiddenError, SameOriginForbiddenError, NotFoundError, FetchError, NotEditableError, WebOperationError } from './logic/CustomError'

export {
  solidLogicSingleton, // solidLogicSingleton is exported entirely because it is used in solid-panes
  store,
  authn,
  authSession
}
