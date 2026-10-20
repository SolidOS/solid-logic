import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  ACCESS_ROLES,
  Authenticated,
  PUBLIC_ACCESS_ROLES,
  Public,
  WRITE_LOCKED_OWNER_ROLE,
  solidLogicSingleton,
  type ACLContext,
  type AccessControlSubjectKind,
  type AccessMode,
  type AccessRole,
  type ContainerAccessScopeResult,
  type AccessSubject,
  type Authorization,
  type PatchPlan,
  type PublicAccessRole
} from '../src'

describe('public ACL API', () => {
  it('exports the role list and exposes mapping through the singleton', () => {
    expect(ACCESS_ROLES).toEqual(['Owner', 'Editor', 'No Access', 'Viewer', 'Poster', 'Submitter'])
    expect(PUBLIC_ACCESS_ROLES).toEqual(['No Access', 'Viewer'])
    expect(WRITE_LOCKED_OWNER_ROLE).toBe('Owner (write locked)')
    expect(Authenticated).toMatchObject({ type: 'agentClass', iri: 'http://www.w3.org/ns/auth/acl#AuthenticatedAgent' })
    expect(Public).toMatchObject({ type: 'agentClass', iri: 'http://xmlns.com/foaf/0.1/Agent' })
    for (const role of ACCESS_ROLES) {
      expect(solidLogicSingleton.acl.roleFromModes(solidLogicSingleton.acl.modesFromRole(role))).toBe(role)
    }
    for (const role of PUBLIC_ACCESS_ROLES) {
      expect(solidLogicSingleton.acl.publicRoleFromModes(solidLogicSingleton.acl.modesFromPublicRole(role))).toBe(role)
    }
  })

  it('exports the types used by access-control consumers', () => {
    expectTypeOf(solidLogicSingleton.acl.modesFromRole).toEqualTypeOf<(role: AccessRole) => AccessMode[]>()
    expectTypeOf(solidLogicSingleton.acl.roleFromModes).toEqualTypeOf<(modes: Iterable<AccessMode>) => AccessRole>()
    expectTypeOf(solidLogicSingleton.acl.findEffectiveAcl).returns.toEqualTypeOf<Promise<ACLContext>>()
    expectTypeOf(solidLogicSingleton.acl.findAccessGrants).returns.toEqualTypeOf<Promise<Authorization[]>>()
    expectTypeOf(solidLogicSingleton.acl.planGrant).toEqualTypeOf<
      (resource: string | import('rdflib').NamedNode, subject: AccessSubject, modes: AccessMode[]) => Promise<PatchPlan>
    >()
    expectTypeOf(solidLogicSingleton.acl.publicRoleFromModes).toEqualTypeOf<(modes: Iterable<AccessMode>) => PublicAccessRole>()
    expectTypeOf(solidLogicSingleton.acl.modesFromPublicRole).toEqualTypeOf<(role: PublicAccessRole) => AccessMode[]>()
    expectTypeOf<AccessControlSubjectKind>().toEqualTypeOf<'agent' | 'agentGroup' | 'agentClass' | 'origin'>()
    expectTypeOf<ContainerAccessScopeResult>().toEqualTypeOf<{
      distinctScopes: ('folder+contents' | 'folder' | 'contents')[]
      primaryScope: 'folder+contents' | 'folder' | 'contents'
      mixed: boolean
    }>()
  })
})
