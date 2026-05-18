import fetchMock from 'jest-fetch-mock'
import { TextEncoder, TextDecoder } from 'util'

global.TextEncoder = TextEncoder as any
global.TextDecoder = TextDecoder as any

fetchMock.enableMocks()

// @uvdsl/solid-oidc-client-browser uses `import.meta.url` (for its
// SharedWorker URL), which jest/jsdom cannot evaluate. Stub the module
// surface used by the adapter so SolidAuthnLogic can be unit-tested.
jest.mock('@uvdsl/solid-oidc-client-browser', () => {
  class Session {
    isActive = false
    webId = undefined
    async login() {}
    async logout() {}
    async handleRedirectFromLogin() {}
    async restore() {}
    authFetch(input: any, init?: any) { return fetch(input, init) }
  }
  class SessionIDB {}
  return { Session, SessionIDB }
}, { virtual: true })