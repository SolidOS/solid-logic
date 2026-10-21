import { describe, expect, it, vi } from 'vitest'
import { sym } from 'rdflib'
import { createResourceLogic } from '../../src/resource/resourceLogic'

function buildResourceLogic(overrides: {
  webOperation?: (method: string, uri: string) => Promise<any>
  getContainerElements?: (resource: any) => any[]
  getContainerMembers?: (resource: any) => Promise<string[]>
  isContainer?: (resource: any) => boolean
  findAclDocUrl?: (resource: any) => Promise<string | undefined>
} = {}) {
  const typeIndexLogic = {
    deleteTypeIndexRegistrationForResource: vi.fn().mockResolvedValue(true)
  }

  const store = {
    fetcher: {
      webOperation: vi.fn(overrides.webOperation ?? (async () => { throw new Error('unexpected webOperation') })),
      _fetch: vi.fn(async (..._args: any[]) => ({ ok: true })),
      load: vi.fn(),
      unload: vi.fn()
    },
    anyValue: vi.fn().mockImplementation((_subject: any, predicate: any) => {
      const predicateUri = predicate?.value ?? predicate?.uri ?? ''
      if (predicateUri.endsWith('modified')) return '2026-08-10T00:00:00Z'
      return undefined
    }),
    any: vi.fn().mockReturnValue(undefined),
    holds: vi.fn().mockReturnValue(false),
    each: vi.fn().mockReturnValue([]),
    removeMatches: vi.fn(),
    removeDocument: vi.fn(),
    sym
  }

  const resourceLogic = createResourceLogic(
    store as any,
    {
      findAclDocUrl: vi.fn(overrides.findAclDocUrl ?? (async () => undefined)),
      roleFromModes: vi.fn(),
      modesFromRole: vi.fn(),
      publicRoleFromModes: vi.fn(),
      modesFromPublicRole: vi.fn(),
      setACLUserPublic: vi.fn(),
      genACLText: vi.fn(),
      Authenticated: { type: 'agentClass', iri: 'http://www.w3.org/ns/auth/acl#AuthenticatedAgent' },
      Public: { type: 'agentClass', iri: 'http://xmlns.com/foaf/0.1/Agent' },
      PUBLIC_ACCESS_ROLES: ['No Access', 'Viewer']
    } as any,
    {
      createContainer: vi.fn(async () => undefined),
      isContainer: vi.fn(overrides.isContainer ?? (() => false)),
      getContainerMemberCount: vi.fn().mockReturnValue(0),
      getContainerElements: vi.fn(overrides.getContainerElements ?? (() => [])),
      getContainerMembers: vi.fn(overrides.getContainerMembers ?? (async () => []))
    } as any,
    typeIndexLogic as any
  )

  return { resourceLogic, store, typeIndexLogic }
}

describe('createResourceLogic', () => {
  it('delegates container helpers', async () => {
    const members = [sym('https://example.com/workspace/item.ttl')]
    const { resourceLogic } = buildResourceLogic({
      getContainerElements: () => members
    })
    const resource = sym('https://example.com/workspace/')

    expect(await resourceLogic.createContainer('https://example.com/workspace/new/')).toBeUndefined()
    expect(resourceLogic.isContainer(resource)).toBe(false)
    expect(resourceLogic.getContainerMemberCount(resource)).toBe(0)
    expect(resourceLogic.getContainerMembers(resource)).toEqual(members)
  })

  it('fetches resource content with its metadata', async () => {
    const subjectUri = 'https://example.com/workspace/doc.ttl'
    const { resourceLogic, store } = buildResourceLogic({
      webOperation: async (method: string, uri: string) => {
        if (method === 'GET' && uri === subjectUri) {
          return {
            ok: true,
            headers: new Headers({
              'content-type': 'text/turtle; charset=utf-8',
              'wac-allow': 'user="read write", public="read"',
              etag: '"abc"'
            }),
            responseText: '<> a <#Thing>.'
          }
        }

        throw new Error(`unexpected request: ${method} ${uri}`)
      }
    })

    await expect(resourceLogic.fetchContentAndMetadata(sym(subjectUri))).resolves.toEqual({
      content: '<> a <#Thing>.',
      metadata: {
        contentType: 'text/turtle',
        access: { canEdit: true, isPublic: true, isPublicKnown: true },
        aclUri: undefined,
        eTag: '"abc"',
        modified: '2026-08-10T00:00:00Z'
      }
    })
    expect(store.fetcher.webOperation).toHaveBeenCalledWith('GET', subjectUri)
  })

  it('rejects content responses without text', async () => {
    const subjectUri = 'https://example.com/workspace/doc.ttl'
    const { resourceLogic } = buildResourceLogic({
      webOperation: async () => ({
        ok: true,
        headers: new Headers({ 'content-type': 'text/turtle' })
      })
    })

    await expect(resourceLogic.fetchContentAndMetadata(sym(subjectUri)))
      .rejects.toThrow('Error reading file: No text in response object')
  })

  it('rejects content responses without a content type', async () => {
    const subjectUri = 'https://example.com/workspace/doc.ttl'
    const { resourceLogic } = buildResourceLogic({
      webOperation: async () => ({
        ok: true,
        headers: new Headers(),
        responseText: 'content'
      })
    })

    await expect(resourceLogic.fetchContentAndMetadata(sym(subjectUri)))
      .rejects.toThrow('Error reading file: No content-type available')
  })

  it('recognizes hidden Solid resource files', () => {
    const { resourceLogic } = buildResourceLogic()

    expect(resourceLogic.isHiddenFile(sym('https://example.com/workspace/.private'))).toBe(true)
    expect(resourceLogic.isHiddenFile(sym('https://example.com/workspace/file.acl'))).toBe(true)
    expect(resourceLogic.isHiddenFile(sym('https://example.com/workspace/file.meta'))).toBe(true)
    expect(resourceLogic.isHiddenFile(sym('https://example.com/workspace/file~'))).toBe(true)
    expect(resourceLogic.isHiddenFile(sym('https://example.com/workspace/file.ttl'))).toBe(false)
  })

  it('builds index resources consistently for containers with or without a trailing slash', () => {
    const { resourceLogic } = buildResourceLogic()

    expect(resourceLogic.getContainerIndexThing(sym('https://example.com/workspace')).uri)
      .toBe('https://example.com/workspace/index.ttl#this')
    expect(resourceLogic.getContainerIndexThing(sym('https://example.com/workspace/')).uri)
      .toBe('https://example.com/workspace/index.ttl#this')
  })

  it('checks the container index and storage-root triples in the store', () => {
    const { resourceLogic, store } = buildResourceLogic()
    store.holds
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)

    const container = sym('https://example.com/workspace/')
    const storageRoot = sym('https://example.com/')

    expect(resourceLogic.containerHasIndexDocument(container)).toBe(true)
    expect(resourceLogic.isStorageRoot(storageRoot)).toBe(true)
    expect(store.holds).toHaveBeenNthCalledWith(
      1,
      container,
      expect.anything(),
      sym('https://example.com/workspace/index.ttl#this').doc()
    )
    expect(store.holds).toHaveBeenNthCalledWith(
      2,
      storageRoot,
      expect.anything(),
      expect.anything(),
      storageRoot.doc()
    )
  })

  it('returns resource metadata even when delete access probing fails for the container', async () => {
    const subjectUri = 'https://example.com/workspace/doc.ttl'
    const containerUri = 'https://example.com/workspace/'

    const { resourceLogic, store } = buildResourceLogic({
      webOperation: async (method: string, uri: string) => {
        if (method === 'HEAD' && uri === subjectUri) {
          return new Response('', {
            status: 200,
            headers: {
              'content-type': 'text/turtle',
              'wac-allow': 'user="read write", public="read"',
              etag: '"abc"'
            }
          })
        }

        if (method === 'HEAD' && uri === containerUri) {
          throw new Error('container head failed')
        }

        throw new Error(`unexpected request: ${method} ${uri}`)
      }
    })

    const metadata = await resourceLogic.fetchMetadataWithDelete(sym(subjectUri))

    expect(metadata.access).toEqual({
      canEdit: true,
      isPublic: true,
      isPublicKnown: true,
      canDelete: false
    })
    expect(metadata.contentType).toBe('text/turtle')
    expect(store.fetcher.webOperation).toHaveBeenCalledWith('HEAD', subjectUri)
    expect(store.fetcher.webOperation).toHaveBeenCalledWith('HEAD', containerUri)
  })

  it('reads access headers even when HEAD omits content-type', async () => {
    const subjectUri = 'https://example.com/workspace/doc.ttl'

    const { resourceLogic } = buildResourceLogic({
      webOperation: async (method: string, uri: string) => {
        if (method === 'HEAD' && uri === subjectUri) {
          return {
            ok: true,
            headers: new Headers({
              'wac-allow': 'user="read write", public="read"',
              etag: '"abc"'
            })
          }
        }

        throw new Error(`unexpected request: ${method} ${uri}`)
      }
    })

    const metadata = await resourceLogic.fetchMetadataWithDelete(sym(subjectUri))

    expect(metadata.access).toEqual({
      canEdit: true,
      isPublic: true,
      isPublicKnown: true,
      canDelete: false
    })
    expect(metadata.contentType).toBeUndefined()
    expect(metadata.eTag).toBe('"abc"')
  })

  it('returns unknown public access when the metadata request fails', async () => {
    const subjectUri = 'https://example.com/workspace/doc.ttl'
    const { resourceLogic } = buildResourceLogic({
      webOperation: async () => {
        throw new Error('HEAD failed')
      }
    })

    const metadata = await resourceLogic.fetchMetadataWithDelete(sym(subjectUri))

    expect(metadata.access).toEqual({
      canEdit: false,
      isPublic: false,
      isPublicKnown: false,
      canDelete: false
    })
  })

  it('fetches metadata through the guarded HEAD request', async () => {
    const subjectUri = 'https://example.com/workspace/doc.ttl'
    const { resourceLogic, store } = buildResourceLogic({
      webOperation: async (method: string, uri: string) => {
        if (method === 'HEAD' && uri === subjectUri) {
          return new Response('', {
            status: 200,
            headers: {
              'content-type': 'text/turtle',
              'wac-allow': 'user="read write"',
              etag: '"abc"'
            }
          })
        }

        throw new Error(`unexpected request: ${method} ${uri}`)
      }
    })

    await expect(resourceLogic.fetchMetadata(sym(subjectUri))).resolves.toMatchObject({
      contentType: 'text/turtle',
      access: { canEdit: true, isPublic: false },
      eTag: '"abc"'
    })
    expect(store.fetcher.webOperation).toHaveBeenCalledWith('HEAD', subjectUri)
  })

  it('recursively deletes containers and tolerates not found resource deletes', async () => {
    const rootUri = 'https://example.com/workspace/container/'
    const childUri = 'https://example.com/workspace/container/item.ttl'
    const rootNode = sym(rootUri)
    const childNode = sym(childUri)

    const { resourceLogic, store, typeIndexLogic } = buildResourceLogic({
      isContainer: (resource: any) => resource?.value === rootUri,
      getContainerMembers: async (resource: any) => resource?.value === rootUri ? [childUri] : [],
      findAclDocUrl: async (resource: any) => `${resource.value}.acl`,
      webOperation: async () => {
        throw new Error('unexpected webOperation')
      }
    })

    store.fetcher._fetch.mockImplementation(async (...args: any[]) => {
      const [uri, options] = args as [string, { method?: string }]

      if (options.method === 'DELETE' && uri.endsWith('.acl')) {
        return { ok: true }
      }

      if (options.method === 'DELETE' && uri === childUri) {
        throw { status: 404 }
      }

      if (options.method === 'DELETE' && uri === rootUri) {
        return { ok: true }
      }

      throw new Error(`unexpected delete: ${options.method} ${uri}`)
    })

    await expect(resourceLogic.recursiveDelete(rootNode as any)).resolves.toEqual({ ok: true })

    expect(store.fetcher._fetch).toHaveBeenCalledWith(childUri, { method: 'DELETE' })
    expect(store.fetcher._fetch).toHaveBeenCalledWith(rootUri, { method: 'DELETE' })
    expect(typeIndexLogic.deleteTypeIndexRegistrationForResource).toHaveBeenCalledTimes(0)
    expect(store.removeDocument).toHaveBeenCalledWith(childNode)
    expect(store.removeDocument).toHaveBeenCalledWith(rootNode)
  })

  it('throws when DELETE resolves to a failed response and does not mutate the store', async () => {
    const resourceUri = 'https://example.com/workspace/doc.ttl'
    const resourceNode = sym(resourceUri)
    const { resourceLogic, store, typeIndexLogic } = buildResourceLogic({
      webOperation: async () => ({ ok: true, headers: new Headers({ 'content-type': 'text/turtle' }), responseText: 'ok' })
    })

    store.fetcher._fetch.mockResolvedValue(new Response('', { status: 403 }))

    await expect(resourceLogic.recursiveDelete(resourceNode as any)).rejects.toThrow('HTTP error on DELETE! Status: 403')
    expect(store.removeDocument).not.toHaveBeenCalled()
    expect(store.removeMatches).not.toHaveBeenCalled()
    expect(store.fetcher.unload).not.toHaveBeenCalled()
    expect(typeIndexLogic.deleteTypeIndexRegistrationForResource).not.toHaveBeenCalled()
  })

  it('deletes type-index registrations when requested', async () => {
    const resourceUri = 'https://example.com/workspace/doc.ttl'
    const userNode = sym('https://example.com/profile/card#me')
    const { resourceLogic, store, typeIndexLogic } = buildResourceLogic({
      webOperation: async () => ({ ok: true, headers: new Headers({ 'content-type': 'text/turtle' }), responseText: 'ok' })
    })

    store.fetcher._fetch.mockResolvedValue({ ok: true })

    await expect(resourceLogic.deleteResourceAndTypeIndexIfExists(sym(resourceUri), userNode)).resolves.toBeUndefined()
    expect(typeIndexLogic.deleteTypeIndexRegistrationForResource).toHaveBeenCalledWith(sym(resourceUri), userNode)
    expect(store.fetcher._fetch).toHaveBeenCalledWith(resourceUri, { method: 'DELETE' })
  })
})
