
import { Fetcher, NamedNode, Store, UpdateManager } from "rdflib"
import * as debug from "./util/debug"
import {
  setACLUserPublic,
  genACLText
} from './acl/aclLogic'
import {
  ensureTypeIndexes,
  loadTypeIndexes,
  registerInTypeIndex,
  loadIndex
} from './typeIndex/typeIndex'
import { SolidLogic } from "./logic/SolidLogic"
import authSessionImport from './authn/authSession'
import { offlineTestID, appContext } from './util/authUtil'
import { UnauthorizedError, CrossOriginForbiddenError, SameOriginForbiddenError, NotFoundError, FetchError } from './logic/CustomError'
import { ACL_LINK } from './util/UtilityLogic'
import { getSuggestedIssuers } from './issuer/issuer'

const authSession = authSessionImport
const typeIndexLogic = {
  ensureTypeIndexes,
  loadTypeIndexes,
  registerInTypeIndex,
  loadIndex
}

const aclLogic = {
  setACLUserPublic,
  genACLText
}

const authUtil = { offlineTestID, appContext }

const solidLogicError = { UnauthorizedError, CrossOriginForbiddenError, SameOriginForbiddenError, NotFoundError, FetchError }

type AppDetails = {
  noun: string
  appPathSegment: string
}
type AuthenticationContext = {
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
interface AuthnLogic {
  currentUser: () => NamedNode | null
  checkUser: <T>(setUserCallback?: (me: NamedNode | null) => T) => Promise<NamedNode | T | null>
  saveUser: (webId: NamedNode | string | null,
    context?: AuthenticationContext) => NamedNode | null

}
interface SolidNamespace {
    [key: string]: (term: string) => NamedNode
}
interface ConnectedStore extends Store {
  fetcher: Fetcher;
}

interface LiveStore extends ConnectedStore {
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

const solidLogicSingleton = new SolidLogic({ fetch: fetcher }, authSession)

const authn = solidLogicSingleton.authn

// Make this directly accessible as it is what you need most of the time
const store = solidLogicSingleton.store
const kb = store // Very commonly used synonym of store - Knowledge Base

// export const authn = solidLogicSingleton.authn
const chat = solidLogicSingleton.chat

const profile = solidLogicSingleton.profile

debug.log('Unique quadstore initialized.')

export {
  authSession,
  typeIndexLogic,
  aclLogic,
  authUtil,
  ACL_LINK,
  getSuggestedIssuers,
  solidLogicError,
  solidLogicSingleton,
  authn,
  store,
  kb,
  chat,
  profile,
  SolidLogic, 
  AppDetails,
  LiveStore,
  SolidNamespace,
  AuthnLogic,
  AuthenticationContext
}
