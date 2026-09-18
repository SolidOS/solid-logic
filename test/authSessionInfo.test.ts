import { describe, expect, it } from 'vitest'
import { legacySessionInfo } from '../src/authSession/authSession'
import { watchSessionTransitions, type DocumentLike, type SessionLike } from '../src/authSession/transitions'

describe('legacySessionInfo', () => {
  it('reports a session whose backing store was cleared as logged out', async () => {
    // Another tab logged out: the local session object still reports Alice.
    const session = { isActive: true, webId: 'https://a.example/#me' }
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
      () => 'cleared'
    )

    handlers.visibilitychange()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(emitted).toEqual(['logout', 'identityReplaced'])
    expect(legacySessionInfo(session as unknown as SessionLike))
      .toEqual({ webId: undefined, isLoggedIn: false })
  })

  it('reports an inactive session as logged out even when a WebID is still cached', () => {
    expect(legacySessionInfo({ isActive: false, webId: 'https://a.example/#me' } as SessionLike))
      .toEqual({ webId: 'https://a.example/#me', isLoggedIn: false })
  })

  it('falls back to the WebID only when isActive is undefined', () => {
    expect(legacySessionInfo({ webId: 'https://a.example/#me' } as SessionLike).isLoggedIn).toBe(true)
    expect(legacySessionInfo({} as SessionLike)).toEqual({ webId: undefined, isLoggedIn: false })
  })

  it('reports an active session as logged in', () => {
    expect(legacySessionInfo({ isActive: true, webId: 'https://a.example/#me' } as SessionLike).isLoggedIn).toBe(true)
  })
})
