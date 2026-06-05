/**
 * OIDC session factory.
 *
 * Everything needed to create and configure the underlying auth session:
 *   - Session database backends (in-memory and IndexedDB)
 *   - Session instantiation (WebSession or SessionCore, with local-dev
 *     fallbacks for environments where the service worker can't load)
 *   - Login compatibility shim that normalises legacy call-site signatures
 *     and resolves the canonical issuer through /.well-known discovery
 *
 * The raw session instance (_session) is consumed by authSession.ts where
 * the legacy event layer and logout listener are attached.
 *
 * DO NOT import _session directly — always go through authSession.ts so
 * the event wiring is guaranteed to run.
 */

import {
  Session as WebSession,
} from '@uvdsl/solid-oidc-client-browser'
import * as OidcCore from '@uvdsl/solid-oidc-client-browser/core'
import type { Session as OidcSession, SessionDatabase } from '@uvdsl/solid-oidc-client-browser/core'

// ---------------------------------------------------------------------------
// Session databases
// ---------------------------------------------------------------------------

export class MemorySessionDatabase implements SessionDatabase {
  private readonly map = new Map<string, any>()

  private shouldPreserveExistingRefreshToken(id: string, value: any): boolean {
    return id === 'refresh_token' && (value == null || value === '') && this.map.has(id)
  }

  async init (): Promise<SessionDatabase> {
    return this
  }

  async setItem (id: string, value: any): Promise<void> {
    // Some Solid IdPs do not include refresh_token on refresh responses.
    // Keep the previous token instead of overwriting it with null/undefined.
    if (this.shouldPreserveExistingRefreshToken(id, value)) {
      return
    }
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

export class IndexedDbSessionDatabase implements SessionDatabase {
  private db: IDBDatabase | null = null
  private readonly dbName = 'soidc'
  private readonly storeName = 'session'
  private readonly dbVersion = 1

  private async shouldPreserveExistingRefreshToken(id: string, value: any): Promise<boolean> {
    if (id !== 'refresh_token' || !(value == null || value === '')) {
      return false
    }
    const existing = await this.getItem(id)
    return existing != null && existing !== ''
  }

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
    // Some Solid IdPs do not include refresh_token on refresh responses.
    // Keep the previous token instead of overwriting it with null/undefined.
    if (await this.shouldPreserveExistingRefreshToken(id, value)) {
      return
    }
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
      let result: any = null

      tx.onerror = () => reject(tx.error ?? request.error)
      tx.onabort = () => reject(tx.error ?? request.error ?? new Error('IndexedDB transaction aborted'))
      tx.oncomplete = () => resolve(result)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        result = request.result ?? null
      }
    })
  }
}

// ---------------------------------------------------------------------------
// Session instantiation
// ---------------------------------------------------------------------------

function getSessionCoreCtor (): (new (...args: any[]) => OidcSession) | null {
  const coreAny = OidcCore as any
  const candidate = coreAny.SessionCore ?? coreAny.default?.SessionCore ?? coreAny.default

  if (typeof candidate !== 'function') {
    return null
  }

  return candidate as new (...args: any[]) => OidcSession
}

const SessionCoreCtor = getSessionCoreCtor()

function createSession (): OidcSession {
  const shouldSkipWorkerInLocalDev = typeof window !== 'undefined' && (() => {
    const host = window.location.hostname
    // In local NSS setups (including subdomain mode like alice.localhost),
    // worker-based session storage can be brittle and lose state on reload.
    // Prefer SessionCore + IndexedDB for deterministic persistence.
    return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost')
  })()

  if (shouldSkipWorkerInLocalDev) {
    if (SessionCoreCtor) {
      return new SessionCoreCtor(undefined, { database: new IndexedDbSessionDatabase() })
    }
    return new WebSession()
  }

  try {
    return new WebSession()
  } catch (error) {
    // In some deployments, worker URL resolution can become file:// and fail cross-origin.
    // Fall back to SessionCore so auth still works without background refresh worker.
    // Use IndexedDB to keep refresh-token persistence across page reloads.
    console.warn('solid-logic: falling back to non-worker auth session:', error)
    try {
      if (SessionCoreCtor) {
        return new SessionCoreCtor(undefined, { database: new IndexedDbSessionDatabase() })
      }
      return new WebSession()
    } catch (dbError) {
      console.warn('solid-logic: IndexedDB unavailable, using in-memory session database:', dbError)
      if (SessionCoreCtor) {
        return new SessionCoreCtor(undefined, { database: new MemorySessionDatabase() })
      }
      return new WebSession()
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton session
// ---------------------------------------------------------------------------

const _session = createSession()

export { _session }
