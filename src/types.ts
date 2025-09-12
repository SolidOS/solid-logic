import { Session } from '@inrupt/solid-client-authn-browser'
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
    authSession: Session //this needs to be deprecated in the future. Is only here to allow imports like panes.UI.authn.authSession prior to moving authn from ui to logic
    currentUser: () => NamedNode | null
    checkUser: <T>(setUserCallback?: (me: NamedNode | null) => T) => Promise<NamedNode | T | null>
    saveUser: (webId: NamedNode | string | null,
        context?: AuthenticationContext) => NamedNode | null
}

export interface SolidNamespace {
    [key: string]: (term: string) => NamedNode
}

export type TypeIndexScope = { label: string, index: NamedNode, agent: NamedNode }
export type ScopedApp = { instance: NamedNode, type: NamedNode, scope: TypeIndexScope }

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

export interface TypeIndexLogic {
    getRegistrations: (instance, theClass) => Node[],
    loadTypeIndexesFor: (user: NamedNode) => Promise<Array<TypeIndexScope>>,
    loadCommunityTypeIndexes: (user: NamedNode) => Promise<TypeIndexScope[][]>,
    loadAllTypeIndexes: (user: NamedNode) => Promise<Array<TypeIndexScope>>,
    getScopedAppInstances: (klass: NamedNode, user: NamedNode) => Promise<ScopedApp[]>,
    getAppInstances: (klass: NamedNode) => Promise<NamedNode[]>,
    suggestPublicTypeIndex: (me: NamedNode) => NamedNode,
    suggestPrivateTypeIndex: (preferencesFile: NamedNode) => NamedNode,
    registerInTypeIndex: (instance: NamedNode, index: NamedNode, theClass: NamedNode) => Promise<NamedNode | null>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    deleteTypeIndexRegistration: (item: any) => Promise<void>
    getScopedAppsFromIndex: (scope: TypeIndexScope, theClass: NamedNode | null) => Promise<ScopedApp[]>
}

export interface SolidLogic {
    store: LiveStore,
    authn: AuthnLogic,
    acl: AclLogic,
    profile: ProfileLogic,
    inbox: InboxLogic,
    typeIndex: TypeIndexLogic,
    chat: ChatLogic,
    load: (doc: NamedNode | NamedNode[] | string) => void,
    updatePromise: (del: Array<Statement>, ins: Array<Statement>) => Promise<void>,
    clearStore: () => void
}
