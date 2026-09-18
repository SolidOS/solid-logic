import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { solidLogicSingleton } from '../src/logic/solidLogicSingleton'
import { authSession } from '../src/authSession/authSession'
import { fetchMock } from './helpers/fetch-mock'
import { silenceDebugMessages } from './helpers/debugger'

silenceDebugMessages()

describe('store', () => {
  it('exists', () => {
    expect(solidLogicSingleton.store).toBeInstanceOf(Object)
  })
})

describe('store.fetcher', () => {
  it('exists', () => {
    expect(solidLogicSingleton.store.fetcher).toBeInstanceOf(Object)
  })
})

describe('store.updater', () => {
  it('exists', () => {
    expect(solidLogicSingleton.store.updater).toBeInstanceOf(Object)
  })
})

describe('authn', () => {
  it('exists', () => {
    expect(solidLogicSingleton.authn).toBeInstanceOf(Object)
  })
})

describe('solidLogicSingleton fetch bridge', () => {
  const singletonFetch = (solidLogicSingleton.store.fetcher as any)._fetch as (url: string, init?: RequestInit) => Promise<Response>

  let originalFetch: any
  let originalAuthFetch: any
  let originalInfoDescriptor: PropertyDescriptor | undefined
  let originalActiveDescriptor: PropertyDescriptor | undefined

  // `info` is derived and getter-only (see authSession.ts), so it cannot be
  // assigned in a test — redefine the property, and put the module's own
  // descriptor back afterwards.
  const setInfo = (value: any): void => {
    Object.defineProperty(authSession, 'info', {
      configurable: true,
      enumerable: true,
      get: () => value
    })
  }

  // The uvdsl session exposes `isActive` as a getter as well; tests that need
  // an active session shadow it on the instance and restore it afterwards.
  const setSessionActive = (value: boolean): void => {
    Object.defineProperty(authSession, 'isActive', {
      configurable: true,
      get: () => value
    })
  }

  beforeEach(() => {
    fetchMock.resetMocks()

    const sessionAny = authSession as any
    originalFetch = sessionAny.fetch
    originalAuthFetch = sessionAny.authFetch
    originalInfoDescriptor = Object.getOwnPropertyDescriptor(authSession, 'info')
    originalActiveDescriptor = Object.getOwnPropertyDescriptor(authSession, 'isActive')

    setInfo({ isLoggedIn: false })
  })

  afterEach(() => {
    const sessionAny = authSession as any
    sessionAny.fetch = originalFetch
    sessionAny.authFetch = originalAuthFetch
    if (originalInfoDescriptor) Object.defineProperty(authSession, 'info', originalInfoDescriptor)
    if (originalActiveDescriptor) Object.defineProperty(authSession, 'isActive', originalActiveDescriptor)
    else delete (authSession as any).isActive
  })

  it('uses window.fetch when credentials are omit even if a session exists', async () => {
    const sessionAny = authSession as any
    setInfo({ webId: 'https://alice.example/profile#me', isLoggedIn: true })
    setSessionActive(true)
    sessionAny.fetch = vi.fn().mockResolvedValue(new Response('session'))

    fetchMock.mockResponseOnce('window')

    await singletonFetch('https://example.com/resource', { credentials: 'omit' })

    expect(sessionAny.fetch).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('falls back to authFetch when session.fetch is unavailable', async () => {
    const sessionAny = authSession as any
    setInfo({ webId: 'https://alice.example/profile#me', isLoggedIn: true })
    setSessionActive(true)
    sessionAny.fetch = undefined
    sessionAny.authFetch = vi.fn().mockResolvedValue(new Response('auth'))

    await singletonFetch('https://example.com/resource')

    expect(sessionAny.authFetch).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('uses window.fetch when the session reports inactive even though a WebID is cached', async () => {
    const sessionAny = authSession as any
    setInfo({ webId: 'https://alice.example/profile#me', isLoggedIn: false })
    setSessionActive(false)
    sessionAny.fetch = vi.fn().mockResolvedValue(new Response('session'))

    fetchMock.mockResponseOnce('window')

    await singletonFetch('https://example.com/resource')

    expect(sessionAny.fetch).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

