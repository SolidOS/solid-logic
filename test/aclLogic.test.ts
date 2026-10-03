import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Fetcher, Store, sym, UpdateManager } from 'rdflib'
import { applyPlan, findEffectiveACL, planGrant, planPublicRead, planRevoke } from '@dokieli/web-access-control'
import { ACL_LINK, createAclLogic } from '../src/acl/aclLogic'

vi.mock('@dokieli/web-access-control', () => ({
  findEffectiveACL: vi.fn(),
  planGrant: vi.fn(),
  planPublicRead: vi.fn(),
  planRevoke: vi.fn(),
  applyPlan: vi.fn(),
  Authenticated: Symbol('Authenticated'),
  Public: Symbol('Public'),
  planOwnerControl: vi.fn()
}))

describe('createAclLogic', () => {
  let store: Store & {
    fetcher: Fetcher & {
      _fetch: ReturnType<typeof vi.fn>
      load: ReturnType<typeof vi.fn>
      webOperation: ReturnType<typeof vi.fn>
    }
    any: ReturnType<typeof vi.fn>
  }
  let aclLogic: ReturnType<typeof createAclLogic>

  beforeEach(() => {
    const fetcher = {
      _fetch: vi.fn(),
      load: vi.fn(),
      webOperation: vi.fn(),
      unload: vi.fn()
    } as unknown as Fetcher & {
      _fetch: ReturnType<typeof vi.fn>
      load: ReturnType<typeof vi.fn>
      webOperation: ReturnType<typeof vi.fn>
      unload: ReturnType<typeof vi.fn>
    }

    store = {
      fetcher,
      updater: new UpdateManager(new Store()),
      any: vi.fn()
    } as unknown as Store & {
      fetcher: typeof fetcher
      any: ReturnType<typeof vi.fn>
    }

    aclLogic = createAclLogic(store)
  })

  it('exports the ACL link relation constant', () => {
    expect(ACL_LINK.value).toBe('http://www.iana.org/assignments/link-relations/acl')
  })

  it('finds the ACL document URL from the discovered link', async () => {
    const resource = sym('https://example.com/resource.ttl')
    const aclDoc = sym('https://example.com/resource.ttl.acl')
    const loadResult = { ok: true }

    store.fetcher.load.mockResolvedValue(loadResult)
    store.any.mockReturnValue(aclDoc)

    await expect(aclLogic.findAclDocUrl(resource)).resolves.toBe(aclDoc.value)
    expect(store.fetcher.load).toHaveBeenCalledWith(resource)
    expect(store.any).toHaveBeenCalledWith(resource, ACL_LINK)
  })

  it('returns the authorizations from the effective ACL context', async () => {
    const resource = sym('https://example.com/resource.ttl')
    const context = { authorizations: [{ id: 'a1' }] }

    vi.mocked(findEffectiveACL).mockResolvedValue(context as any)
    store.fetcher._fetch.mockResolvedValue(new Response('', { status: 200 }))

    await expect(aclLogic.findAccessGrants(resource)).resolves.toEqual(context.authorizations)
    expect(findEffectiveACL).toHaveBeenCalledWith(resource.value, expect.objectContaining({ fetch: expect.any(Function) }))
  })

  it('delegates planGrant through the effective ACL context', async () => {
    const resource = sym('https://example.com/resource.ttl')
    const subject = { type: 'agent', value: 'https://example.com/profile/card#me' }
    const plan = { updates: [] }

    vi.mocked(findEffectiveACL).mockResolvedValue({ authorizations: [] } as any)
    vi.mocked(planGrant).mockReturnValue(plan as any)
    store.fetcher._fetch.mockResolvedValue(new Response('', { status: 200 }))

    await expect(aclLogic.planGrant(resource, subject as any, ['Read'])).resolves.toBe(plan)
    expect(planGrant).toHaveBeenCalledWith(expect.objectContaining({ authorizations: [] }), subject, ['Read'])
  })

  it('delegates planPublicRead through the effective ACL context', async () => {
    const resource = sym('https://example.com/resource.ttl')
    const plan = { updates: [] }

    vi.mocked(findEffectiveACL).mockResolvedValue({ authorizations: [] } as any)
    vi.mocked(planPublicRead).mockReturnValue(plan as any)
    store.fetcher._fetch.mockResolvedValue(new Response('', { status: 200 }))

    await expect(aclLogic.planPublicRead(resource, true)).resolves.toBe(plan)
    expect(planPublicRead).toHaveBeenCalledWith(expect.objectContaining({ authorizations: [] }), true)
  })

  it('delegates planRevoke through the effective ACL context', async () => {
    const resource = sym('https://example.com/resource.ttl')
    const subject = { type: 'agent', iri: 'https://example.com/profile/card#me' }
    const plan = { target: 'https://example.com/resource.ttl.acl', deletes: [], inserts: [] }

    vi.mocked(findEffectiveACL).mockResolvedValue({ authorizations: [] } as any)
    vi.mocked(planRevoke).mockReturnValue(plan as any)
    store.fetcher._fetch.mockResolvedValue(new Response('', { status: 200 }))

    await expect(aclLogic.planRevoke(resource, subject as any)).resolves.toBe(plan)
    expect(planRevoke).toHaveBeenCalledWith(expect.objectContaining({ authorizations: [] }), subject)
  })

  it('applies a patch plan with the store fetcher', async () => {
    const plan = { target: 'https://example.com/resource.ttl.acl', deletes: [], inserts: [] }
    const response = new Response('ok', { status: 200 })

    store.fetcher._fetch.mockResolvedValue(new Response('', { status: 200 }))
    vi.mocked(applyPlan).mockResolvedValue(response)

    await expect(aclLogic.applyPlan(plan as any)).resolves.toBe(response)
    expect(applyPlan).toHaveBeenCalledWith(plan, expect.objectContaining({ fetch: expect.any(Function) }))
  })

  it('throws when the store cannot supply a fetch function', async () => {
    const resource = sym('https://example.com/resource.ttl')
    store.fetcher = { _fetch: vi.fn(), load: vi.fn(), webOperation: vi.fn(), unload: vi.fn() } as any
    delete (store.fetcher as any).fetch
    delete (store.fetcher as any)._fetch

    await expect(aclLogic.findEffectiveAcl(resource)).rejects.toThrow('Cannot find effective ACL, store has no fetcher')
  })
})
