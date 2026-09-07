/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SolidAuthnLogic } from '../src/authn/SolidAuthnLogic'
import { silenceDebugMessages } from './helpers/debugger'
import { AuthenticationContext } from '../src/types'
import { EventEmitter } from 'node:events'
import { NamedNode } from 'rdflib'

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
    it('emits login when handleIncomingRedirect activates the session', async () => {
      const emitted: Array<[string, unknown]> = []
      const loginSession = {
        events: new EventEmitter(),
        isActive: false,
        webId: undefined as string | undefined,
        info: undefined,
        handleIncomingRedirect: vi.fn(async () => {
          loginSession.isActive = true
          loginSession.webId = 'https://alice.example.com/profile/card#me'
        })
      }
      loginSession.events.on('login', (url: unknown) => emitted.push(['login', url]))

      const logic = new SolidAuthnLogic(loginSession as any)

      const webId = await logic.checkUser<NamedNode>()

      expect(webId?.uri).toBe('https://alice.example.com/profile/card#me')
      expect(loginSession.handleIncomingRedirect).toHaveBeenCalledTimes(1)
      expect(emitted).toEqual([['login', window.location.href]])
    })
  })

  describe('late session restore', () => {
    it('emits sessionRestore when restore settles after the timeout', async () => {
      vi.useFakeTimers()
      try {
        let resolveRestore: () => void = () => {}
        const slowSession = {
          events: new EventEmitter(),
          isActive: false,
          webId: undefined as string | undefined,
          restore () {
            return new Promise<void>(resolve => {
              resolveRestore = () => {
                slowSession.isActive = true
                slowSession.webId = 'http://localhost:3100/sharon/profile/card#me'
                resolve()
              }
            })
          }
        }
        const logic = new SolidAuthnLogic(slowSession as any)
        const emitted: string[] = []
        slowSession.events.on('sessionRestore', (url: string) => emitted.push(url))

        const check = logic.checkUser()
        await vi.advanceTimersByTimeAsync(6000)
        await check
        expect(emitted).toEqual([])

        resolveRestore()
        await vi.advanceTimersByTimeAsync(0)
        expect(emitted).toHaveLength(1)
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('currentUser', () => {
    it('exists', () => {
      expect(solidAuthnLogic.currentUser).toBeInstanceOf(Function)
    })
    it('runs', async () => {
      expect(await solidAuthnLogic.currentUser()).toEqual(null)
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