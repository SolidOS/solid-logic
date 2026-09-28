import { describe, expect, it, vi } from 'vitest'
import { createSolidLogic } from '../src/logic/solidLogic'
import { silenceDebugMessages } from './helpers/debugger'

silenceDebugMessages()

type Listener = () => void

/** A fake uvdsl-style session: the properties the identity state reads. */
function fakeSession (): any {
  const listeners = new Map<string, Set<Listener>>()
  return {
    isActive: false,
    webId: undefined as string | undefined,
    addEventListener (type: string, listener: Listener) {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(listener)
    },
    fire (type: string): void { listeners.get(type)?.forEach(listener => listener()) }
  }
}

describe('createSolidLogic', () => {
  it('releases the store invalidation subscription with the auth logic', () => {
    const session = fakeSession()
    const logic = createSolidLogic({ fetch: vi.fn() }, session)
    const flag = vi.spyOn(logic.store.updater!, 'flagAuthorizationMetadata')

    // A login flags every recorded response: the store is subscribed.
    session.isActive = true
    session.webId = 'https://alice.example/me'
    session.fire('sessionStateChange')
    expect(flag).toHaveBeenCalledTimes(1)

    // Disposing the auth logic releases the store's subscription as well.
    logic.authn.dispose?.()

    session.webId = 'https://bob.example/me'
    session.fire('sessionStateChange')
    expect(flag).toHaveBeenCalledTimes(1)
  })
})
