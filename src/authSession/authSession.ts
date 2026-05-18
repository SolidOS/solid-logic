import { Session as UvdslSession, SessionIDB } from '@uvdsl/solid-oidc-client-browser'

/** Inrupt-shape `Session` API consumed by solid-logic + downstream panes,
 * backed by uvdsl's default `Session` (WebWorkerSession). */

export const EVENTS = { LOGIN: 'login', LOGOUT: 'logout', SESSION_RESTORED: 'sessionRestore' } as const
type Cb = (...args: any[]) => void

export class Session {
  private inner: UvdslSession | null = null
  private subs: Record<string, Set<Cb>> = {}
  readonly events = {
    on: (n: string, cb: Cb) => { (this.subs[n] ||= new Set()).add(cb) },
    off: (n: string, cb: Cb) => this.subs[n]?.delete(cb),
    removeListener: (n: string, cb: Cb) => this.subs[n]?.delete(cb),
  }
  private emit(n: string, ...a: any[]) {
    this.subs[n]?.forEach(cb => { try { cb(...a) } catch (_) {} })
  }
  private ensure(redirect?: string) {
    return this.inner ||= new UvdslSession(
      { client_name: 'SolidOS', redirect_uris: [redirect || location.origin + location.pathname] } as any,
      { database: new SessionIDB() } as any,
    )
  }

  get info() {
    const s = this.inner
    return { webId: s?.isActive ? s.webId : undefined, isLoggedIn: !!s?.isActive }
  }

  fetch = (input: RequestInfo | URL, init?: RequestInit) =>
    this.ensure().authFetch(input as any, init)

  async login(opts: { oidcIssuer: string; redirectUrl?: string }) {
    const r = opts.redirectUrl || location.href
    await this.ensure(r).login(opts.oidcIssuer, r)
  }

  async logout() { await this.ensure().logout(); this.emit('logout') }

  async handleIncomingRedirect(opts?: { restorePreviousSession?: boolean; url?: string }) {
    const url = new URL(opts?.url || location.href)
    const s = this.ensure()
    if (url.searchParams.has('code') && url.searchParams.has('state')) {
      await s.handleRedirectFromLogin()
      for (const k of ['code', 'state', 'iss']) url.searchParams.delete(k)
      try { history.replaceState(null, '', url.toString()) } catch (_) {}
      if (s.isActive) this.emit('login')
    } else if (opts?.restorePreviousSession !== false) {
      await s.restore()
      if (s.isActive) this.emit('sessionRestore', url.toString())
    }
  }
}

export const authSession = new Session()
