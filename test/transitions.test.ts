import { describe, expect, it, vi } from 'vitest'
import { classifySessionTransition, identityReplaced, reloadOnIdentityReplaced, restoreSession, sessionExplicitlyInactive, sessionIsActive, sessionWasCleared, watchSessionTransitions, type DocumentLike, type SessionLike } from '../src/authSession/transitions'

describe('classifySessionTransition', () => {
  it('reports a logout when the session goes inactive', () => {
    expect(classifySessionTransition(
      { isActive: true, webId: 'https://a.example/#me' },
      { isActive: false }
    )).toBe('logout')
  })

  it('reports a session change when a restored session becomes active', () => {
    expect(classifySessionTransition(
      { isActive: false },
      { isActive: true, webId: 'https://a.example/#me' }
    )).toBe('sessionChange')
  })

  it('reports a session change when the WebID changes while active', () => {
    expect(classifySessionTransition(
      { isActive: true, webId: 'https://a.example/#me' },
      { isActive: true, webId: 'https://b.example/#me' }
    )).toBe('sessionChange')
  })

  it('reports nothing when nothing changed (refocus with the same identity)', () => {
    expect(classifySessionTransition(
      { isActive: true, webId: 'https://a.example/#me' },
      { isActive: true, webId: 'https://a.example/#me' }
    )).toBeNull()
    expect(classifySessionTransition({ isActive: false }, { isActive: false })).toBeNull()
  })
})

describe('identityReplaced', () => {
  it('reports a replacement when an established WebID changes (A -> B)', () => {
    expect(identityReplaced(
      { isActive: true, webId: 'https://a.example/#me' },
      { isActive: true, webId: 'https://b.example/#me' }
    )).toBe(true)
  })

  it('reports a replacement when an established identity is cleared (A -> logged out)', () => {
    expect(identityReplaced(
      { isActive: true, webId: 'https://a.example/#me' },
      { isActive: false, webId: 'https://a.example/#me' }
    )).toBe(true)
    expect(identityReplaced(
      { isActive: true, webId: 'https://a.example/#me' },
      { isActive: false }
    )).toBe(true)
  })

  it('ignores start-up (no identity -> A) and a same-identity token refresh', () => {
    expect(identityReplaced({ isActive: false }, { isActive: true, webId: 'https://a.example/#me' })).toBe(false)
    expect(identityReplaced(
      { isActive: true, webId: 'https://a.example/#me' },
      { isActive: true, webId: 'https://a.example/#me' }
    )).toBe(false)
  })

  it('ignores a steady partial-logout state (the same WebID retained while inactive)', () => {
    // Otherwise every refocus would report a replacement again and a reload
    // consumer would loop.
    expect(identityReplaced(
      { isActive: false, webId: 'https://a.example/#me' },
      { isActive: false, webId: 'https://a.example/#me' }
    )).toBe(false)
  })

  it('does not repeat the replacement after a partial logout', () => {
    // The replacement was reported when A went inactive: clearing the retained
    // WebID, or a later login as someone else, is not a second replacement.
    expect(identityReplaced(
      { isActive: false, webId: 'https://a.example/#me' },
      { isActive: false }
    )).toBe(false)
    expect(identityReplaced(
      { isActive: false, webId: 'https://a.example/#me' },
      { isActive: true, webId: 'https://b.example/#me' }
    )).toBe(false)
  })
})

describe('reloadOnIdentityReplaced', () => {
  it('subscribes the reload action to identityReplaced', () => {
    const handlers: Record<string, () => void> = {}
    const events = {
      on: (event: string, handler: () => void): void => { handlers[event] = handler }
    }
    let reloads = 0
    reloadOnIdentityReplaced(events, () => { reloads += 1 })

    expect(handlers.identityReplaced).toBeInstanceOf(Function)
    handlers.identityReplaced()
    expect(reloads).toBe(1)
  })

  it('does nothing without an event layer', () => {
    expect(() => reloadOnIdentityReplaced(undefined)).not.toThrow()
  })
})

// A session stand-in: a real EventTarget the test can poke. setTokenDetails
// mirrors the uvdsl method every token update goes through.
class FakeSession extends EventTarget {
  isActive = false
  webId: string | undefined

  async setTokenDetails (details: { webId?: string }): Promise<void> {
    this.webId = details.webId
  }
}

describe('sessionIsActive', () => {
  it('treats an explicit isActive:false as inactive even with a cached WebID', () => {
    expect(sessionIsActive({ isActive: false, webId: 'https://a.example/#me' })).toBe(false)
  })

  it('falls back to the WebID only when isActive is undefined', () => {
    expect(sessionIsActive({ webId: 'https://a.example/#me' })).toBe(true)
    expect(sessionIsActive({})).toBe(false)
  })

  it('is active when isActive is true', () => {
    expect(sessionIsActive({ isActive: true })).toBe(true)
  })
})

describe('restoreSession', () => {
  it('shares a restore that is already in flight', async () => {
    let restores = 0
    let resolveRestore: (value: unknown) => void = () => undefined
    const session = {
      restore: (): Promise<unknown> => {
        restores += 1
        return new Promise((resolve) => { resolveRestore = resolve })
      }
    }

    const first = restoreSession(session)
    const second = restoreSession(session)
    // The shared attempt calls restore() on the next microtask.
    await Promise.resolve()

    // `restore()` can mutate the session, so both call sites share one attempt.
    expect(restores).toBe(1)
    expect(second).toBe(first)

    resolveRestore('restored')
    await expect(first).resolves.toBe('restored')

    // Once it settled, the next caller starts a new restore.
    void restoreSession(session)
    await Promise.resolve()
    expect(restores).toBe(2)
  })

  it('has nothing to share when the session cannot restore', () => {
    expect(restoreSession(undefined)).toBeUndefined()
    expect(restoreSession({})).toBeUndefined()
  })
})

describe('watchSessionTransitions', () => {
  it('emits on the session state event', () => {
    const session = new FakeSession()
    const emitted: string[] = []
    watchSessionTransitions(session as unknown as SessionLike, (event) => emitted.push(event), undefined)

    session.isActive = true
    session.webId = 'https://a.example/#me'
    session.dispatchEvent(new Event('sessionStateChange'))
    expect(emitted).toEqual(['sessionChange'])

    session.isActive = false
    session.webId = undefined
    session.dispatchEvent(new Event('sessionStateChange'))
    expect(emitted).toEqual(['sessionChange', 'logout', 'identityReplaced'])
  })

  it('notices a WebID change while the session stays active (token update)', async () => {
    const session = new FakeSession()
    session.isActive = true
    session.webId = 'https://a.example/#me'
    const emitted: string[] = []
    watchSessionTransitions(session as unknown as SessionLike, (event) => emitted.push(event), undefined)

    // uvdsl dispatches sessionStateChange only when isActive changes; the
    // token update itself is the evidence of an A -> B switch.
    await session.setTokenDetails({ webId: 'https://b.example/#me' })

    expect(emitted).toEqual(['sessionChange', 'identityReplaced'])
  })

  it('emits logout when isActive flips false while a WebID is still cached', () => {
    const session = new FakeSession()
    session.isActive = true
    session.webId = 'https://a.example/#me'
    const emitted: string[] = []
    watchSessionTransitions(session as unknown as SessionLike, (event) => emitted.push(event), undefined)

    session.isActive = false // webId retained, as during a partial logout
    session.dispatchEvent(new Event('sessionStateChange'))

    expect(emitted).toEqual(['logout', 'identityReplaced'])
  })

  it('emits identityReplaced when an established identity is replaced', () => {
    const session = new FakeSession()
    session.isActive = true
    session.webId = 'https://a.example/#me'
    const emitted: string[] = []
    watchSessionTransitions(session as unknown as SessionLike, (event) => emitted.push(event), undefined)

    session.webId = 'https://b.example/#me'
    session.dispatchEvent(new Event('sessionStateChange'))

    expect(emitted).toEqual(['sessionChange', 'identityReplaced'])
  })

  it('does not repeat identityReplaced for a steady partial-logout state on refocus', () => {
    const session = new FakeSession()
    session.isActive = false
    session.webId = 'https://a.example/#me' // retained, as during a partial logout
    const emitted: string[] = []
    const handlers: Record<string, () => void> = {}
    const doc: DocumentLike = {
      visibilityState: 'visible',
      addEventListener: (type: string, listener: () => void): void => { handlers[type] = listener }
    }
    watchSessionTransitions(session as unknown as SessionLike, (event) => emitted.push(event), doc)

    handlers.visibilitychange()
    handlers.visibilitychange()
    expect(emitted).toEqual([])
  })

  it('notices a change made elsewhere when the tab is refocused', () => {
    const session = new FakeSession()
    const emitted: string[] = []
    const handlers: Record<string, () => void> = {}
    const doc: DocumentLike = {
      visibilityState: 'visible',
      addEventListener: (type: string, listener: () => void): void => { handlers[type] = listener }
    }
    watchSessionTransitions(session as unknown as SessionLike, (event) => emitted.push(event), doc)

    // Another tab logged in while this one sat in the background.
    session.isActive = true
    session.webId = 'https://b.example/#me'
    handlers.visibilitychange()
    expect(emitted).toEqual(['sessionChange'])

    // Refocusing again with the same identity costs nothing.
    handlers.visibilitychange()
    expect(emitted).toEqual(['sessionChange'])
  })

  it('re-reads the session on refocus when it cannot receive pushed changes', async () => {
    const session = new FakeSession()
    session.isActive = true
    session.webId = 'https://a.example/#me'
    const emitted: string[] = []
    const handlers: Record<string, () => void> = {}
    const doc: DocumentLike = {
      visibilityState: 'visible',
      addEventListener: (type: string, listener: () => void): void => { handlers[type] = listener }
    }
    watchSessionTransitions(
      session as unknown as SessionLike,
      (event) => emitted.push(event),
      doc,
      // SessionCore cannot hear the other tab: re-reading pulls the change in.
      () => { session.webId = 'https://b.example/#me' }
    )

    handlers.visibilitychange()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(emitted).toEqual(['sessionChange', 'identityReplaced'])
  })

  it('reports the logout when the resync finds the backing session cleared', async () => {
    const session = new FakeSession()
    session.isActive = true
    session.webId = 'https://a.example/#me'
    const emitted: string[] = []
    const handlers: Record<string, () => void> = {}
    const doc: DocumentLike = {
      visibilityState: 'visible',
      addEventListener: (type: string, listener: () => void): void => { handlers[type] = listener }
    }
    watchSessionTransitions(
      session as unknown as SessionLike,
      (event) => emitted.push(event),
      doc,
      // Another tab logged out: restore() rejected with "No session to
      // restore." and left the local session state untouched.
      () => 'cleared'
    )

    handlers.visibilitychange()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(emitted).toEqual(['logout', 'identityReplaced'])
  })

  it('compares as it stands when the resync fails transiently', async () => {
    const session = new FakeSession()
    session.isActive = true
    session.webId = 'https://a.example/#me'
    const emitted: string[] = []
    const handlers: Record<string, () => void> = {}
    const doc: DocumentLike = {
      visibilityState: 'visible',
      addEventListener: (type: string, listener: () => void): void => { handlers[type] = listener }
    }
    watchSessionTransitions(
      session as unknown as SessionLike,
      (event) => emitted.push(event),
      doc,
      () => { throw new Error('HTTP 400 on refresh') }
    )

    handlers.visibilitychange()
    await new Promise((resolve) => setTimeout(resolve, 0))

    // A transient refresh failure is not a logout.
    expect(emitted).toEqual([])
  })

  it('reports a cleared session that only answers after the resync timeout', async () => {
    vi.useFakeTimers()
    try {
      const session = new FakeSession()
      session.isActive = true
      session.webId = 'https://a.example/#me'
      const emitted: string[] = []
      const handlers: Record<string, () => void> = {}
      const doc: DocumentLike = {
        visibilityState: 'visible',
        addEventListener: (type: string, listener: () => void): void => { handlers[type] = listener }
      }
      watchSessionTransitions(
        session as unknown as SessionLike,
        (event) => emitted.push(event),
        doc,
        // A slow cross-tab logout: the answer arrives long after the timeout.
        () => new Promise((resolve) => setTimeout(() => resolve('cleared'), 5000))
      )

      handlers.visibilitychange()
      await vi.advanceTimersByTimeAsync(2500)
      // Timed out: the comparison ran as it stood, nothing reported yet.
      expect(emitted).toEqual([])

      await vi.advanceTimersByTimeAsync(3000)
      // The outcome was kept, not discarded.
      expect(emitted).toEqual(['logout', 'identityReplaced'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops answering for the cleared identity once the backing session is gone', async () => {
    const session = new FakeSession()
    session.isActive = true
    session.webId = 'https://a.example/#me'
    const emitted: string[] = []
    const handlers: Record<string, () => void> = {}
    const doc: DocumentLike = {
      visibilityState: 'visible',
      addEventListener: (type: string, listener: () => void): void => { handlers[type] = listener }
    }
    watchSessionTransitions(
      session as unknown as SessionLike,
      (event) => emitted.push(event),
      doc,
      // Another tab logged out. The local session object still reports Alice:
      // restore() can reject without mutating it.
      () => 'cleared'
    )

    handlers.visibilitychange()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(emitted).toEqual(['logout', 'identityReplaced'])
    // The local object still carries Alice, but the session is no longer usable:
    // the consumers that read it directly must stand down.
    expect(session.webId).toBe('https://a.example/#me')
    expect(sessionWasCleared(session)).toBe(true)
    expect(sessionExplicitlyInactive(session)).toBe(true)

    // A later login in this tab is a new identity, not masked by the clear.
    session.webId = 'https://b.example/#me'
    session.dispatchEvent(new Event('sessionStateChange'))
    expect(emitted).toEqual(['logout', 'identityReplaced', 'sessionChange'])
    expect(sessionWasCleared(session)).toBe(false)
    expect(sessionExplicitlyInactive(session)).toBe(false)
  })

  it('compares again when a slow resync only reports a change after the timeout', async () => {
    vi.useFakeTimers()
    try {
      const session = new FakeSession()
      session.isActive = true
      session.webId = 'https://a.example/#me'
      const emitted: string[] = []
      const handlers: Record<string, () => void> = {}
      const doc: DocumentLike = {
        visibilityState: 'visible',
        addEventListener: (type: string, listener: () => void): void => { handlers[type] = listener }
      }
      watchSessionTransitions(
        session as unknown as SessionLike,
        (event) => emitted.push(event),
        doc,
        // A slow cross-tab login: the re-read only updates the session (A -> B)
        // long after the comparison gave up waiting.
        () => new Promise((resolve) => setTimeout(() => {
          session.webId = 'https://b.example/#me'
          resolve('changed')
        }, 5000))
      )

      handlers.visibilitychange()
      await vi.advanceTimersByTimeAsync(2500)
      // Timed out: compared as it stood, nothing reported yet.
      expect(emitted).toEqual([])

      await vi.advanceTimersByTimeAsync(3000)
      // The late change was compared instead of being dropped.
      expect(emitted).toEqual(['sessionChange', 'identityReplaced'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not apply a cleared outcome that a newer transition superseded', async () => {
    vi.useFakeTimers()
    try {
      const session = new FakeSession()
      session.isActive = true
      session.webId = 'https://a.example/#me'
      const emitted: string[] = []
      const handlers: Record<string, () => void> = {}
      const doc: DocumentLike = {
        visibilityState: 'visible',
        addEventListener: (type: string, listener: () => void): void => { handlers[type] = listener }
      }
      let resolveResync: (value: unknown) => void = () => undefined
      watchSessionTransitions(
        session as unknown as SessionLike,
        (event) => emitted.push(event),
        doc,
        () => new Promise((resolve) => { resolveResync = resolve })
      )

      handlers.visibilitychange()
      await vi.advanceTimersByTimeAsync(2500)
      expect(emitted).toEqual([])

      // Bob logs in in this tab while the slow resync is still in flight.
      session.webId = 'https://b.example/#me'
      session.dispatchEvent(new Event('sessionStateChange'))
      expect(emitted).toEqual(['sessionChange', 'identityReplaced'])

      // The resync now answers about the state from before Bob logged in.
      resolveResync('cleared')
      await vi.advanceTimersByTimeAsync(0)

      // Bob must not be reported as logged out, and his credentials must stay
      // usable: the outcome belonged to the superseded state.
      expect(emitted).toEqual(['sessionChange', 'identityReplaced'])
      expect(sessionWasCleared(session)).toBe(false)
      expect(sessionExplicitlyInactive(session)).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('runs one resync at a time when the tab is refocused repeatedly', async () => {
    const session = new FakeSession()
    const emitted: string[] = []
    const handlers: Record<string, () => void> = {}
    const doc: DocumentLike = {
      visibilityState: 'visible',
      addEventListener: (type: string, listener: () => void): void => { handlers[type] = listener }
    }
    let resyncs = 0
    let resolveResync: (value: unknown) => void = () => undefined
    watchSessionTransitions(
      session as unknown as SessionLike,
      (event) => emitted.push(event),
      doc,
      // `restore()` can mutate the session, so overlapping restores could
      // overwrite a newer identity: the second refocus joins the first resync.
      () => {
        resyncs += 1
        return new Promise((resolve) => { resolveResync = resolve })
      }
    )

    handlers.visibilitychange()
    await Promise.resolve()
    handlers.visibilitychange()
    await Promise.resolve()
    expect(resyncs).toBe(1)

    // The single resync pulled in Bob's login: reported once, by the newest refocus.
    session.isActive = true
    session.webId = 'https://b.example/#me'
    resolveResync('changed')
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(resyncs).toBe(1)
    expect(emitted).toEqual(['sessionChange'])
  })

  it('does not apply a cleared outcome once the session reports another identity', async () => {
    const session = new FakeSession()
    session.isActive = true
    session.webId = 'https://a.example/#me'
    const emitted: string[] = []
    const handlers: Record<string, () => void> = {}
    const doc: DocumentLike = {
      visibilityState: 'visible',
      addEventListener: (type: string, listener: () => void): void => { handlers[type] = listener }
    }
    let resolveResync: (value: unknown) => void = () => undefined
    watchSessionTransitions(
      session as unknown as SessionLike,
      (event) => emitted.push(event),
      doc,
      () => new Promise((resolve) => { resolveResync = resolve })
    )

    handlers.visibilitychange()
    await Promise.resolve()
    // The identity changes while the restore is in flight — without a session
    // event the watcher cannot see a transition at all.
    session.webId = 'https://b.example/#me'
    resolveResync('cleared')
    await new Promise((resolve) => setTimeout(resolve, 0))

    // The answer was about Alice; Bob must not be logged out by it.
    expect(emitted).toEqual([])
    expect(sessionWasCleared(session)).toBe(false)
    expect(sessionExplicitlyInactive(session)).toBe(false)
  })

  it('does not mark a session that was never established as cleared', async () => {
    const session = new FakeSession()
    const emitted: string[] = []
    const handlers: Record<string, () => void> = {}
    const doc: DocumentLike = {
      visibilityState: 'visible',
      addEventListener: (type: string, listener: () => void): void => { handlers[type] = listener }
    }
    watchSessionTransitions(session as unknown as SessionLike, (event) => emitted.push(event), doc, () => 'cleared')

    handlers.visibilitychange()
    await new Promise((resolve) => setTimeout(resolve, 0))

    // Nothing was in use, so nothing is reported and nothing is invalidated:
    // a mark here would mask the login that follows.
    expect(emitted).toEqual([])
    expect(sessionWasCleared(session)).toBe(false)

    session.isActive = true
    session.webId = 'https://a.example/#me'
    session.dispatchEvent(new Event('sessionStateChange'))

    expect(emitted).toEqual(['sessionChange'])
    expect(sessionExplicitlyInactive(session)).toBe(false)
  })

  it('checks nothing while the tab is hidden', () => {
    const session = new FakeSession()
    const emitted: string[] = []
    const handlers: Record<string, () => void> = {}
    const doc: DocumentLike = {
      visibilityState: 'hidden',
      addEventListener: (type: string, listener: () => void): void => { handlers[type] = listener }
    }
    watchSessionTransitions(session as unknown as SessionLike, (event) => emitted.push(event), doc)

    session.isActive = true
    session.webId = 'https://b.example/#me'
    handlers.visibilitychange()
    expect(emitted).toEqual([])

    doc.visibilityState = 'visible'
    handlers.visibilitychange()
    expect(emitted).toEqual(['sessionChange'])
  })

  it('works with a session that has no event listener support', () => {
    const emitted: string[] = []
    const handlers: Record<string, () => void> = {}
    const doc: DocumentLike = {
      visibilityState: 'visible',
      addEventListener: (type: string, listener: () => void): void => { handlers[type] = listener }
    }
    const session: SessionLike = { isActive: true, webId: 'https://a.example/#me' }
    watchSessionTransitions(session, (event) => emitted.push(event), doc)

    session.webId = 'https://b.example/#me'
    handlers.visibilitychange()
    expect(emitted).toEqual(['sessionChange', 'identityReplaced'])
  })
})
