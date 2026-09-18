import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  classifyTransition,
  effectiveIdentity,
  identityReplaced,
  legacySessionInfo,
  sessionExplicitlyInactive,
  sessionIsActive,
  sessionOwnsIdentity,
  subscribeIdentity,
  type IdentityEvent
} from '../src/authSession/identityState'

type Listener = () => void

/**
 * A fake uvdsl-style session: `isActive`/`webId` properties, a
 * `sessionStateChange` listener the test can fire, and an optional restore.
 */
function fakeSession (init: {
  isActive?: boolean
  webId?: string
  info?: { isLoggedIn?: boolean, webId?: string }
  restore?: () => Promise<unknown>
} = {}): any {
  const listeners = new Map<string, Set<Listener>>()
  const session: any = {
    isActive: init.isActive,
    webId: init.webId,
    info: init.info ?? {},
    addEventListener (type: string, listener: Listener) {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(listener)
    },
    fire (type: string) { listeners.get(type)?.forEach(listener => listener()) }
  }
  if (init.restore) session.restore = init.restore
  return session
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 12; i++) await Promise.resolve()
}

const collect = (): { events: IdentityEvent[], emit: (event: IdentityEvent) => void } => {
  const events: IdentityEvent[] = []
  return { events, emit: (event: IdentityEvent) => { events.push(event) } }
}

describe('identityState — predicates', () => {
  it('treats isActive as authoritative and the WebID as the legacy fallback', () => {
    expect(sessionIsActive({ isActive: true })).toBe(true)
    expect(sessionIsActive({ isActive: false, webId: 'https://a.example/me' })).toBe(false)
    expect(sessionIsActive({ webId: 'https://a.example/me' })).toBe(true)
    expect(sessionIsActive({})).toBe(false)
    expect(sessionOwnsIdentity({ isActive: false, webId: 'https://a.example/me' })).toBe(false)
    expect(sessionOwnsIdentity({ webId: 'https://a.example/me' })).toBe(true)
    expect(sessionExplicitlyInactive({ info: { isLoggedIn: false }, webId: 'https://a.example/me' })).toBe(true)
    expect(legacySessionInfo({ isActive: false, webId: 'https://a.example/me' }))
      .toEqual({ webId: 'https://a.example/me', isLoggedIn: false })
    expect(legacySessionInfo({ webId: 'https://a.example/me' }))
      .toEqual({ webId: 'https://a.example/me', isLoggedIn: true })
  })

  it('classifies transitions, and only replaces an actively established identity', () => {
    expect(classifyTransition({ isActive: false }, { isActive: true, webId: 'A' })).toBe('sessionChange')
    expect(classifyTransition({ isActive: true, webId: 'A' }, { isActive: false, webId: 'A' })).toBe('logout')
    expect(classifyTransition({ isActive: true, webId: 'A' }, { isActive: true, webId: 'B' })).toBe('sessionChange')
    expect(classifyTransition({ isActive: true, webId: 'A' }, { isActive: true, webId: 'A' })).toBe(null)
    expect(classifyTransition({ isActive: true, webId: 'A' }, { isActive: false })).toBe('logout')

    expect(identityReplaced({ isActive: true, webId: 'A' }, { isActive: true, webId: 'B' })).toBe(true)
    expect(identityReplaced({ isActive: true, webId: 'A' }, { isActive: false, webId: 'A' })).toBe(true)
    expect(identityReplaced({ isActive: true, webId: 'A' }, { isActive: false })).toBe(true)
    // Start-up and same-identity refreshes are not replacements.
    expect(identityReplaced({ isActive: false }, { isActive: true, webId: 'A' })).toBe(false)
    expect(identityReplaced({ isActive: true, webId: 'A' }, { isActive: true, webId: 'A' })).toBe(false)
    // A session that already went inactive does not replace twice.
    expect(identityReplaced({ isActive: false, webId: 'A' }, { isActive: false })).toBe(false)
    expect(identityReplaced({ isActive: false, webId: 'A' }, { isActive: false, webId: 'B' })).toBe(false)
  })
})

describe('identityState — session transitions', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })

  it('reports a login once, and nothing when the identity does not move', () => {
    const session = fakeSession({ isActive: false })
    const { events, emit } = collect()
    subscribeIdentity(session, { onEvent: emit })

    session.isActive = true
    session.webId = 'https://alice.example/me'
    session.fire('sessionStateChange')
    expect(events).toEqual(['sessionChange'])

    // A refocus with the same identity costs no event.
    document.dispatchEvent(new Event('visibilitychange'))
    expect(events).toEqual(['sessionChange'])
    session.fire('sessionStateChange')
    expect(events).toEqual(['sessionChange'])
  })

  it('reports a logout, and one replacement for the identity that was active', () => {
    const session = fakeSession({ isActive: true, webId: 'https://alice.example/me' })
    const { events, emit } = collect()
    subscribeIdentity(session, { onEvent: emit })

    session.isActive = false
    session.fire('sessionStateChange')
    expect(events).toEqual(['logout', 'identityReplaced'])

    // Clearing the retained WebID afterwards is no second replacement (the
    // session already went inactive) — the WebID change itself still counts as
    // a session change, which consumers only use to invalidate.
    session.webId = undefined
    session.fire('sessionStateChange')
    expect(events).toEqual(['logout', 'identityReplaced', 'sessionChange'])
  })

  it('reports an identity change while the session stays active', () => {
    const session = fakeSession({ isActive: true, webId: 'https://alice.example/me' })
    const { events, emit } = collect()
    subscribeIdentity(session, { onEvent: emit })

    session.webId = 'https://bob.example/me'
    session.fire('sessionStateChange')
    expect(events).toEqual(['sessionChange', 'identityReplaced'])
  })

  it('catches an A to B change that uvdsl never announces, around setTokenDetails', async () => {
    const session = fakeSession({ isActive: true, webId: 'https://alice.example/me' })
    // The library's single entry point for token updates, installed before the
    // subscription so the watcher wraps it.
    const original = vi.fn(async () => { session.webId = 'https://bob.example/me' })
    session.setTokenDetails = original
    const { events, emit } = collect()
    subscribeIdentity(session, { onEvent: emit })

    subscribeIdentity(session, {}) // second subscription must not wrap again
    await session.setTokenDetails('token')
    await flush()
    expect(original).toHaveBeenCalledTimes(1)
    expect(events).toEqual(['sessionChange', 'identityReplaced'])
  })
})

describe('identityState — refocus resync', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reports a cross-tab logout once, and does not repeat it on a later refocus', async () => {
    const session = fakeSession({ isActive: true, webId: 'https://alice.example/me' })
    const { events, emit } = collect()
    let restores = 0
    subscribeIdentity(session, {
      onEvent: emit,
      resync: async () => {
        restores += 1
        return 'cleared'
      }
    })

    document.dispatchEvent(new Event('visibilitychange'))
    await flush()
    expect(restores).toBe(1)
    expect(events).toEqual(['logout', 'identityReplaced'])

    document.dispatchEvent(new Event('visibilitychange'))
    await flush()
    expect(restores).toBe(2)
    expect(events).toEqual(['logout', 'identityReplaced'])
  })

  it('joins a resync in flight instead of starting a second one', async () => {
    const session = fakeSession({ isActive: true, webId: 'https://alice.example/me' })
    let resolveRestore: (value: unknown) => void = () => undefined
    let restores = 0
    subscribeIdentity(session, {
      resync: () => {
        restores += 1
        return new Promise(resolve => { resolveRestore = resolve })
      }
    })

    document.dispatchEvent(new Event('visibilitychange'))
    document.dispatchEvent(new Event('visibilitychange'))
    await flush()
    expect(restores).toBe(1)
    resolveRestore('changed')
    await flush()
  })

  it('drops an answer that belongs to an identity the session has left', async () => {
    const session = fakeSession({ isActive: true, webId: 'https://alice.example/me' })
    const { events, emit } = collect()
    let resolveRestore: (value: unknown) => void = () => undefined
    subscribeIdentity(session, {
      onEvent: emit,
      resync: () => new Promise(resolve => { resolveRestore = resolve })
    })

    document.dispatchEvent(new Event('visibilitychange'))
    await flush()

    // Bob logs in while Alice's restore is still in flight: the attempt's
    // answer is about Alice and must not log Bob out.
    session.webId = 'https://bob.example/me'
    session.fire('sessionStateChange')
    expect(events).toEqual(['sessionChange', 'identityReplaced'])

    resolveRestore('cleared')
    await flush()
    expect(events).toEqual(['sessionChange', 'identityReplaced'])
    expect(effectiveIdentity(session)).toEqual({ webId: 'https://bob.example/me', source: 'session' })
  })

  it('ignores a cleared answer when the raw identity moved without an event', async () => {
    const session = fakeSession({ isActive: true, webId: 'https://alice.example/me' })
    const { events, emit } = collect()
    let resolveRestore: (value: unknown) => void = () => undefined
    subscribeIdentity(session, {
      onEvent: emit,
      resync: () => new Promise(resolve => { resolveRestore = resolve })
    })

    document.dispatchEvent(new Event('visibilitychange'))
    await flush()
    // No event was dispatched: the watcher never saw this, which is exactly
    // the case the raw-identity guard exists for.
    session.webId = 'https://bob.example/me'
    resolveRestore('cleared')
    await flush()
    expect(events).toEqual([])
    expect(sessionExplicitlyInactive(session)).toBe(false)
  })
})

describe('identityState — cookie identity', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })

  it('adopts a cookie identity silently as a replacement source, and reports its loss', () => {
    const session = fakeSession({ isActive: false })
    const { events, emit } = collect()
    const subscription = subscribeIdentity(session, { onEvent: emit })

    subscription.reportCookieIdentity('https://cookie.example/profile/card#me')
    expect(events).toEqual(['sessionChange'])
    expect(effectiveIdentity(session)).toEqual({ webId: 'https://cookie.example/profile/card#me', source: 'cookie' })

    // Replacing a cookie identity is a replacement: the data fetched for the
    // previous cookie user has to go.
    subscription.reportCookieIdentity('https://other.example/profile/card#me')
    expect(events).toEqual(['sessionChange', 'sessionChange', 'identityReplaced'])

    subscription.reportCookieIdentity(null)
    expect(events).toEqual(['sessionChange', 'sessionChange', 'identityReplaced', 'sessionChange', 'identityReplaced'])
    expect(effectiveIdentity(session)).toEqual({ source: 'none' })
  })

  it('does not replace the identity while the session owns it', () => {
    const session = fakeSession({ isActive: true, webId: 'https://alice.example/me' })
    const { events, emit } = collect()
    const subscription = subscribeIdentity(session, { onEvent: emit })

    subscription.reportCookieIdentity('https://cookie.example/profile/card#me')
    expect(events).toEqual([])
    expect(effectiveIdentity(session)).toEqual({ webId: 'https://alice.example/me', source: 'session' })
  })

  it('forgets a remembered cookie identity once the session owns one again', () => {
    const session = fakeSession({ isActive: false })
    const subscription = subscribeIdentity(session, {})
    subscription.reportCookieIdentity('https://cookie.example/profile/card#me')
    expect(effectiveIdentity(session).source).toBe('cookie')

    // The session logs in: it owns the identity now, and the remembered cookie
    // value must not answer after a later logout.
    session.isActive = true
    session.webId = 'https://alice.example/me'
    session.fire('sessionStateChange')
    session.isActive = false
    session.fire('sessionStateChange')
    expect(effectiveIdentity(session)).toEqual({ source: 'none' })
  })

  it('ignores a probe that answers after its subscription was released', () => {
    const session = fakeSession({ isActive: false })
    const { events, emit } = collect()
    const subscription = subscribeIdentity(session, { onEvent: emit })

    subscription.unsubscribe()
    subscription.reportCookieIdentity('https://cookie.example/profile/card#me')
    expect(events).toEqual([])
    expect(effectiveIdentity(session)).toEqual({ source: 'none' })
  })

  it('forwards a refocus to the subscribers and removes the listener with the last one', async () => {
    const session = fakeSession({ isActive: true, webId: 'https://alice.example/me' })
    const onRefocus = vi.fn()
    const first = subscribeIdentity(session, { onRefocus })

    document.dispatchEvent(new Event('visibilitychange'))
    expect(onRefocus).toHaveBeenCalledTimes(1)

    first.unsubscribe()
    document.dispatchEvent(new Event('visibilitychange'))
    expect(onRefocus).toHaveBeenCalledTimes(1)
  })
})
