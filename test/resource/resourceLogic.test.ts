import { describe, expect, it, vi } from 'vitest'
import { sym } from 'rdflib'
import { createResourceLogic } from '../../src/resource/resourceLogic'

const solidFileClientMocks = vi.hoisted(() => ({
  itemExists: vi.fn(),
  move: vi.fn()
}))

vi.mock('solid-file-client', () => ({
  default: class {
    itemExists = solidFileClientMocks.itemExists
    move = solidFileClientMocks.move
  }
}))

function buildResourceLogic(overrides: {
  webOperation?: (method: string, uri: string) => Promise<any>
  getContainerMembers?: (resource: any) => Promise<string[]>
  isContainer?: (resource: any) => boolean
  findAclDocUrl?: (resource: any) => Promise<string | undefined>
  currentUser?: () => any
  getPodRoot?: () => any
} = {}) {
  const typeIndexLogic = {
    deleteTypeIndexRegistrationForResource: vi.fn().mockResolvedValue(true)
  }

  const authn = {
    authSession: {},
    currentUser: vi.fn(overrides.currentUser ?? (() => null)),
    checkUser: vi.fn(),
    saveUser: vi.fn()
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
    add: vi.fn(),
    holds: vi.fn().mockReturnValue(false),
    sym
  }

  const resourceLogic = createResourceLogic(
    store as any,
    authn as any,
    {
      findAclDocUrl: vi.fn(overrides.findAclDocUrl ?? (async () => undefined)),
      setACLUserPublic: vi.fn(),
      setACLUserOwnerOnly: vi.fn().mockResolvedValue(undefined),
      genACLText: vi.fn()
    } as any,
    {
      createContainer: vi.fn(async () => undefined),
      isContainer: vi.fn(overrides.isContainer ?? (() => false)),
      getContainerVisibleItemCount: vi.fn().mockReturnValue(0),
      getContainerMembers: vi.fn(overrides.getContainerMembers ?? (async () => []))
    } as any,
    typeIndexLogic as any,
    {
      getPodRoot: vi.fn(overrides.getPodRoot ?? (() => sym('https://example.com/')))
    } as any
  )

  return { resourceLogic, store, typeIndexLogic }
}

describe('createResourceLogic', () => {
  it('delegates container helpers', async () => {
    const { resourceLogic } = buildResourceLogic()
    const resource = sym('https://example.com/workspace/')

    expect(await resourceLogic.createContainer('https://example.com/workspace/new/')).toBeUndefined()
    expect(resourceLogic.isContainer(resource)).toBe(false)
    expect(resourceLogic.getContainerVisibleItemCount(resource)).toBe(0)
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

    const metadata = await resourceLogic.fetchMetadata(sym(subjectUri))

    expect(metadata.access).toEqual({
      canEdit: true,
      canControl: false,
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

    const metadata = await resourceLogic.fetchMetadata(sym(subjectUri))

    expect(metadata.access).toEqual({
      canEdit: true,
      canControl: false,
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
      currentUser: () => userNode,
      webOperation: async () => ({ ok: true, headers: new Headers({ 'content-type': 'text/turtle' }), responseText: 'ok' })
    })

    store.fetcher._fetch.mockResolvedValue({ ok: true })

    await expect(resourceLogic.deleteResourceAndTypeIndexIfExists(sym(resourceUri))).resolves.toBeUndefined()
    expect(typeIndexLogic.deleteTypeIndexRegistrationForResource).toHaveBeenCalledWith(sym(resourceUri), userNode)
    expect(store.fetcher._fetch).toHaveBeenCalledWith(resourceUri, { method: 'DELETE' })
  })

  it('refreshes source and Trash memberships after moving a resource', async () => {
    const resourceUri = 'https://example.com/workspace/doc.ttl'
    const sourceContainer = sym('https://example.com/workspace/')
    const trashContainer = sym('https://example.com/Trash/')
    const targetResource = sym('https://example.com/Trash/doc.ttl')
    const user = sym('https://example.com/profile/card#me')
    const { resourceLogic, store } = buildResourceLogic({
      currentUser: () => user,
      getPodRoot: () => sym('https://example.com/'),
      webOperation: async () => ({ ok: true, headers: new Headers() })
    })

    solidFileClientMocks.move.mockReset()
    solidFileClientMocks.itemExists.mockReset()
    solidFileClientMocks.move.mockResolvedValue(undefined)
    solidFileClientMocks.itemExists.mockResolvedValue(false)
    store.fetcher.load.mockResolvedValue(undefined)

    await resourceLogic.moveToTrash(sym(resourceUri))

    expect(solidFileClientMocks.move).toHaveBeenCalledWith(resourceUri, targetResource.uri, { withAcl: false, withMeta: false })
    expect(store.removeMatches).toHaveBeenCalledWith(sourceContainer, expect.anything(), sym(resourceUri), sourceContainer.doc())
    expect(store.fetcher.load).toHaveBeenCalledWith(sourceContainer, { force: true, clearPreviousData: true })
    expect(store.fetcher.load).toHaveBeenCalledWith(trashContainer, { force: true, clearPreviousData: true })
    expect(store.add).toHaveBeenCalledWith(trashContainer, expect.anything(), targetResource, trashContainer.doc())
  })
})
