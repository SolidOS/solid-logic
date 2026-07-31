import { vi } from 'vitest'

type MatchPattern = RegExp | string | ((request: Request) => boolean)
type HandlerResult = any
type Handler = (request: Request) => any

type Rule = {
  pattern: MatchPattern
  handler: Handler
  once: boolean
}

const rules: Rule[] = []
const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = []
let defaultResponse = new Response('Not Found', { status: 404 })

function toResponse (result: HandlerResult): Response | Promise<Response> {
  if (result instanceof Response || result instanceof Promise) {
    return result
  }

  if (typeof result === 'string') {
    return new Response(result, { status: 200 })
  }

  const status = typeof result.status === 'number' ? result.status : 200
  const body = typeof result.body === 'string' ? result.body : ''
  const headers = result.headers instanceof Headers
    ? result.headers
    : new Headers(result.headers as Record<string, string> | undefined)

  return new Response(body, { status, headers })
}

function matches (pattern: MatchPattern, request: Request): boolean {
  if (pattern instanceof RegExp) return pattern.test(request.url)
  if (typeof pattern === 'string') return pattern === request.url
  return pattern(request)
}

function createFetchMock () {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push([input, init])
    const request = input instanceof Request ? input : new Request(input, init)

    const ruleIndex = (() => {
      for (let index = rules.length - 1; index >= 0; index -= 1) {
        if (matches(rules[index].pattern, request)) {
          return index
        }
      }
      return -1
    })()
    if (ruleIndex >= 0) {
      const [rule] = rules.splice(ruleIndex, 1)
      const response = await rule.handler(request)
      if (!rule.once) {
        rules.push(rule)
      }
      return toResponse(response)
    }

    return defaultResponse.clone()
  })
}

export type FetchMock = ReturnType<typeof vi.fn> & {
  mockResponse: (body: string, init?: ResponseInit) => typeof fetchMock
  mockResponseOnce: (body: string, init?: ResponseInit) => typeof fetchMock
  mockIf: (pattern: MatchPattern, bodyOrHandler: HandlerResult | Handler, init?: ResponseInit) => typeof fetchMock
  mockOnceIf: (pattern: MatchPattern, bodyOrHandler: HandlerResult | Handler, init?: ResponseInit) => typeof fetchMock
  resetMocks: () => void
}

export const fetchMock = createFetchMock() as FetchMock

declare global {
  const fetchMock: FetchMock
}

function addRule (pattern: MatchPattern, bodyOrHandler: HandlerResult | Handler, init?: ResponseInit, once = false): void {
  const handler: Handler = typeof bodyOrHandler === 'function'
    ? bodyOrHandler as Handler
    : async () => ({
        body: bodyOrHandler,
        status: init?.status,
        headers: init?.headers,
      })

  rules.push({ pattern, handler, once })
}

fetchMock.mockResponse = (body: string, init?: ResponseInit) => {
  defaultResponse = new Response(body, {
    status: typeof init?.status === 'number' ? init.status : 200,
    headers: init?.headers,
  })
  return fetchMock
}

fetchMock.mockResponseOnce = (body: string, init?: ResponseInit) => {
  rules.push({
    pattern: () => true,
    once: true,
    handler: async () => ({ body, status: init?.status, headers: init?.headers }),
  })
  return fetchMock
}

fetchMock.mockIf = (pattern: MatchPattern, bodyOrHandler: HandlerResult | Handler, init?: ResponseInit) => {
  addRule(pattern, bodyOrHandler, init, false)
  return fetchMock
}

fetchMock.mockOnceIf = (pattern: MatchPattern, bodyOrHandler: HandlerResult | Handler, init?: ResponseInit) => {
  addRule(pattern, bodyOrHandler, init, true)
  return fetchMock
}

fetchMock.resetMocks = () => {
  rules.length = 0
  calls.length = 0
  defaultResponse = new Response('Not Found', { status: 404 })
  fetchMock.mockClear()
}

Object.defineProperty(fetchMock, 'calls', {
  get: () => calls,
})

export function mockFetchIf (pattern: RegExp, handler: Function): void {
  rules.push({
    pattern,
    once: false,
    handler: async (request) => handler(request),
  })
}

export function enableFetchMocks (): void {
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('fetchMock', fetchMock)
}

export function resetFetchMocks (): void {
  fetchMock.resetMocks()
  vi.unstubAllGlobals()
}
