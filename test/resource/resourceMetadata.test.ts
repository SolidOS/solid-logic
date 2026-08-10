import { describe, expect, it } from 'vitest'
import { readWacAccessInfo } from '../../src/resource/resourceMetadata'

describe('readWacAccessInfo', () => {
  it('parses user and public access modes', () => {
    expect(readWacAccessInfo('user="read write", public="read"')).toEqual({
      canEdit: true,
      isPublic: true
    })
  })

  it('returns false access when the header is missing or malformed', () => {
    expect(readWacAccessInfo(undefined)).toEqual({ canEdit: false, isPublic: false })
    expect(readWacAccessInfo('not-a-valid-header')).toEqual({ canEdit: false, isPublic: false })
  })
})
