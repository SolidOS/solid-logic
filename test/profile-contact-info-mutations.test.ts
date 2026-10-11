import { describe, expect, it } from 'vitest'
import { graph, literal, st, sym } from 'rdflib'
import { ns } from '../src/util/ns'
import { getContactInfo } from '../src/profile/sections/contactInfo/selectors'
import { processContactInfoMutations } from '../src/profile/sections/contactInfo/mutations'
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

    store.updater = {
      update: (_deletions: any[], insertions: any[], callback: Function) => {
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
