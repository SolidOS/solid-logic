/**
 * Auth session wiring.
 *
 * Takes the raw OIDC session from session.ts and layers on:
 *   - Login compatibility shim (normalises legacy call-site signatures
 *     and resolves the canonical issuer)
 *   - SessionEvents shim (legacy EventEmitter-style API)
 *   - Logout listener (emits 'logout' on session deactivation)
 *
 * Exports the fully assembled authSession.
 */

import type { Session as OidcSession } from '@uvdsl/solid-oidc-client-browser/core'
import { _session } from './session'
import { resolveIssuerForLogin } from './issuer'
import { SessionEvents } from './events'

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

// ---------------------------------------------------------------------------
// Login compatibility shim
// ---------------------------------------------------------------------------
// Wraps _session.login() so that call sites with different calling
// conventions all work.  The underlying session expects:
//   login(issuer: string, redirectUrl: string)
//
// idpOrOptions can be:
//   - a string (issuer URL) — passed through with less resolution
//   - an options object with any of these field-name variants:
//       issuer:   oidcIssuer | idp | issuer
//       redirect: redirectUrl | redirect_uri | redirectUri
//     (all redirect field names map to the same value: the URL the IdP
//     should send the browser back to after authentication)
//   - anything else — passed through to the underlying session as-is
//
// In all cases the issuer is resolved through
// /.well-known/openid-configuration before redirect so the canonical
// issuer host is used.

const sessionAny = _session as any
const originalLogin = typeof sessionAny.login === 'function'
  ? sessionAny.login.bind(_session)
  : undefined

if (originalLogin) {
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

// ---------------------------------------------------------------------------
// Legacy event layer
// ---------------------------------------------------------------------------

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
  