import { describe, expect, it } from 'vitest'
import { graph, literal, st, sym } from 'rdflib'
import { ns } from '../src/util/ns'
import { getHeading } from '../src/profile/sections/heading/selectors'
import { processHeadingMutations } from '../src/profile/sections/heading/mutations'
import { saveHeadingUpdatesFailedMessageText, updaterUnsupportedStoreErrorMessageText } from '../src/profile/texts'

describe('Intro selectors and mutations', () => {
  it('selectors return a stable profile shape from empty store', () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')

    expect(getHeading(subject, store).pronouns).toBe('')

    const profile = getHeading(subject, store)
    expect(profile.sourceNode.value).toBe(subject.value)
    expect(typeof profile.name).toBe('string')
  })

  it('mutation surfaces unsupported store updater errors', async () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')

    const plan = {
      basicOps: { create: [], update: [], remove: [] },
      phoneOps: { create: [], update: [], remove: [] },
      emailOps: { create: [], update: [], remove: [] },
      addressOps: { create: [], update: [], remove: [] }
    }

    await expect(processHeadingMutations(store, subject, plan as any)).rejects.toMatchObject({
      message: saveHeadingUpdatesFailedMessageText,
      cause: expect.objectContaining({ message: updaterUnsupportedStoreErrorMessageText })
    })
  })

  it('prefers work email and phone when present', () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    const doc = subject.doc()

    const homeEmail = sym('https://example.com/profile/card#email-home')
    const workEmail = sym('https://example.com/profile/card#email-work')
    const homePhone = sym('https://example.com/profile/card#phone-home')
    const workPhone = sym('https://example.com/profile/card#phone-work')

    store.add(st(subject, ns.vcard('hasEmail'), homeEmail, doc))
    store.add(st(homeEmail, ns.vcard('value'), sym('mailto:home@example.com'), doc))
    store.add(st(homeEmail, ns.rdf('type'), ns.vcard('Home'), doc))

    store.add(st(subject, ns.vcard('hasEmail'), workEmail, doc))
    store.add(st(workEmail, ns.vcard('value'), sym('mailto:work@example.com'), doc))
    store.add(st(workEmail, ns.rdf('type'), ns.vcard('Work'), doc))

    store.add(st(subject, ns.vcard('hasTelephone'), homePhone, doc))
    store.add(st(homePhone, ns.vcard('value'), sym('tel:+1111111111'), doc))
    store.add(st(homePhone, ns.rdf('type'), ns.vcard('Home'), doc))

    store.add(st(subject, ns.vcard('hasTelephone'), workPhone, doc))
    store.add(st(workPhone, ns.vcard('value'), sym('tel:+2222222222'), doc))
    store.add(st(workPhone, ns.rdf('type'), ns.vcard('Work'), doc))

    const profile = getHeading(subject, store)

    expect(profile.primaryEmail?.sourceNode.value).toBe(workEmail.value)
    expect(profile.primaryPhone?.sourceNode.value).toBe(workPhone.value)
  })

  it('falls back to first valid email and phone when work type is missing', () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    const doc = subject.doc()

    const firstEmail = sym('https://example.com/profile/card#email-first')
    const secondEmail = sym('https://example.com/profile/card#email-second')
    const firstPhone = sym('https://example.com/profile/card#phone-first')
    const secondPhone = sym('https://example.com/profile/card#phone-second')

    store.add(st(subject, ns.vcard('hasEmail'), firstEmail, doc))
    store.add(st(firstEmail, ns.vcard('value'), sym('mailto:first@example.com'), doc))
    store.add(st(firstEmail, ns.rdf('type'), ns.vcard('Home'), doc))

    store.add(st(subject, ns.vcard('hasEmail'), secondEmail, doc))
    store.add(st(secondEmail, ns.vcard('value'), sym('mailto:second@example.com'), doc))
    store.add(st(secondEmail, ns.rdf('type'), ns.vcard('Home'), doc))

    store.add(st(subject, ns.vcard('hasTelephone'), firstPhone, doc))
    store.add(st(firstPhone, ns.vcard('value'), sym('tel:+3333333333'), doc))
    store.add(st(firstPhone, ns.rdf('type'), ns.vcard('Home'), doc))

    store.add(st(subject, ns.vcard('hasTelephone'), secondPhone, doc))
    store.add(st(secondPhone, ns.vcard('value'), sym('tel:+4444444444'), doc))
    store.add(st(secondPhone, ns.rdf('type'), ns.vcard('Home'), doc))

    const profile = getHeading(subject, store)

    expect(profile.primaryEmail?.sourceNode.value).toBe(firstEmail.value)
    expect(profile.primaryPhone?.sourceNode.value).toBe(firstPhone.value)
  })

  it('uses the first current resume role for heading job title', () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    const doc = subject.doc()
    const currentRole = sym('https://example.com/profile/card#role-current')
    const pastRole = sym('https://example.com/profile/card#role-past')
    const currentOrg = sym('https://example.com/profile/card#org-current')
    const pastOrg = sym('https://example.com/profile/card#org-past')

    store.add(st(currentRole, ns.org('member'), subject, doc))
    store.add(st(currentRole, ns.rdf('type'), ns.solid('CurrentRole'), doc))
    store.add(st(currentRole, ns.vcard('role'), literal('Staff Engineer'), doc))
    store.add(st(currentRole, ns.org('organization'), currentOrg, doc))
    store.add(st(currentOrg, ns.schema('name'), literal('Inrupt'), doc))
    store.add(st(currentRole, ns.schema('startDate'), literal('2024-01-01'), doc))

    store.add(st(pastRole, ns.org('member'), subject, doc))
    store.add(st(pastRole, ns.rdf('type'), ns.solid('PastRole'), doc))
    store.add(st(pastRole, ns.vcard('role'), literal('Developer'), doc))
    store.add(st(pastRole, ns.org('organization'), pastOrg, doc))
    store.add(st(pastOrg, ns.schema('name'), literal('Old Co'), doc))
    store.add(st(pastRole, ns.schema('startDate'), literal('2020-01-01'), doc))
    store.add(st(pastRole, ns.schema('endDate'), literal('2023-12-01'), doc))

    const profile = getHeading(subject, store)

    expect(profile.jobTitle).toBe('Staff Engineer')
  })

  it('falls back to the latest past resume role when no current role exists', () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    const doc = subject.doc()
    const olderPastRole = sym('https://example.com/profile/card#role-past-older')
    const latestPastRole = sym('https://example.com/profile/card#role-past-latest')
    const olderOrg = sym('https://example.com/profile/card#org-older')
    const latestOrg = sym('https://example.com/profile/card#org-latest')

    store.add(st(olderPastRole, ns.org('member'), subject, doc))
    store.add(st(olderPastRole, ns.rdf('type'), ns.solid('PastRole'), doc))
    store.add(st(olderPastRole, ns.vcard('role'), literal('Developer'), doc))
    store.add(st(olderPastRole, ns.org('organization'), olderOrg, doc))
    store.add(st(olderOrg, ns.schema('name'), literal('Older Co'), doc))
    store.add(st(olderPastRole, ns.schema('startDate'), literal('2019-01-01'), doc))
    store.add(st(olderPastRole, ns.schema('endDate'), literal('2021-02-01'), doc))

    store.add(st(latestPastRole, ns.org('member'), subject, doc))
    store.add(st(latestPastRole, ns.rdf('type'), ns.solid('PastRole'), doc))
    store.add(st(latestPastRole, ns.vcard('role'), literal('Senior Developer'), doc))
    store.add(st(latestPastRole, ns.org('organization'), latestOrg, doc))
    store.add(st(latestOrg, ns.schema('name'), literal('Latest Co'), doc))
    store.add(st(latestPastRole, ns.schema('startDate'), literal('2021-03-01'), doc))
    store.add(st(latestPastRole, ns.schema('endDate'), literal('2024-02-01'), doc))

    const profile = getHeading(subject, store)

    expect(profile.jobTitle).toBe('Senior Developer')
  })

  it('writes trimmed basic heading fields and keeps nicknames in sync', async () => {
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

    await processHeadingMutations(store, subject, {
      basicOps: {
        create: [{
          sourceNode: subject.value,
          name: '  Jane Doe  ',
          nickname: '  janey  ',
          pronouns: '  She/Her  ',
          dateOfBirth: '2000-01-01',
          imageSrc: 'https://example.com/jane.png',
          status: 'new'
        }],
        update: [],
        remove: []
      },
      phoneOps: { create: [], update: [], remove: [] },
      emailOps: { create: [], update: [], remove: [] },
      addressOps: { create: [], update: [], remove: [] }
    } as any)

    expect(store.any(subject, ns.vcard('fn'), null, doc)?.value).toBe('Jane Doe')
    expect(store.any(subject, ns.foaf('nick'), null, doc)?.value).toBe('janey')
    expect(store.any(subject, ns.vcard('nickname'), null, doc)?.value).toBe('janey')
    expect(store.any(subject, ns.solid('preferredSubjectPronoun'), null, doc)?.value).toBe('She')
    expect(store.any(subject, ns.solid('preferredObjectPronoun'), null, doc)?.value).toBe('Her')
    expect(store.any(subject, ns.vcard('role'), null, doc)).toBeNull()
    expect(store.any(subject, ns.vcard('hasPhoto'), null, doc)?.termType).toBe('NamedNode')

    await processHeadingMutations(store, subject, {
      basicOps: {
        create: [],
        update: [],
        remove: [{
          sourceNode: subject.value,
          name: '',
          nickname: '',
          pronouns: '',
          dateOfBirth: '',
          imageSrc: '',
          status: 'deleted'
        }]
      },
      phoneOps: { create: [], update: [], remove: [] },
      emailOps: { create: [], update: [], remove: [] },
      addressOps: { create: [], update: [], remove: [] }
    } as any)

    expect(store.any(subject, ns.vcard('fn'), null, doc)).toBeNull()
    expect(store.any(subject, ns.foaf('nick'), null, doc)).toBeNull()
    expect(store.any(subject, ns.solid('preferredSubjectPronoun'), null, doc)).toBeNull()
    expect(store.any(subject, ns.solid('preferredObjectPronoun'), null, doc)).toBeNull()
    expect(store.any(subject, ns.vcard('hasPhoto'), null, doc)).toBeNull()
  })

  it('replaces and removes legacy image predicates with the canonical photo field', async () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    const doc = subject.doc()
    const legacyImage = sym('https://example.com/legacy.png')

    store.add(st(subject, ns.foaf('img'), legacyImage, doc))
    store.updater = {
      update: (deletions: any[], insertions: any[], callback: Function) => {
        deletions.forEach((statement) => store.remove(st(statement.subject, statement.predicate, statement.object, statement.why)))
        insertions.forEach((statement) => store.add(statement.subject, statement.predicate, statement.object, statement.why))
        callback('', true)
      }
    }

    const basicOps = {
      create: [],
      update: [{
        sourceNode: subject.value,
        name: '',
        nickname: '',
        pronouns: '',
        dateOfBirth: '',
        imageSrc: 'https://example.com/current.png',
        status: 'updated'
      }],
      remove: []
    }

    await processHeadingMutations(store, subject, {
      basicOps,
      phoneOps: { create: [], update: [], remove: [] },
      emailOps: { create: [], update: [], remove: [] },
      addressOps: { create: [], update: [], remove: [] }
    } as any)

    expect(store.any(subject, ns.foaf('img'), null, doc)).toBeNull()
    expect(store.any(subject, ns.vcard('hasPhoto'), null, doc)?.value).toBe('https://example.com/current.png')
    expect(getHeading(subject, store).imageSrc).toBe('https://example.com/current.png')

    await processHeadingMutations(store, subject, {
      basicOps: {
        create: [],
        update: [],
        remove: [{
          sourceNode: subject.value,
          name: '',
          nickname: '',
          pronouns: '',
          dateOfBirth: '',
          imageSrc: '',
          status: 'deleted'
        }]
      },
      phoneOps: { create: [], update: [], remove: [] },
      emailOps: { create: [], update: [], remove: [] },
      addressOps: { create: [], update: [], remove: [] }
    } as any)

    expect(getHeading(subject, store).imageSrc).toBeUndefined()
  })

})
