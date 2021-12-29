
import { Fetcher, NamedNode, Store, UpdateManager } from "rdflib";
import * as debug from "./util/debug";
import {
  checkUser, // Async
  currentUser, // Sync
  // defaultTestUser, // Sync
  // filterAvailablePanes, // Async
  getSuggestedIssuers,
  ensureTypeIndexes,
  appContext,
  findAppInstances,
  findOriginOwner,
  getUserRoles, // Async
  loadTypeIndexes,
  // logIn,
  logInLoadProfile,
  logInLoadPreferences,
  // loginStatusBox,
  // newAppInstance,
  offlineTestID,
  registerInTypeIndex,
  // registrationControl,
  // registrationList,
  // selectWorkspace,
  setACLUserPublic,
  saveUser,
  authSession,
  // renderSignInPopup
} from './authn/authn'
import { SolidLogic } from "./logic/solidLogic";

export const authn = {
  checkUser, // Async
  currentUser, // Sync
  // defaultTestUser, // Sync
  // filterAvailablePanes, // Async
  getSuggestedIssuers,
  ensureTypeIndexes,
  appContext,
  findAppInstances,
  findOriginOwner,
  getUserRoles, // Async
  loadTypeIndexes,
  // logIn,
  logInLoadProfile,
  logInLoadPreferences,
  // loginStatusBox,
  // newAppInstance,
  offlineTestID,
  registerInTypeIndex,
  // registrationControl,
  // registrationList,
  // selectWorkspace,
  setACLUserPublic,
  saveUser,
  authSession,
  // renderSignInPopup
}
export { SolidLogic } from './logic/solidLogic'

export { ACL_LINK } from './util/UtilityLogic';

export type AppDetails = {
  noun: string
  appPathSegment: string
}

export type AuthenticationContext = {
  containers?: Array<NamedNode>
  div?: HTMLElement
  dom?: HTMLDocument
  index?: { [key: string]: Array<NamedNode> }
  instances?: Array<NamedNode>
  me?: NamedNode | null
  noun?: string
  preferencesFile?: NamedNode
  preferencesFileError?: string
  publicProfile?: NamedNode
  statusArea?: HTMLElement
}
export interface AuthnLogic {
  currentUser: () => NamedNode | null;
}
export interface SolidNamespace {
    [key: string]: (term: string) => NamedNode
}
interface ConnectedStore extends Store {
  fetcher: Fetcher;
}

export interface LiveStore extends ConnectedStore {
  updater: UpdateManager;
}

// code which used to be in solid.ui/logic
const fetcher = async (url, requestInit) => {
  if (authSession.info.webId) {
    return authSession.fetch(url, requestInit)
  } else {
    return window.fetch(url, requestInit)
  }
}

export const solidLogicSingleton = new SolidLogic({ fetch: fetcher }, authSession)

// Make this directly accessible as it is what you need most of the time
export const store = solidLogicSingleton.store
export const kb = store // Very commonly used synonym of store - Knowledge Base

// export const authn = solidLogicSingleton.authn
export const chat = solidLogicSingleton.chat

export const profile = solidLogicSingleton.profile

debug.log('Unique quadstore initialized.')