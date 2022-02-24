/**
* @jest-environment jsdom
* 
*/
import { SolidAuthnLogic } from '../src/authn/SolidAuthnLogic'
import { silenceDebugMessages } from './helpers/setup'
import { authSession } from '../src/authSession/authSession'
import { AuthenticationContext } from '../src/types'

silenceDebugMessages()
let solidAuthnLogic

describe("SolidAuthnLogic", () => {
  
  beforeEach(() => {
    solidAuthnLogic = new SolidAuthnLogic(authSession)
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