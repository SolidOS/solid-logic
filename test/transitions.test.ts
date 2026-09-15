import { describe, expect, it } from 'vitest'
import { classifySessionTransition, watchSessionTransitions, type DocumentLike, type SessionLike } from '../src/authSession/transitions'

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

// A session stand-in: a real EventTarget the test can poke.
class FakeSession extends EventTarget {
  isActive = false
  webId: string | undefined
}

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
    expect(emitted).toEqual(['sessionChange', 'logout'])
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
    expect(emitted).toEqual(['sessionChange'])
  })
})
