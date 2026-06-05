/**
 * Legacy event compatibility layer.
 *
 * Pure EventEmitter-style shim — no side effects, no uvdsl dependencies.
 * Wired into the auth session by authSession.ts.
 */

type LegacyEventName = 'login' | 'logout' | 'sessionRestore'
type LegacyEventHandler = (...args: unknown[]) => void

/**
 * Minimal EventEmitter-style shim so that existing consumers using
 * `authSession.events.on('login' | 'logout' | 'sessionRestore', handler)`
 * continue working without modification.
 *
 * Events are emitted by SolidAuthnLogic.checkUser() (login/sessionRestore)
 * and by the sessionStateChange listener in authSession.ts (logout).
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

