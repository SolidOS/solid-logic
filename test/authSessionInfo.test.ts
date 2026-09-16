import { describe, expect, it } from 'vitest'
import { legacySessionInfo } from '../src/authSession/authSession'
import type { SessionLike } from '../src/authSession/transitions'

describe('legacySessionInfo', () => {
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
