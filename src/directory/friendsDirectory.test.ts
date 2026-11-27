import { graph, st, sym } from 'rdflib'
import { describe, expect, it, vi } from 'vitest'
import { createDirectoryLogic } from './directoryLogic'
import { ns } from '../util/ns'

describe('friends directory discovery', () => {
  it('finds a friend by the WebID account name when no stored name is available', async () => {
    const store = graph() as any
    const user = sym('https://pod.example/profile/card#me')
    const friend = sym('https://sharonsolidosplayground.com/timmy/profile/card#me')
    store.add(st(user, ns.foaf('knows'), friend, user.doc()))
    store.fetcher = { load: vi.fn().mockResolvedValue(undefined) }
    const directory = createDirectoryLogic(store, {} as any, {} as any)
    const entries = await directory.search({
      user,
      sources: ['friends'],
      maxFoafDistance: 1,
      query: 'ti'
    })

    expect(entries).toContainEqual(expect.objectContaining({
      kind: 'person',
      uri: friend.value,
      label: 'timmy'
    }))
  })

  it('finds a friend of a friend by the WebID account name', async () => {
    const store = graph() as any
    const user = sym('https://pod.example/profile/card#me')
    const friend = sym('https://dimitri.example/profile/card#me')
    const friendOfFriend = sym('https://pod.example/marcus/profile/card#me')
    store.add(st(user, ns.foaf('knows'), friend, user.doc()))
    store.add(st(friend, ns.foaf('knows'), friendOfFriend, friend.doc()))
    store.fetcher = { load: vi.fn().mockResolvedValue(undefined) }
    const directory = createDirectoryLogic(store, {} as any, {} as any)

    const entries = await directory.search({
      user,
      sources: ['friends'],
      maxFoafDistance: 3,
      query: 'marcus'
    })

    expect(entries).toContainEqual(expect.objectContaining({
      kind: 'person',
      uri: friendOfFriend.value,
      label: 'marcus',
      relationshipLabel: 'People'
    }))
  })
})
