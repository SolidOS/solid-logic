import {
  Session,
} from '@uvdsl/solid-oidc-client-browser'

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

export type SessionWithLegacyEvents = Session & { events: SessionEvents }

const _session = new Session()
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

  