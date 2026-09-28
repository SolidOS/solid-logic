import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SolidAuthnLogic } from '../src/authn/SolidAuthnLogic'
import { authSession } from '../src/authSession/authSession'
import { subscribeIdentity, type IdentitySubscription } from '../src/authSession/identityState'
import { silenceDebugMessages } from './helpers/debugger'

silenceDebugMessages()

type Listener = (...args: any[]) => void

/**
 * A fake uvdsl-style session: properties the identity state reads, a
 * `sessionStateChange` listener, and the legacy `events` emitter the logic
 * (and the state's subscription) publish through.
 */
function fakeSession (init: {
  isActive?: boolean
  webId?: string
  info?: { isLoggedIn?: boolean, webId?: string }
  restore?: () => Promise<unknown>
  handleRedirectFromLogin?: () => Promise<unknown>
} = {}): any {
  const listeners = new Map<string, Set<Listener>>()
  const emitted: string[] = []
  const session: any = {
    isActive: init.isActive,
    webId: init.webId,
    info: init.info,
    restore: init.restore,
    handleRedirectFromLogin: init.handleRedirectFromLogin,
    emitted,
    addEventListener (type: string, listener: Listener) {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(listener)
    },
    fire (type: string): void {
      listeners.get(type)?.forEach(listener => listener())
    },
    events: {
      on (_type: string, _listener: Listener): void { /* registered by checkUser */ },
      emit (type: string): void { emitted.push(type) }
    }
  }
  return session
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 12; i++) await Promise.resolve()
}

// jsdom keeps its own location; the NSS probe reads hostname/port/protocol from
// it, so tests that exercise the probe replace it for their duration.
const originalLocation = Object.getOwnPropertyDescriptor(window, 'location')

const setLocation = (hostname: string): void => {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      hostname,
      port: '',
      protocol: 'http:',
      href: `http://${hostname}/`,
      toString: () => `http://${hostname}/`
    }
  })
}

// Every instance a test creates is disposed afterwards: the identity state
// keeps ONE document listener per session, and jsdom's document is shared by
// the whole file — a surviving subscription would probe during later tests.
let instances: SolidAuthnLogic[] = []
let forwarders: IdentitySubscription[] = []

const createAuthn = (session: any): SolidAuthnLogic => {
  // The app forwards the state's events through authSession's subscription;
  // a fake session needs the same forwarder for the emitted list to mean
  // anything.
  forwarders.push(subscribeIdentity(session, { onEvent: (event) => session.emitted.push(event) }))
  const authn = new SolidAuthnLogic(session)
  instances.push(authn)
  return authn
}

afterEach(() => {
  instances.forEach(authn => authn.dispose())
  instances = []
  forwarders.forEach(subscription => subscription.unsubscribe())
  forwarders = []
})

const okProbe = (): void => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 403 })))
}

describe('SolidAuthnLogic — currentUser', () => {
  it('returns the WebID of an active session', () => {
    const authn = createAuthn(fakeSession({ isActive: true, webId: 'https://alice.example/me' }))
    expect(authn.currentUser()?.value).toBe('https://alice.example/me')
  })

  it('reports logged out when the session explicitly went inactive, even with a cached WebID', () => {
    const authn = createAuthn(fakeSession({ isActive: false, webId: 'https://alice.example/me' }))
    expect(authn.currentUser()).toBe(null)
  })

  it('reports logged out when the legacy info says so, even with a cached WebID', () => {
    const authn = createAuthn(fakeSession({
      webId: 'https://alice.example/me',
      info: { isLoggedIn: false, webId: 'https://alice.example/me' }
    }))
    expect(authn.currentUser()).toBe(null)
  })

  it('accepts a legacy session that reports no state at all but carries a WebID', () => {
    const authn = createAuthn(fakeSession({ webId: 'https://alice.example/me' }))
    expect(authn.currentUser()?.value).toBe('https://alice.example/me')
  })
})

describe('SolidAuthnLogic — checkUser', () => {
  beforeEach(() => {
    setLocation('localhost')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    if (originalLocation) Object.defineProperty(window, 'location', originalLocation)
  })

  it('exists and runs', async () => {
    const authn = createAuthn(fakeSession())
    expect(authn.checkUser).toBeInstanceOf(Function)
    expect(await authn.checkUser()).toEqual(null)
  })

  it('activates a session from a restore and announces sessionRestore once', async () => {
    const session = fakeSession({ isActive: false })
    session.restore = async () => {
      session.isActive = true
      session.webId = 'https://alice.example/me'
    }
    const authn = createAuthn(session)

    expect((await authn.checkUser() as any)?.value).toBe('https://alice.example/me')
    expect(session.emitted).toEqual(['sessionRestore'])
    expect(authn.currentUser()?.value).toBe('https://alice.example/me')
  })

  it('announces login after a redirect, not sessionRestore', async () => {
    const session = fakeSession({ isActive: false })
    session.handleRedirectFromLogin = async () => {
      session.isActive = true
      session.webId = 'https://alice.example/me'
    }
    const authn = createAuthn(session)

    await authn.checkUser()
    expect(session.emitted).toEqual(['login'])
  })

  it('treats "No session to restore." as logged out instead of failing', async () => {
    const session = fakeSession({ isActive: false, restore: async () => { throw new Error('No session to restore.') } })
    const authn = createAuthn(session)

    await expect(authn.checkUser()).resolves.toEqual(null)
    expect(session.emitted).toEqual([])
  })

  it('rethrows a restore failure when the session nevertheless became active', async () => {
    const session = fakeSession({ isActive: false })
    session.restore = async () => {
      session.isActive = true
      session.webId = 'https://alice.example/me'
      throw new Error('refresh failed')
    }
    const authn = createAuthn(session)

    await expect(authn.checkUser()).rejects.toThrow('refresh failed')
  })

  it('recovers the NSS cookie WebID when the client restore is empty, and reports it as a session change', async () => {
    setLocation('alice.localhost')
    okProbe()
    const session = fakeSession({ isActive: false })
    const authn = createAuthn(session)

    expect((await authn.checkUser() as any)?.value).toBe('http://alice.localhost/profile/card#me')
    expect(authn.currentUser()?.value).toBe('http://alice.localhost/profile/card#me')
    // Adopting a cookie identity is a change, not a replacement: there was no
    // previous user to drop.
    expect(session.emitted).toEqual(['sessionChange'])
  })

  it('ignores a cookie probe that answers after the session took the identity', async () => {
    setLocation('alice.localhost')
    let resolveFetch: (value: Response) => void = () => undefined
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { resolveFetch = resolve })))
    const session = fakeSession({ isActive: false })
    const authn = createAuthn(session)

    const checking = authn.checkUser()
    await flush()
    // The session logs in while the probe is in flight.
    session.isActive = true
    session.webId = 'https://alice.example/me'
    session.fire('sessionStateChange')
    resolveFetch(new Response(null, { status: 403 }))
    await checking

    expect(authn.currentUser()?.value).toBe('https://alice.example/me')
    expect(session.emitted).toEqual(['sessionChange'])
  })

  it('does not probe when the session already has a WebID', async () => {
    setLocation('alice.localhost')
    const fetchMock = vi.fn(async () => new Response(null, { status: 403 }))
    vi.stubGlobal('fetch', fetchMock)
    const session = fakeSession({ isActive: true, webId: 'https://alice.example/me' })
    const authn = createAuthn(session)

    await authn.checkUser()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('SolidAuthnLogic — refocus and dispose', () => {
  beforeEach(() => {
    setLocation('alice.localhost')
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    if (originalLocation) Object.defineProperty(window, 'location', originalLocation)
  })

  it('re-probes the cookie identity on refocus and reports it when it is gone', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 403 }))
    vi.stubGlobal('fetch', fetchMock)
    const session = fakeSession({ isActive: false })
    const authn = createAuthn(session)

    document.dispatchEvent(new Event('visibilitychange'))
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(authn.currentUser()?.value).toBe('http://alice.localhost/profile/card#me')

    // The cookie session is gone in another tab.
    fetchMock.mockImplementation(async () => new Response(null, { status: 200 }))
    document.dispatchEvent(new Event('visibilitychange'))
    await flush()
    expect(authn.currentUser()).toBe(null)
    expect(session.emitted).toEqual(['sessionChange', 'sessionChange', 'identityReplaced'])
  })

  it('stops probing once the last instance using the session is disposed', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 403 }))
    vi.stubGlobal('fetch', fetchMock)
    const session = fakeSession({ isActive: false })
    const authn = createAuthn(session)

    authn.dispose()
    document.dispatchEvent(new Event('visibilitychange'))
    await flush()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps the refocus probe for the remaining instance', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 403 }))
    vi.stubGlobal('fetch', fetchMock)
    const session = fakeSession({ isActive: false })
    const first = createAuthn(session)
    const second = createAuthn(session)

    first.dispose()
    document.dispatchEvent(new Event('visibilitychange'))
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(second.currentUser()?.value).toBe('http://alice.localhost/profile/card#me')
  })

  it('drops a probe result that was in flight when the instance was disposed', async () => {
    let resolveFetch: (value: Response) => void = () => undefined
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { resolveFetch = resolve })))
    const session = fakeSession({ isActive: false })
    const authn = createAuthn(session)

    document.dispatchEvent(new Event('visibilitychange'))
    await flush()
    authn.dispose()
    resolveFetch(new Response(null, { status: 403 }))
    await flush()

    expect(authn.currentUser()).toBe(null)
    expect(session.emitted).toEqual([])
  })

  it('does not touch the identity while the session owns it', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 403 }))
    vi.stubGlobal('fetch', fetchMock)
    const session = fakeSession({ isActive: true, webId: 'https://alice.example/me' })
    const authn = createAuthn(session)

    document.dispatchEvent(new Event('visibilitychange'))
    await flush()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(authn.currentUser()?.value).toBe('https://alice.example/me')
  })
})

describe('authSession.info', () => {
  afterEach(() => {
    const sessionAny = authSession as any
    delete sessionAny.webId
    delete sessionAny.isActive
  })

  it('is derived from the session, and assignment is ignored', () => {
    const sessionAny = authSession as any
    Object.defineProperty(sessionAny, 'webId', { value: 'https://alice.example/me', configurable: true })
    Object.defineProperty(sessionAny, 'isActive', { value: true, configurable: true })

    expect(sessionAny.info).toEqual({ webId: 'https://alice.example/me', isLoggedIn: true })

    // Legacy code assigns snapshots; reads stay derived so a retained value
    // cannot answer for the session.
    sessionAny.info = { webId: 'https://mallory.example/me', isLoggedIn: true }
    expect(sessionAny.info).toEqual({ webId: 'https://alice.example/me', isLoggedIn: true })
  })

  it('reports logged out when the session explicitly went inactive', () => {
    const sessionAny = authSession as any
    Object.defineProperty(sessionAny, 'webId', { value: 'https://alice.example/me', configurable: true })
    Object.defineProperty(sessionAny, 'isActive', { value: false, configurable: true })

    expect(sessionAny.info).toEqual({ webId: 'https://alice.example/me', isLoggedIn: false })
  })
})
