import { describe, expect, it } from 'vitest'
import { fetcher, graph, lit, sym, UpdateManager } from 'rdflib'

const LINK = (name: string) => sym(`http://www.w3.org/2007/ont/link#${name}`)
const HTTPH = (name: string) => sym(`http://www.w3.org/2007/ont/httph#${name}`)

// The contract the session-transition fix relies on, proven against the real
// UpdateManager rather than a mock:
//   1. a response fetched anonymously answers `false` (definitively read-only);
//   2. flagging the metadata turns that into `undefined` (unknown), which is
//      what sends callers to load again;
//   3. a fresh response under the new identity answers definitively again.
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
    // answer is "unknown" — the state checkEditable()/fetcher.load() repair.
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

  it('does not repair a flagged, already-loaded document via load(), but refresh() repairs it', async () => {
    const store: any = graph()
    const doc = 'https://example.org/repair'
    let calls = 0
    const fakeFetch = async (): Promise<Response> => {
      calls += 1
      const headers = calls === 1
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

    // rdflib 2.4.0: load() looks the recorded request up as a NamedNode while
    // the fetcher stored a literal, finds nothing, keeps the mark and answers
    // from the cache — no refetch, still unknown.
    await store.fetcher.load(doc)
    expect(calls).toBe(1)
    expect(store.updater.editable(doc)).toBeUndefined()

    // refresh() forces the fetch and records a fresh response.
    await new Promise<void>((resolve) => { store.fetcher.refresh(sym(doc), () => resolve()) })
    expect(calls).toBe(2)
    expect(store.updater.editable(doc)).toBe('N3PATCH')
  })
})
