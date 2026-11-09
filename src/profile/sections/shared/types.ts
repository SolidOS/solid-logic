import { BlankNode, LiveStore, NamedNode, st } from 'rdflib'

export type RowStatus = 'existing' | 'new' | 'modified' | 'deleted'

export type MutationOps<T> = {
  create: T[]
  update: T[]
  remove: T[]
}

export type RdfStatement = ReturnType<typeof st>
export type RdfResourceNode = NamedNode | BlankNode

export type UpdateCallback = (_uri: string, ok: boolean, message?: string, response?: unknown) => void

export type WebOperationResponse = {
  ok?: boolean
  status?: number
  responseText?: string
}

export type RdfFetcher = {
  load?: (doc: NamedNode) => Promise<unknown>
  webOperation?: (...args: unknown[]) => Promise<WebOperationResponse>
}

export type MutationCapableStore = LiveStore
