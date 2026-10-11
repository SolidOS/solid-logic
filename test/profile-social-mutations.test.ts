import { describe, expect, it, vi } from 'vitest'
import { Collection, graph, literal, st, sym } from 'rdflib'
import { ns } from '../src/util/ns'
import { presentSocial } from '../src/profile/sections/social/selectors'
import { processSocialMutations } from '../src/profile/sections/social/mutations'
import { findSocialAccountOption, getSocialAccountOptions, homepageForAccount } from '../src/profile/sections/social/helpers'
import { saveSocialUpdatesFailedMessageText } from '../src/profile/texts'
import { expandRdfList } from '../src/profile/sections/shared/rdfList'

vi.mock('../src/profile/sections/social/helpers', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../src/profile/sections/social/helpers')
  return {
    ...actual,
    ensureSocialOntologyLoaded: vi.fn()
  }
})

describe('Social selectors and mutations', () => {
  it('provides social account options including Facebook and Instagram', () => {
    const store = graph() as any

    const options = getSocialAccountOptions(store)
    const labels = options.map((option) => option.label.toLowerCase())

    expect(labels).toContain('facebook')
    expect(labels).toContain('instagram')
  })

  it('matches account options from legacy account-like names', () => {
    const store = graph() as any
    const options = getSocialAccountOptions(store)

    expect(findSocialAccountOption(options, 'FacebookAccount')?.label).toBe('Facebook')
    expect(findSocialAccountOption(options, 'InstagramAccount')?.label).toBe('Instagram')
  })

  it('selector returns empty social accounts from empty store', () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')

    expect(presentSocial(subject, store)).toEqual({ accounts: [] })
  })

  it('preserves multiple unnamed accounts and their types during an empty mutation', async () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    const doc = subject.doc()
    const firstAccount = sym('https://example.com/profile/card#account-one')
    const secondAccount = sym('https://example.com/profile/card#account-two')
    const firstType = sym('https://example.com/ontology#FirstAccount')
    const secondType = sym('https://example.com/ontology#SecondAccount')
    const metadata = ns.schema('identifier')

    store.add(subject, ns.foaf('account'), firstAccount, doc)
    store.add(subject, ns.foaf('account'), secondAccount, doc)
    store.add(firstAccount, ns.rdf('type'), firstType, doc)
    store.add(secondAccount, ns.rdf('type'), secondType, doc)
    store.add(firstAccount, metadata, literal('one'), doc)
    store.add(secondAccount, metadata, literal('two'), doc)
    store.updater = {
      update: (deletions: any[], insertions: any[], callback: Function) => {
        deletions.forEach((statement) => store.remove(st(statement.subject, statement.predicate, statement.object, statement.why)))
        insertions.forEach((statement) => store.add(statement.subject, statement.predicate, statement.object, statement.why))
        callback('', true)
      }
    }

    await processSocialMutations(store, subject, { create: [], update: [], remove: [] } as any)

    expect(store.holds(firstAccount, ns.rdf('type'), firstType, doc)).toBe(true)
    expect(store.holds(secondAccount, ns.rdf('type'), secondType, doc)).toBe(true)
    expect(store.any(firstAccount, metadata, null, doc)?.value).toBe('one')
    expect(store.any(secondAccount, metadata, null, doc)?.value).toBe('two')
  })

  it('mutation surfaces unsupported store updater errors', async () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')

    const plan = { create: [], update: [], remove: [] }
    await expect(processSocialMutations(store, subject, plan as any)).rejects.toMatchObject({
      message: saveSocialUpdatesFailedMessageText,
      cause: expect.objectContaining({
        message: 'Social updates are not supported by this store updater.'
      })
    })
  })

  it('writes new social entry as id node with foaf account structure', async () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    const doc = subject.doc()

    store.updater = {
      update: (deletions: any[], insertions: any[], callback: Function) => {
        deletions.forEach((statement) => store.remove(st(statement.subject, statement.predicate, statement.object, statement.why)))
        insertions.forEach((statement) => store.add(statement.subject, statement.predicate, statement.object, statement.why))
        callback('', true)
      }
    }

    const plan = {
      create: [{ name: 'Github', icon: '', homepage: 'https://www.github.com/sharon', sourceNode: '', status: 'new' }],
      update: [],
      remove: []
    }

    await processSocialMutations(store, subject, plan as any)

    const accountLinks = store.statementsMatching(subject, ns.foaf('account'), null, doc)
    expect(accountLinks).toHaveLength(1)

    const expandedAccounts = accountLinks
      .flatMap((statement: any) => expandRdfList(store, statement.object))
      .filter((node: any) => node.termType === 'NamedNode')
    expect(expandedAccounts).toHaveLength(1)
    const sourceNode = expandedAccounts[0]
    expect(sourceNode.termType).toBe('NamedNode')
    expect(sourceNode.value).toMatch(/^https:\/\/example\.com\/profile\/card#id\d{13}$/)

    const accountName = store.any(sourceNode, ns.foaf('accountName'), null, doc)
    expect(accountName?.value).toBe('sharon')
  })

  it('normalizes duplicated profile prefix when writing accountName', async () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    const doc = subject.doc()

    store.updater = {
      update: (deletions: any[], insertions: any[], callback: Function) => {
        deletions.forEach((statement) => store.remove(st(statement.subject, statement.predicate, statement.object, statement.why)))
        insertions.forEach((statement) => store.add(statement.subject, statement.predicate, statement.object, statement.why))
        callback('', true)
      }
    }

    const plan = {
      create: [{
        name: 'Facebook',
        icon: '',
        homepage: 'https://www.facebook.com/https://www.facebook.com/sharon.stratsianis',
        sourceNode: '',
        status: 'new'
      }],
      update: [],
      remove: []
    }

    await processSocialMutations(store, subject, plan as any)

    const accountLinks = store.statementsMatching(subject, ns.foaf('account'), null, doc)
    const expandedAccounts = accountLinks
      .flatMap((statement: any) => expandRdfList(store, statement.object))
      .filter((node: any) => node.termType === 'NamedNode')
    const sourceNode = expandedAccounts[0]

    const accountName = store.any(sourceNode, ns.foaf('accountName'), null, doc)
    expect(accountName?.value).toBe('sharon.stratsianis')
  })

  it('normalizes GitHub www homepage to username accountName', async () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    const doc = subject.doc()

    store.updater = {
      update: (deletions: any[], insertions: any[], callback: Function) => {
        deletions.forEach((statement) => store.remove(st(statement.subject, statement.predicate, statement.object, statement.why)))
        insertions.forEach((statement) => store.add(statement.subject, statement.predicate, statement.object, statement.why))
        callback('', true)
      },
      serialize: vi.fn(() => ''),
    }

    store.fetcher = {
      webOperation: vi.fn(async () => ({ ok: true, status: 200 }))
    }

    const plan = {
      create: [{
        name: 'Github',
        icon: '',
        homepage: 'https://www.github.com/SharonStrat',
        sourceNode: '',
        status: 'new'
      }],
      update: [],
      remove: []
    }

    await processSocialMutations(store, subject, plan as any)

    const accountLinks = store.statementsMatching(subject, ns.foaf('account'), null, doc)
    const expandedAccounts = accountLinks
      .flatMap((statement: any) => expandRdfList(store, statement.object))
      .filter((node: any) => node.termType === 'NamedNode')

    const sourceNode = expandedAccounts[0]
    const accountName = store.any(sourceNode, ns.foaf('accountName'), null, doc)
    expect(accountName?.value).toBe('SharonStrat')
  })

  it('uses full accountName URL as homepage without re-prefixing', () => {
    const store = graph() as any
    const accountNode = sym('https://example.com/profile/card#id1')
    const classNode = sym('https://solidos.github.io/profile-pane/src/ontology/socialMedia.ttl#FacebookAccount')
    const doc = accountNode.doc()

    store.add(accountNode, ns.rdf('type'), classNode, doc)
    store.add(classNode, ns.foaf('userProfilePrefix'), literal('https://www.facebook.com/') as any, doc)
    store.add(accountNode, ns.foaf('accountName'), literal('https://www.facebook.com/sharon.stratsianis') as any, doc)

    expect(homepageForAccount(store, accountNode)).toBe('https://www.facebook.com/sharon.stratsianis')
  })

  it('persists social account order from orderedRows input', async () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    const doc = subject.doc()

    const facebookNode = sym('https://example.com/profile/card#id1111111111111')
    const instagramNode = sym('https://example.com/profile/card#id2222222222222')
    const facebookClass = sym('https://solidos.github.io/profile-pane/src/ontology/socialMedia.ttl#FacebookAccount')
    const instagramClass = sym('https://solidos.github.io/profile-pane/src/ontology/socialMedia.ttl#InstagramAccount')

    store.updater = {
      update: (deletions: any[], insertions: any[], callback: Function) => {
        deletions.forEach((statement) => store.remove(st(statement.subject, statement.predicate, statement.object, statement.why)))
        insertions.forEach((statement) => store.add(statement.subject, statement.predicate, statement.object, statement.why))
        callback('', true)
      }
    }

    store.add(subject, ns.foaf('account'), new Collection([facebookNode, instagramNode]), doc)
    store.add(facebookNode, ns.rdf('type'), facebookClass, doc)
    store.add(facebookNode, ns.foaf('accountName'), literal('sharon-facebook'), doc)
    store.add(instagramNode, ns.rdf('type'), instagramClass, doc)
    store.add(instagramNode, ns.foaf('accountName'), literal('sharon-instagram'), doc)

    const orderedRows = [
      { name: 'Instagram', icon: '', homepage: 'https://www.instagram.com/sharon-instagram', sourceNode: instagramNode.value, status: 'existing' },
      { name: 'Facebook', icon: '', homepage: 'https://www.facebook.com/sharon-facebook', sourceNode: facebookNode.value, status: 'existing' }
    ] as any

    await processSocialMutations(store, subject, { create: [], update: [], remove: [] } as any, orderedRows)

    const accountLists = store.statementsMatching(subject, ns.foaf('account'), null, doc)
    const expanded = accountLists
      .map((statement: any) => expandRdfList(store, statement.object))
      .sort((a: any[], b: any[]) => b.length - a.length)[0]
      .filter((node: any) => node.termType === 'NamedNode')

    expect(expanded.map((node: any) => node.value)).toEqual([instagramNode.value, facebookNode.value])
  })

  it('returns reordered social accounts from the selector after saving orderedRows', async () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    const doc = subject.doc()

    const facebookNode = sym('https://example.com/profile/card#id1111111111111')
    const instagramNode = sym('https://example.com/profile/card#id2222222222222')
    const facebookClass = sym('https://solidos.github.io/profile-pane/src/ontology/socialMedia.ttl#FacebookAccount')
    const instagramClass = sym('https://solidos.github.io/profile-pane/src/ontology/socialMedia.ttl#InstagramAccount')

    store.updater = {
      update: (deletions: any[], insertions: any[], callback: Function) => {
        deletions.forEach((statement) => store.remove(st(statement.subject, statement.predicate, statement.object, statement.why)))
        insertions.forEach((statement) => store.add(statement.subject, statement.predicate, statement.object, statement.why))
        callback('', true)
      }
    }

    store.add(subject, ns.foaf('account'), new Collection([facebookNode, instagramNode]), doc)
    store.add(facebookNode, ns.rdf('type'), facebookClass, doc)
    store.add(facebookNode, ns.foaf('accountName'), literal('sharon-facebook'), doc)
    store.add(instagramNode, ns.rdf('type'), instagramClass, doc)
    store.add(instagramNode, ns.foaf('accountName'), literal('sharon-instagram'), doc)

    await processSocialMutations(
      store,
      subject,
      { create: [], update: [], remove: [] } as any,
      [
        { name: 'Instagram', icon: '', homepage: 'https://www.instagram.com/sharon-instagram', sourceNode: instagramNode.value, status: 'existing' },
        { name: 'Facebook', icon: '', homepage: 'https://www.facebook.com/sharon-facebook', sourceNode: facebookNode.value, status: 'existing' }
      ] as any
    )

    const accounts = presentSocial(subject, store).accounts

    expect(accounts.map((account) => account.sourceNode.value)).toEqual([instagramNode.value, facebookNode.value])
    expect(accounts.map((account) => account.homepage)).toEqual([
      'https://www.instagram.com/sharon-instagram',
      'https://www.facebook.com/sharon-facebook'
    ])
  })

  it('preserves unrelated statements on reused social entry nodes', async () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    const doc = subject.doc()

    const facebookNode = sym('https://example.com/profile/card#id1111111111111')
    const instagramNode = sym('https://example.com/profile/card#id2222222222222')
    const facebookClass = sym('https://solidos.github.io/profile-pane/src/ontology/socialMedia.ttl#FacebookAccount')
    const instagramClass = sym('https://solidos.github.io/profile-pane/src/ontology/socialMedia.ttl#InstagramAccount')

    store.updater = {
      update: (deletions: any[], insertions: any[], callback: Function) => {
        deletions.forEach((statement) => store.remove(st(statement.subject, statement.predicate, statement.object, statement.why)))
        insertions.forEach((statement) => store.add(statement.subject, statement.predicate, statement.object, statement.why))
        callback('', true)
      }
    }

    store.add(subject, ns.foaf('account'), new Collection([facebookNode, instagramNode]), doc)
    store.add(facebookNode, ns.rdf('type'), facebookClass, doc)
    store.add(facebookNode, ns.foaf('accountName'), literal('sharon-facebook'), doc)
    store.add(instagramNode, ns.rdf('type'), instagramClass, doc)
    store.add(instagramNode, ns.foaf('accountName'), literal('sharon-instagram'), doc)
    store.add(instagramNode, ns.rdfs('comment'), literal('keep-me'), doc)

    await processSocialMutations(
      store,
      subject,
      { create: [], update: [], remove: [] } as any,
      [
        { name: 'Instagram', icon: '', homepage: 'https://www.instagram.com/sharon-instagram', sourceNode: instagramNode.value, status: 'existing' },
        { name: 'Facebook', icon: '', homepage: 'https://www.facebook.com/sharon-facebook', sourceNode: facebookNode.value, status: 'existing' }
      ] as any
    )

    expect(store.any(instagramNode, ns.rdfs('comment'), null, doc)?.value).toBe('keep-me')
    expect(presentSocial(subject, store).accounts.map((account) => account.sourceNode.value)).toEqual([
      instagramNode.value,
      facebookNode.value
    ])
  })

  it('writes other accounts with homepage and icon instead of accountName', async () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    const doc = subject.doc()

    store.updater = {
      update: (deletions: any[], insertions: any[], callback: Function) => {
        deletions.forEach((statement) => store.remove(st(statement.subject, statement.predicate, statement.object, statement.why)))
        insertions.forEach((statement) => store.add(statement.subject, statement.predicate, statement.object, statement.why))
        callback('', true)
      }
    }

    await processSocialMutations(store, subject, {
      create: [{
        name: 'Other',
        icon: 'https://example.com/icon.svg',
        homepage: 'https://example.com/custom-profile',
        sourceNode: '',
        status: 'new'
      }],
      update: [],
      remove: []
    } as any)

    const accountLinks = store.statementsMatching(subject, ns.foaf('account'), null, doc)
    const expandedAccounts = accountLinks
      .flatMap((statement: any) => expandRdfList(store, statement.object))
      .filter((node: any) => node.termType === 'NamedNode')
    const sourceNode = expandedAccounts[0]

    expect(store.any(sourceNode, ns.foaf('homepage'), null, doc)?.value).toBe('https://example.com/custom-profile')
    expect(store.any(sourceNode, ns.foaf('icon'), null, doc)?.value).toBe('https://example.com/icon.svg')
    expect(store.any(sourceNode, ns.foaf('accountName'), null, doc)).toBeNull()
  })



})
