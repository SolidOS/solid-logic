import { describe, expect, it } from 'vitest'
import { graph, st, sym, literal } from 'rdflib'
import { ns } from '../src/util/ns'
import { getSkillDetails, getSkills } from '../src/profile/sections/skills/selectors'
import { processSkillsMutations } from '../src/profile/sections/skills/mutations'
import { saveSkillsUpdatesFailedMessageText } from '../src/profile/texts'

describe('Skills selectors and mutations', () => {
  it('selector returns empty skills from empty store', () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')

    expect(getSkills(subject, store)).toEqual([])
  })

  it('selector reads names from publicId node when publicId is a skill: node', () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    const doc = subject.doc()
    const skillEntry = sym(`${doc.value}#id1`)
    const skillPublicId = sym('skill:typescript')

    store.add(subject, ns.schema('skills'), skillEntry, doc)
    store.add(skillEntry, ns.solid('publicId'), skillPublicId, doc)
    store.add(skillPublicId, ns.schema('name'), 'TypeScript', doc)

    expect(getSkills(subject, store)).toEqual(['TypeScript'])
  })

  it('selector reads names from blank-node publicId and preserves blank-node identifier', () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    const doc = subject.doc()
    const skillEntry = sym(`${doc.value}#id1`)
    const skillPublicId = store.bnode('custom-skill')

    store.add(subject, ns.schema('skills'), skillEntry, doc)
    store.add(skillEntry, ns.solid('publicId'), skillPublicId, doc)
    store.add(skillPublicId, ns.schema('name'), 'Facilitation', doc)

    expect(getSkills(subject, store)).toEqual(['Facilitation'])
    expect(getSkillDetails(subject, store)).toEqual([
      expect.objectContaining({
        name: 'Facilitation',
        publicId: '_:custom-skill'
      })
    ])
  })

  it('mutation surfaces section-specific unsupported store updater errors', async () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')

    const plan = {
      create: [{ name: 'TypeScript', publicId: 'skill:typescript', sourceNode: '', status: 'new' }],
      update: [],
      remove: []
    }
    await expect(processSkillsMutations(store, subject, plan as any)).rejects.toMatchObject({
      message: saveSkillsUpdatesFailedMessageText,
      cause: expect.objectContaining({
        message: 'Skill updates are not supported by this store updater.'
      })
    })
  })

  it('writes created skills with skill: node publicId and name on the publicId node', async () => {
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
      create: [{ name: 'TypeScript', publicId: 'http://data.europa.eu/esco/skill/typescript', sourceNode: '', status: 'new' }],
      update: [],
      remove: []
    }

    await processSkillsMutations(store, subject, plan as any)

    const skillLinks = store.statementsMatching(subject, ns.schema('skills'), null, doc)
    expect(skillLinks).toHaveLength(1)

    const sourceNode = skillLinks[0].object
    const publicIdLink = store.any(sourceNode, ns.solid('publicId'), null, doc)
    expect(publicIdLink?.termType).toBe('NamedNode')
    expect(publicIdLink?.value).toBe('skill:typescript')

    const skillName = store.any(publicIdLink as any, ns.schema('name'), null, doc)
    expect(skillName?.value).toBe('TypeScript')

    const legacyNameOnEntry = store.any(sourceNode, ns.schema('name'), null, doc)
    expect(legacyNameOnEntry).toBeNull()
  })

  it('writes created custom skills with blank-node publicId and name on that blank node', async () => {
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
      create: [{ name: 'Facilitation', publicId: '', sourceNode: '', status: 'new' }],
      update: [],
      remove: []
    }

    await processSkillsMutations(store, subject, plan as any)

    const skillLinks = store.statementsMatching(subject, ns.schema('skills'), null, doc)
    expect(skillLinks).toHaveLength(1)

    const sourceNode = skillLinks[0].object
    const publicIdLink = store.any(sourceNode, ns.solid('publicId'), null, doc)
    expect(publicIdLink?.termType).toBe('BlankNode')

    const skillName = store.any(publicIdLink as any, ns.schema('name'), null, doc)
    expect(skillName?.value).toBe('Facilitation')

    const legacyNameOnEntry = store.any(sourceNode, ns.schema('name'), null, doc)
    expect(legacyNameOnEntry).toBeNull()
  })


  it('deletes both skill entry triples and schema:skills pointer', async () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    const doc = subject.doc()
    const sourceNode = sym(`${doc.value}#id777`)

    store.updater = {
      update: (deletions: any[], insertions: any[], callback: Function) => {
        deletions.forEach((statement) => store.remove(st(statement.subject, statement.predicate, statement.object, statement.why)))
        insertions.forEach((statement) => store.add(statement.subject, statement.predicate, statement.object, statement.why))
        callback('', true)
      }
    }

    store.add(subject, ns.schema('skills'), sourceNode, doc)
    const publicIdNode = sym('skill:typescript')
    store.add(sourceNode, ns.solid('publicId'), publicIdNode, doc)
    store.add(publicIdNode, ns.schema('name'), literal('TypeScript'), doc)

    const plan = {
      create: [],
      update: [],
      remove: [{ name: 'TypeScript', publicId: 'skill:typescript', sourceNode: `${doc.value}#id777`, status: 'deleted' }]
    }

    await processSkillsMutations(store, subject, plan as any)

    expect(store.statementsMatching(subject, ns.schema('skills'), null, doc)).toHaveLength(0)
    expect(store.statementsMatching(sourceNode, null, null, doc)).toHaveLength(0)
  })
})
