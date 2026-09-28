import { describe, expect, it, vi } from 'vitest'
import { sym } from 'rdflib'
import { createTypeIndexLogic } from '../../src/typeIndex/typeIndexLogic'

describe('createTypeIndexLogic', () => {
  function buildTypeIndexLogic (overrides: {
    publicTypeIndex?: any
    privateTypeIndex?: any
  } = {}) {
    const store = {
      each: vi.fn().mockReturnValue([]),
      holds: vi.fn().mockReturnValue(false),
      any: vi.fn().mockImplementation((_subject: any, predicate: any) => {
        const predicateUri = predicate?.value ?? predicate?.uri ?? ''
        if (predicateUri.endsWith('publicTypeIndex')) return overrides.publicTypeIndex ?? undefined
        if (predicateUri.endsWith('privateTypeIndex')) return overrides.privateTypeIndex ?? undefined
        return undefined
      }),
      statementsMatching: vi.fn().mockReturnValue([]),
      fetcher: {
        load: vi.fn().mockResolvedValue(undefined)
      },
      updater: {
        update: vi.fn().mockResolvedValue(undefined)
      },
      the: vi.fn(),
      sym
    }

    const profileLogic = {
      loadProfile: vi.fn().mockResolvedValue(sym('https://example.com/profile/card')),
      silencedLoadPreferences: vi.fn().mockResolvedValue(sym('https://example.com/settings/prefs.ttl'))
    }

    const utilityLogic = {
      followOrCreateLinkWithContentOnCreate: vi.fn().mockResolvedValue(sym('https://example.com/settings/typeIndex.ttl'))
    }

    const authn = {
      currentUser: vi.fn().mockReturnValue(sym('https://example.com/profile/card#me'))
    }

    const typeIndexLogic = createTypeIndexLogic(store as any, authn as any, profileLogic as any, utilityLogic as any)

    return { typeIndexLogic, store, profileLogic, utilityLogic, authn }
  }

  it('does not create missing type-index links during delete cleanup', async () => {
    const resource = sym('https://example.com/workspace/doc.ttl')
    const user = sym('https://example.com/profile/card#me')
    const { typeIndexLogic, utilityLogic, store, profileLogic } = buildTypeIndexLogic()

    await expect(typeIndexLogic.deleteTypeIndexRegistrationForResource(resource, user)).resolves.toBe(false)

    expect(profileLogic.loadProfile).toHaveBeenCalledWith(user)
    expect(profileLogic.silencedLoadPreferences).toHaveBeenCalledWith(user)
    expect(utilityLogic.followOrCreateLinkWithContentOnCreate).not.toHaveBeenCalled()
    expect(store.fetcher.load).not.toHaveBeenCalled()
    expect(store.updater.update).not.toHaveBeenCalled()
  })

  it('still creates missing type-index links for normal discovery', async () => {
    const user = sym('https://example.com/profile/card#me')
    const { typeIndexLogic, utilityLogic } = buildTypeIndexLogic()

    await typeIndexLogic.loadTypeIndexesFor(user)

    expect(utilityLogic.followOrCreateLinkWithContentOnCreate).toHaveBeenCalled()
  })
})
