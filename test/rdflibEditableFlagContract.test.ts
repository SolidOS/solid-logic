import { describe, expect, it } from 'vitest'
import { fetcher, graph, lit, sym, UpdateManager } from 'rdflib'
import { refreshDocumentAuthorization } from '../src/authSession/flagAuthorizationOnTransitions'

const LINK = (name: string) => sym(`http://www.w3.org/2007/ont/link#${name}`)
const HTTPH = (name: string) => sym(`http://www.w3.org/2007/ont/httph#${name}`)

// The contract the session-transition handling relies on, proven against the
// real UpdateManager/Fetcher rather than a mock:
//   1. a response fetched anonymously answers `false` (definitively read-only);
//   2. flagging the metadata turns that into `undefined` (unknown), which is
//      what sends callers to a repair;
//   3. a fresh response under the new identity answers definitively again —
//      through `load()` on rdflib >= 2.4.1, and through
//      `refreshDocumentAuthorization()` on any version.
describe('rdflib authorization metadata contract', () => {
  it('goes from definitive to unknown when flagged, and answers again after a fresh response', () => {
    const store: any = graph()
    const meta = sym('urn:x-auth-test:app')
    store.fetcher = { appNode: meta }
    const doc = 'https://example.org/foo'

    const anonymous = { request: sym('urn:x-auth-test:req-1'), response: sym('urn:x-auth-test:res-1') }
    // The fetcher stores the document URI as a string literal, not a node
    // (linkeddata/rdflib.js#427); `editable()` matches it through the same
    // string-to-literal coercion.
    store.add(anonymous.request, LINK('requestedURI'), lit(doc), meta)
    store.add(anonymous.request, LINK('response'), anonymous.response, meta)
    store.add(anonymous.response, HTTPH('wac-allow'), lit('user="read"'), meta)

    const updater = new UpdateManager(store)
    expect(updater.editable(doc)).toBe(false)

    // The identity changed: every recorded response is out-of-date now, so the
    // answer is "unknown" — the state checkEditable()/load() repair.
    updater.flagAuthorizationMetadata()
    expect(updater.editable(doc)).toBeUndefined()

    // The next load records a fresh, authenticated response.
    const fresh = { request: sym('urn:x-auth-test:req-2'), response: sym('urn:x-auth-test:res-2') }
    store.add(fresh.request, LINK('requestedURI'), lit(doc), meta)
    store.add(fresh.request, LINK('response'), fresh.response, meta)
    store.add(fresh.response, HTTPH('wac-allow'), lit('user="read write"'), meta)
    store.add(fresh.response, HTTPH('accept-patch'), lit('text/n3'), meta)
    expect(updater.editable(doc)).toBe('N3PATCH')
  })

  it('heals a flagged, already-loaded document through load() (rdflib >= 2.4.1)', async () => {
    const store: any = graph()
    const doc = 'https://example.org/heal'
    let calls = 0
    const fakeFetch = async (): Promise<Response> => {
      calls += 1
      const headers: Record<string, string> = calls === 1
        ? { 'content-type': 'text/turtle', 'wac-allow': 'user="read"' }
        : { 'content-type': 'text/turtle', 'wac-allow': 'user="read write"', 'accept-patch': 'text/n3' }
      return new Response('', { status: 200, headers })
    }
    fetcher(store, { fetch: fakeFetch })
    store.updater = new UpdateManager(store)

    await store.fetcher.load(doc)
    expect(calls).toBe(1)
    expect(store.updater.editable(doc)).toBe(false)

    store.updater.flagAuthorizationMetadata()
    expect(store.updater.editable(doc)).toBeUndefined()

    // 2.4.1: load() finds the recorded request (the URI is stored as a literal)
    // and refetches a document whose recorded answers are all flagged, so the
    // stale read-only answer is replaced by the fresh one.
    await store.fetcher.load(doc)
    expect(calls).toBe(2)
    expect(store.updater.editable(doc)).toBe('N3PATCH')
  })

  it('repairs through refreshDocumentAuthorization() on any rdflib (the deterministic path)', async () => {
    const store: any = graph()
    const doc = 'https://example.org/repair'
    let calls = 0
    const fakeFetch = async (): Promise<Response> => {
      calls += 1
      const headers: Record<string, string> = calls === 1
        ? { 'content-type': 'text/turtle', 'wac-allow': 'user="read"' }
        : { 'content-type': 'text/turtle', 'wac-allow': 'user="read write"', 'accept-patch': 'text/n3' }
      return new Response('', { status: 200, headers })
    }
    fetcher(store, { fetch: fakeFetch })
    store.updater = new UpdateManager(store)

    await store.fetcher.load(doc)
    store.updater.flagAuthorizationMetadata()
    expect(store.updater.editable(doc)).toBeUndefined()

    // refresh() forces the fetch, awaiting the fetcher's completion callback,
    // and only then answers from the fresh response.
    await expect(refreshDocumentAuthorization(store, doc)).resolves.toBe('N3PATCH')
    expect(calls).toBe(2)
  })
})
