import {
  checkUser, // Async
  currentUser, // Sync
  findAppInstances, // Async?
  findOriginOwner,
  getUserRoles, // Async
  loadTypeIndexes,
  logIn,
  logInLoadProfile,
  logInLoadPreferences,
  offlineTestID,
  registerInTypeIndex,
  setACLUserPublic,
  saveUser,
  authSession
} from '../src/authn/authn'
import { sym } from 'rdflib'
import { Session } from '@inrupt/solid-client-authn-browser'
import { silenceDebugMessages } from './helpers/setup'
import { AuthenticationContext } from '../src/index'

silenceDebugMessages()

describe('checkUser', () => {
  it('exists', () => {
    expect(checkUser).toBeInstanceOf(Function)
  })
  it('runs', async () => {
    expect(await checkUser()).toEqual(null)
  })
})

describe('currentUser', () => {
  it('exists', () => {
    expect(currentUser).toBeInstanceOf(Function)
  })
  it('runs', async () => {
    expect(await currentUser()).toEqual(null)
  })
})

describe('findOriginOwner', () => {
  it('exists', () => {
    expect(findOriginOwner).toBeInstanceOf(Function)
  })
  it('runs', () => {
    expect(findOriginOwner('')).toEqual(false)
  })
})

describe('loadTypeIndexes', () => {
  it('exists', () => {
    expect(loadTypeIndexes).toBeInstanceOf(Function)
  })
  it('runs', () => {
    expect(loadTypeIndexes({})).toBeInstanceOf(Object)
  })
})

describe('offlineTestID', () => {
  it('exists', () => {
    expect(offlineTestID).toBeInstanceOf(Function)
  })
  it('runs', () => {
    expect(offlineTestID()).toEqual(null)
  })
})

describe('registerInTypeIndex', () => {
  it('exists', () => {
    expect(registerInTypeIndex).toBeInstanceOf(Function)
  })
  it.skip('runs', async () => {
    expect(await registerInTypeIndex(
      {} as AuthenticationContext,
      sym('https://test.test#'),
      sym('https://test.test#'),
      false
    )).toEqual(undefined)
  })
})


describe('setACLUserPublic', () => {
  it('exists', () => {
    expect(setACLUserPublic).toBeInstanceOf(Function)
  })
  it.skip('runs', async () => {
    expect(await setACLUserPublic(
      'https://test.test#',
      sym('https://test.test#'),
      {}
    )).toEqual({})
  })
})

describe('saveUser', () => {
  it('exists', () => {
    expect(saveUser).toBeInstanceOf(Function)
  })
  it('runs', () => {
    expect(saveUser(
      '',
      {} as AuthenticationContext
    )).toEqual(null)
  })
})

describe('authSession', () => {
  it('exists', () => {
    expect(authSession).toBeInstanceOf(Session)
  })
})