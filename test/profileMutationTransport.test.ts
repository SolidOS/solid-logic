import { describe, expect, it, vi } from 'vitest'
import { graph, literal, sym } from 'rdflib'
import { ns } from '../src/util/ns'
import { runCollectionPutTransport, setDocumentEtag } from '../src/profile/sections/shared/rdfMutationHelpers'

describe('profile mutation transport', () => {
  it('restores the document graph when a conditional collection PUT fails', async () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    const doc = subject.doc()
    const oldName = literal('Before')
    const newName = literal('After')

    store.add(subject, ns.foaf('name'), oldName, doc)
    store.updater = { editable: () => true }
    store.fetcher = {
      putBack: vi.fn(async () => {
        throw Object.assign(new Error('precondition failed'), { status: 412 })
      })
    }
    setDocumentEtag(store, doc, '"profile-v1"')

    await expect(runCollectionPutTransport(
      store,
      doc,
      () => {
        store.remove(subject, ns.foaf('name'), oldName, doc)
        store.add(subject, ns.foaf('name'), newName, doc)
      }
    )).rejects.toMatchObject({ status: 412 })

    expect(store.holds(subject, ns.foaf('name'), oldName, doc)).toBe(true)
    expect(store.holds(subject, ns.foaf('name'), newName, doc)).toBe(false)
    expect(store.fetcher.putBack).toHaveBeenCalledWith(doc, {
      headers: { 'If-Match': '"profile-v1"' }
    })
  })
})
