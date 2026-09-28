import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sym, type Fetcher, type LiveStore } from 'rdflib'
import { createResourceLogic } from '../src/resource/resourceLogic'
import { type AclLogic, type TypeIndexLogic } from '../src/types'

const makeStore = () => {
  const fetcher = {
    _fetch: vi.fn(),
    unload: vi.fn()
  } as unknown as Fetcher & { _fetch: ReturnType<typeof vi.fn>; unload: ReturnType<typeof vi.fn> }

  return {
    fetcher,
    removeMatches: vi.fn(),
    removeDocument: vi.fn()
  } as unknown as LiveStore & {
    fetcher: typeof fetcher
    removeMatches: ReturnType<typeof vi.fn>
    removeDocument: ReturnType<typeof vi.fn>
  }
}

describe('resourceLogic', () => {
  let store: ReturnType<typeof makeStore>
  let aclLogic: AclLogic
  let containerLogic: {
    createContainer: ReturnType<typeof vi.fn>
    isContainer: ReturnType<typeof vi.fn>
    getContainerMemberCount: ReturnType<typeof vi.fn>
    getContainerMembers: ReturnType<typeof vi.fn>
  }
  let typeIndexLogic: TypeIndexLogic

  beforeEach(() => {
    store = makeStore()
    aclLogic = {
      findAclDocUrl: vi.fn().mockResolvedValue(undefined),
      setACLUserPublic: vi.fn(),
      genACLText: vi.fn()
    }
    containerLogic = {
      createContainer: vi.fn(),
      isContainer: vi.fn(),
      getContainerMemberCount: vi.fn(),
      getContainerMembers: vi.fn()
    }
    typeIndexLogic = {
      getRegistrations: vi.fn(),
      loadTypeIndexesFor: vi.fn(),
      loadCommunityTypeIndexes: vi.fn(),
      loadAllTypeIndexes: vi.fn(),
      getScopedAppInstances: vi.fn(),
      getAppInstances: vi.fn(),
      suggestPublicTypeIndex: vi.fn(),
      suggestPrivateTypeIndex: vi.fn(),
      registerInTypeIndex: vi.fn(),
      deleteTypeIndexRegistration: vi.fn(),
      deleteTypeIndexRegistrationForResource: vi.fn(),
      getScopedAppsFromIndex: vi.fn()
    }
    store.fetcher._fetch.mockResolvedValue(new Response('deleted', { status: 200 }))
  })

  it('deletes container members before deleting the container itself', async () => {
    const resourceLogic = createResourceLogic(store, aclLogic, containerLogic, typeIndexLogic)
    const container = sym('https://example.com/container/')
    const member = sym('https://example.com/container/member.txt')

    containerLogic.isContainer.mockImplementation((resourceNode) => resourceNode.value === container.value)
    containerLogic.getContainerMembers.mockResolvedValue([member])

    await resourceLogic.recursiveDelete(container)

    expect(containerLogic.getContainerMembers).toHaveBeenCalledWith(container)
    expect(store.fetcher._fetch).toHaveBeenCalledWith(member.value, { method: 'DELETE' })
    expect(store.fetcher._fetch).toHaveBeenCalledWith(container.value, { method: 'DELETE' })
    expect(store.removeMatches).toHaveBeenCalledTimes(2)
    expect(store.removeMatches).toHaveBeenNthCalledWith(1, container, sym('http://www.w3.org/ns/ldp#contains'), member, container.doc())
    expect(store.removeMatches).toHaveBeenNthCalledWith(2, sym('https://example.com/'), sym('http://www.w3.org/ns/ldp#contains'), container, sym('https://example.com/').doc())
    expect(store.removeDocument).toHaveBeenCalledWith(member)
    expect(store.removeDocument).toHaveBeenCalledWith(container)
  })

  it('invokes type index cleanup when deleteTypeIndexes is true', async () => {
    const resourceLogic = createResourceLogic(store, aclLogic, containerLogic, typeIndexLogic)
    const resource = sym('https://example.com/resource.ttl')
    const user = sym('https://example.com/profile/card#me')

    containerLogic.isContainer.mockReturnValue(false)

    await resourceLogic.recursiveDelete(resource, { deleteTypeIndexes: true, user })

    expect(typeIndexLogic.deleteTypeIndexRegistrationForResource).toHaveBeenCalledWith(resource, user)
  })

  it('treats a missing resource as already deleted', async () => {
    const resourceLogic = createResourceLogic(store, aclLogic, containerLogic, typeIndexLogic)
    const resource = sym('https://example.com/missing.ttl')

    containerLogic.isContainer.mockReturnValue(false)
    store.fetcher._fetch.mockRejectedValueOnce({ response: { status: 404 } })

    await expect(resourceLogic.recursiveDelete(resource)).resolves.toBeUndefined()
    expect(store.removeDocument).toHaveBeenCalledWith(resource)
  })
})
