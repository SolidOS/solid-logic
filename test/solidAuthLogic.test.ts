import { beforeEach, describe, expect, it } from 'vitest'
import { SolidAuthnLogic } from '../src/authn/SolidAuthnLogic'
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

      ;(authn as any).reportFallbackIdentityChange('https://alice.localhost/profile/card#me')

      expect(emitted).toEqual(['sessionChange', 'identityReplaced'])
    })

    it('reports an anonymous-to-cookie transition without a replacement', () => {
      const events = new EventEmitter()
      const emitted: string[] = []
      events.on('sessionChange', () => emitted.push('sessionChange'))
      events.on('identityReplaced', () => emitted.push('identityReplaced'))
      const authn = new SolidAuthnLogic({ events } as any)
      ;(authn as any).fallbackWebId = 'https://alice.localhost/profile/card#me'
      ;(authn as any).cookieBackedFallback = true

      ;(authn as any).reportFallbackIdentityChange(null)

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

      ;(authn as any).reportFallbackIdentityChange('https://alice.localhost/profile/card#me')

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