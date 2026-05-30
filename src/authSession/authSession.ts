import {
  Session as WebSession,
} from '@uvdsl/solid-oidc-client-browser'
import * as OidcCore from '@uvdsl/solid-oidc-client-browser/core'
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

class IndexedDbSessionDatabase implements SessionDatabase {
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

const _session = createSession()
const events = new SessionEvents()

const sessionAny = _session as any
const originalLogin = typeof sessionAny.login === 'function'
  ? sessionAny.login.bind(_session)
  : undefined

async function discoverIssuerFromWellKnown (issuer: string): Promise<string | null> {
  try {
    const issuerUrl = new URL(issuer)
    const wellKnownUrl = new URL('/.well-known/openid-configuration', issuerUrl.origin)
    const wellKnownResponse = await fetch(wellKnownUrl.toString(), { credentials: 'include' })
    if (!wellKnownResponse.ok) {
      return null
    }

    const wellKnownPayload = await wellKnownResponse.json()
    if (typeof wellKnownPayload?.issuer !== 'string' || !wellKnownPayload.issuer) {
      return null
    }

    return wellKnownPayload.issuer.replace(/\/$/, '')
  } catch (_err) {
    return null
  }
}

async function resolveIssuerForLogin (issuer: string): Promise<string> {
  // Prefer the issuer advertised by discovery; if app and issuer hosts still differ,
  // redirecting to the canonical issuer host is cleaner than rewriting the issuer here.
  const discoveredIssuer = await discoverIssuerFromWellKnown(issuer)
  if (discoveredIssuer) {
    return discoveredIssuer
  }
  return issuer
}

if (originalLogin) {
  // Keep compatibility with older call sites that pass an options object.
  sessionAny.login = async (idpOrOptions: any, redirectUri?: string) => {
    if (idpOrOptions && typeof idpOrOptions === 'object' && !Array.isArray(idpOrOptions)) {
      const oidcIssuer = idpOrOptions.oidcIssuer ?? idpOrOptions.idp ?? idpOrOptions.issuer
      const redirectUrl = idpOrOptions.redirectUrl ?? idpOrOptions.redirect_uri ?? idpOrOptions.redirectUri
      if (typeof oidcIssuer === 'string' && typeof redirectUrl === 'string') {
        return originalLogin(await resolveIssuerForLogin(oidcIssuer), redirectUrl)
      }
    }
    if (typeof idpOrOptions === 'string') {
      return originalLogin(await resolveIssuerForLogin(idpOrOptions), redirectUri)
    }
    return originalLogin(idpOrOptions, redirectUri)
  }
}

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

  