import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ensureDocumentAuthorization,
  flagAuthorizationOnSessionTransitions,
  loadAuthorizedDocument
} from '../src/authSession/flagAuthorizationOnTransitions'
import { silenceDebugMessages } from './helpers/debugger'

silenceDebugMessages()

type Listener = () => void

function fakeSession (init: { isActive?: boolean, webId?: string } = {}): any {
  const listeners = new Map<string, Set<Listener>>()
  const session: any = {
    isActive: init.isActive,
    webId: init.webId,
    addEventListener (type: string, listener: Listener) {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(listener)
    },
    fire (type: string): void { listeners.get(type)?.forEach(listener => listener()) }
  }
  return session
}

/**
 * A store that models the rdflib contract this module relies on:
 * `flagAuthorizationMetadata()` makes every recorded answer unusable
 * (`editable()` → undefined), and a `load()` of a fully flagged document
 * records a fresh answer (linkeddata/rdflib.js#871).
 */
function fakeStore (options: {
  flagFails?: boolean
  answer?: string | boolean | undefined
  freshAnswer?: string | boolean | undefined
  load?: (doc: unknown) => unknown
} = {}): any {
  let flagged = false
  let answer = options.answer ?? 'SPARQL'
  const freshAnswer = options.freshAnswer ?? 'SPARQL'
  return {
    updater: {
      flagAuthorizationMetadata: vi.fn(() => {
        if (options.flagFails) throw new Error('no metadata support')
        flagged = true
      }),
      editable: vi.fn(() => flagged ? undefined : answer)
    },
    fetcher: {
      load: vi.fn(async (doc: unknown) => {
        await options.load?.(doc)
        if (flagged) {
          flagged = false
          answer = freshAnswer
        }
      })
    }
  }
}

const doc = 'https://example.org/doc'

let unsubscribes: Array<() => void> = []

const connect = (store: any, session: any): void => {
  unsubscribes.push(flagAuthorizationOnSessionTransitions(store, session))
}

afterEach(() => {
  unsubscribes.forEach(unsubscribe => unsubscribe())
  unsubscribes = []
})

describe('flagAuthorizationOnSessionTransitions', () => {
  it('flags the store when the identity changes, and only then', () => {
    const session = fakeSession({ isActive: false })
    const store = fakeStore()
    connect(store, session)

    expect(store.updater.flagAuthorizationMetadata).not.toHaveBeenCalled()

    // A refocus or event with no change costs nothing.
    session.fire('sessionStateChange')
    expect(store.updater.flagAuthorizationMetadata).not.toHaveBeenCalled()

    session.isActive = true
    session.webId = 'https://alice.example/me'
    session.fire('sessionStateChange')
    expect(store.updater.flagAuthorizationMetadata).toHaveBeenCalledTimes(1)
  })

  it('covers logout and an identity change while active', () => {
    const session = fakeSession({ isActive: true, webId: 'https://alice.example/me' })
    const store = fakeStore()
    connect(store, session)

    session.webId = 'https://bob.example/me'
    session.fire('sessionStateChange')
    session.isActive = false
    session.fire('sessionStateChange')

    expect(store.updater.flagAuthorizationMetadata).toHaveBeenCalledTimes(2)
    // Every recorded answer is unknown from here on.
    expect(store.updater.editable(doc)).toBeUndefined()
  })

  it('stops flagging once the subscription is released', () => {
    const session = fakeSession({ isActive: false })
    const store = fakeStore()
    connect(store, session)
    unsubscribes.pop()!() // release the one this test created

    session.isActive = true
    session.webId = 'https://alice.example/me'
    session.fire('sessionStateChange')

    expect(store.updater.flagAuthorizationMetadata).not.toHaveBeenCalled()
  })
})

describe('ensureDocumentAuthorization', () => {
  it('trusts a definitive answer that was not invalidated, without loading', async () => {
    const store = fakeStore({ answer: false })
    await expect(ensureDocumentAuthorization(store, doc)).resolves.toBe(true)
    expect(store.fetcher.load).not.toHaveBeenCalled()
  })

  it('repairs a flagged answer through a load', async () => {
    const session = fakeSession({ isActive: false })
    const store = fakeStore()
    connect(store, session)

    session.isActive = true
    session.webId = 'https://alice.example/me'
    session.fire('sessionStateChange')
    expect(store.updater.editable(doc)).toBeUndefined()

    await expect(ensureDocumentAuthorization(store, doc)).resolves.toBe(true)
    expect(store.fetcher.load).toHaveBeenCalledTimes(1)
    // The fresh answer is what the caller reads afterwards.
    expect(store.updater.editable(doc)).toBe('SPARQL')
  })

  it('repairs a store whose invalidation FAILED instead of trusting it', async () => {
    const session = fakeSession({ isActive: false })
    const store = fakeStore({ flagFails: true })
    connect(store, session)

    session.isActive = true
    session.webId = 'https://alice.example/me'
    session.fire('sessionStateChange')
    expect(store.updater.editable(doc)).toBe('SPARQL') // still the old identity's answer

    // Cannot invalidate and cannot repair — the caller must not trust it.
    await expect(ensureDocumentAuthorization(store, doc)).resolves.toBe(false)
  })

  it('stays unknown when the load fails', async () => {
    const session = fakeSession({ isActive: false })
    const store = fakeStore({ load: () => { throw new Error('network down') } })
    connect(store, session)

    session.isActive = true
    session.webId = 'https://alice.example/me'
    session.fire('sessionStateChange')

    await expect(ensureDocumentAuthorization(store, doc)).resolves.toBe(false)
  })

  it('gives up as unknown when the identity keeps changing under it', async () => {
    const session = fakeSession({ isActive: false })
    const store = fakeStore({
      load: () => {
        // The identity moves on while the response is on its way.
        session.webId = session.webId === 'https://alice.example/me'
          ? 'https://bob.example/me'
          : 'https://alice.example/me'
        session.fire('sessionStateChange')
      }
    })
    connect(store, session)

    // A first login flags the recorded answer; every repair is overtaken.
    session.isActive = true
    session.webId = 'https://alice.example/me'
    session.fire('sessionStateChange')

    // Never a stale answer: the module answers unknown, whatever the last
    // overtaken response left behind.
    await expect(ensureDocumentAuthorization(store, doc)).resolves.toBe(false)
    expect(store.fetcher.load).toHaveBeenCalledTimes(3)
  })

  it('has no answer when the store cannot load at all', async () => {
    const session = fakeSession({ isActive: false })
    // No fetcher, and flagging fails: the recorded answer stays definitive for
    // the previous identity and there is nothing to reload it with.
    const store: any = {
      updater: {
        editable: vi.fn(() => 'SPARQL'),
        flagAuthorizationMetadata: vi.fn(() => { throw new Error('cannot invalidate') })
      }
    }
    connect(store, session)

    session.isActive = true
    session.webId = 'https://alice.example/me'
    session.fire('sessionStateChange')

    // The caller must not trust it, and must not act on a stale answer either.
    await expect(ensureDocumentAuthorization(store, doc)).resolves.toBe(false)
  })
})

describe('loadAuthorizedDocument', () => {
  it('consumes a load that was not overtaken by a transition', async () => {
    const store = fakeStore()
    await expect(loadAuthorizedDocument(store, doc)).resolves.toBe(true)
    expect(store.fetcher.load).toHaveBeenCalledTimes(1)
  })

  it('refuses to report success when the store cannot load at all', async () => {
    // No fetcher to load with: the call fails like a plain load() would,
    // instead of answering "consumed" for a document it never loaded.
    const store: any = { updater: { editable: vi.fn(() => 'SPARQL') } }
    await expect(loadAuthorizedDocument(store, doc)).rejects.toThrow('fetcher.load is unavailable')
  })

  it('repairs a load that a transition overtook', async () => {
    const session = fakeSession({ isActive: false })
    const store = fakeStore({
      load: () => {
        // A login lands while the response is in flight: the flag only marks
        // responses that already existed, so this one would look definitive.
        session.isActive = true
        session.webId = 'https://alice.example/me'
        session.fire('sessionStateChange')
      }
    })
    connect(store, session)

    await expect(loadAuthorizedDocument(store, doc)).resolves.toBe(true)
    expect(store.fetcher.load).toHaveBeenCalledTimes(2)
    expect(store.updater.editable(doc)).toBe('SPARQL')
  })

  it('reports false when the repair cannot be established', async () => {
    const session = fakeSession({ isActive: false })
    const store = fakeStore({
      flagFails: true,
      load: () => {
        session.isActive = true
        session.webId = 'https://alice.example/me'
        session.fire('sessionStateChange')
      }
    })
    connect(store, session)

    await expect(loadAuthorizedDocument(store, doc)).resolves.toBe(false)
  })
})
