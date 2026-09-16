import { describe, expect, it, vi } from 'vitest'
import { SessionEvents } from '../src/authSession/events'
import { SESSION_TRANSITIONS, flagAuthorizationOnSessionTransitions, refreshDocumentAuthorization } from '../src/authSession/flagAuthorizationOnTransitions'
import { silenceDebugMessages } from './helpers/debugger'

silenceDebugMessages()

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

describe('refreshDocumentAuthorization', () => {
  it('force-refreshes the document before answering editability', async () => {
    const order: string[] = []
    const store = {
      fetcher: {
        // rdflib's real signature: callback completion, no useful return value.
        refresh: (doc: unknown, done?: () => void): void => {
          order.push(`refresh:${String(doc)}`)
          done?.()
        }
      },
      updater: {
        editable: (doc: unknown): string | boolean | undefined => {
          order.push(`editable:${String(doc)}`)
          return 'N3PATCH'
        }
      }
    }

    await expect(refreshDocumentAuthorization(store, 'https://a.example/')).resolves.toBe('N3PATCH')
    expect(order).toEqual(['refresh:https://a.example/', 'editable:https://a.example/'])
  })

  it('waits for the refresh callback before reading editability', async () => {
    const order: string[] = []
    const store = {
      fetcher: {
        refresh: (_doc: unknown, done?: () => void): void => {
          // The fresh response lands after the refresh call has returned.
          setTimeout(() => {
            order.push('refreshed')
            done?.()
          }, 0)
        }
      },
      updater: {
        editable: (): string => {
          order.push('editable')
          return 'N3PATCH'
        }
      }
    }

    await refreshDocumentAuthorization(store, 'https://a.example/')
    expect(order).toEqual(['refreshed', 'editable'])
  })

  it('still awaits a promise-returning refresh wrapper', async () => {
    const order: string[] = []
    const store = {
      fetcher: {
        refresh: async (): Promise<void> => {
          await Promise.resolve()
          order.push('refreshed')
        }
      },
      updater: {
        editable: (): boolean => {
          order.push('editable')
          return true
        }
      }
    }

    await refreshDocumentAuthorization(store, 'https://a.example/')
    expect(order).toEqual(['refreshed', 'editable'])
  })

  it('answers editability even when the store cannot refresh', async () => {
    const store = { updater: { editable: (): boolean => false } }
    await expect(refreshDocumentAuthorization(store, 'https://a.example/')).resolves.toBe(false)
  })
})
