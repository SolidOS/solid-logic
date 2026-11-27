import { beforeEach, describe, expect, it } from 'vitest'
import { presentCV } from '../src/profile/sections/resume/selectors'
import { blankNode, sym } from 'rdflib'
import { ns } from '../src/util/ns'
import { store } from '../src/index'

describe('CVPresenter', () => {
  const jane = sym('https://jane.doe.example/profile/card#me')
  const doc = jane.doc()

  beforeEach(() => {
    store.removeDocument(doc)
  })

  it('returns an empty list when no memberships exist', () => {
    const result = presentCV(jane, store)
    expect(result).toEqual([])
  })

  it('presents a role entry from an org membership', () => {
    const membership = blankNode()
    const organization = blankNode()

    store.add(membership, ns.org('member'), jane, doc)
    store.add(membership, ns.vcard('role'), 'Developer', doc)
    store.add(membership, ns.schema('startDate'), '2024-01-01', doc)
    store.add(membership, ns.org('organization'), organization, doc)
    store.add(organization, ns.schema('name'), 'Inrupt', doc)

    const result = presentCV(jane, store)

    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Developer')
    expect(result[0].orgName).toBe('Inrupt')
  })
})
