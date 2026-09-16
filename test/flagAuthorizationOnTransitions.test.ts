import { describe, expect, it, vi } from 'vitest'
import { SessionEvents } from '../src/authSession/events'
import { SESSION_TRANSITIONS, ensureDocumentAuthorization, flagAuthorizationOnSessionTransitions, refreshDocumentAuthorization } from '../src/authSession/flagAuthorizationOnTransitions'
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

  it('stays unknown when the store cannot refresh (no capability)', async () => {
    const store = { updater: { editable: (): boolean => false } }
    // Without a refresh capability the previous identity's answer must not be
    // handed back as if it were current.
    await expect(refreshDocumentAuthorization(store, 'https://a.example/')).resolves.toBeUndefined()
  })

  it('refreshes again when the identity changed while the refresh was in flight', async () => {
    const session = { events: new SessionEvents() }
    let calls = 0
    let editableReads = 0
    const store: any = {
      fetcher: {
        refresh: (_doc: unknown, done?: () => void): void => {
          calls += 1
          // The identity changes mid-flight on the first refresh only.
          if (calls === 1) session.events.emit('sessionChange')
          done?.()
        }
      },
      updater: {
        flagAuthorizationMetadata: (): void => {},
        editable: (): string => {
          editableReads += 1
          return 'N3PATCH'
        }
      }
    }
    flagAuthorizationOnSessionTransitions(store, session)

    await expect(refreshDocumentAuthorization(store, 'https://a.example/')).resolves.toBe('N3PATCH')
    expect(calls).toBe(2)
    // The overtaken response is never read as the answer.
    expect(editableReads).toBe(1)
  })

  it('fails closed (unknown) when the identity keeps changing', async () => {
    const session = { events: new SessionEvents() }
    let calls = 0
    const store: any = {
      fetcher: {
        refresh: (_doc: unknown, done?: () => void): void => {
          calls += 1
          session.events.emit('sessionChange')
          done?.()
        }
      },
      updater: {
        flagAuthorizationMetadata: (): void => {},
        editable: (): string => 'N3PATCH'
      }
    }
    flagAuthorizationOnSessionTransitions(store, session)

    await expect(refreshDocumentAuthorization(store, 'https://a.example/')).resolves.toBeUndefined()
    expect(calls).toBe(3)
  })

  it('scopes the generation to the store — another store\'s transition is no overtake', async () => {
    const sessionA = { events: new SessionEvents() }
    const sessionB = { events: new SessionEvents() }
    let calls = 0
    const storeA: any = {
      fetcher: {
        refresh: (_doc: unknown, done?: () => void): void => {
          calls += 1
          // A transition in ANOTHER store/session must not overtake this refresh.
          sessionB.events.emit('sessionChange')
          done?.()
        }
      },
      updater: {
        flagAuthorizationMetadata: (): void => {},
        editable: (): string => 'N3PATCH'
      }
    }
    const storeB: any = { updater: { flagAuthorizationMetadata: (): void => {} } }
    flagAuthorizationOnSessionTransitions(storeA, sessionA)
    flagAuthorizationOnSessionTransitions(storeB, sessionB)

    await expect(refreshDocumentAuthorization(storeA, 'https://a.example/')).resolves.toBe('N3PATCH')
    expect(calls).toBe(1)
  })
})

describe('ensureDocumentAuthorization', () => {
  it('does not refresh when the store can answer definitively', async () => {
    let calls = 0
    const store: any = {
      fetcher: { refresh: (): void => { calls += 1 } },
      updater: { editable: (): string => 'N3PATCH' }
    }

    await expect(ensureDocumentAuthorization(store, 'https://a.example/')).resolves.toBe(true)
    expect(calls).toBe(0)
  })

  it('refreshes a flagged document before its triples are consumed', async () => {
    let calls = 0
    let flagged = true
    const store: any = {
      fetcher: {
        refresh: (_doc: unknown, done?: () => void): void => {
          calls += 1
          flagged = false
          done?.()
        }
      },
      updater: { editable: (): string | undefined => (flagged ? undefined : 'N3PATCH') }
    }

    await expect(ensureDocumentAuthorization(store, 'https://a.example/')).resolves.toBe(true)
    expect(calls).toBe(1)
  })

  it('keeps a definitive read-only answer readable (false is not a failure)', async () => {
    let calls = 0
    let flagged = true
    const store: any = {
      fetcher: {
        refresh: (_doc: unknown, done?: () => void): void => {
          calls += 1
          flagged = false
          done?.()
        }
      },
      updater: { editable: (): boolean | undefined => (flagged ? undefined : false) }
    }

    await expect(ensureDocumentAuthorization(store, 'https://a.example/')).resolves.toBe(true)
    expect(calls).toBe(1)
  })

  it('refreshes when a flag failure left the store answering for the previous identity', async () => {
    const session = { events: new SessionEvents() }
    let calls = 0
    const store: any = {
      fetcher: {
        refresh: (_doc: unknown, done?: () => void): void => {
          calls += 1
          done?.()
        }
      },
      updater: {
        flagAuthorizationMetadata: (): void => { throw new Error('store gone') },
        // Definitive, but from the previous identity: the failure must not be
        // treated as recovery.
        editable: (): string => 'N3PATCH'
      }
    }
    flagAuthorizationOnSessionTransitions(store, session)
    session.events.emit('sessionChange')

    await expect(ensureDocumentAuthorization(store, 'https://a.example/')).resolves.toBe(true)
    expect(calls).toBe(1)
  })

  it('treats a missing flag API as a failed invalidation', async () => {
    const session = { events: new SessionEvents() }
    let calls = 0
    const store: any = {
      fetcher: {
        refresh: (_doc: unknown, done?: () => void): void => {
          calls += 1
          done?.()
        }
      },
      // No flagAuthorizationMetadata: the store cannot be invalidated.
      updater: { editable: (): string => 'N3PATCH' }
    }
    flagAuthorizationOnSessionTransitions(store, session)
    session.events.emit('sessionChange')

    await expect(ensureDocumentAuthorization(store, 'https://a.example/')).resolves.toBe(true)
    expect(calls).toBe(1)
  })

  it('reports false when the needed repair cannot complete', async () => {
    const session = { events: new SessionEvents() }
    const store: any = {
      updater: {
        flagAuthorizationMetadata: (): void => { throw new Error('store gone') },
        editable: (): string => 'N3PATCH'
      }
    }
    flagAuthorizationOnSessionTransitions(store, session)
    session.events.emit('sessionChange')

    // No refresh capability: the caller must not consume cached triples.
    await expect(ensureDocumentAuthorization(store, 'https://a.example/')).resolves.toBe(false)
  })
})
