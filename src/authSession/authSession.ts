import {
  Session as WebSession,
} from '@uvdsl/solid-oidc-client-browser'
import {
  SessionCore,
} from '@uvdsl/solid-oidc-client-browser/core'
import type { Session as OidcSession, SessionDatabase } from '@uvdsl/solid-oidc-client-browser/core'

type LegacyEventName = 'login' | 'logout' | 'sessionRestore'
type LegacyEventHandler = (...args: unknown[]) => void

/**
 * Minimal EventEmitter-style shim so that existing consumers using
 * `authSession.events.on('login' | 'logout' | 'sessionRestore', handler)`
 * continue working without modification.
 *
 * Events are emitted by SolidAuthnLogic.checkUser() (login/sessionRestore)
 * and by the sessionStateChange listener below (logout).
 */
export class SessionEvents {
  private readonly listeners: Map<string, Set<LegacyEventHandler>> = new Map()

  on (event: LegacyEventName, handler: LegacyEventHandler): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(handler)
  }

  off (event: LegacyEventName, handler: LegacyEventHandler): void {
    this.listeners.get(event)?.delete(handler)
  }

  emit (event: LegacyEventName, ...args: unknown[]): void {
    this.listeners.get(event)?.forEach(h => h(...args))
  }
}

type SessionCompatibilityShape = {
  webId?: string
  isActive?: boolean
  info?: {
    webId?: string
    isLoggedIn?: boolean
  }
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  authFetch?: (input: string | URL | Request, init?: RequestInit, dpopPayload?: any) => Promise<Response>
}

export type SessionWithLegacyEvents = OidcSession & SessionCompatibilityShape & { events: SessionEvents }

class MemorySessionDatabase implements SessionDatabase {
  private readonly map = new Map<string, any>()

  async init (): Promise<SessionDatabase> {
    return this
  }

  async setItem (id: string, value: any): Promise<void> {
    this.map.set(id, value)
  }

  async getItem (id: string): Promise<any> {
    return this.map.has(id) ? this.map.get(id) : null
  }

  async deleteItem (id: string): Promise<void> {
    this.map.delete(id)
  }

  async clear (): Promise<void> {
    this.map.clear()
  }

  close (): void {
    // No-op for in-memory database
  }
}

class IndexedDbSessionDatabase implements SessionDatabase {
  private db: IDBDatabase | null = null
  private readonly dbName = 'soidc'
  private readonly storeName = 'session'
  private readonly dbVersion = 1

  async init (): Promise<SessionDatabase> {
    if (this.db) return this

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName)
        }
      }
    })

    return this
  }

  async setItem (id: string, value: any): Promise<void> {
    await this.init()
    await this.withStore('readwrite', store => store.put(value, id))
  }

  async getItem (id: string): Promise<any> {
    await this.init()
    return this.withStore('readonly', store => store.get(id))
  }

  async deleteItem (id: string): Promise<void> {
    await this.init()
    await this.withStore('readwrite', store => store.delete(id))
  }

  async clear (): Promise<void> {
    await this.init()
    await this.withStore('readwrite', store => store.clear())
  }

  close (): void {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }

  private withStore(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<any>): Promise<any> {
    return new Promise<any>((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Session database not initialized'))
        return
      }

      const tx = this.db.transaction(this.storeName, mode)
      const store = tx.objectStore(this.storeName)
      const request = op(store)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result ?? null)
    })
  }
}

function resolveWorkerUrl (): string | URL | undefined {
  if (typeof window === 'undefined') return undefined

  const explicitWorkerUrl = (window as any).__SOLID_LOGIC_WORKER_URL__
  if (typeof explicitWorkerUrl === 'string' && explicitWorkerUrl.trim().length > 0) {
    return explicitWorkerUrl
  }
  if (explicitWorkerUrl instanceof URL) {
    return explicitWorkerUrl
  }

  try {
    // Default to same-origin sibling asset next to the current page URL.
    new URL('/RefreshWorker.js', window.location.origin).toString()
  } catch {
    return undefined
  }
}

function createSession (): OidcSession {
  try {
    const workerUrl = resolveWorkerUrl()
    return workerUrl
      ? new WebSession(undefined, { workerUrl })
      : new WebSession()
  } catch (error) {
    // In some deployments, worker URL resolution can become file:// and fail cross-origin.
    // Fall back to SessionCore so auth still works without background refresh worker.
    // Use IndexedDB to keep refresh-token persistence across page reloads.
    console.warn('solid-logic: falling back to non-worker auth session:', error)
    try {
      return new SessionCore(undefined, { database: new IndexedDbSessionDatabase() })
    } catch (dbError) {
      console.warn('solid-logic: IndexedDB unavailable, using in-memory session database:', dbError)
      return new SessionCore(undefined, { database: new MemorySessionDatabase() })
    }
  }
}

const _session = createSession()
const events = new SessionEvents()

// Emit the legacy 'logout' event when the session transitions from active to inactive.
// 'login' and 'sessionRestore' are emitted in SolidAuthnLogic.checkUser()
// because only that call site knows which path activated the session.
let _wasActive = false
if (typeof (_session as unknown as EventTarget).addEventListener === 'function') {
  ;(_session as unknown as EventTarget).addEventListener('sessionStateChange', () => {
    const isNowActive = (_session as any).isActive ?? Boolean((_session as any).webId)
    if (_wasActive && !isNowActive) {
      events.emit('logout')
    }
    _wasActive = isNowActive
  })
}

export const authSession: SessionWithLegacyEvents = Object.assign(_session, { events })

  
