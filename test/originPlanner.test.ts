import { describe, expect, it, vi } from 'vitest'
import { authorizationsFromDataset, buildACLContext, parseTurtle, type ACLContext, type Quad } from '@dokieli/web-access-control'
import { planOriginGrant, planOriginRevoke } from '../src/acl/originPlanner'
import { createAclLogic } from '../src/acl/aclLogic'

const resource = 'https://pod.example/folder/data.ttl'
const acl = resource + '.acl'
const origin = 'https://app.example'
const alice = 'https://alice.example/#me'
const prefix = '@prefix acl: <http://www.w3.org/ns/auth/acl#>. '

async function context(body = ''): Promise<ACLContext> {
  const dataset = await parseTurtle(prefix + body, { baseIRI: acl, contentType: 'text/turtle' }) as Quad[]
  return buildACLContext({
    resource,
    defaultACLResource: acl,
    effectiveACLResource: acl,
    dataset
  })
}

function apply(plan: { deletes: Quad[], inserts: Quad[] }, ctx: ACLContext): Quad[] {
  return ctx.dataset.filter(item => !plan.deletes.some(deleted => item.equals(deleted))).concat(plan.inserts)
}

describe('origin planner', () => {
  it('creates a standalone origin authorization', async () => {
    const ctx = await context()
    const plan = planOriginGrant(ctx, origin + '/', ['Read', 'Write'])
    const auths = authorizationsFromDataset(plan.inserts, { accessTo: resource })
    expect(auths).toHaveLength(1)
    expect(auths[0]).toEqual(expect.objectContaining({
      origin: [origin],
      agent: [],
      agentClass: [],
      agentGroup: [],
      mode: ['Read', 'Write']
    }))
  })

  it('splits a shared authorization so origin changes do not affect other recipients', async () => {
    const ctx = await context(`<#shared> a acl:Authorization; acl:accessTo <${resource}>; acl:agent <${alice}>; acl:origin <${origin}>; acl:mode acl:Read.`)
    const plan = planOriginGrant(ctx, origin, ['Write'])
    const auths = authorizationsFromDataset(apply(plan, ctx), { accessTo: resource })
    expect(auths).toEqual(expect.arrayContaining([
      expect.objectContaining({ agent: [alice], origin: [], mode: ['Read'] }),
      expect.objectContaining({ agent: [], origin: [origin], mode: ['Write'] })
    ]))
  })

  it('revokes only the origin part of a shared authorization', async () => {
    const ctx = await context(`<#shared> a acl:Authorization; acl:accessTo <${resource}>; acl:agent <${alice}>; acl:origin <${origin}>; acl:mode acl:Read.`)
    const plan = planOriginRevoke(ctx, origin)
    const auths = authorizationsFromDataset(apply(plan, ctx), { accessTo: resource })
    expect(auths).toEqual([expect.objectContaining({ agent: [alice], origin: [], mode: ['Read'] })])
  })

  it('removes a standalone origin authorization entirely on revoke', async () => {
    const ctx = await context(`<#origin> a acl:Authorization; acl:accessTo <${resource}>; acl:origin <${origin}>; acl:mode acl:Read.`)
    const plan = planOriginRevoke(ctx, origin)
    const auths = authorizationsFromDataset(apply(plan, ctx), { accessTo: resource })
    expect(auths).toEqual([])
  })

  it('dispatches origin through solid-logic and keeps other subject kinds on dokieli', async () => {
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === resource) return new Response(null, { headers: { Link: `<${acl}>; rel="acl"` } })
      if (url === acl) return new Response(init?.method === 'HEAD' ? null : '', { headers: { 'Content-Type': 'text/turtle' } })
      throw new Error(`Unexpected fetch ${url}`)
    })
    const logic = createAclLogic({ fetcher: { _fetch: fetch } })
    const originPlan = await logic.planGrant(resource, { type: 'origin', iri: origin }, ['Read'])
    const agentPlan = await logic.planGrant(resource, { type: 'agent', iri: alice }, ['Read'])

    expect(authorizationsFromDataset(originPlan.inserts, { accessTo: resource })[0].origin).toEqual([origin])
    expect(authorizationsFromDataset(agentPlan.inserts, { accessTo: resource })[0].agent).toEqual([alice])
  })
})
