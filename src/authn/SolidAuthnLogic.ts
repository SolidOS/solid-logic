import { namedNode, NamedNode, sym } from "rdflib";
import { appContext, offlineTestID } from "./authUtil";
import * as debug from '../util/debug'
import { Session } from "@inrupt/solid-client-authn-browser";
import { AuthenticationContext, AuthnLogic } from "../types";
export class SolidAuthnLogic implements AuthnLogic {
  private session: Session; 

  constructor(solidAuthSession: Session) {
    this.session = solidAuthSession;
  }
  
  // we created authSession getter because we want to access it as authn.authSession externally
  get authSession():Session { return this.session } 

  currentUser(): NamedNode | null {
    const app = appContext()
    if (app.viewingNoAuthPage) {
      return sym(app.webId)
    }
    if (this.session.info.webId && this.session.info.isLoggedIn) {
      return sym(this.session.info.webId)
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
    this.session.onSessionRestore((url) => {
      if (document.location.toString() !== url) history.replaceState(null, '', url)
    })

    /**
     * Handle a successful authentication redirect
     */
    await this.session
      .handleIncomingRedirect({
        restorePreviousSession: true,
        url: window.location.href
      })

    // Check to see if a hash was stored in local storage
    const postLoginRedirectHash = window.localStorage.getItem('preLoginRedirectHash')
    if (postLoginRedirectHash) {
      const curUrl = new URL(window.location.href)
      if (curUrl.hash !== postLoginRedirectHash) {
        if (history.pushState) {
          // console.log('Setting window.location.has using pushState')
          history.pushState(null, document.title, postLoginRedirectHash)
        } else {
          // console.warn('Setting window.location.has using location.hash')
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

    const webId = this.webIdFromSession(this.session.info)
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
  webIdFromSession (session?: { webId?: string, isLoggedIn: boolean }): string | null {
    const webId = session?.webId && session.isLoggedIn ? session.webId : null
    return webId
  }

}