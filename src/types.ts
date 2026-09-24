import type { SessionWithLegacyEvents } from './authSession/authSession'
import { LiveStore, NamedNode, Statement } from 'rdflib'

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
    authSession: SessionWithLegacyEvents //this needs to be deprecated in the future. Is only here to allow imports like panes.UI.authn.authSession prior to moving authn from ui to logic
    currentUser: () => NamedNode | null
    checkUser: <T>(setUserCallback?: (me: NamedNode | null) => T) => Promise<NamedNode | T | null>
    saveUser: (webId: NamedNode | string | null,
        context?: AuthenticationContext) => NamedNode | null
    /**
     * Releases what the implementation registered elsewhere (document and
     * session listeners). Optional so other implementations stay valid, but a
     * caller that replaces a logic instance should dispose the old one.
     */
    dispose?: () => void
}

export interface SolidNamespace {
    [key: string]: (term: string) => NamedNode
}

export type TypeIndexScope = { label: string, index: NamedNode, agent: NamedNode }
export type ScopedApp = { instance: NamedNode, type: NamedNode, scope: TypeIndexScope }
export type TypeIndexVisibility = 'public' | 'private'

export interface NewPaneOptions {
    me?: NamedNode;
    newInstance?: NamedNode;
    newBase: string;
}

export interface CreatedPaneOptions {
newInstance: NamedNode;
}

export interface ChatLogic {
    setAcl: (chatContainer: NamedNode, me: NamedNode, invitee: NamedNode) => Promise<void>,
    addToPrivateTypeIndex: (chatThing, me) => void | Promise<void>,
    findChat: (invitee: NamedNode) => Promise<Chat>,
    createChatThing: (chatContainer: NamedNode, me: NamedNode) => Promise<NamedNode>,
    mintNew: (newPaneOptions: NewPaneOptions) => Promise<CreatedPaneOptions>,
    getChat: (invitee: NamedNode, boolean) => Promise<NamedNode | null>,
    sendInvite: (invitee: NamedNode, chatThing: NamedNode) => void
}

export interface Chat {
    me: NamedNode,
    chatContainer: NamedNode,
    exists: boolean
}

export interface ProfileLogic {
    silencedLoadPreferences: (user: NamedNode) => Promise<NamedNode | undefined>,
    loadPreferences: (user: NamedNode) => Promise<NamedNode>,
    loadProfile: (user: NamedNode) => Promise<NamedNode>,
    loadMe: () => Promise<NamedNode>,
    getPodRoot: (user: NamedNode) => NamedNode,
    getMainInbox: (user: NamedNode) => Promise<NamedNode>,
    findStorage: (me: NamedNode) => Node | null
}

export interface AclLogic {
    findAclDocUrl: (url: NamedNode) => Promise<string | undefined>,
    setACLUserPublic: (docURI: string, me: NamedNode,
        options: {
            defaultForNew?: boolean,
            public?: []
        }
    ) => Promise<NamedNode>,
    setACLUserOwnerOnly: (docURI: string, me: NamedNode,
        options: {
            defaultForNew?: boolean,
        }
    ) => Promise<NamedNode>,
    genACLText: (docURI: string, me: NamedNode, aclURI: string,
        options: {
            defaultForNew?: boolean,
            public?: []
        }
    ) => string | undefined
}

export interface InboxLogic {
    createInboxFor: (peerWebId: string, nick: string) => Promise<string>,
    getNewMessages: (user?: NamedNode) => Promise<NamedNode[]>,
    markAsRead: (url: string, date: Date) => void
}

export type ResourceDeleteOptions = {
    deleteTypeIndexes?: boolean,
}

export type ResourceAccess = {
    canEdit: boolean
    canControl: boolean
    isPublic: boolean
    canDelete: boolean
}

export type ResourceMetadata = {
    contentType: string | undefined
    access: ResourceAccess
    aclUri: string | undefined
    eTag: string | undefined
    modified: string | undefined
}

export interface ResourceLogic {
    recursiveDelete: (resource: NamedNode, options?: ResourceDeleteOptions) => Promise<any>,
    deleteResourceAndTypeIndexIfExists: (resource: NamedNode) => Promise<void>,
    moveToTrash: (resource: NamedNode) => Promise<void>,
    findTypeIndexRegistrations: (resource: NamedNode, visibility: TypeIndexVisibility) => Promise<NamedNode[]>,
    addToTypeIndex: (resource: NamedNode, visibility: TypeIndexVisibility, theClass: NamedNode) => Promise<NamedNode | null>,
    removeFromTypeIndex: (resource: NamedNode, visibility: TypeIndexVisibility) => Promise<boolean>,
    fetchMetadata: (subject: NamedNode) => Promise<ResourceMetadata>,
    createContainer: (url: string) => Promise<void>,
    isContainer: (resource: NamedNode) => boolean,
    isStorageRoot: (store: LiveStore, resource: NamedNode) => boolean,
    noHiddenFiles: (resource: NamedNode) => boolean,
    canAcceptUploads: (resource: NamedNode) => boolean,
    getContainerVisibleItemCount: (resource: NamedNode) => number,
    getContainerIndexThing: (container: NamedNode) => NamedNode,
    getContainerMintClass: (container: NamedNode) => NamedNode | undefined,
    loadContainerMintClass: (container: NamedNode) => Promise<NamedNode | undefined>,
    hasMintClassIndexDocument: (resource: NamedNode) => boolean,
    isPaneIndexDocument: (resource: NamedNode) => boolean,
    copyResource: (resource: NamedNode, targetUrl: string) => Promise<void>,
    moveResource: (resource: NamedNode, targetUrl: string) => Promise<void>
}

export interface TypeIndexLogic {
    getRegistrations: (instance, theClass) => Node[],
    loadTypeIndexesFor: (user: NamedNode) => Promise<Array<TypeIndexScope>>,
    loadExistingTypeIndexesFor: (user: NamedNode) => Promise<Array<TypeIndexScope>>,
    loadCommunityTypeIndexes: (user: NamedNode) => Promise<Array<TypeIndexScope>>,
    loadAllTypeIndexes: (user: NamedNode) => Promise<Array<TypeIndexScope>>,
    getScopedAppInstances: (klass: NamedNode, user: NamedNode) => Promise<ScopedApp[]>,
    getAppInstances: (klass: NamedNode) => Promise<NamedNode[]>,
    suggestPublicTypeIndex: (me: NamedNode) => NamedNode,
    suggestPrivateTypeIndex: (preferencesFile: NamedNode) => NamedNode,
    registerInTypeIndex: (instance: NamedNode, index: NamedNode, theClass: NamedNode) => Promise<NamedNode | null>,
    deleteTypeIndexRegistration: (item: any) => Promise<void>,
    findTypeIndexRegistrationsForResourceInScope: (resource: NamedNode, scope: TypeIndexScope) => NamedNode[],
    deleteTypeIndexRegistrationsForResourceInScope: (resource: NamedNode, scope: TypeIndexScope) => Promise<boolean>,
    deleteTypeIndexRegistrationForResource: (resource: NamedNode, user: NamedNode) => Promise<boolean>,
    getScopedAppsFromIndex: (scope: TypeIndexScope, theClass: NamedNode | null) => Promise<ScopedApp[]>,
}

export interface SolidLogic {
    store: LiveStore,
    authn: AuthnLogic,
    acl: AclLogic,
    resource: ResourceLogic,
    profile: ProfileLogic,
    inbox: InboxLogic,
    typeIndex: TypeIndexLogic,
    chat: ChatLogic,
    load: (doc: NamedNode | NamedNode[] | string) => void,
    updatePromise: (del: Array<Statement>, ins: Array<Statement>) => Promise<void>,
    clearStore: () => void
}
