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

  it('refreshes again when the identity changed while the refresh was in flight', async () => {
    const store: any = { updater: { flagAuthorizationMetadata: (): void => {} } }
    const session = { events: new SessionEvents() }
    flagAuthorizationOnSessionTransitions(store, session)

    let calls = 0
    let editableReads = 0
    const flaky = {
      fetcher: {
        refresh: (_doc: unknown, done?: () => void): void => {
          calls += 1
          // The identity changes mid-flight on the first refresh only.
          if (calls === 1) session.events.emit('sessionChange')
          done?.()
        }
      },
      updater: {
        editable: (): string => {
          editableReads += 1
          return 'N3PATCH'
        }
      }
    }

    await expect(refreshDocumentAuthorization(flaky, 'https://a.example/')).resolves.toBe('N3PATCH')
    expect(calls).toBe(2)
    // The overtaken response is never read as the answer.
    expect(editableReads).toBe(1)
  })

  it('fails closed (unknown) when the identity keeps changing', async () => {
    const store: any = { updater: { flagAuthorizationMetadata: (): void => {} } }
    const session = { events: new SessionEvents() }
    flagAuthorizationOnSessionTransitions(store, session)

    let calls = 0
    const alwaysOvertaken = {
      fetcher: {
        refresh: (_doc: unknown, done?: () => void): void => {
          calls += 1
          session.events.emit('sessionChange')
          done?.()
        }
      },
      updater: { editable: (): string => 'N3PATCH' }
    }

    await expect(refreshDocumentAuthorization(alwaysOvertaken, 'https://a.example/')).resolves.toBeUndefined()
    expect(calls).toBe(3)
  })
})
