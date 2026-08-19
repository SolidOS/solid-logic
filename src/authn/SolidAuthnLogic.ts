import { namedNode, NamedNode, sym } from 'rdflib'
import { appContext, offlineTestID } from './authUtil'
import * as debug from '../util/debug'
import type { SessionWithLegacyEvents } from '../authSession/authSession'
import type { AuthenticationContext, AuthnLogic } from '../types'

export class SolidAuthnLogic implements AuthnLogic {
  private session: SessionWithLegacyEvents
  private checkUserInFlight: Promise<NamedNode | null> | null = null
  private sessionRestoreHookAttached = false
  private fallbackWebId: string | null = null

  constructor(solidAuthSession: SessionWithLegacyEvents) {
    this.session = solidAuthSession
  }

  // we created authSession getter because we want to access it as authn.authSession externally
  get authSession(): SessionWithLegacyEvents { return this.session }

  currentUser(): NamedNode | null {
    const app = appContext()
    if (app.viewingNoAuthPage) {
      return sym(app.webId)
    }
    const sessionAny = this.session as any
    const infoWebId = sessionAny?.info?.webId
    const sessionWebId = sessionAny?.webId
    const webId = infoWebId || sessionWebId || this.fallbackWebId
    const infoLoggedIn = sessionAny?.info?.isLoggedIn
    const sessionActive = sessionAny?.isActive
    const isLoggedIn = infoLoggedIn === true || sessionActive === true ||
      ((infoLoggedIn == null && sessionActive == null) ? Boolean(webId) : false) ||
      Boolean(this.fallbackWebId)
    if (this && this.session && webId && isLoggedIn) {
      return sym(webId)
    }
    return offlineTestID() // null unless testing
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
      if (typeof sessionAny?.restore === 'function') {
        const wasActive = sessionAny?.isActive ?? Boolean(sessionAny?.webId)
        try {
          await sessionAny.restore()
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          if (!/no session to restore/i.test(message)) {
            throw error
          }
          debug.log('No previous session to restore')
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
      // NSS-specific fallback: recover WebID from NSS cookie session when client restore is empty.
      webId = await this.probeNssCookieBackedWebId()
    }

    if (webId) {
      this.fallbackWebId = webId
    } else {
      this.fallbackWebId = null
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
    if (infoLoggedIn === true || rootLoggedIn === true || rootActive === true) {
      return webId
    }
    if (infoLoggedIn === false && rootLoggedIn === false && rootActive === false) {
      return null
    }
    return webId
  }

}
