import { Fetcher, NamedNode, Store, UpdateManager } from "rdflib"

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

export interface SolidNamespace {
    [key: string]: (term: string) => NamedNode
}

interface ConnectedStore extends Store {
    fetcher: Fetcher;
}

export interface LiveStore extends ConnectedStore {
    updater: UpdateManager;
}
