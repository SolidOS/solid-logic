import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ensureDocumentAuthorization,
  flagAuthorizationOnSessionTransitions,
  loadAuthorizedDocument,
  refreshDocumentAuthorization
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

/** A store whose fetcher answers `refresh` with a completion callback. */
function fakeStore (options: {
  flagFails?: boolean
  editable?: string | boolean | undefined
  refresh?: (doc: unknown, done: (ok?: unknown, message?: unknown) => void) => unknown
  load?: (doc: unknown) => unknown
} = {}): any {
  const editable = options.editable ?? 'N3PATCH'
  return {
    updater: {
      flagAuthorizationMetadata: vi.fn(() => {
        if (options.flagFails) throw new Error('no metadata support')
      }),
      editable: vi.fn(() => editable)
    },
    fetcher: {
      refresh: vi.fn((doc: unknown, done: any) => {
        if (options.refresh) return options.refresh(doc, done)
        done(true)
      }),
      load: vi.fn(async (doc: unknown) => {
        if (options.load) await options.load(doc)
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

  it('remembers a failed invalidation, so the decision points repair instead of trusting it', async () => {
    const session = fakeSession({ isActive: false })
    const store = fakeStore({ flagFails: true })
    connect(store, session)

    session.isActive = true
    session.webId = 'https://alice.example/me'
    session.fire('sessionStateChange')
    expect(store.updater.flagAuthorizationMetadata).toHaveBeenCalledTimes(1)

    // The store could not be invalidated: its recorded answer belongs to the
    // previous identity, so it must be refreshed even though editable() answers.
    await expect(ensureDocumentAuthorization(store, doc)).resolves.toBe(true)
    expect(store.fetcher.refresh).toHaveBeenCalledTimes(1)
  })

  it('trusts a definitive answer that was not invalidated', async () => {
    const store = fakeStore({ editable: false })
    await expect(ensureDocumentAuthorization(store, doc)).resolves.toBe(true)
    expect(store.fetcher.refresh).not.toHaveBeenCalled()
  })
})

describe('refreshDocumentAuthorization', () => {
  it('forces the refresh and answers under the current identity', async () => {
    const store = fakeStore()
    await expect(refreshDocumentAuthorization(store, doc)).resolves.toBe('N3PATCH')
    expect(store.fetcher.refresh).toHaveBeenCalledTimes(1)
    expect(store.updater.editable).toHaveBeenCalledTimes(1)
  })

  it('stays unknown when the refresh fails instead of answering from the recorded copy', async () => {
    const store = fakeStore({ refresh: (_doc, done) => { done(false, 'network down') } })
    await expect(refreshDocumentAuthorization(store, doc)).resolves.toBeUndefined()
    expect(store.updater.editable).not.toHaveBeenCalled()
  })

  it('gives up as unknown when the identity keeps changing under it', async () => {
    const session = fakeSession({ isActive: true, webId: 'https://alice.example/me' })
    const store = fakeStore({
      refresh: (_doc, done) => {
        // The identity moves on while the response is on its way.
        session.webId = session.webId === 'https://alice.example/me'
          ? 'https://bob.example/me'
          : 'https://alice.example/me'
        session.fire('sessionStateChange')
        done(true)
      }
    })
    connect(store, session)

    await expect(refreshDocumentAuthorization(store, doc)).resolves.toBeUndefined()
    expect(store.fetcher.refresh).toHaveBeenCalledTimes(3)
    expect(store.updater.editable).not.toHaveBeenCalled()
  })

  it('has no answer when the store cannot refresh at all', async () => {
    const store: any = { updater: { editable: vi.fn(() => 'N3PATCH') } }
    await expect(refreshDocumentAuthorization(store, doc)).resolves.toBeUndefined()
  })
})

describe('loadAuthorizedDocument', () => {
  it('consumes a load that was not overtaken by a transition', async () => {
    const store = fakeStore()
    await expect(loadAuthorizedDocument(store, doc)).resolves.toBe(true)
    expect(store.fetcher.load).toHaveBeenCalledTimes(1)
    expect(store.fetcher.refresh).not.toHaveBeenCalled()
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
    expect(store.fetcher.refresh).toHaveBeenCalledTimes(1)
  })

  it('reports false when the repair cannot be established', async () => {
    const session = fakeSession({ isActive: false })
    const store: any = {
      updater: {
        flagAuthorizationMetadata: vi.fn(),
        editable: vi.fn(() => 'N3PATCH')
      },
      // no fetcher.refresh: nothing can be re-answered
      fetcher: {
        load: vi.fn(async () => {
          session.isActive = true
          session.webId = 'https://alice.example/me'
          session.fire('sessionStateChange')
        })
      }
    }
    connect(store, session)

    await expect(loadAuthorizedDocument(store, doc)).resolves.toBe(false)
  })
})
