import { namedNode, NamedNode, sym } from 'rdflib'
import { appContext, offlineTestID } from './authUtil'
import * as debug from '../util/debug'
import {
  effectiveIdentity,
  restoreSession,
  sessionOwnsIdentity,
  sessionWasCleared,
  subscribeIdentity,
  type IdentitySubscription,
  type SessionLike
} from '../authSession/identityState'
import type { SessionWithLegacyEvents } from '../authSession/authSession'
import type { AuthenticationContext, AuthnLogic } from '../types'

// Some auth clients (uvdsl worker-backed session) only settle restore() on
// a worker message; a missing/unreachable RefreshWorker asset makes it hang
// forever. This caps the wait so the login UI can never spin indefinitely.
const SESSION_RESTORE_TIMEOUT_MS = 5000

/**
 * Await a session restore promise, but give up after
 * SESSION_RESTORE_TIMEOUT_MS and resolve with undefined so callers can
 * treat a stalled restore as "no previous session".
 */
async function withRestoreTimeout<T> (promise: Promise<T> | null): Promise<T | undefined> {
  if (promise === null) return undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<undefined>(resolve => {
    timer = setTimeout(() => resolve(undefined), SESSION_RESTORE_TIMEOUT_MS)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

export class SolidAuthnLogic implements AuthnLogic {
  private session: SessionWithLegacyEvents
  private checkUserInFlight: Promise<NamedNode | null> | null = null
  private sessionRestoreHookAttached = false
  /**
   * This instance's subscription to the session's identity state. Its lifetime
   * IS this instance's: a cookie probe that answers after `dispose()` is
   * ignored, and the refocus listener is removed with the last instance using
   * the session (see identityState.ts).
   */
  private identity: IdentitySubscription

  constructor (solidAuthSession: SessionWithLegacyEvents) {
    this.session = solidAuthSession
    // The cookie-backed identity is invisible to the session (it stays inactive
    // and WebID-less), so it is re-probed when the tab regains focus: another
    // tab may have logged out or switched identity while this one was
    // backgrounded. Only meaningful where the probe applies (*.localhost NSS).
    //
    // TEMPORARY, pending the uvdsl change: this subscription exists because the
    // library does not report a cookie identity change (nor a WebID change that
    // keeps the session active). See the identityState header.
    this.identity = subscribeIdentity(solidAuthSession as unknown as SessionLike, {
      onRefocus: () => this.refreshCookieBackedFallback()
    })
  }

  /**
   * Detaches this instance from the session's identity state: the refocus
   * listener is removed with the last instance using the session, and a probe
   * that is still in flight can no longer apply its result.
   */
  dispose (): void {
    this.identity.unsubscribe()
  }

  /**
   * Re-probes the NSS cookie-backed identity. Skipped while the session owns
   * the identity — the probe only exists for the case where it does not — and
   * the state drops the result if the session takes ownership while the probe
   * is in flight.
   */
  private async refreshCookieBackedFallback (): Promise<void> {
    if (sessionOwnsIdentity(this.session as unknown as SessionLike)) return
    this.identity.reportCookieIdentity(await this.probeNssCookieBackedWebId())
  }

  // we created authSession getter because we want to access it as authn.authSession externally
  get authSession (): SessionWithLegacyEvents { return this.session }

  currentUser (): NamedNode | null {
    const app = appContext()
    if (app.viewingNoAuthPage) {
      return sym(app.webId)
    }
    // The state answers with the session's identity when it owns one, the
    // probed cookie identity when the session is inactive (or cleared), and
    // nothing when neither does — a logout that retains the cached WebID must
    // not keep answering for the previous user.
    const { webId } = effectiveIdentity(this.session as unknown as SessionLike)
    return webId ? sym(webId) : offlineTestID() // null unless testing
  }

  /**
   * Retrieves currently logged in webId from either
   * defaultTestUser or SolidAuth
   * Also activates a session after login
   * @param [setUserCallback] Optional callback
   * @returns Resolves with webId uri, if no callback provided
   */
  async checkUser<T> (
    setUserCallback?: (me: NamedNode | null) => T
  ): Promise<NamedNode | T | null> {
    // Save hash for "restorePreviousSession"
    const preLoginRedirectHash = new URL(window.location.href).hash
    if (preLoginRedirectHash) {
      window.localStorage.setItem('preLoginRedirectHash', preLoginRedirectHash)
    }
    const sessionAny = this.session as any
    if (!this.sessionRestoreHookAttached && typeof sessionAny?.events?.on === 'function') {
      // Backward-compatible hook for auth clients exposing an EventEmitter-style API.
      sessionAny.events.on('sessionRestore', (url: string) => {
        debug.log(`Session restored to ${url}`)
        if (document.location.toString() !== url) history.replaceState(null, '', url)
      })
      this.sessionRestoreHookAttached = true
    }

    if (!this.checkUserInFlight) {
      this.checkUserInFlight = this.resolveCurrentUser()
    }

    const inFlight = this.checkUserInFlight
    let me: NamedNode | null
    try {
      me = await inFlight
    } finally {
      if (this.checkUserInFlight === inFlight) {
        this.checkUserInFlight = null
      }
    }

    return Promise.resolve(setUserCallback ? setUserCallback(me) : me)
  }

  private async resolveCurrentUser (): Promise<NamedNode | null> {
    const sessionAny = this.session as any

    /**
     * Handle a successful authentication redirect
     */
    const redirectUrl = new URL(window.location.href)
    redirectUrl.hash = ''
    if (typeof sessionAny?.handleIncomingRedirect === 'function') {
      await sessionAny.handleIncomingRedirect({
        restorePreviousSession: true,
        url: redirectUrl.href
      })
    } else {
      // uvdsl-style session (no handleIncomingRedirect): restore then handle redirect.
      //
      // The worker-backed session (WebWorkerSession) resolves restore() ONLY
      // when the SharedWorker posts a message back. If the worker asset can't
      // be fetched — local/dev servers that don't serve the RefreshWorker
      // chunk at the resolved URL, wrong MIME type, CSP, or a worker that
      // fails before `onconnect` — the promise never settles and the login
      // UI would spin forever. Race it against a timeout and treat a stall
      // as "no previous session" so the page can render the login button.
      const wasActive = sessionAny?.isActive ?? Boolean(sessionAny?.webId)
      // The shared restore lock also covers this call: a refocus resync can be
      // in flight at the same time, and two overlapping restores could write an
      // older identity back over a newer one.
      const restoring = restoreSession(sessionAny)
      if (restoring) {
        try {
          await withRestoreTimeout(restoring)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          // A failed restore on an inactive session just means "no usable
          // session to restore" — whether that's "No session to restore.",
          // a stale refresh token / dead client_id returning HTTP 400, or a
          // missing session database. Never let it block the login UI: log
          // and continue as logged-out so the page renders the login button.
          // Only re-throw when the session actually became active, which is
          // an unexpected refresh failure worth surfacing.
          const isNowActive = sessionAny?.isActive ?? Boolean(sessionAny?.webId)
          if (isNowActive && !/no session to restore/i.test(message)) {
            throw error
          }
          debug.log(`Session restore failed, continuing logged-out: ${message}`)
        }
        const isNowActive = sessionAny?.isActive ?? Boolean(sessionAny?.webId)
        if (!wasActive && isNowActive) {
          sessionAny.events?.emit('sessionRestore', window.location.href)
        }
      }
      if (typeof sessionAny?.handleRedirectFromLogin === 'function') {
        const wasActive = sessionAny?.isActive ?? Boolean(sessionAny?.webId)
        await sessionAny.handleRedirectFromLogin()
        const isNowActive = sessionAny?.isActive ?? Boolean(sessionAny?.webId)
        if (!wasActive && isNowActive) {
          sessionAny.events?.emit('login')
        }
      }
    }

    // Check to see if a hash was stored in local storage
    const postLoginRedirectHash = window.localStorage.getItem('preLoginRedirectHash')
    if (postLoginRedirectHash) {
      const curUrl = new URL(window.location.href)
      if (curUrl.hash !== postLoginRedirectHash) {
        if (history.pushState) {
          // debug.log('Setting window.location.has using pushState')
          history.pushState(null, document.title, postLoginRedirectHash)
        } else {
          // debug.warn('Setting window.location.has using location.hash')
          location.hash = postLoginRedirectHash
        }
        curUrl.hash = postLoginRedirectHash
      }
      // See https://stackoverflow.com/questions/3870057/how-can-i-update-window-location-hash-without-jumping-the-document
      // window.location.href = curUrl.toString()// @@ See https://developer.mozilla.org/en-US/docs/Web/API/Window/location
      window.localStorage.setItem('preLoginRedirectHash', '')
    }

    // Check to see if already logged in / have the WebID
    let me = offlineTestID()
    if (me) {
      return me
    }

    let webId = this.webIdFromSession(sessionAny?.info, sessionAny)
    if (!webId) {
      // NSS-specific fallback: recover the WebID from the NSS cookie session
      // when the client restore is empty. The result goes through the identity
      // state, which drops it if the session took ownership while the probe was
      // in flight (or if this instance was disposed meanwhile) — and reports the
      // change like any other transition.
      this.identity.reportCookieIdentity(await this.probeNssCookieBackedWebId())
      webId = effectiveIdentity(sessionAny).webId ?? null
    }

    if (webId) {
      me = this.saveUser(webId)
    }

    if (me) {
      debug.log(`(Logged in as ${me} by authentication)`)
    }

    return me
  }

  private async probeNssCookieBackedWebId (): Promise<string | null> {
    if (typeof window === 'undefined') {
      return null
    }

    const { hostname, port, protocol } = window.location
    const localhostSuffix = '.localhost'
    // NSS local pods use subdomains like alice.localhost.
    if (!hostname.endsWith(localhostSuffix)) {
      return null
    }

    const podName = hostname.slice(0, -localhostSuffix.length)
    if (!podName || podName === 'localhost' || podName.includes('.')) {
      return null
    }

    try {
      // NSS returns 403 on this account page when the cookie session is valid.
      const probeResponse = await fetch('/account/password/change', {
        credentials: 'include',
        redirect: 'manual',
        cache: 'no-store'
      })
      if (probeResponse.status !== 403) {
        return null
      }
      const origin = `${protocol}//${hostname}${port ? `:${port}` : ''}`
      return `${origin}/profile/card#me`
    } catch (_error) {
      return null
    }
  }

  /**
   * Saves `webId` in `context.me`
   * @param webId
   * @param context
   *
   * @returns Returns the WebID, after setting it
   */
  saveUser (
    webId: NamedNode | string | null,
    context?: AuthenticationContext
  ): NamedNode | null {
    let webIdUri: string
    if (webId) {
      webIdUri = (typeof webId === 'string') ? webId : webId.uri
      const me = namedNode(webIdUri)
      if (context) {
        context.me = me
      }
      return me
    }
    return null
  }

  /**
   * @returns {Promise<string|null>} Resolves with WebID URI or null
   */
  webIdFromSession (
    sessionInfo?: { webId?: string, isLoggedIn?: boolean },
    sessionRoot?: { webId?: string, isLoggedIn?: boolean, isActive?: boolean }
  ): string | null {
    const webId = sessionInfo?.webId || sessionRoot?.webId
    if (!webId) {
      return null
    }
    const infoLoggedIn = sessionInfo?.isLoggedIn
    const rootLoggedIn = sessionRoot?.isLoggedIn
    const rootActive = sessionRoot?.isActive
    // An explicit inactive/not-logged-in flag wins over a cached WebID and
    // over a positive flag in another source — the same rule the identity
    // state uses (see identityState.ts). The session root has no `isLoggedIn`
    // property, so requiring every source to be false kept a cached WebID
    // alive across a logout; a mixed snapshot must not resurrect one either. A
    // session whose backing store lost it is inactive as well, however
    // positive its own fields still look.
    if (sessionWasCleared(sessionRoot) ||
      infoLoggedIn === false || rootLoggedIn === false || rootActive === false) {
      return null
    }
    // Active, or a legacy session that reports no state at all.
    return webId
  }
}
