import { namedNode, NamedNode, sym } from 'rdflib'
import { appContext, offlineTestID } from './authUtil'
import * as debug from '../util/debug'
import { SessionWithLegacyEvents } from '../authSession/authSession'
import { AuthenticationContext, AuthnLogic } from '../types'

export class SolidAuthnLogic implements AuthnLogic {
  private session: SessionWithLegacyEvents

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
    const webId = sessionAny?.info?.webId || sessionAny?.webId
    const isLoggedIn = sessionAny?.info?.isLoggedIn ?? sessionAny?.isActive ?? Boolean(webId)
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
    if (typeof sessionAny?.events?.on === 'function') {
      // Backward-compatible hook for auth clients exposing an EventEmitter-style API.
      sessionAny.events.on('sessionRestore', (url: string) => {
        debug.log(`Session restored to ${url}`)
        if (document.location.toString() !== url) history.replaceState(null, '', url)
      })
    }

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
      return Promise.resolve(setUserCallback ? setUserCallback(me) : me)
    }

    const webId = this.webIdFromSession(sessionAny?.info || sessionAny)
    if (webId) {
      me = this.saveUser(webId)
    }

    if (me) {
      debug.log(`(Logged in as ${me} by authentication)`)
    }

    return Promise.resolve(setUserCallback ? setUserCallback(me) : me)
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
  webIdFromSession (session?: { webId?: string, isLoggedIn?: boolean, isActive?: boolean }): string | null {
    const webId = session?.webId
    if (!webId) {
      return null
    }
    if (typeof session?.isLoggedIn === 'boolean') {
      return session.isLoggedIn ? webId : null
    }
    if (typeof session?.isActive === 'boolean') {
      return session.isActive ? webId : null
    }
    return webId
  }

}
