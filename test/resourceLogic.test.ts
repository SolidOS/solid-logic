import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sym, type Fetcher, type LiveStore } from 'rdflib'
import { createResourceLogic } from '../src/resource/resourceLogic'
import { type AclLogic, type TypeIndexLogic } from '../src/types'

const makeStore = () => {
  const fetcher = {
    _fetch: vi.fn(),
    unload: vi.fn(),
    webOperation: vi.fn()
  } as unknown as Fetcher & {
    _fetch: ReturnType<typeof vi.fn>
    unload: ReturnType<typeof vi.fn>
    webOperation: ReturnType<typeof vi.fn>
  }

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
      findEffectiveAcl: vi.fn().mockResolvedValue({ authorizations: [] }),
      findAccessGrants: vi.fn().mockResolvedValue([]),
      classifyContainerScope: vi.fn().mockReturnValue('folder+contents'),
      isProtectedResource: vi.fn(),
      classifyAccessControlSubject: vi.fn().mockResolvedValue(undefined),
      roleFromModes: vi.fn(),
      modesFromRole: vi.fn(),
      publicRoleFromModes: vi.fn(),
      modesFromPublicRole: vi.fn(),
      planGrant: vi.fn(),
      planGrantContainer: vi.fn(),
      planGrantContainerAndContents: vi.fn(),
      planGrantContainerContents: vi.fn(),
      planRevoke: vi.fn(),
      planRevokeContainerContents: vi.fn(),
      planPublicRead: vi.fn(),
      resetToDefault: vi.fn(),
      applyPlan: vi.fn(),
      setACLUserPublic: vi.fn(),
      genACLText: vi.fn(),
      Authenticated: { type: 'agentClass', iri: 'http://www.w3.org/ns/auth/acl#AuthenticatedAgent' },
      Public: { type: 'agentClass', iri: 'http://xmlns.com/foaf/0.1/Agent' },
      PUBLIC_ACCESS_ROLES: ['No Access', 'Viewer']
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
    store.fetcher.webOperation.mockResolvedValue(new Response(null, { status: 201 }))
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
    expect(store.removeMatches).toHaveBeenNthCalledWith(1, container, sym('http://www.w3.org/ns/ldp#contains'), member)
    expect(store.removeMatches).toHaveBeenNthCalledWith(2, sym('https://example.com/'), sym('http://www.w3.org/ns/ldp#contains'), container)
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

  it('surfaces document cleanup failures instead of reporting success', async () => {
    const resourceLogic = createResourceLogic(store, aclLogic, containerLogic, typeIndexLogic)
    const resource = sym('https://example.com/resource.ttl')

    containerLogic.isContainer.mockReturnValue(false)
    store.removeDocument.mockImplementation(() => {
      throw new Error(
        'Statement to be removed is not on store: <https://example.com/resource.ttl> <http://www.w3.org/2007/ont/link#uri> "https://example.com/resource.ttl"'
      )
    })

    await expect(resourceLogic.recursiveDelete(resource)).rejects.toThrow('Statement to be removed is not on store:')
    expect(store.fetcher.unload).not.toHaveBeenCalled()
  })

  it('recognizes only profile-card.ttl WebIDs', () => {
    const resourceLogic = createResourceLogic(store, aclLogic, containerLogic, typeIndexLogic)

    expect(resourceLogic.isWebId(sym('https://alice.example.com/profile/card.ttl#me'))).toBe(true)
    expect(resourceLogic.isWebId(sym('https://alice.example.com/profile/card#me'))).toBe(false)
    expect(resourceLogic.isWebId(sym('https://alice.example.com/profile/card.jsonld#me'))).toBe(false)
  })

  it('uploads image files to the destination and adds the MIME extension when needed', async () => {
    const resourceLogic = createResourceLogic(store, aclLogic, containerLogic, typeIndexLogic)
    const file = new File(['image'], 'photo', { type: 'image/jpeg' })

    const [result] = await resourceLogic.uploadFiles(
      [file],
      'https://example.com/images/'
    )

    expect(result).toEqual({
      success: true,
      file,
      uploadedUri: 'https://example.com/images/photo_.jpg'
    })
    expect(store.fetcher.webOperation).toHaveBeenCalledWith(
      'PUT',
      'https://example.com/images/photo_.jpg',
      expect.objectContaining({ contentType: 'image/jpeg' })
    )
  })

  it('returns structured per-file failures without preventing other uploads', async () => {
    const resourceLogic = createResourceLogic(store, aclLogic, containerLogic, typeIndexLogic)
    const quotaFile = new File(['large'], 'quota.txt', { type: 'text/plain' })
    const successfulFile = new File(['ok'], 'ok.txt', { type: 'text/plain' })
    const unknownErrorFile = new File(['bad'], 'unknown-error.txt', { type: 'text/plain' })
    const unknownTypeFile = new File(['data'], 'file.unknownextension123', { type: '' })
    store.fetcher.webOperation.mockImplementation((_method, uri) => {
      if (uri.endsWith('/quota.txt')) {
        return Promise.reject({ response: { status: 413 }, message: 'Payload too large' })
      }
      if (uri.endsWith('/ok.txt')) {
        return Promise.resolve(new Response(null, { status: 201 }))
      }
      if (uri.endsWith('/unknown-error.txt')) return Promise.reject(null)
      return Promise.reject(null)
    })

    const results = await resourceLogic.uploadFiles(
      [quotaFile, successfulFile, unknownErrorFile, unknownTypeFile],
      'https://example.com/files'
    )

    expect(results[0]).toMatchObject({
      success: false,
      file: quotaFile,
      error: {
        name: 'ResourceUploadError',
        message: 'Payload too large',
        destinationUri: 'https://example.com/files/quota.txt',
        status: 413
      }
    })
    expect(results[1]).toEqual({
      success: true,
      file: successfulFile,
      uploadedUri: 'https://example.com/files/ok.txt'
    })
    expect(results[2]).toMatchObject({
      success: false,
      file: unknownErrorFile,
      error: { name: 'ResourceUploadError', message: 'Upload failed' }
    })
    expect(results[3]).toMatchObject({
      success: false,
      file: unknownTypeFile,
      error: { name: 'ResourceUploadError', status: undefined }
    })
    expect(store.fetcher.webOperation).toHaveBeenCalledTimes(3)
  })
})
