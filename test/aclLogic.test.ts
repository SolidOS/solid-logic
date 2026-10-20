import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Fetcher, Store, namedNode, sym, UpdateManager } from 'rdflib'
import { ACL, applyPlan, buildACLContext, findEffectiveACL, parseTurtle, planGrant, planPublicRead, planRevoke, Public, quad, type PatchPlan, type Quad } from '@dokieli/web-access-control'
import { ACL_LINK, analyzeContainerAccessScope, classifyAuthorizationScope, classifyContainerAccessScope, createAclLogic, filterAuthorizationsByContainerScope } from '../src/acl/aclLogic'

var actualFindEffectiveACL: typeof findEffectiveACL
var actualPlanGrant: typeof planGrant
var actualPlanPublicRead: typeof planPublicRead
var actualPlanRevoke: typeof planRevoke

vi.mock('@dokieli/web-access-control', async importOriginal => {
  const actual = await importOriginal<typeof import('@dokieli/web-access-control')>()
  actualFindEffectiveACL = actual.findEffectiveACL
  actualPlanGrant = actual.planGrant
  actualPlanPublicRead = actual.planPublicRead
  actualPlanRevoke = actual.planRevoke

  return {
    ...actual,
  findEffectiveACL: vi.fn(),
  planGrant: vi.fn(),
  planPublicRead: vi.fn(),
  planRevoke: vi.fn(),
  applyPlan: vi.fn(),
  planOwnerControl: vi.fn()
  }
})

const root = 'http://localhost:3100/sharon/'
const owner = root + 'profile/card#me'
const container = root + 'Questionnaires/questionare1/published/2026-10-13T04-04-43.658Z/'
const rootACL = `@prefix acl: <${ACL}>.
<#owner> a acl:Authorization;
    acl:accessTo <./>; acl:default <./>;
    acl:agent <${owner}>; acl:mode acl:Read, acl:Write, acl:Control.`

function sharingLogic(resource: string, ownACL?: string, inheritedACL = rootACL) {
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'HEAD') {
      return new Response(null, { headers: { Link: `<${url + '.acl'}>; rel="acl"` } })
    }
    if (url === root + '.acl') {
      return new Response(inheritedACL, { headers: { 'Content-Type': 'text/turtle' } })
    }
    if (url === resource + '.acl' && ownACL) {
      return new Response(ownACL, { headers: { 'Content-Type': 'text/turtle' } })
    }
    return new Response(null, { status: 404 })
  })
  vi.mocked(findEffectiveACL).mockImplementation(actualFindEffectiveACL as any)
  vi.mocked(planGrant).mockImplementation(actualPlanGrant as any)
  vi.mocked(planPublicRead).mockImplementation(actualPlanPublicRead as any)
  vi.mocked(planRevoke).mockImplementation(actualPlanRevoke as any)
  return createAclLogic({ fetcher: { _fetch: fetch } })
}

function accessFor(plan: PatchPlan, resource: string) {
  return buildACLContext({
    resource,
    dataset: plan.inserts,
    defaultACLResource: resource + '.acl',
    effectiveACLResource: plan.target,
    effectiveContainer: container
  }).authorizations
}

describe('createAclLogic', () => {
  let store: Store & {
    fetcher: Fetcher & {
      _fetch: ReturnType<typeof vi.fn>
      load: ReturnType<typeof vi.fn>
      webOperation: ReturnType<typeof vi.fn>
    }
    any: ReturnType<typeof vi.fn>
    holds: ReturnType<typeof vi.fn>
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
      holds: ReturnType<typeof vi.fn>
    }

    ;(store as any).holds = vi.fn()
    aclLogic = createAclLogic(store)
  })

  describe('container scope analysis', () => {
    const resource = 'https://example.com/container/'
    const authorization = (scope: 'both' | 'folder' | 'contents') => ({
      id: scope,
      blankNode: false,
      accessTo: scope === 'contents' ? [] : [resource],
      default: scope === 'folder' ? [] : [resource],
      agent: ['https://example.com/person#me'],
      agentClass: [],
      agentGroup: [],
      origin: [],
      mode: ['Read' as const],
      condition: []
    })

    it.each([
      ['both', ['folder+contents'], 'folder+contents'],
      ['folder', ['folder'], 'folder'],
      ['contents', ['contents'], 'contents'],
      ['mixed', ['folder', 'contents'], 'contents']
    ] as const)('classifies %s authorization entries', (_label, distinctScopes, primaryScope) => {
      const authorizations = _label === 'mixed'
        ? [authorization('folder'), authorization('contents')]
        : [authorization(_label as 'both' | 'folder' | 'contents')]
      const analysis = analyzeContainerAccessScope({ resource, authorizations } as any)
      expect(analysis.distinctScopes).toEqual(distinctScopes)
      expect(analysis.primaryScope).toBe(primaryScope)
      expect(analysis.mixed).toBe(_label === 'mixed')
      expect(classifyContainerAccessScope({ resource, authorizations } as any)).toBe(primaryScope)
    })

    it('treats an inherited owner rule (accessTo + default on the parent) as folder and contents', () => {
      const analysis = analyzeContainerAccessScope({
        resource,
        inherited: true,
        authorizations: [{
          agent: ['https://example.com/owner#me'], agentClass: [], agentGroup: [], origin: [],
          mode: ['Read', 'Write', 'Control'],
          accessTo: ['https://example.com/'],
          default: ['https://example.com/'],
          condition: []
        }, {
          agent: [], agentClass: ['http://xmlns.com/foaf/0.1/Agent'], agentGroup: [], origin: [],
          mode: ['Read'],
          accessTo: ['https://example.com/'],
          default: [],
          condition: []
        }]
      } as any)
      expect(analysis.distinctScopes).toEqual(['folder+contents'])
      expect(analysis.primaryScope).toBe('folder+contents')
      expect(analysis.mixed).toBe(false)
    })
  })

  it('exports the ACL link relation constant', () => {
    expect(ACL_LINK.value).toBe('http://www.iana.org/assignments/link-relations/acl')
  })

  it('maps roles to ACL modes and back', () => {
    expect(aclLogic.modesFromRole('Editor')).toEqual(['Read', 'Write'])
    expect(aclLogic.modesFromRole('Owner')).toEqual(['Read', 'Write', 'Control'])
    expect(aclLogic.modesFromRole('No Access')).toEqual([])
    expect(aclLogic.roleFromModes(['Read', 'Write'])).toBe('Editor')
    expect(aclLogic.roleFromModes(['Read'])).toBe('Viewer')
    expect(aclLogic.roleFromModes([])).toBe('No Access')
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

    vi.mocked(findEffectiveACL).mockResolvedValue({ resource: resource.value, authorizations: [] } as any)
    vi.mocked(planGrant).mockReturnValue(plan as any)
    store.fetcher._fetch.mockResolvedValue(new Response('', { status: 200 }))

    await expect(aclLogic.planGrant(resource, subject as any, ['Read'])).resolves.toBe(plan)
    expect(planGrant).toHaveBeenCalledWith(expect.objectContaining({ authorizations: [] }), subject, ['Read'])
  })

  it('plans a container-only grant without adding defaults', async () => {
    const resource = sym('https://example.com/container/')
    const subject = { type: 'agent', iri: 'https://example.com/profile/card#me' }
    const plan = { target: resource.value + '.acl', deletes: [], inserts: [] }

    vi.mocked(findEffectiveACL).mockResolvedValue({ resource: resource.value, authorizations: [] } as any)
    vi.mocked(planGrant).mockReturnValue(plan as any)

    await expect(aclLogic.planGrantContainer(resource, subject as any, ['Read'])).resolves.toBe(plan)
    expect(planGrant).toHaveBeenCalledWith(expect.objectContaining({ resource: resource.value }), subject, ['Read'])
  })

  it('rejects the container-only grant API for files', async () => {
    const resource = sym('https://example.com/file.ttl')

    vi.mocked(findEffectiveACL).mockResolvedValue({ resource: resource.value, authorizations: [] } as any)

    await expect(aclLogic.planGrantContainer(resource, { type: 'agent', iri: 'https://example.com/me' } as any, ['Read']))
      .rejects.toThrow('Expected a container URL')
  })

  it('resets a resource ACL without deleting an inherited parent ACL', async () => {
    const resource = sym('https://example.com/container/file.ttl')
    const response = new Response(null, { status: 204 })
    vi.mocked(findEffectiveACL).mockResolvedValue({
      resource: resource.value,
      defaultACLResource: 'https://example.com/container/file.ttl.acl',
      authorizations: []
    } as any)
    store.fetcher._fetch.mockResolvedValue(response)

    await expect(aclLogic.resetToDefault(resource)).resolves.toBe(response)
    expect(store.fetcher._fetch).toHaveBeenCalledWith(
      'https://example.com/container/file.ttl.acl',
      { method: 'DELETE' }
    )
  })

  it('identifies storage roots as protected resources', () => {
    const resource = sym('https://example.com/alice/')
    store.holds.mockReturnValue(true)

    expect(aclLogic.isProtectedResource(resource)).toBe(true)
    store.holds.mockReturnValue(false)
    expect(aclLogic.isProtectedResource(sym('https://example.com/alice/file.ttl'))).toBe(false)
  })

  it('rejects resetting a protected storage resource', async () => {
    const resource = sym('https://example.com/alice/')
    store.holds.mockReturnValue(true)
    vi.mocked(findEffectiveACL).mockResolvedValue({
      resource: resource.value,
      defaultACLResource: resource.value + '.acl',
      authorizations: []
    } as any)

    await expect(aclLogic.resetToDefault(resource)).rejects.toThrow('protected storage resource')
    expect(store.fetcher._fetch).not.toHaveBeenCalled()
  })

  it('rejects applying access to protected storage contents', async () => {
    const resource = sym('https://example.com/alice/')
    store.holds.mockReturnValue(true)
    vi.mocked(findEffectiveACL).mockResolvedValue({
      resource: resource.value,
      authorizations: []
    } as any)

    await expect(aclLogic.planGrantContainerContents(resource, {
      type: 'agent',
      iri: 'https://example.com/profile/card#me'
    } as any, ['Read'])).rejects.toThrow('protected storage resource')
  })

  it('removes only a direct subject acl:default authorization', async () => {
    const resource = sym('https://example.com/alice/')
    const subject = { type: 'agent', iri: 'https://example.com/person#me' }
    const authorization = namedNode('https://example.com/alice/.acl#person')
    const accessTo = quad(authorization, namedNode(ACL + 'accessTo'), resource)
    const defaultRule = quad(authorization, namedNode(ACL + 'default'), resource)
    vi.mocked(findEffectiveACL).mockResolvedValue({
      resource: resource.value,
      defaultACLResource: resource.value + '.acl',
      inherited: false,
      authorizations: [{ id: authorization.value, agent: [subject.iri], agentClass: [], agentGroup: [], origin: [], mode: ['Read'], default: [resource.value], accessTo: [resource.value], condition: [], blankNode: false }],
      dataset: [accessTo, defaultRule]
    } as any)

    const plan = await aclLogic.planRevokeContainerContents(resource, subject as any)
    console.log(plan.inserts)
    expect(plan.deletes).toEqual([defaultRule])
    expect(plan.deletes).not.toContain(accessTo)
    expect(plan.inserts).toEqual([])
  })

  it('splits a shared contents authorization when downgrading one subject', async () => {
    const resource = sym('https://example.com/alice/')
    const alice = 'https://example.com/alice#me'
    const bob = 'https://example.com/bob#me'
    const authorization = namedNode('https://example.com/alice/.acl#shared')
    const statements = [
      quad(authorization, namedNode(ACL + 'type'), namedNode(ACL + 'Authorization')),
      quad(authorization, namedNode(ACL + 'default'), resource),
      quad(authorization, namedNode(ACL + 'agent'), namedNode(alice)),
      quad(authorization, namedNode(ACL + 'agent'), namedNode(bob)),
      quad(authorization, namedNode(ACL + 'mode'), namedNode(ACL + 'Read')),
      quad(authorization, namedNode(ACL + 'mode'), namedNode(ACL + 'Write'))
    ]
    vi.mocked(findEffectiveACL).mockResolvedValue({
      resource: resource.value,
      defaultACLResource: resource.value + '.acl',
      inherited: false,
      authorizations: [{
        id: authorization.value,
        agent: [alice, bob],
        agentClass: [],
        agentGroup: [],
        origin: [],
        mode: ['Read', 'Write'],
        default: [resource.value],
        accessTo: [],
        condition: [],
        blankNode: false
      }],
      dataset: statements
    } as any)

    const plan = await aclLogic.planGrantContainerContents(resource, { type: 'agent', iri: alice }, ['Read'])
    expect(plan.deletes).toEqual(statements)

    const aliceRule = plan.inserts.find(statement =>
      statement.predicate.value === ACL + 'agent' && statement.object.value === alice)?.subject
    const bobRule = plan.inserts.find(statement =>
      statement.predicate.value === ACL + 'agent' && statement.object.value === bob)?.subject
    expect(aliceRule).toBeDefined()
    expect(bobRule).toBeDefined()
    expect(plan.inserts.filter(statement => statement.subject.equals(aliceRule!))
      .some(statement => statement.predicate.value === ACL + 'mode' && statement.object.value === ACL + 'Read')).toBe(true)
    expect(plan.inserts.filter(statement => statement.subject.equals(aliceRule!))
      .some(statement => statement.predicate.value === ACL + 'mode' && statement.object.value === ACL + 'Write')).toBe(false)
    expect(plan.inserts.filter(statement => statement.subject.equals(bobRule!))
      .some(statement => statement.predicate.value === ACL + 'mode' && statement.object.value === ACL + 'Write')).toBe(true)
  })

  it('allocates deterministic, collision-free IDs when splitting a shared authorization', async () => {
    const resource = sym('https://example.com/alice/')
    const alice = 'https://example.com/alice#me'
    const bob = 'https://example.com/bob#me'
    const aclResource = resource.value + '.acl'
    const authorization = namedNode(aclResource + '#shared')
    const statements = [
      quad(authorization, namedNode(ACL + 'type'), namedNode(ACL + 'Authorization')),
      quad(authorization, namedNode(ACL + 'default'), resource),
      quad(authorization, namedNode(ACL + 'agent'), namedNode(alice)),
      quad(authorization, namedNode(ACL + 'agent'), namedNode(bob)),
      quad(authorization, namedNode(ACL + 'mode'), namedNode(ACL + 'Read')),
      quad(namedNode(aclResource + '#split'), namedNode(ACL + 'type'), namedNode(ACL + 'Authorization')),
      quad(namedNode(aclResource + '#retained'), namedNode(ACL + 'type'), namedNode(ACL + 'Authorization'))
    ]
    const context = {
      resource: resource.value,
      defaultACLResource: aclResource,
      inherited: false,
      authorizations: [{
        id: authorization.value,
        agent: [alice, bob],
        agentClass: [],
        agentGroup: [],
        origin: [],
        mode: ['Read'],
        default: [resource.value],
        accessTo: [],
        condition: [],
        blankNode: false
      }],
      dataset: statements
    } as any
    vi.mocked(findEffectiveACL).mockResolvedValue(context)

    const first = await aclLogic.planGrantContainerContents(resource, { type: 'agent', iri: alice }, ['Read'])
    const second = await aclLogic.planGrantContainerContents(resource, { type: 'agent', iri: alice }, ['Read'])
    const insertedAuthorizationIds = (plan: PatchPlan) => [...new Set(plan.inserts
      .filter(statement =>
        statement.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' &&
        statement.object.value === ACL + 'Authorization')
      .map(statement => statement.subject.value))]

    expect(insertedAuthorizationIds(first)).toEqual([
      aclResource + '#retained-1',
      aclResource + '#split-1'
    ])
    expect(insertedAuthorizationIds(second)).toEqual(insertedAuthorizationIds(first))
  })

  it('preserves other subjects when revoking one subject from a shared contents authorization', async () => {
    const resource = sym('https://example.com/alice/')
    const alice = 'https://example.com/alice#me'
    const bob = 'https://example.com/bob#me'
    const authorization = namedNode('https://example.com/alice/.acl#shared')
    const statements = [
      quad(authorization, namedNode(ACL + 'type'), namedNode(ACL + 'Authorization')),
      quad(authorization, namedNode(ACL + 'default'), resource),
      quad(authorization, namedNode(ACL + 'agent'), namedNode(alice)),
      quad(authorization, namedNode(ACL + 'agent'), namedNode(bob)),
      quad(authorization, namedNode(ACL + 'mode'), namedNode(ACL + 'Read'))
    ]
    vi.mocked(findEffectiveACL).mockResolvedValue({
      resource: resource.value,
      defaultACLResource: resource.value + '.acl',
      inherited: false,
      authorizations: [{
        id: authorization.value,
        agent: [alice, bob],
        agentClass: [],
        agentGroup: [],
        origin: [],
        mode: ['Read'],
        default: [resource.value],
        accessTo: [],
        condition: [],
        blankNode: false
      }],
      dataset: statements
    } as any)

    const plan = await aclLogic.planRevokeContainerContents(resource, { type: 'agent', iri: alice })
    expect(plan.deletes).toEqual(statements)
    expect(plan.inserts.some(statement =>
      statement.predicate.value === ACL + 'agent' && statement.object.value === bob
    )).toBe(true)
    expect(plan.inserts.some(statement =>
      statement.predicate.value === ACL + 'agent' && statement.object.value === alice
    )).toBe(false)
    expect(plan.inserts.some(statement =>
      statement.predicate.value === ACL + 'default' && statement.object.value === resource.value
    )).toBe(true)
  })

  it('keeps inherited folder access without an acl:default when revoking contents', async () => {
    const resource = sym('https://example.com/alice/')
    const subject = { type: 'agent', iri: 'https://example.com/person#me' }
    vi.mocked(findEffectiveACL).mockResolvedValue({
      resource: resource.value,
      defaultACLResource: resource.value + '.acl',
      inherited: true,
      authorizations: [{ id: 'https://example.com/.acl#person', agent: [subject.iri], agentClass: [], agentGroup: [], origin: [], mode: ['Read'], default: [resource.value], accessTo: [], condition: [], blankNode: false }],
      dataset: []
    } as any)

    const plan = await aclLogic.planRevokeContainerContents(resource, subject as any)
    expect(plan.deletes).toEqual([])
    // Inherited defaults cover the folder too; revoking contents keeps folder access only.
    expect(plan.inserts.some(statement => statement.predicate.value === ACL + 'accessTo')).toBe(true)
    expect(plan.inserts.some(statement => statement.predicate.value === ACL + 'default')).toBe(false)
  })

  it('rejects revoking contents when no default authorization exists', async () => {
    const resource = sym('https://example.com/alice/')
    vi.mocked(findEffectiveACL).mockResolvedValue({
      resource: resource.value,
      inherited: false,
      authorizations: [],
      dataset: []
    } as any)

    await expect(aclLogic.planRevokeContainerContents(resource, {
      type: 'agent',
      iri: 'https://example.com/person#me'
    } as any)).rejects.toThrow('No default authorization found')
  })

  it('keeps the last Control authorization on a protected resource', async () => {
    const resource = sym('https://example.com/alice/')
    const subject = { type: 'agent', iri: 'https://example.com/profile/card#me' }
    store.holds.mockReturnValue(true)
    vi.mocked(findEffectiveACL).mockResolvedValue({
      resource: resource.value,
      authorizations: [{
        agent: [subject.iri],
        mode: ['Read', 'Write', 'Control']
      }]
    } as any)

    await expect(aclLogic.planGrant(resource, subject as any, ['Read'])).rejects.toThrow('retain at least one Control')
    await expect(aclLogic.planRevoke(resource, subject as any)).rejects.toThrow('retain at least one Control')
  })

  it('delegates planPublicRead through the effective ACL context', async () => {
    const resource = sym('https://example.com/resource.ttl')
    const plan = { updates: [] }

    vi.mocked(findEffectiveACL).mockResolvedValue({ resource: resource.value, authorizations: [] } as any)
    vi.mocked(planPublicRead).mockReturnValue(plan as any)
    store.fetcher._fetch.mockResolvedValue(new Response('', { status: 200 }))

    await expect(aclLogic.planPublicRead(resource, true)).resolves.toBe(plan)
    expect(planPublicRead).toHaveBeenCalledWith(expect.objectContaining({ authorizations: [] }), true)
  })

  it('delegates planRevoke through the effective ACL context', async () => {
    const resource = sym('https://example.com/resource.ttl')
    const subject = { type: 'agent', iri: 'https://example.com/profile/card#me' }
    const plan = { target: 'https://example.com/resource.ttl.acl', deletes: [], inserts: [] }

    vi.mocked(findEffectiveACL).mockResolvedValue({ resource: resource.value, authorizations: [] } as any)
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

  it('only classifies bare HTTP(S) origins as origin subjects', async () => {
    store.findTypeURIs = vi.fn(() => ({})) as any

    await expect(aclLogic.classifyAccessControlSubject('https://example.com/')).resolves.toEqual({
      kind: 'origin',
      subjectValue: 'https://example.com'
    })

    await expect(aclLogic.classifyAccessControlSubject('https://example.com/?tenant=a')).resolves.toBeUndefined()
    await expect(aclLogic.classifyAccessControlSubject('file:///')).resolves.toBeUndefined()
  })

  it('classifies vcard groups as agentGroup subjects', async () => {
    store.findTypeURIs = vi.fn(() => ({
      'http://www.w3.org/2006/vcard/ns#Group': true
    })) as any

    await expect(aclLogic.classifyAccessControlSubject('https://example.com/group.ttl')).resolves.toEqual({
      kind: 'agentGroup',
      subjectValue: 'https://example.com/group.ttl'
    })
  })

  describe('container sharing ACL inheritance', () => {
    function inheritedContext(resource: string, authorizations: any[], dataset: Quad[] = []) {
      return {
        resource,
        defaultACLResource: resource + '.acl',
        effectiveACLResource: root + '.acl',
        effectiveContainer: root,
        inherited: true,
        authorizations,
        dataset
      } as any
    }

    function quadsFor(plan: PatchPlan, subject: string, predicate: string) {
      return plan.inserts.filter(statement =>
        statement.predicate.value === predicate && statement.object.value === subject)
    }

    it('materializes an inherited folder-only grant with only acl:accessTo', async () => {
      const resource = sym('https://example.com/folder-only/')
      const subject = { type: 'agent' as const, iri: 'https://example.com/viewer#me' }
      vi.mocked(findEffectiveACL).mockResolvedValue(inheritedContext(resource.value, [{
        id: 'https://example.com/.acl#owner',
        agent: ['https://example.com/owner#me'], agentClass: [], agentGroup: [], origin: [],
        mode: ['Read', 'Write'], default: [resource.value], accessTo: [resource.value],
        condition: [], blankNode: false
      }]))

      const plan = await aclLogic.planGrantContainer(resource, subject, ['Read'])
      const subjectRule = quadsFor(plan, subject.iri, ACL + 'agent')[0].subject.value
      expect(quadsFor(plan, resource.value, ACL + 'accessTo').some(q => q.subject.value === subjectRule)).toBe(true)
      expect(quadsFor(plan, resource.value, ACL + 'default').some(q => q.subject.value === subjectRule)).toBe(false)
    })

    it('preserves supported conditions while materializing an inherited authorization', async () => {
      const resource = sym('https://example.com/conditioned/')
      const subject = { type: 'agent' as const, iri: 'https://example.com/owner#me' }
      const authorization = namedNode('https://example.com/.acl#conditioned')
      const condition = namedNode('https://example.com/.acl#condition-1')
      const conditionType = namedNode(ACL + 'ClientCondition')
      const conditionClient = namedNode(ACL + 'client')
      const conditionValue = namedNode('https://example.com/client')
      const dataset = [
        quad(authorization, namedNode(ACL + 'condition'), condition),
        quad(condition, namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'), conditionType),
        quad(condition, conditionClient, conditionValue)
      ]
      vi.mocked(findEffectiveACL).mockResolvedValue(inheritedContext(resource.value, [{
        id: authorization.value,
        agent: [subject.iri], agentClass: [], agentGroup: [], origin: [],
        mode: ['Read'], default: [root], accessTo: [],
        condition: [{
          id: condition.value,
          blankNode: false,
          properties: {
            [conditionClient.value]: [conditionValue.value]
          }
        }]
      }], dataset))

      const plan = await aclLogic.planGrantContainer(resource, subject, ['Read', 'Write'])
      expect(plan.inserts.some(statement =>
        statement.predicate.value === ACL + 'condition'
      )).toBe(true)
      expect(plan.inserts.some(statement =>
        statement.predicate.value === conditionClient.value &&
        statement.object.value === conditionValue.value
      )).toBe(true)
    })

    it('rejects unsupported condition properties instead of silently dropping them', async () => {
      const resource = sym('https://example.com/unsupported-condition/')
      const subject = { type: 'agent' as const, iri: 'https://example.com/owner#me' }
      vi.mocked(findEffectiveACL).mockResolvedValue(inheritedContext(resource.value, [{
        id: 'https://example.com/.acl#unsupported-condition',
        agent: [subject.iri], agentClass: [], agentGroup: [], origin: [],
        mode: ['Read'], default: [root], accessTo: [],
        condition: [{
          id: 'https://example.com/.acl#condition-unsupported',
          blankNode: false,
          properties: {
            'https://example.com/unsupported-condition-property': ['https://example.com/value']
          }
        }]
      }]))

      await expect(aclLogic.planGrantContainer(resource, subject, ['Read', 'Write']))
        .rejects.toThrow('Unsupported ACL condition')
    })

    it('materializes an inherited contents-only grant with only acl:default', async () => {
      const resource = sym('https://example.com/contents-only/')
      const subject = { type: 'agent' as const, iri: 'https://example.com/viewer#me' }
      vi.mocked(findEffectiveACL).mockResolvedValue(inheritedContext(resource.value, [{
        id: 'https://example.com/.acl#owner',
        agent: ['https://example.com/owner#me'], agentClass: [], agentGroup: [], origin: [],
        mode: ['Read'], default: [resource.value], accessTo: [], condition: [], blankNode: false
      }]))

      const plan = await aclLogic.planGrantContainerContents(resource, subject, ['Read'])
      const subjectRule = quadsFor(plan, subject.iri, ACL + 'agent')[0].subject.value
      expect(quadsFor(plan, resource.value, ACL + 'default').some(q => q.subject.value === subjectRule)).toBe(true)
      expect(quadsFor(plan, resource.value, ACL + 'accessTo').some(q => q.subject.value === subjectRule)).toBe(false)
    })

    it('preserves inherited folder+contents grants while adding a scoped grant', async () => {
      const resource = sym('https://example.com/folder-and-contents/')
      const subject = { type: 'agent' as const, iri: 'https://example.com/viewer#me' }
      const owner = 'https://example.com/owner#me'
      vi.mocked(findEffectiveACL).mockResolvedValue(inheritedContext(resource.value, [{
        id: 'https://example.com/.acl#owner',
        agent: [owner], agentClass: [], agentGroup: [], origin: [],
        mode: ['Read', 'Write'], default: [resource.value], accessTo: [resource.value],
        condition: [], blankNode: false
      }]))

      const plan = await aclLogic.planGrantContainer(resource, subject, ['Read'])
      const ownerRule = quadsFor(plan, owner, ACL + 'agent')[0].subject.value
      expect(quadsFor(plan, resource.value, ACL + 'accessTo').some(q => q.subject.value === ownerRule)).toBe(true)
      expect(quadsFor(plan, resource.value, ACL + 'default').some(q => q.subject.value === ownerRule)).toBe(true)
    })

    it('clones inherited acl:condition descriptions and avoids authorization ID collisions', async () => {
      const resource = sym('https://example.com/conditioned/')
      const subject = { type: 'agent' as const, iri: 'https://example.com/viewer#me' }
      const collidingId = resource.value + '.acl#inherited-1'
      const conditionId = 'https://example.com/.acl#client-condition'
      vi.mocked(findEffectiveACL).mockResolvedValue(inheritedContext(resource.value, [{
        id: collidingId,
        agent: ['https://example.com/owner#me'], agentClass: [], agentGroup: [], origin: [],
        mode: ['Read'], default: [resource.value], accessTo: [resource.value],
        condition: [{
          id: conditionId, blankNode: false,
          properties: {
            [ACL + 'ClientCondition']: ['https://example.com/client'],
            [ACL + 'description']: ['only from the trusted client']
          }
        }],
        blankNode: false
      }], [quad(namedNode(collidingId), namedNode(ACL + 'Authorization'), namedNode(ACL + 'Authorization'))]))

      const plan = await aclLogic.planGrantContainer(resource, subject, ['Read'])
      const ruleIds = new Set(plan.inserts
        .filter(statement => statement.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' &&
          statement.object.value === ACL + 'Authorization')
        .map(statement => statement.subject.value))
      expect(ruleIds.has(collidingId)).toBe(false)
      expect(ruleIds.size).toBe(2)
      expect(plan.inserts.some(statement =>
        statement.predicate.value === ACL + 'condition' &&
        statement.object.value !== conditionId)).toBe(true)
      expect(plan.inserts.some(statement =>
        statement.predicate.value === ACL + 'description' &&
        statement.object.value === 'only from the trusted client')).toBe(true)
    })

    it('preserves inherited default access when materializing a contents-only grant', async () => {
      const resource = sym('https://example.com/parent/')
      const ownerSubject = 'https://example.com/owner#me'
      const subject = { type: 'agent' as const, iri: 'https://example.com/viewer#me' }
      vi.mocked(findEffectiveACL).mockResolvedValue({
        resource: resource.value,
        defaultACLResource: resource.value + '.acl',
        inherited: true,
        authorizations: [
          { id: 'https://example.com/.acl#owner', agent: [ownerSubject], agentClass: [], agentGroup: [], origin: [], mode: ['Read', 'Write', 'Control'], default: [resource.value], accessTo: [], condition: [], blankNode: false }
        ],
        dataset: []
      } as any)

      const plan = await aclLogic.planGrantContainerContents(resource, subject, ['Read'])
      const ownerRule = plan.inserts.find(statement =>
        statement.predicate.value === ACL + 'agent' &&
        statement.object.value === ownerSubject)?.subject.value
      expect(ownerRule).toBeDefined()
      expect(plan.inserts.filter(statement => statement.subject.value === ownerRule && statement.predicate.value === ACL + 'default')).toHaveLength(1)
      expect(plan.inserts.filter(statement => statement.subject.value === ownerRule && statement.predicate.value === ACL + 'mode')).toHaveLength(3)
      expect(plan.inserts.some(statement =>
        statement.predicate.value === ACL + 'accessTo' &&
        statement.object.value === resource.value &&
        statement.object.value === resource.value &&
        statement.subject.value.includes('inherited-new'))).toBe(false)
      expect(plan.inserts.some(statement =>
        statement.predicate.value === ACL + 'default' &&
        statement.object.value === resource.value &&
        statement.object.value === resource.value)).toBe(true)
    })

    it('supports an explicit container-only grant without adding a default', async () => {
      const plan = await sharingLogic(container).planGrantContainer(container, Public, ['Read'])
      const publicRule = plan.inserts.find(statement =>
        statement.predicate.value === ACL + 'agentClass' &&
        statement.object.value === Public.iri)?.subject.value
      expect(publicRule).toBeDefined()
      expect(plan.inserts.some(statement =>
        statement.predicate.value === ACL + 'default' &&
        statement.object.value === container &&
        statement.subject.value === publicRule
      )).toBe(false)
    })

    it('supports an explicit contents-only grant without adding accessTo', async () => {
      const plan = await sharingLogic(container).planGrantContainerContents(container, Public, ['Read'])
      const publicRule = plan.inserts.find(statement =>
        statement.predicate.value === ACL + 'agentClass' &&
        statement.object.value === Public.iri)?.subject.value
      expect(publicRule).toBeDefined()
      expect(plan.inserts.some(statement =>
        statement.subject.value === publicRule &&
        statement.predicate.value === ACL + 'default' &&
        statement.object.value === container
      )).toBe(true)
      expect(plan.inserts.some(statement =>
        statement.subject.value === publicRule &&
        statement.predicate.value === ACL + 'accessTo' &&
        statement.object.value === container
      )).toBe(false)
    })

    it('allocates a deterministic ID for a new direct contents authorization', async () => {
      const resource = sym('https://example.com/alice/')
      const aclResource = resource.value + '.acl'
      vi.mocked(findEffectiveACL).mockResolvedValue({
        resource: resource.value,
        defaultACLResource: aclResource,
        inherited: false,
        authorizations: [],
        dataset: [
          quad(namedNode(aclResource + '#contents'), namedNode(ACL + 'type'), namedNode(ACL + 'Authorization'))
        ]
      } as any)

      const subject = { type: 'agent' as const, iri: 'https://example.com/person#me' }
      const first = await aclLogic.planGrantContainerContents(resource, subject, ['Read'])
      const second = await aclLogic.planGrantContainerContents(resource, subject, ['Read'])

      expect(first.inserts[0]?.subject.value).toBe(aclResource + '#contents-1')
      expect(second.inserts.map(statement => statement.subject.value))
        .toEqual(first.inserts.map(statement => statement.subject.value))
    })

    it('keeps the inherited owner on the folder itself when materializing a first ACL', async () => {
      const sharonRootACL = rootACL + `
<#public> a acl:Authorization;
    acl:accessTo <./>;
    acl:agentClass <http://xmlns.com/foaf/0.1/Agent>; acl:mode acl:Read.`
      for (const planner of ['planGrantContainer', 'planGrantContainerContents', 'planGrantContainerAndContents'] as const) {
        const plan = await sharingLogic(container, undefined, sharonRootACL)[planner](container, { type: 'agent', iri: 'https://example.com/friend#me' }, ['Read'])
        const ownerRule = plan.inserts.find(statement =>
          statement.predicate.value === ACL + 'agent' &&
          statement.object.value === owner)?.subject.value
        expect(ownerRule, planner).toBeDefined()
        const ownerQuads = plan.inserts.filter(statement => statement.subject.value === ownerRule)
        expect(ownerQuads.some(q => q.predicate.value === ACL + 'accessTo' && q.object.value === container), planner).toBe(true)
        expect(ownerQuads.some(q => q.predicate.value === ACL + 'default' && q.object.value === container), planner).toBe(true)
        expect(ownerQuads.some(q => q.predicate.value === ACL + 'mode' && q.object.value === ACL + 'Control'), planner).toBe(true)
        // The root public rule is accessTo-only on the parent, so it is not inherited.
        expect(plan.inserts.some(q => q.predicate.value === ACL + 'agentClass' && q.object.value === Public.iri), planner).toBe(false)
      }
    })

    it('writes accessTo and default for an inherited folder+contents grant', async () => {
      const friend = 'https://example.com/friend#me'
      const plan = await sharingLogic(container).planGrantContainerAndContents(container, { type: 'agent', iri: friend }, ['Read'])
      const friendRule = plan.inserts.find(statement =>
        statement.predicate.value === ACL + 'agent' &&
        statement.object.value === friend)?.subject.value
      const friendQuads = plan.inserts.filter(statement => statement.subject.value === friendRule)
      expect(friendQuads.some(q => q.predicate.value === ACL + 'accessTo' && q.object.value === container)).toBe(true)
      expect(friendQuads.some(q => q.predicate.value === ACL + 'default' && q.object.value === container)).toBe(true)
    })

    it('replaces an inherited subject rule instead of dropping it on a folder+contents grant', async () => {
      const resource = sym('https://example.com/shared/')
      const viewer = 'https://example.com/viewer#me'
      vi.mocked(findEffectiveACL).mockResolvedValue(inheritedContext(resource.value, [{
        id: 'https://example.com/.acl#viewer',
        agent: [viewer], agentClass: [], agentGroup: [], origin: [],
        mode: ['Read'], default: ['https://example.com/'], accessTo: ['https://example.com/'],
        condition: [], blankNode: false
      }]))

      const plan = await aclLogic.planGrantContainerAndContents(resource, { type: 'agent', iri: viewer }, ['Read', 'Write'])
      const viewerRules = plan.inserts.filter(q => q.predicate.value === ACL + 'agent' && q.object.value === viewer)
      expect(viewerRules).toHaveLength(1)
      const ruleQuads = plan.inserts.filter(q => q.subject.equals(viewerRules[0].subject))
      expect(ruleQuads.filter(q => q.predicate.value === ACL + 'mode').map(q => q.object.value).sort())
        .toEqual([ACL + 'Read', ACL + 'Write'])
      expect(ruleQuads.some(q => q.predicate.value === ACL + 'accessTo')).toBe(true)
      expect(ruleQuads.some(q => q.predicate.value === ACL + 'default')).toBe(true)
    })

    it('writes accessTo and default for a direct folder+contents grant', async () => {
      const plan = await sharingLogic(container, rootACL).planGrantContainerAndContents(container, Public, ['Read'])
      const publicRule = plan.inserts.find(statement =>
        statement.predicate.value === ACL + 'agentClass' &&
        statement.object.value === Public.iri)?.subject.value
      expect(publicRule).toBeDefined()
      const ruleQuads = plan.inserts.filter(q => q.subject.value === publicRule)
      expect(ruleQuads.some(q => q.predicate.value === ACL + 'accessTo' && q.object.value === container)).toBe(true)
      expect(ruleQuads.some(q => q.predicate.value === ACL + 'default' && q.object.value === container)).toBe(true)
    })

    it('writes only acl:default for a direct contents-only grant', async () => {
      const acl = rootACL.replace(`<${owner}>`, `<${owner}>`)
      const plan = await sharingLogic(container, acl).planGrantContainerContents(container, Public, ['Read'])
      expect(plan.inserts.some(statement => statement.predicate.value === ACL + 'accessTo')).toBe(false)
      expect(plan.inserts.some(statement =>
        statement.predicate.value === ACL + 'default' &&
        statement.object.value === container &&
        statement.subject.value.includes('#contents-'))).toBe(true)
    })

    it('grants public Read to the container without opting into its contents', async () => {
      const plan = await sharingLogic(container).planGrant(container, Public, ['Read'])
      expect(plan.target).toBe(container + '.acl')
      expect(plan.deletes).toEqual([])
      expect(plan.inserts.some(statement =>
        statement.predicate.value === ACL + 'accessTo' &&
        statement.object.value === container &&
        statement.subject.value.includes('new'))).toBe(true)
      expect(accessFor(plan, container + 'index.ttl').some(grant =>
        grant.agent.includes(owner))).toBe(true)
    })

    it('does not opt into contents through the public-read convenience API', async () => {
      const plan = await sharingLogic(container).planPublicRead(container, true)
      expect(accessFor(plan, container + 'index.ttl')).toHaveLength(0)
    })

    it('preserves the inherited owner default when revoking an inherited public grant', async () => {
      const inheritedACL = rootACL + `
  <#public> a acl:Authorization; acl:default <./>;
      acl:agentClass <${Public.iri}>; acl:mode acl:Read.`
      const plan = await sharingLogic(container, undefined, inheritedACL).planRevoke(container, Public)
      const ownerRule = plan.inserts.find(statement =>
        statement.predicate.value === ACL + 'agent' &&
        statement.object.value === owner)
      expect(ownerRule).toBeDefined()
      expect(plan.inserts.some(statement =>
        statement.subject.value === ownerRule?.subject.value &&
        statement.predicate.value === ACL + 'default'
      )).toBe(true)
      for (const resource of [container, container + 'index.ttl', container + 'questions/q1.ttl']) {
        const grants = accessFor(plan, resource)
        expect(grants.some(grant => grant.agentClass.includes(Public.iri))).toBe(false)
      }
    })

    it('does not add a default when granting to a container that already has an ACL', async () => {
      const acl = rootACL.split('<./>').join(`<${container}>`)
      const plan = await sharingLogic(container, acl).planGrant(container, Public, ['Read'])
      expect(accessFor(plan, container + 'index.ttl')).toHaveLength(0)
      expect(plan.deletes).toEqual([])
    })

    it('revokes a previously materialized public grant without removing owner defaults', async () => {
      const granted = await sharingLogic(container).planGrantContainerContents(container, Public, ['Read'])
      const directACL = rootACL + `
  <#public> a acl:Authorization; acl:default <${container}>;
      acl:agentClass <${Public.iri}>; acl:mode acl:Read.`
      const dataset: Quad[] = await parseTurtle(directACL, { baseIRI: container + '.acl', contentType: 'text/turtle' })
      const directContext = buildACLContext({
        resource: container,
        dataset,
        defaultACLResource: container + '.acl',
        effectiveACLResource: container + '.acl',
        effectiveContainer: container
      })
      const publicRule = namedNode(container + '.acl#public')
      directContext.authorizations.push({
        id: publicRule.value,
        blankNode: false,
        accessTo: [],
        default: [container],
        agent: [],
        agentClass: [Public.iri],
        agentGroup: [],
        mode: ['Read'],
        origin: [],
        condition: []
      })
      directContext.dataset = [
        ...directContext.dataset,
        quad(publicRule, namedNode(ACL + 'default'), namedNode(container)),
        quad(publicRule, namedNode(ACL + 'agentClass'), namedNode(Public.iri))
      ]
      vi.mocked(findEffectiveACL).mockResolvedValue(directContext as any)
      const revoked = await aclLogic.planRevokeContainerContents(container, Public)
      expect(revoked.deletes.some(statement =>
        statement.predicate.value === ACL + 'default' &&
        statement.object.value === container
      )).toBe(true)
      expect(revoked.deletes.some(statement =>
        statement.predicate.value === ACL + 'accessTo'
      )).toBe(false)
      expect(granted.inserts.some(statement =>
        statement.predicate.value === ACL + 'default' &&
        statement.object.value === container
      )).toBe(true)
    })

    it('does not add defaults when sharing an individual resource', async () => {
      const resource = container + 'index.ttl'
      const plan = await sharingLogic(resource).planGrant(resource, Public, ['Read'])
      expect(plan.inserts.some(statement => statement.predicate.value === ACL + 'default')).toBe(false)
      const grants = accessFor(plan, resource)
      expect(grants.find(grant => grant.agent.includes(owner))?.mode).toEqual(['Read', 'Write', 'Control'])
      expect(grants.find(grant => grant.agentClass.includes(Public.iri))?.mode).toEqual(['Read'])
    })

    it('parses the stored relative owner WebID without changing its identity', () => {
      const dataset = parseTurtle(`@prefix acl: <${ACL}>. @prefix card: <../../../../profile/card#>. <#owner> acl:agent card:me.`, {
        baseIRI: container + '.acl', contentType: 'text/turtle'
      })
      expect(dataset[0].object.value).toBe(owner)
    })
  })

  describe('container scope classification', () => {
    const scopeContext = (predicates: string[]) => ({
      resource: container,
      dataset: predicates.map(predicate =>
        quad(namedNode(container + '.acl#a1'), namedNode(ACL + predicate), namedNode(container))),
    } as any)

    it('classifies accessTo-only ACLs as folder only', () => {
      expect(classifyContainerAccessScope(scopeContext(['accessTo']))).toBe('folder')
    })

    it('classifies default-only ACLs as contents defaults', () => {
      expect(classifyContainerAccessScope(scopeContext(['default']))).toBe('contents')
    })

    it('classifies ACLs with both predicates as folder and contents', () => {
      expect(classifyContainerAccessScope(scopeContext(['accessTo', 'default']))).toBe('folder+contents')
    })

    it('classifies mixed grants conservatively as folder and contents', () => {
      const context = {
        resource: container,
        dataset: [
          quad(namedNode(container + '.acl#a1'), namedNode(ACL + 'accessTo'), namedNode(container)),
          quad(namedNode(container + '.acl#a2'), namedNode(ACL + 'default'), namedNode(container))
        ]
      } as any
      expect(classifyContainerAccessScope(context)).toBe('contents')
    })

    it('defaults an ACL with neither direct predicate to folder and contents', () => {
      expect(classifyContainerAccessScope(scopeContext([]))).toBe('folder+contents')
    })

    it('filters mixed authorizations by their complete predicate scope without mutation', () => {
      const grants = [
        { agent: [owner], agentGroup: [], agentClass: [], origin: [], mode: ['Read'], accessTo: [container], default: [] },
        { agent: ['https://example.com/contents#me'], agentGroup: [], agentClass: [], origin: [], mode: ['Read'], accessTo: [], default: [container] },
        { agent: ['https://example.com/both#me'], agentGroup: [], agentClass: [], origin: [], mode: ['Read'], accessTo: [container], default: [container] },
        { agent: ['https://example.com/other#me'], agentGroup: [], agentClass: [], origin: [], mode: ['Read'], accessTo: [container, 'https://example.com/other'], default: [container] }
      ] as any

      expect(classifyAuthorizationScope(container, grants[0])).toBe('folder')
      expect(classifyAuthorizationScope(container, grants[1])).toBe('contents')
      expect(classifyAuthorizationScope(container, grants[2])).toBe('folder+contents')
      expect(filterAuthorizationsByContainerScope(container, grants, 'folder')).toEqual([grants[0]])
      expect(filterAuthorizationsByContainerScope(container, grants, 'contents')).toEqual([grants[1]])
      expect(filterAuthorizationsByContainerScope(container, grants, 'folder+contents')).toEqual([grants[2], grants[3]])
      expect(grants).toHaveLength(4)
    })

    it('includes inherited parent defaults when filtering a container scope', () => {
      const inheritedGrant = {
        agent: ['https://example.com/inherited#me'],
        agentGroup: [],
        agentClass: [],
        origin: [],
        mode: ['Read'],
        accessTo: [],
        default: ['https://example.com/parent/']
      } as any

      expect(classifyAuthorizationScope(container, inheritedGrant)).toBeUndefined()
      expect(classifyAuthorizationScope(container, inheritedGrant, true)).toBe('folder+contents')
      expect(filterAuthorizationsByContainerScope(container, [inheritedGrant], 'folder+contents', true))
        .toEqual([inheritedGrant])
    })
  })
})
