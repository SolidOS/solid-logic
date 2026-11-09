import { describe, expect, it } from 'vitest'
import { blankNode, graph, literal, st, sym } from 'rdflib'
import { ns } from '../src/util/ns'
import { getEducation } from '../src/profile/sections/education/selectors'
import { processEducationMutations } from '../src/profile/sections/education/mutations'
import { saveEducationUpdatesFailedMessageText, updaterUnsupportedStoreErrorMessageText } from '../src/profile/texts'

describe('Education selectors and mutations', () => {
  it('selector returns empty education list from empty store', () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')

    expect(getEducation(subject, store)).toEqual([])
  })

  it('mutation surfaces unsupported store updater errors', async () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')

    const plan = { create: [], update: [], remove: [] }
    await expect(processEducationMutations(store, subject, plan as any)).rejects.toMatchObject({
      message: saveEducationUpdatesFailedMessageText,
      cause: expect.objectContaining({ message: updaterUnsupportedStoreErrorMessageText })
    })
  })

  it('selector sorts current education first and dedupes blank nodes in favor of named nodes', () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    const doc = subject.doc()
    const namedMembership = sym(`${doc.value}#education-1`)
    const duplicateBlankMembership = blankNode()
    const pastMembership = sym(`${doc.value}#education-2`)

    ;[namedMembership, duplicateBlankMembership].forEach((node) => {
      store.add(node, ns.org('member'), subject, doc)
      store.add(node, ns.rdf('type'), ns.schema('EducationalOccupationalCredential'), doc)
      store.add(node, ns.schema('name'), literal('Harvard'), doc)
      store.add(node, ns.schema('educationalCredentialAwarded'), literal('BSc'), doc)
      store.add(node, ns.schema('location'), literal('Cambridge'), doc)
      store.add(node, ns.schema('startDate'), literal('2020-09-01'), doc)
    })

    store.add(pastMembership, ns.org('member'), subject, doc)
    store.add(pastMembership, ns.rdf('type'), ns.schema('EducationalOccupationalCredential'), doc)
    store.add(pastMembership, ns.schema('name'), literal('Oxford'), doc)
    store.add(pastMembership, ns.schema('startDate'), literal('2015-09-01'), doc)
    store.add(pastMembership, ns.schema('endDate'), literal('2019-06-01'), doc)

    const result = getEducation(subject, store)

    expect(result).toHaveLength(2)
    expect(result[0].school).toBe('Harvard')
    expect(result[0].sourceNode.value).toBe(namedMembership.value)
    expect(result[1].school).toBe('Oxford')
  })

  it('mutation creates, updates, and removes education membership statements', async () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    const doc = subject.doc()
    const existingMembership = sym(`${doc.value}#education-existing`)

    store.updater = {
      update: (deletions: any[], insertions: any[], callback: Function) => {
        deletions.forEach((statement) => store.remove(st(statement.subject, statement.predicate, statement.object, statement.why)))
        insertions.forEach((statement) => store.add(statement.subject, statement.predicate, statement.object, statement.why))
        callback('', true)
      }
    }

    store.add(existingMembership, ns.org('member'), subject, doc)
    store.add(existingMembership, ns.rdf('type'), ns.schema('EducationalOccupationalCredential'), doc)
    store.add(existingMembership, ns.schema('name'), literal('Old school'), doc)

    await processEducationMutations(store, subject, {
      create: [{ school: 'New school', degree: 'MSc', location: 'Boston', startDate: '2024-01-01', endDate: '', description: 'New cohort', sourceNode: '', status: 'new' }],
      update: [{ school: 'Updated school', degree: 'BA', location: 'London', startDate: '2020-01-01', endDate: '2023-01-01', description: 'Updated description', sourceNode: existingMembership.value, status: 'modified' }],
      remove: []
    } as any)

    expect(store.any(existingMembership, ns.schema('name'), null, doc)?.value).toBe('Updated school')
    expect(store.any(existingMembership, ns.schema('description'), null, doc)?.value).toBe('Updated description')

    const createdMemberships = store.each(null, ns.org('member'), subject, doc).filter((node) => node.value !== existingMembership.value)
    expect(createdMemberships).toHaveLength(1)
    expect(store.any(createdMemberships[0] as any, ns.schema('name'), null, doc)?.value).toBe('New school')

    await processEducationMutations(store, subject, {
      create: [],
      update: [],
      remove: [{ school: 'Updated school', degree: 'BA', location: 'London', startDate: '2020-01-01', endDate: '2023-01-01', description: 'Updated description', sourceNode: existingMembership.value, status: 'deleted' }]
    } as any)

    expect(store.statementsMatching(existingMembership, null, null, doc)).toHaveLength(0)
  })
})
