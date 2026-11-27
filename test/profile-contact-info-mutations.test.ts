import { describe, expect, it } from 'vitest'
import { graph, literal, st, sym } from 'rdflib'
import { ns } from '../src/util/ns'
import { getContactInfo } from '../src/profile/sections/contactInfo/selectors'
import { processContactInfoMutations } from '../src/profile/sections/contactInfo/mutations'
import { buildAddressStatements, buildEmailStatements, buildPhoneStatements } from '../src/profile/sections/contactInfo/rdfBuilders'
import { saveContactUpdatesFailedMessageText, updaterUnsupportedStoreErrorMessageText } from '../src/profile/texts'

describe('Contact info selectors and mutations', () => {
  it('selector returns empty contact arrays from empty store', () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')

    const result = getContactInfo(subject, store)
    expect(result.emails).toEqual([])
    expect(result.phones).toEqual([])
    expect(result.addresses).toEqual([])
  })

  it('mutation surfaces unsupported store updater errors', async () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')

    const plan = {
      phoneOps: { create: [], update: [], remove: [] },
      emailOps: { create: [], update: [], remove: [] },
      addressOps: { create: [], update: [], remove: [] }
    }

    await expect(processContactInfoMutations(store, subject, plan as any)).rejects.toMatchObject({
      message: saveContactUpdatesFailedMessageText,
      cause: expect.objectContaining({ message: updaterUnsupportedStoreErrorMessageText })
    })
  })

  it('creates phone/email/address entries with #id + 13 digits and URI values', async () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    const insertionsCaptured: any[] = []
    let updateCalls = 0

    store.updater = {
      update: (_deletions: any[], insertions: any[], callback: Function) => {
        updateCalls += 1
        insertionsCaptured.push(...insertions)
        callback('', true)
      }
    }

    const plan = {
      phoneOps: {
        create: [{ value: '+1-111-222-3333', type: 'Voice', sourceNode: '', status: 'new' }],
        update: [],
        remove: []
      },
      emailOps: {
        create: [{ value: 'jane@example.com', type: 'Internet', sourceNode: '', status: 'new' }],
        update: [],
        remove: []
      },
      addressOps: {
        create: [{ streetAddress: 'Main St', locality: 'Boston', region: 'MA', postalCode: '02101', countryName: 'US', type: 'Home', sourceNode: '', status: 'new' }],
        update: [],
        remove: []
      }
    }

    await processContactInfoMutations(store, subject, plan as any)

    expect(updateCalls).toBe(1)
    const idPattern = /^https:\/\/example\.com\/profile\/card#id\d{13}$/

    const emailLink = insertionsCaptured.find((statement) => statement.predicate.value === ns.vcard('hasEmail').value)
    const phoneLink = insertionsCaptured.find((statement) => statement.predicate.value === ns.vcard('hasTelephone').value)
    const addressLink = insertionsCaptured.find((statement) => statement.predicate.value === ns.vcard('hasAddress').value)

    expect(emailLink?.object?.value).toMatch(idPattern)
    expect(phoneLink?.object?.value).toMatch(idPattern)
    expect(addressLink?.object?.value).toMatch(idPattern)

    const emailValue = insertionsCaptured.find(
      (statement) => statement.subject.value === emailLink.object.value && statement.predicate.value === ns.vcard('value').value
    )
    const phoneValue = insertionsCaptured.find(
      (statement) => statement.subject.value === phoneLink.object.value && statement.predicate.value === ns.vcard('value').value
    )

    expect(emailValue?.object?.termType).toBe('NamedNode')
    expect(emailValue?.object?.value).toBe('mailto:jane@example.com')
    expect(phoneValue?.object?.termType).toBe('NamedNode')
    expect(phoneValue?.object?.value).toBe('tel:+1-111-222-3333')
  })

  it('normalizes contact URI values and preserves full type IRIs', () => {
    const subject = sym('https://example.com/profile/card#me')
    const doc = subject.doc()
    const node = sym(`${doc.value}#contact`)
    const fullHomeType = 'http://www.w3.org/2006/vcard/ns#Home'

    const phone = buildPhoneStatements(subject, doc, node, {
      value: '  TEL: +1 555 010 1000  ',
      type: fullHomeType,
      sourceNode: '',
      status: 'new'
    } as any)
    const email = buildEmailStatements(subject, doc, node, {
      value: ' MAILTO:person@example.com ',
      type: fullHomeType,
      sourceNode: '',
      status: 'new'
    } as any)
    const address = buildAddressStatements(subject, doc, node, {
      type: fullHomeType,
      streetAddress: '  Main St ',
      locality: '',
      region: '',
      postalCode: '',
      countryName: '',
      sourceNode: '',
      status: 'new'
    } as any)

    expect(phone.find((statement) => statement.predicate.equals(ns.vcard('value')))?.object.value)
      .toBe('tel:+15550101000')
    expect(email.find((statement) => statement.predicate.equals(ns.vcard('value')))?.object.value)
      .toBe('mailto:person@example.com')
    expect(address.find((statement) => statement.predicate.equals(ns.rdf('type')))?.object.value)
      .toBe(fullHomeType)
    expect(address.find((statement) => statement.predicate.equals(ns.vcard('street-address')))?.object.value)
      .toBe('Main St')
  })

  it('selector resolves direct entry-node values and address details while ignoring invalid points', () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    const doc = subject.doc()
    const emailNode = sym('mailto:direct@example.com')
    const phoneNode = sym('tel:+15551234567')
    const invalidPhoneNode = sym(`${doc.value}#invalid-phone`)
    const addressNode = sym(`${doc.value}#address-1`)

    store.add(st(subject, ns.vcard('hasEmail'), emailNode, doc))
    store.add(st(subject, ns.vcard('hasTelephone'), phoneNode, doc))
    store.add(st(subject, ns.vcard('hasTelephone'), invalidPhoneNode, doc))
    store.add(st(subject, ns.vcard('hasAddress'), addressNode, doc))
    store.add(st(addressNode, ns.rdf('type'), ns.vcard('Home'), doc))
    store.add(st(addressNode, ns.vcard('street-address'), literal('1 Main St'), doc))
    store.add(st(addressNode, ns.vcard('locality'), literal('Boston'), doc))
    store.add(st(addressNode, ns.vcard('country-name'), literal('US'), doc))

    const result = getContactInfo(subject, store)

    expect(result.emails).toHaveLength(1)
    expect(result.emails[0].valueNode.value).toBe('mailto:direct@example.com')
    expect(result.phones).toHaveLength(1)
    expect(result.phones[0].valueNode.value).toBe('tel:+15551234567')
    expect(result.addresses).toHaveLength(1)
    expect(result.addresses[0].type?.value).toBe(ns.vcard('Home').value)
    expect(result.addresses[0].streetAddress).toBe('1 Main St')
    expect(result.addresses[0].countryName).toBe('US')
  })

  it('migrates direct telephone links to a new entry node during updates', async () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    const doc = subject.doc()
    const oldPhone = sym('tel:+15551234567')

    store.add(st(subject, ns.vcard('hasTelephone'), oldPhone, doc))
    store.updater = {
      update: (deletions: any[], insertions: any[], callback: Function) => {
        deletions.forEach((statement) => store.remove(st(statement.subject, statement.predicate, statement.object, statement.why)))
        insertions.forEach((statement) => store.add(statement.subject, statement.predicate, statement.object, statement.why))
        callback('', true)
      }
    }

    await processContactInfoMutations(store, subject, {
      phoneOps: {
        create: [],
        update: [{ value: '+15557654321', type: 'Voice', sourceNode: oldPhone.value, status: 'updated' }],
        remove: []
      },
      emailOps: { create: [], update: [], remove: [] },
      addressOps: { create: [], update: [], remove: [] }
    } as any)

    expect(store.holds(subject, ns.vcard('hasTelephone'), oldPhone, doc)).toBe(false)
    const newPhone = store.any(subject, ns.vcard('hasTelephone'), null, doc)
    expect(newPhone?.termType).toBe('NamedNode')
    expect(newPhone?.value).toMatch(/#id\d{13}$/)
    expect(store.any(newPhone, ns.vcard('value'), null, doc)?.value).toBe('tel:+15557654321')
    expect(getContactInfo(subject, store).phones[0].valueNode.value).toBe('tel:+15557654321')
  })

  it('updates one contact dialog in one request without deleting secondary entries or metadata', async () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    const doc = subject.doc()
    const phone = sym(`${doc.value}#phone-1`)
    const secondaryEmail = sym(`${doc.value}#email-2`)
    let updateCalls = 0

    store.add(st(subject, ns.vcard('hasTelephone'), phone, doc))
    store.add(st(phone, ns.vcard('value'), sym('tel:+15551234567'), doc))
    store.add(st(phone, ns.rdf('type'), ns.vcard('Work'), doc))
    store.add(st(phone, ns.vcard('pref'), literal('1'), doc))
    store.add(st(subject, ns.vcard('hasEmail'), secondaryEmail, doc))
    store.add(st(secondaryEmail, ns.vcard('value'), sym('mailto:secondary@example.com'), doc))
    store.updater = {
      update: (deletions: any[], insertions: any[], callback: Function) => {
        updateCalls += 1
        deletions.forEach((statement) => store.remove(st(statement.subject, statement.predicate, statement.object, statement.why)))
        insertions.forEach((statement) => store.add(statement.subject, statement.predicate, statement.object, statement.why))
        callback('', true)
      }
    }

    await processContactInfoMutations(store, subject, {
      phoneOps: {
        create: [],
        update: [{ value: '+15557654321', type: 'Home', sourceNode: phone.value, status: 'updated' }],
        remove: []
      },
      emailOps: { create: [], update: [], remove: [] },
      addressOps: { create: [], update: [], remove: [] }
    } as any)

    expect(updateCalls).toBe(1)
    expect(store.holds(phone, ns.vcard('pref'), literal('1'), doc)).toBe(true)
    expect(store.holds(subject, ns.vcard('hasEmail'), secondaryEmail, doc)).toBe(true)
    expect(store.any(secondaryEmail, ns.vcard('value'), null, doc)?.value).toBe('mailto:secondary@example.com')
    expect(store.any(phone, ns.vcard('value'), null, doc)?.value).toBe('tel:+15557654321')
    expect(store.any(phone, ns.rdf('type'), null, doc)?.value).toBe(ns.vcard('Home').value)
    expect(store.any(phone, ns.vcard('pref'), null, doc)?.value).toBe('1')
  })

  it('replaces an email value and type without retaining the old value', async () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    const doc = subject.doc()
    const email = sym(`${doc.value}#email-1`)

    store.add(st(subject, ns.vcard('hasEmail'), email, doc))
    store.add(st(email, ns.vcard('value'), sym('mailto:old@example.com'), doc))
    store.add(st(email, ns.rdf('type'), ns.vcard('Work'), doc))
    store.updater = {
      update: (deletions: any[], insertions: any[], callback: Function) => {
        deletions.forEach((statement) => store.remove(st(statement.subject, statement.predicate, statement.object, statement.why)))
        insertions.forEach((statement) => store.add(statement.subject, statement.predicate, statement.object, statement.why))
        callback('', true)
      }
    }

    await processContactInfoMutations(store, subject, {
      phoneOps: { create: [], update: [], remove: [] },
      emailOps: {
        create: [],
        update: [{ value: 'new@example.com', type: 'Home', sourceNode: email.value, status: 'updated' }],
        remove: []
      },
      addressOps: { create: [], update: [], remove: [] }
    } as any)

    expect(store.any(email, ns.vcard('value'), null, doc)?.value).toBe('mailto:new@example.com')
    expect(store.any(email, ns.rdf('type'), null, doc)?.value).toBe(ns.vcard('Home').value)
    expect(store.holds(email, ns.vcard('value'), sym('mailto:old@example.com'), doc)).toBe(false)
  })

  it('preserves custom address metadata while replacing owned fields', async () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    const doc = subject.doc()
    const address = sym(`${doc.value}#address-1`)
    const customPredicate = sym('https://example.com/metadata#verified')

    store.add(st(subject, ns.vcard('hasAddress'), address, doc))
    store.add(st(address, ns.rdf('type'), ns.vcard('Work'), doc))
    store.add(st(address, ns.vcard('street-address'), literal('Old Street'), doc))
    store.add(st(address, customPredicate, literal('yes'), doc))
    store.updater = {
      update: (deletions: any[], insertions: any[], callback: Function) => {
        deletions.forEach((statement) => store.remove(st(statement.subject, statement.predicate, statement.object, statement.why)))
        insertions.forEach((statement) => store.add(statement.subject, statement.predicate, statement.object, statement.why))
        callback('', true)
      }
    }

    await processContactInfoMutations(store, subject, {
      phoneOps: { create: [], update: [], remove: [] },
      emailOps: { create: [], update: [], remove: [] },
      addressOps: {
        create: [],
        update: [{
          sourceNode: address.value,
          type: 'Home',
          streetAddress: 'New Street',
          locality: '',
          region: '',
          postalCode: '',
          countryName: '',
          status: 'updated'
        }],
        remove: []
      }
    } as any)

    expect(store.any(address, ns.vcard('street-address'), null, doc)?.value).toBe('New Street')
    expect(store.any(address, ns.rdf('type'), null, doc)?.value).toBe(ns.vcard('Home').value)
    expect(store.holds(address, customPredicate, literal('yes'), doc)).toBe(true)
  })

  it('selector falls back to vcard:value statements outside the subject document', () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    const doc = subject.doc()
    const emailEntry = sym(`${doc.value}#email-1`)
    const phoneEntry = sym(`${doc.value}#phone-1`)
    const externalDoc = sym('https://example.com/other.ttl')

    store.add(st(subject, ns.vcard('hasEmail'), emailEntry, doc))
    store.add(st(subject, ns.vcard('hasTelephone'), phoneEntry, doc))
    store.add(st(emailEntry, ns.vcard('value'), sym('mailto:external@example.com'), externalDoc))
    store.add(st(phoneEntry, ns.vcard('value'), sym('tel:+19998887777'), externalDoc))

    const result = getContactInfo(subject, store)

    expect(result.emails).toHaveLength(1)
    expect(result.emails[0].valueNode.value).toBe('mailto:external@example.com')
    expect(result.phones).toHaveLength(1)
    expect(result.phones[0].valueNode.value).toBe('tel:+19998887777')
  })

})
