import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  ACCESS_ROLES,
  solidLogicSingleton,
  type ACLContext,
  type AccessControlSubjectKind,
  type AccessMode,
  type AccessRole,
  type AccessSubject,
  type Authorization,
  type PatchPlan
} from '../src'

describe('public ACL API', () => {
  it('exports the role list and exposes mapping through the singleton', () => {
    expect(ACCESS_ROLES).toEqual(['Owner', 'Editor', 'No Access', 'Viewer', 'Poster', 'Submitter'])
    for (const role of ACCESS_ROLES) {
      expect(solidLogicSingleton.acl.roleFromModes(solidLogicSingleton.acl.modesFromRole(role))).toBe(role)
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
    expectTypeOf<AccessControlSubjectKind>().toEqualTypeOf<'agent' | 'agentGroup' | 'agentClass' | 'origin'>()
  })
})
