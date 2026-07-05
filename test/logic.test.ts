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
  let originalInfo: any

  beforeEach(() => {
    fetchMock.resetMocks()

    const sessionAny = authSession as any
    originalFetch = sessionAny.fetch
    originalAuthFetch = sessionAny.authFetch
    originalInfo = sessionAny.info

    sessionAny.info = { isLoggedIn: false }
  })

  afterEach(() => {
    const sessionAny = authSession as any
    sessionAny.fetch = originalFetch
    sessionAny.authFetch = originalAuthFetch
    sessionAny.info = originalInfo
  })

  it('uses window.fetch when credentials are omit even if a session exists', async () => {
    const sessionAny = authSession as any
    sessionAny.info = { webId: 'https://alice.example/profile#me', isLoggedIn: true }
    sessionAny.fetch = vi.fn().mockResolvedValue(new Response('session'))

    fetchMock.mockResponseOnce('window')

    await singletonFetch('https://example.com/resource', { credentials: 'omit' })

    expect(sessionAny.fetch).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('falls back to authFetch when session.fetch is unavailable', async () => {
    const sessionAny = authSession as any
    sessionAny.info = { webId: 'https://alice.example/profile#me', isLoggedIn: true }
    sessionAny.fetch = undefined
    sessionAny.authFetch = vi.fn().mockResolvedValue(new Response('auth'))

    await singletonFetch('https://example.com/resource')

    expect(sessionAny.authFetch).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

