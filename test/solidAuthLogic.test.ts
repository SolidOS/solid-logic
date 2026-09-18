import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SolidAuthnLogic } from '../src/authn/SolidAuthnLogic'
import { watchSessionTransitions } from '../src/authSession/transitions'
import { silenceDebugMessages } from './helpers/debugger'
import { AuthenticationContext } from '../src/types'
import { EventEmitter } from 'node:events'

silenceDebugMessages()
let solidAuthnLogic: SolidAuthnLogic
const authSession = {
  events: new EventEmitter(),
  addEventListener (event: string | symbol, listener: (...args: any[]) => void) {
    this.events.on(event, listener)
  },
  removeEventListener (event: string | symbol, listener: (...args: any[]) => void) {
    this.events.off(event, listener)
  },
}

describe('SolidAuthnLogic', () => {
  
  beforeEach(() => {
    solidAuthnLogic = new SolidAuthnLogic(authSession as any)
  })

  describe('checkUser', () => {
    it('exists', () => {
      expect(solidAuthnLogic.checkUser).toBeInstanceOf(Function)
    })
    it('runs', async () => {
      expect(await solidAuthnLogic.checkUser()).toEqual(null)
    })
  })

  describe('currentUser', () => {
    it('exists', () => {
      expect(solidAuthnLogic.currentUser).toBeInstanceOf(Function)
    })
    it('runs', async () => {
      expect(await solidAuthnLogic.currentUser()).toEqual(null)
    })
    it('reports logged out when the session explicitly went inactive, even with a cached WebID and a remembered fallback', () => {
      const authn = new SolidAuthnLogic({
        isActive: false,
        webId: 'https://alice.example/profile#me',
        info: { webId: 'https://alice.example/profile#me', isLoggedIn: false }
      } as any)
      // checkUser() had cached the identity before the logout.
      ;(authn as any).fallbackWebId = 'https://alice.example/profile#me'

      expect(authn.currentUser()).toBeNull()
      // The fallback must not survive the logout and resurrect the identity.
      expect((authn as any).fallbackWebId).toBeNull()
    })
    it('returns the WebID while the session is active', () => {
      const authn = new SolidAuthnLogic({
        isActive: true,
        webId: 'https://alice.example/profile#me',
        info: { webId: 'https://alice.example/profile#me', isLoggedIn: true }
      } as any)

      expect(authn.currentUser()?.uri).toBe('https://alice.example/profile#me')
    })

    it('keeps a cookie-backed fallback usable while the OIDC session is inactive', () => {
      // The NSS cookie probe is precisely the case where the OIDC session has
      // no active client state; that identity is not the "previous user".
      const authn = new SolidAuthnLogic({
        isActive: false,
        info: { isLoggedIn: false }
      } as any)
      ;(authn as any).fallbackWebId = 'https://alice.localhost/profile/card#me'
      ;(authn as any).cookieBackedFallback = true

      expect(authn.currentUser()?.uri).toBe('https://alice.localhost/profile/card#me')
    })
  })

  describe('webIdFromSession', () => {
    it('returns null when the info reports logged out, even though the session root has no isLoggedIn', () => {
      // Regression: requiring every source to be explicitly false let the
      // cached WebID survive a logout (the root has no `isLoggedIn` property).
      expect(solidAuthnLogic.webIdFromSession(
        { webId: 'https://alice.example/profile#me', isLoggedIn: false },
        { webId: 'https://alice.example/profile#me', isActive: false }
      )).toBeNull()
    })
    it('returns the WebID while the session is active', () => {
      expect(solidAuthnLogic.webIdFromSession(
        { webId: 'https://alice.example/profile#me', isLoggedIn: true },
        { webId: 'https://alice.example/profile#me' }
      )).toBe('https://alice.example/profile#me')
    })
    it('falls back to the WebID for legacy sessions that report no state at all', () => {
      expect(solidAuthnLogic.webIdFromSession(
        { webId: 'https://alice.example/profile#me' },
        { webId: 'https://alice.example/profile#me' }
      )).toBe('https://alice.example/profile#me')
    })
    it('treats a mixed snapshot as logged out when any source reports inactive', () => {
      expect(solidAuthnLogic.webIdFromSession(
        { webId: 'https://alice.example/profile#me', isLoggedIn: true },
        { webId: 'https://alice.example/profile#me', isActive: false }
      )).toBeNull()
    })
  })

  describe('cookie-backed fallback identity changes', () => {
    it('reports a replacement when an established cookie identity is cleared', () => {
      const events = new EventEmitter()
      const emitted: string[] = []
      events.on('sessionChange', () => emitted.push('sessionChange'))
      events.on('identityReplaced', () => emitted.push('identityReplaced'))
      const authn = new SolidAuthnLogic({ events } as any)
      ;(authn as any).fallbackWebId = null
      ;(authn as any).cookieBackedFallback = false

      ;(authn as any).reportFallbackIdentityChange('https://alice.localhost/profile/card#me', true)

      expect(emitted).toEqual(['sessionChange', 'identityReplaced'])
    })

    it('reports when a cookie-backed identity is replaced by an OIDC one', () => {
      const events = new EventEmitter()
      const emitted: string[] = []
      events.on('sessionChange', () => emitted.push('sessionChange'))
      events.on('identityReplaced', () => emitted.push('identityReplaced'))
      // The OIDC session is active: the watcher has already emitted
      // `sessionChange` for it going active, so only the replacement is owed
      // (the watcher could not see the cookie identity it replaces).
      const authn = new SolidAuthnLogic({ events, isActive: true } as any)
      ;(authn as any).fallbackWebId = 'https://bob.example/profile#me'
      ;(authn as any).cookieBackedFallback = false

      ;(authn as any).reportFallbackIdentityChange('https://alice.localhost/profile/card#me', true)

      expect(emitted).toEqual(['identityReplaced'])
    })

    it('does not repeat the replacement the watcher already emitted for the OIDC identity', () => {
      const events = new EventEmitter()
      const emitted: string[] = []
      events.on('sessionChange', () => emitted.push('sessionChange'))
      events.on('identityReplaced', () => emitted.push('identityReplaced'))
      const authn = new SolidAuthnLogic({ events, isActive: false } as any)
      ;(authn as any).fallbackWebId = 'https://alice.localhost/profile/card#me'
      ;(authn as any).cookieBackedFallback = true

      // OIDC B logged out (the watcher reported B -> inactive, replacement
      // included) and the cookie probe then found A.
      ;(authn as any).reportFallbackIdentityChange('https://bob.example/profile#me', false)

      expect(emitted).toEqual(['sessionChange'])
    })

    it('does not duplicate OIDC-sourced changes (the watcher already reports them)', () => {
      const events = new EventEmitter()
      const emitted: string[] = []
      events.on('sessionChange', () => emitted.push('sessionChange'))
      events.on('identityReplaced', () => emitted.push('identityReplaced'))
      const authn = new SolidAuthnLogic({ events } as any)
      ;(authn as any).fallbackWebId = 'https://bob.example/profile#me'
      ;(authn as any).cookieBackedFallback = false

      ;(authn as any).reportFallbackIdentityChange('https://alice.example/profile#me', false)

      expect(emitted).toEqual([])
    })

    it('reports an anonymous-to-cookie transition without a replacement', () => {
      const events = new EventEmitter()
      const emitted: string[] = []
      events.on('sessionChange', () => emitted.push('sessionChange'))
      events.on('identityReplaced', () => emitted.push('identityReplaced'))
      const authn = new SolidAuthnLogic({ events } as any)
      ;(authn as any).fallbackWebId = 'https://alice.localhost/profile/card#me'
      ;(authn as any).cookieBackedFallback = true

      ;(authn as any).reportFallbackIdentityChange(null, false)

      // Nothing of a previous identity was cached, so no replacement.
      expect(emitted).toEqual(['sessionChange'])
    })

    it('stays silent when the fallback identity is unchanged', () => {
      const events = new EventEmitter()
      const emitted: string[] = []
      events.on('sessionChange', () => emitted.push('sessionChange'))
      events.on('identityReplaced', () => emitted.push('identityReplaced'))
      const authn = new SolidAuthnLogic({ events } as any)
      ;(authn as any).fallbackWebId = 'https://alice.localhost/profile/card#me'

      ;(authn as any).reportFallbackIdentityChange('https://alice.localhost/profile/card#me', true)

      expect(emitted).toEqual([])
    })

    it('revalidates a cookie-backed identity on refocus and reports it when it is gone', async () => {
      const events = new EventEmitter()
      const emitted: string[] = []
      events.on('sessionChange', () => emitted.push('sessionChange'))
      events.on('identityReplaced', () => emitted.push('identityReplaced'))
      const authn = new SolidAuthnLogic({ events, isActive: false } as any)
      ;(authn as any).fallbackWebId = 'https://alice.localhost/profile/card#me'
      ;(authn as any).cookieBackedFallback = true

      // jsdom's hostname is not a *.localhost pod, so the probe finds nothing:
      // another tab logged the cookie session out.
      await authn.refreshCookieBackedFallback()

      expect(emitted).toEqual(['sessionChange', 'identityReplaced'])
      expect((authn as any).fallbackWebId).toBeNull()
      expect((authn as any).cookieBackedFallback).toBe(false)
    })

    it('does not touch the fallback while the OIDC session is active', async () => {
      const events = new EventEmitter()
      const emitted: string[] = []
      events.on('sessionChange', () => emitted.push('sessionChange'))
      events.on('identityReplaced', () => emitted.push('identityReplaced'))
      const authn = new SolidAuthnLogic({ events, isActive: true } as any)
      ;(authn as any).fallbackWebId = 'https://bob.example/profile#me'
      ;(authn as any).cookieBackedFallback = false

      await authn.refreshCookieBackedFallback()

      expect(emitted).toEqual([])
      expect((authn as any).fallbackWebId).toBe('https://bob.example/profile#me')
    })

    it('treats a legacy active session (no isActive, but a WebID) as active', async () => {
      const events = new EventEmitter()
      const emitted: string[] = []
      events.on('sessionChange', () => emitted.push('sessionChange'))
      events.on('identityReplaced', () => emitted.push('identityReplaced'))
      // The supported legacy shape: no isActive at all, identity from the WebID.
      const authn = new SolidAuthnLogic({ events, webId: 'https://alice.example/profile#me' } as any)
      const probe = vi.fn(async (): Promise<string | null> => null)
      ;(authn as any).probeNssCookieBackedWebId = probe

      await authn.refreshCookieBackedFallback()

      // Probing here would replace an identity the session already owns.
      expect(probe).not.toHaveBeenCalled()
      expect(emitted).toEqual([])
      expect((authn as any).fallbackWebId).toBeNull()
    })

    it('does not report a second sessionChange for a legacy session', () => {
      const events = new EventEmitter()
      const emitted: string[] = []
      events.on('sessionChange', () => emitted.push('sessionChange'))
      events.on('identityReplaced', () => emitted.push('identityReplaced'))
      // The watcher treats this shape as active — an active session means it
      // already emitted `sessionChange` for the transition it observed, so
      // only the cookie replacement is owed here.
      const authn = new SolidAuthnLogic({ events, webId: 'https://bob.example/profile#me' } as any)
      ;(authn as any).fallbackWebId = 'https://bob.example/profile#me'
      ;(authn as any).cookieBackedFallback = false

      ;(authn as any).reportFallbackIdentityChange('https://alice.localhost/profile/card#me', true)

      expect(emitted).toEqual(['identityReplaced'])
    })

    it('drops a probe result that an earlier probe superseded', async () => {
      const events = new EventEmitter()
      const emitted: string[] = []
      events.on('sessionChange', () => emitted.push('sessionChange'))
      events.on('identityReplaced', () => emitted.push('identityReplaced'))
      const authn = new SolidAuthnLogic({ events } as any)
      const resolvers: ((webId: string | null) => void)[] = []
      ;(authn as any).probeNssCookieBackedWebId = (): Promise<string | null> =>
        new Promise((resolve) => { resolvers.push(resolve) })

      const first = authn.refreshCookieBackedFallback()
      await Promise.resolve()
      const second = authn.refreshCookieBackedFallback()
      await Promise.resolve()

      // The newer probe answers first, the older one only afterwards.
      resolvers[1]('https://carol.localhost/profile/card#me')
      await second
      resolvers[0]('https://alice.localhost/profile/card#me')
      await first

      expect((authn as any).fallbackWebId).toBe('https://carol.localhost/profile/card#me')
      expect(emitted).toEqual(['sessionChange'])
    })

    it('does not let a checkUser probe replace an identity the session took over', async () => {
      const events = new EventEmitter()
      const emitted: string[] = []
      events.on('sessionChange', () => emitted.push('sessionChange'))
      events.on('identityReplaced', () => emitted.push('identityReplaced'))
      const session = { events, isActive: false } as any
      const authn = new SolidAuthnLogic(session)
      let resolveProbe: (webId: string | null) => void = () => undefined
      ;(authn as any).probeNssCookieBackedWebId = (): Promise<string | null> =>
        new Promise((resolve) => { resolveProbe = resolve })

      const checking = authn.checkUser()
      await Promise.resolve()
      // The OIDC session takes ownership while the NSS probe is in flight.
      session.isActive = true
      session.webId = 'https://bob.example/profile#me'
      resolveProbe('https://alice.localhost/profile/card#me')
      await checking

      // The stale cookie identity must not be usable after a later logout.
      expect(authn.currentUser()?.uri).toBe('https://bob.example/profile#me')
      expect((authn as any).cookieBackedFallback).toBe(false)
      session.isActive = false
      session.webId = undefined
      expect(authn.currentUser()).toBeNull()
      expect(emitted).toEqual([])
    })

    it('does not let an older refocus probe win over a newer checkUser probe', async () => {
      const events = new EventEmitter()
      const emitted: string[] = []
      events.on('sessionChange', () => emitted.push('sessionChange'))
      events.on('identityReplaced', () => emitted.push('identityReplaced'))
      const authn = new SolidAuthnLogic({ events } as any)
      const resolvers: ((webId: string | null) => void)[] = []
      ;(authn as any).probeNssCookieBackedWebId = (): Promise<string | null> =>
        new Promise((resolve) => { resolvers.push(resolve) })

      const refocus = authn.refreshCookieBackedFallback()
      await Promise.resolve()
      const checking = authn.checkUser()
      await Promise.resolve()

      // checkUser's probe answers first, the refocus one only afterwards.
      resolvers[1]('https://carol.localhost/profile/card#me')
      await checking
      resolvers[0]('https://alice.localhost/profile/card#me')
      await refocus

      expect((authn as any).fallbackWebId).toBe('https://carol.localhost/profile/card#me')
      expect(authn.currentUser()?.uri).toBe('https://carol.localhost/profile/card#me')
    })

    it('revalidates the cookie fallback when the OIDC session was reported cleared', async () => {
      const events = new EventEmitter()
      const session = { events, isActive: true, webId: 'https://bob.example/profile#me' } as any
      const authn = new SolidAuthnLogic(session)
      ;(authn as any).fallbackWebId = 'https://alice.localhost/profile/card#me'
      ;(authn as any).cookieBackedFallback = true
      const probe = vi.fn(async (): Promise<string | null> => null)
      ;(authn as any).probeNssCookieBackedWebId = probe

      // Another tab logged the OIDC session out: the backing store lost it, so
      // the local object no longer reports an identity that owns the session.
      const handlers: Record<string, () => void> = {}
      watchSessionTransitions(session, () => undefined, {
        visibilityState: 'visible',
        addEventListener: (type: string, listener: () => void): void => { handlers[type] = listener }
      }, () => 'cleared')
      handlers.visibilitychange()
      await new Promise((resolve) => setTimeout(resolve, 0))

      // The retained cookie identity is probed again — and is gone here.
      await authn.refreshCookieBackedFallback()

      expect(probe).toHaveBeenCalledTimes(1)
      expect((authn as any).fallbackWebId).toBeNull()
      expect((authn as any).cookieBackedFallback).toBe(false)
    })

    it('stops watching the document once disposed', async () => {
      const events = new EventEmitter()
      const authn = new SolidAuthnLogic({ events } as any)
      const probe = vi.fn(async (): Promise<string | null> => null)
      ;(authn as any).probeNssCookieBackedWebId = probe

      authn.dispose()
      document.dispatchEvent(new Event('visibilitychange'))
      await Promise.resolve()

      // A replaced instance must not keep probing on every refocus.
      expect(probe).not.toHaveBeenCalled()
    })

    it('drops a probe result when the session became active while probing', async () => {
      const events = new EventEmitter()
      const emitted: string[] = []
      events.on('sessionChange', () => emitted.push('sessionChange'))
      events.on('identityReplaced', () => emitted.push('identityReplaced'))
      const session = { events, isActive: false } as any
      const authn = new SolidAuthnLogic(session)
      let resolveProbe: (webId: string | null) => void = () => undefined
      ;(authn as any).probeNssCookieBackedWebId = (): Promise<string | null> =>
        new Promise((resolve) => { resolveProbe = resolve })

      const probing = authn.refreshCookieBackedFallback()
      await Promise.resolve()
      // The OIDC session takes over while the cookie probe is in flight.
      session.isActive = true
      session.webId = 'https://bob.example/profile#me'
      resolveProbe('https://alice.localhost/profile/card#me')
      await probing

      expect((authn as any).fallbackWebId).toBeNull()
      expect(emitted).toEqual([])
    })
  })

  describe('saveUser', () => {
    it('exists', () => {
      expect(solidAuthnLogic.saveUser).toBeInstanceOf(Function)
    })
    it('runs', () => {
      expect(solidAuthnLogic.saveUser(
        '',
        {} as AuthenticationContext
      )).toEqual(null)
    })
  })

})