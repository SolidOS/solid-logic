import { describe, expect, it } from 'vitest'
import { classifySessionTransition, identityReplaced, reloadOnIdentityReplaced, sessionIsActive, watchSessionTransitions, type DocumentLike, type SessionLike } from '../src/authSession/transitions'

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
