import { describe, expect, it } from 'vitest'
import { graph, sym } from 'rdflib'
import { ns } from '../src/util/ns'
import { processHeadingMutations } from '../src/profile/sections/heading/mutations'

describe('Heading mutations id-node writes', () => {
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
      basicOps: { create: [], update: [], remove: [] },
      phoneOps: {
        create: [{ value: '+1-999-888-7777', type: 'Voice', sourceNode: '', status: 'new' }],
        update: [],
        remove: []
      },
      emailOps: {
        create: [{ value: 'alex@example.com', type: 'Internet', sourceNode: '', status: 'new' }],
        update: [],
        remove: []
      },
      addressOps: {
        create: [{ streetAddress: 'North St', locality: 'NYC', region: 'NY', postalCode: '10001', countryName: 'US', type: 'Home', sourceNode: '', status: 'new' }],
        update: [],
        remove: []
      }
    }

    await processHeadingMutations(store, subject, plan as any)

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
    expect(emailValue?.object?.value).toBe('mailto:alex@example.com')
    expect(phoneValue?.object?.termType).toBe('NamedNode')
    expect(phoneValue?.object?.value).toBe('tel:+1-999-888-7777')
  })

})
