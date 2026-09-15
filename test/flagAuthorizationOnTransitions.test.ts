import { describe, expect, it, vi } from 'vitest'
import { SessionEvents } from '../src/authSession/events'
import { SESSION_TRANSITIONS, flagAuthorizationOnSessionTransitions } from '../src/authSession/flagAuthorizationOnTransitions'

describe('flagAuthorizationOnSessionTransitions', () => {
  it('marks the store metadata stale on every identity transition', () => {
    const flagAuthorizationMetadata = vi.fn()
    const session = { events: new SessionEvents() }
    flagAuthorizationOnSessionTransitions({ updater: { flagAuthorizationMetadata } }, session)

    for (const transition of SESSION_TRANSITIONS) {
      session.events.emit(transition)
    }

    expect(flagAuthorizationMetadata).toHaveBeenCalledTimes(SESSION_TRANSITIONS.length)
  })

  it('survives a session without the legacy event layer', () => {
    const flagAuthorizationMetadata = vi.fn()
    expect(() => {
      flagAuthorizationOnSessionTransitions({ updater: { flagAuthorizationMetadata } }, {})
    }).not.toThrow()
    expect(flagAuthorizationMetadata).not.toHaveBeenCalled()
  })

  it('survives a store that cannot flag, and a flag that throws', () => {
    const session = { events: new SessionEvents() }
    expect(() => {
      flagAuthorizationOnSessionTransitions({}, session)
    }).not.toThrow()

    flagAuthorizationOnSessionTransitions({ updater: { flagAuthorizationMetadata: () => { throw new Error('store gone') } } }, session)
    expect(() => session.events.emit('login')).not.toThrow()
  })
})
