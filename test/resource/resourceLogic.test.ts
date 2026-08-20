import { describe, expect, it, vi } from 'vitest'
import { sym } from 'rdflib'
import { createResourceLogic } from '../../src/resource/resourceLogic'

function buildResourceLogic(overrides: {
  webOperation?: (method: string, uri: string) => Promise<any>
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
    each: vi.fn().mockReturnValue([]),
    removeMatches: vi.fn(),
    removeDocument: vi.fn(),
    sym
  }

  const resourceLogic = createResourceLogic(
    store as any,
    {
      findAclDocUrl: vi.fn(overrides.findAclDocUrl ?? (async () => undefined)),
      setACLUserPublic: vi.fn(),
      genACLText: vi.fn()
    } as any,
    {
      createContainer: vi.fn(async () => undefined),
      isContainer: vi.fn(overrides.isContainer ?? (() => false)),
      getContainerMemberCount: vi.fn().mockReturnValue(0),
      getContainerMembers: vi.fn(overrides.getContainerMembers ?? (async () => []))
    } as any,
    typeIndexLogic as any
  )

  return { resourceLogic, store, typeIndexLogic }
}

describe('createResourceLogic', () => {
  it('delegates container helpers', async () => {
    const { resourceLogic } = buildResourceLogic()
    const resource = sym('https://example.com/workspace/')

    expect(await resourceLogic.createContainer('https://example.com/workspace/new/')).toBeUndefined()
    expect(resourceLogic.isContainer(resource)).toBe(false)
    expect(resourceLogic.getContainerMemberCount(resource)).toBe(0)
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
      canDelete: false
    })
    expect(metadata.contentType).toBeUndefined()
    expect(metadata.eTag).toBe('"abc"')
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
