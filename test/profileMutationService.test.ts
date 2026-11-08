import { describe, expect, it, vi } from 'vitest'
import { Collection, graph, literal, sym } from 'rdflib'
import { ns } from '../src/util/ns'
import { createProfileMutationService } from '../src/profile/profileMutationService'

describe('profile mutation service document preparation', () => {
  it('clears stale document statements before a forced reload', async () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    const doc = subject.doc()
    const oldAccount = sym('https://example.com/profile/card#old')
    const freshAccount = sym('https://example.com/profile/card#fresh')
    const githubType = sym('https://solidos.github.io/profile-pane/src/ontology/socialMedia.ttl#GithubAccount')

    store.add(subject, ns.foaf('account'), new Collection([oldAccount]), doc)
    store.add(oldAccount, ns.foaf('accountName'), literal('stale'), doc)
    store.fetcher = {
      load: vi.fn(async () => {
        store.add(subject, ns.foaf('account'), new Collection([freshAccount]), doc)
        store.add(freshAccount, ns.rdf('type'), githubType, doc)
        store.add(freshAccount, ns.foaf('accountName'), literal('fresh'), doc)
        return { headers: new Headers({ etag: '"profile-v1"' }) }
      }),
      putBack: vi.fn(async () => new Response())
    }
    store.updater = { editable: () => true }

    await createProfileMutationService(store).processSocialMutations(subject, {
      create: [],
      update: [],
      remove: []
    })

    expect(store.fetcher.load).toHaveBeenCalledWith(doc, { force: true })
    expect(store.fetcher.putBack).toHaveBeenCalledWith(doc, {
      headers: { 'If-Match': '"profile-v1"' }
    })
    expect(store.holds(oldAccount, ns.foaf('accountName'), literal('stale'), doc)).toBe(false)
    expect(store.holds(freshAccount, ns.foaf('accountName'), literal('fresh'), doc)).toBe(true)
  })

  it('surfaces a conditional PUT conflict without falling back to PATCH', async () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    const doc = subject.doc()
    const account = sym('https://example.com/profile/card#account')
    const conflict = Object.assign(new Error('precondition failed'), { status: 412 })

    store.fetcher = {
      load: vi.fn(async () => {
        store.add(subject, ns.foaf('account'), new Collection([account]), doc)
        return { headers: new Headers({ etag: '"profile-v1"' }) }
      }),
      putBack: vi.fn(async () => { throw conflict })
    }
    store.updater = { editable: () => true }

    await expect(createProfileMutationService(store).processSocialMutations(subject, {
      create: [],
      update: [],
      remove: []
    })).rejects.toMatchObject({ cause: { status: 412 } })
    expect(store.fetcher.putBack).toHaveBeenCalledWith(doc, {
      headers: { 'If-Match': '"profile-v1"' }
    })

  })

  it('preserves HTTP status when a collection PUT rejects with a Response', async () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    const doc = subject.doc()
    const account = sym('https://example.com/profile/card#account')
    const conflict = new Response('stale profile', {
      status: 412,
      statusText: 'Precondition Failed'
    })

    store.fetcher = {
      load: vi.fn(async () => {
        store.add(subject, ns.foaf('account'), new Collection([account]), doc)
        return { headers: new Headers({ etag: '"profile-v1"' }) }
      }),
      putBack: vi.fn(async () => { throw conflict })
    }
    store.updater = { editable: () => true }

    await expect(createProfileMutationService(store).processSocialMutations(subject, {
      create: [],
      update: [],
      remove: []
    })).rejects.toMatchObject({
      cause: {
        status: 412,
        statusText: 'Precondition Failed'
      }
    })

  })
})
