import { afterEach, describe, expect, it } from 'vitest'
import { loginCallbackUrl, restorePageAfterLoginCallback } from '../src/authSession/loginCallback'

describe('loginCallbackUrl', () => {
  it('moves a container or root callback to a child path', () => {
    expect(loginCallbackUrl('http://localhost:3200/')).toBe('http://localhost:3200/.oidc-callback')
    expect(loginCallbackUrl('http://localhost:3100/alice/Addressbook/#x')).toBe('http://localhost:3100/alice/Addressbook/.oidc-callback')
  })

  it('keeps the query of the page', () => {
    expect(loginCallbackUrl('http://localhost:3100/alice/?a=1')).toBe('http://localhost:3100/alice/.oidc-callback?a=1')
  })

  it('leaves documents unchanged apart from the fragment', () => {
    expect(loginCallbackUrl('http://localhost:3100/browse.html?uri=x#me')).toBe('http://localhost:3100/browse.html?uri=x')
  })
})

describe('restorePageAfterLoginCallback', () => {
  const start = window.location.href
  afterEach(() => window.history.replaceState(null, '', start))

  it('removes the callback segment and keeps the query', () => {
    window.history.replaceState(null, '', '/alice/Addressbook/.oidc-callback?a=1')
    restorePageAfterLoginCallback()
    expect(window.location.pathname).toBe('/alice/Addressbook/')
    expect(window.location.search).toBe('?a=1')
  })

  it('leaves other pages alone', () => {
    window.history.replaceState(null, '', '/alice/notes.oidc-callback')
    restorePageAfterLoginCallback()
    expect(window.location.pathname).toBe('/alice/notes.oidc-callback')
  })
})
