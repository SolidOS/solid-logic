import { describe, expect, it } from 'vitest'
import { blankNode, graph, literal, sym } from 'rdflib'
import { presentCV } from '../src/profile/sections/resume/selectors'
import { ns } from '../src/util/ns'

const subject = sym('https://example.com/profile/card#me')
const document = subject.doc()

function addMembership (store: any, membership: any): void {
  store.add(membership, ns.org('member'), subject, document)
}

describe('resume selectors', () => {
  it('extracts role names and types from membership role resources', () => {
    const store = graph()
    const membership = sym(`${document.value}#role`)
    const role = sym('https://example.com/roles/engineer')
    addMembership(store, membership)
    store.add(membership, ns.rdf('type'), ns.solid('PastRole'), document)
    store.add(membership, ns.org('role'), role, document)
    store.add(role, ns.schema('name'), literal('Engineer'), document)
    store.add(membership, ns.vcard('role'), literal('Platform'), document)

    expect(presentCV(subject, store as any)).toEqual([
      expect.objectContaining({ title: 'Engineer - Platform', roleType: 'PastRole', sourceNode: membership })
    ])
  })

  it('extracts organization metadata, prioritizing public-id names and classification', () => {
    const store = graph()
    const membership = sym(`${document.value}#role`)
    const organization = sym(`${document.value}#organization`)
    const publicId = sym('https://catalog.example/organizations/acme')
    addMembership(store, membership)
    store.add(membership, ns.org('organization'), organization, document)
    store.add(organization, ns.schema('name'), literal('Acme Incorporated'), document)
    store.add(organization, ns.solid('publicId'), publicId, document)
    store.add(publicId, ns.schema('name'), literal('Acme'), document)
    store.add(organization, ns.org('classification'), literal('Cooperative'), document)
    store.add(organization, ns.org('location'), literal('Remote'), document)
    store.add(organization, ns.schema('uri'), sym('https://acme.example/'), document)

    expect(presentCV(subject, store as any)[0]).toMatchObject({
      orgName: 'Acme',
      orgPublicId: publicId.value,
      orgType: 'Cooperative',
      orgLocation: 'Remote',
      orgHomePage: 'https://acme.example/'
    })
  })

  it('puts current roles first and otherwise sorts roles reverse chronologically', () => {
    const store = graph()
    const current = sym(`${document.value}#current`)
    const recent = sym(`${document.value}#recent`)
    const older = sym(`${document.value}#older`)
    for (const [membership, title, startDate, endDate] of [
      [older, 'Older', '2018-01-01', '2019-01-01'],
      [current, 'Current', '2020-01-01', undefined],
      [recent, 'Recent', '2021-01-01', '2022-01-01']
    ] as const) {
      addMembership(store, membership)
      store.add(membership, ns.vcard('role'), literal(title), document)
      store.add(membership, ns.schema('startDate'), literal(startDate), document)
      if (endDate) store.add(membership, ns.schema('endDate'), literal(endDate), document)
    }

    const roles = presentCV(subject, store as any)
    expect(roles.map(role => role.title)).toEqual(['Current', 'Recent', 'Older'])
    expect(roles[0].isCurrentRole).toBe(true)
  })

  it('deduplicates matching roles and retains the named membership over a blank node', () => {
    const store = graph()
    const blankMembership = blankNode('role')
    const namedMembership = sym(`${document.value}#role`)
    for (const membership of [blankMembership, namedMembership]) {
      addMembership(store, membership)
      store.add(membership, ns.vcard('role'), literal('Engineer'), document)
      store.add(membership, ns.schema('startDate'), literal('2020-01-01'), document)
      store.add(membership, ns.schema('endDate'), literal('2021-01-01'), document)
    }

    expect(presentCV(subject, store as any)).toEqual([
      expect.objectContaining({ sourceNode: namedMembership })
    ])
  })

  it('excludes education memberships from roles', () => {
    const store = graph()
    const education = sym(`${document.value}#education`)
    const role = sym(`${document.value}#role`)
    addMembership(store, education)
    store.add(education, ns.rdf('type'), ns.schema('EducationalOccupationalCredential'), document)
    store.add(education, ns.vcard('role'), literal('Student'), document)
    addMembership(store, role)
    store.add(role, ns.vcard('role'), literal('Developer'), document)

    expect(presentCV(subject, store as any).map(item => item.title)).toEqual(['Developer'])
  })
})
