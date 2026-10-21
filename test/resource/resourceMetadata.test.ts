import { describe, expect, it } from 'vitest'
import { readWacAccessInfo } from '../../src/resource/resourceMetadata'

describe('readWacAccessInfo', () => {
  it('parses user and public access modes', () => {
    expect(readWacAccessInfo('user="read write", public="read"')).toEqual({
      canEdit: true,
      canManageAccess: false,
      isPublic: true,
      isPublicKnown: true
    })
  })

  it('recognizes control access as Manage Access capability', () => {
    expect(readWacAccessInfo('user="read control", public="read"').canManageAccess).toBe(true)
  })

  it('returns false access when the header is missing or malformed', () => {
    expect(readWacAccessInfo(undefined)).toEqual({
      canEdit: false,
      canManageAccess: false,
      isPublic: false,
      isPublicKnown: false
    })
    expect(readWacAccessInfo('not-a-valid-header')).toEqual({
      canEdit: false,
      canManageAccess: false,
      isPublic: false,
      isPublicKnown: true
    })
  })
})
