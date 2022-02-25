import { Session } from "@inrupt/solid-client-authn-browser"
import { NamedNode } from "rdflib"

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

interface NewPaneOptions {
    me?: NamedNode;
    newInstance?: NamedNode;
    newBase: string;
}

interface CreatedPaneOptions {
newInstance: NamedNode;
}