// Make these variables directly accessible as it is what you need most of the time
// This also makes these variable globaly accesible in mashlib
import { solidLogicSingleton } from './logic/solidLogicSingleton'

const authn = solidLogicSingleton.authn
const authSession = solidLogicSingleton.authn.authSession
const store = solidLogicSingleton.store

export { ACL_LINK, ACCESS_ROLES, PUBLIC_ACCESS_ROLES, Authenticated, Public } from './acl/aclLogic'
export type { AccessRole, PublicAccessRole } from './acl/aclLogic'
export { offlineTestID, appContext } from './authn/authUtil'
export { performServerSideLogout } from './authn/serverLogout'
export { reloadOnIdentityReplaced } from './authSession/identityState'
export { getSuggestedIssuers } from './issuer/issuerLogic'
export { createTypeIndexLogic } from './typeIndex/typeIndexLogic'
export { createDirectoryLogic, DEFAULT_DIRECTORY_CATALOG_URL, DEFAULT_DIRECTORY_SOURCES } from './directory/directoryLogic'
export { createProfileMutationService } from './profile/profileMutationService'
export type { BioMutationPlan, BioRow } from './profile/sections/bio/types'
export type { BioDetails } from './profile/sections/bio/types'
export type { ContactMutationPlan, ContactPointRow, ContactAddressRow, ContactInfo, PointDetails, AddressDetails } from './profile/sections/contactInfo/types'
export type { EducationMutationPlan, EducationRow, EducationDetails } from './profile/sections/education/types'
export type { HeadingMutationPlan, ProfileBasicRow, ProfileDetails } from './profile/sections/heading/types'
export type { LanguageMutationPlan } from './profile/sections/languages/mutations'
export type { LanguageRow, LanguageDetails } from './profile/sections/languages/types'
export type { ProjectMutationPlan, ProjectRow, ProjectDetails } from './profile/sections/projects/types'
export type { ResumeMutationPlan } from './profile/sections/resume/mutations'
export type { ResumeRow, RoleDetails, ResumeDetails } from './profile/sections/resume/types'
export type { SkillMutationPlan } from './profile/sections/skills/mutations'
export type { SkillRow, SkillDetails } from './profile/sections/skills/types'
export type { SocialMutationPlan, SocialRow, SocialPresentation, Account, SocialAccountOption } from './profile/sections/social/types'
export type { MutationOps, RowStatus, RdfStatement } from './profile/sections/shared/types'
export { isOriginUrl } from './acl/accessControlSubjects'
export type { AccessControlSubjectKind, AccessControlSubject } from './acl/accessControlSubjects'
export type { ACLContext, AccessMode, AccessSubject, Authorization, PatchPlan } from './types'
export type { AppDetails, SolidNamespace, AuthenticationContext, SolidLogic, ProfileLogic, ChatLogic, DirectoryLogic, DirectoryEntry, DirectorySearchOptions, DirectoryRelationshipLabel, DirectorySource, ProfileMutationService } from './types'
export { UnauthorizedError, CrossOriginForbiddenError, SameOriginForbiddenError, NotFoundError, FetchError, NotEditableError, WebOperationError } from './logic/CustomError'
export { documentDirectoryUri, isAbsoluteHttpUri } from './util/utils'

export {
  solidLogicSingleton, // solidLogicSingleton is exported entirely because it is used in solid-panes
  store,
  authn,
  authSession
}
