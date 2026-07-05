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