import { describe, expect, it } from 'vitest'
import { Collection, graph, literal, NamedNode, st, sym } from 'rdflib'
import { ns } from '../src/util/ns'
import { presentLanguages } from '../src/profile/sections/languages/selectors'
import { processLanguageMutations } from '../src/profile/sections/languages/mutations'
import { saveLanguageUpdatesFailedMessageText } from '../src/profile/texts'
import { expandRdfList } from '../src/profile/sections/shared/rdfList'
describe('Languages selectors and mutations', () => {
  it('selector returns empty list from empty store', () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')

    expect(presentLanguages(subject, store)).toEqual([])
  })

  it('mutation surfaces updater callback failures', async () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    store.updater = {
      update: (_deletions: any[], _insertions: any[], callback: Function) => callback('', false, 'boom')
    }

    const plan = {
      create: [{ name: 'French', publicId: 'https://www.w3.org/ns/iana/language-code/fr', proficiency: '', sourceNode: '', status: 'new' }],
      update: [],
      remove: []
    }
    await expect(processLanguageMutations(store, subject, plan as any)).rejects.toMatchObject({
      message: saveLanguageUpdatesFailedMessageText,
      cause: expect.objectContaining({ message: 'boom' })
    })
  })

  it('reads canonical id-node list with solid publicId URI and schema name', () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    const doc = subject.doc()
    const id1 = sym('https://example.com/profile/card#id1')
    const id2 = sym('https://example.com/profile/card#id2')
    store.add(subject, ns.schema('knowsLanguage'), new Collection([
      id1,
      id2
    ]), doc)
    store.add(id1, ns.solid('publicId'), sym('https://www.w3.org/ns/iana/language-code/en'), doc)
    store.add(id1, ns.schema('name'), literal('English'), doc)
    store.add(id2, ns.solid('publicId'), sym('https://www.w3.org/ns/iana/language-code/es'), doc)
    store.add(id2, ns.schema('name'), literal('Spanish'), doc)

    const languages = presentLanguages(subject, store)
    expect(languages).toHaveLength(2)
    expect(languages.map((item) => item.name)).toEqual(['English', 'Spanish'])
    expect(languages.map((item) => item.publicId)).toEqual([
      'https://www.w3.org/ns/iana/language-code/en',
      'https://www.w3.org/ns/iana/language-code/es'
    ])
  })

  it('reads direct IANA URI list entries', () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    const doc = subject.doc()
    store.add(subject, ns.schema('knowsLanguage'), new Collection([
      sym('https://www.w3.org/ns/iana/language-code/en'),
      sym('https://www.w3.org/ns/iana/language-code/es')
    ]), doc)

    const languages = presentLanguages(subject, store)
    expect(languages).toHaveLength(2)
    expect(languages.map((item) => item.publicId)).toEqual([
      'https://www.w3.org/ns/iana/language-code/en',
      'https://www.w3.org/ns/iana/language-code/es'
    ])
  })

  it('reads legacy entry-node list with solid:publicId literals', () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    const doc = subject.doc()
    const language1 = store.bnode()
    const language2 = store.bnode()

    store.add(subject, ns.schema('knowsLanguage'), new Collection([language1, language2]), doc)
    store.add(language1, ns.solid('publicId'), literal('fr'), doc)
    store.add(language2, ns.solid('publicId'), literal('de'), doc)

    const languages = presentLanguages(subject, store)
    expect(languages).toHaveLength(2)
    expect(languages.map((item) => item.publicId)).toEqual(['fr', 'de'])
  })

  it('reads cumulative legacy list snapshots and keeps merged ordered languages', () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    const doc = subject.doc()
    const id1 = sym('https://example.com/profile/card#id1')
    const id2 = sym('https://example.com/profile/card#id2')
    const id3 = sym('https://example.com/profile/card#id3')

    store.add(subject, ns.schema('knowsLanguage'), new Collection([id1]), doc)
    store.add(subject, ns.schema('knowsLanguage'), new Collection([id1, id2]), doc)
    store.add(subject, ns.schema('knowsLanguage'), new Collection([id1, id2, id3]), doc)

    store.add(id1, ns.solid('publicId'), sym('https://www.w3.org/ns/iana/language-code/en'), doc)
    store.add(id2, ns.solid('publicId'), sym('https://www.w3.org/ns/iana/language-code/fr'), doc)
    store.add(id3, ns.solid('publicId'), sym('https://www.w3.org/ns/iana/language-code/de'), doc)

    const languages = presentLanguages(subject, store)
    expect(languages).toHaveLength(3)
    expect(languages.map((item) => item.publicId)).toEqual([
      'https://www.w3.org/ns/iana/language-code/en',
      'https://www.w3.org/ns/iana/language-code/fr',
      'https://www.w3.org/ns/iana/language-code/de'
    ])
  })

  it('merges fragmented knowsLanguage rdf lists before deduping', () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    const doc = subject.doc()
    const id1 = sym('https://example.com/profile/card#id1')
    const id2 = sym('https://example.com/profile/card#id2')
    const id3 = sym('https://example.com/profile/card#id3')

    store.add(subject, ns.schema('knowsLanguage'), new Collection([id1, id2]), doc)
    store.add(subject, ns.schema('knowsLanguage'), new Collection([id2, id3]), doc)

    store.add(id1, ns.solid('publicId'), sym('https://www.w3.org/ns/iana/language-code/en'), doc)
    store.add(id2, ns.solid('publicId'), sym('https://www.w3.org/ns/iana/language-code/fr'), doc)
    store.add(id3, ns.solid('publicId'), sym('https://www.w3.org/ns/iana/language-code/de'), doc)

    const languages = presentLanguages(subject, store)

    expect(languages).toHaveLength(3)
    expect(languages.map((item) => item.publicId)).toEqual([
      'https://www.w3.org/ns/iana/language-code/en',
      'https://www.w3.org/ns/iana/language-code/fr',
      'https://www.w3.org/ns/iana/language-code/de'
    ])
  })

  it('writes canonical id-node Collection model and removes legacy entry-node model statements', async () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    const doc = subject.doc()
    const legacyEntry1 = sym('https://example.com/profile/card#id111')
    const legacyEntry2 = sym('https://example.com/profile/card#id222')

    store.add(subject, ns.schema('knowsLanguage'), new Collection([legacyEntry1]), doc)
    store.add(subject, ns.schema('knowsLanguage'), new Collection([legacyEntry1, legacyEntry2]), doc)
    store.add(legacyEntry1, ns.solid('publicId'), literal('fr'), doc)
    store.add(legacyEntry2, ns.solid('publicId'), sym('https://www.w3.org/ns/iana/language-code/de'), doc)
    store.add(legacyEntry1, ns.rdf('type'), ns.schema('Language'), doc)

    let insertionsCaptured: any[] = []
    store.updater = {
      update: (deletions: any[], insertions: any[], callback: Function) => {
        insertionsCaptured = insertions
        deletions.forEach((statement) => store.remove(st(statement.subject, statement.predicate, statement.object, statement.why)))
        insertions.forEach((statement) => store.add(statement.subject, statement.predicate, statement.object, statement.why))
        callback('', true)
      }
    }

    await processLanguageMutations(
      store,
      subject,
      { create: [], update: [], remove: [] } as any,
      [
        { name: 'German', publicId: 'https://www.w3.org/ns/iana/language-code/de', proficiency: '', sourceNode: '', status: 'existing' },
        { name: 'French', publicId: 'fr', proficiency: '', sourceNode: '', status: 'existing' }
      ] as any
    )

    const knowsLanguageValues = store.statementsMatching(subject, ns.schema('knowsLanguage'), null, doc)
    expect(knowsLanguageValues).toHaveLength(1)
    const listValue = knowsLanguageValues[0].object as NamedNode
    expect(listValue.termType).toBe('NamedNode')
    expect(listValue.value).toContain('#id')

    const listElements = expandRdfList(store, listValue)
    expect(listElements.every((node: any) => node?.termType === 'NamedNode')).toBe(true)
    expect(listElements.every((node: any) => node?.value.includes('#id'))).toBe(true)

    const publicIdStatements = listElements.map((node: any) => {
      return store.any(node, ns.solid('publicId'), null, doc)
    })

    expect(publicIdStatements.map((node: any) => node?.value)).toEqual([
      'https://www.w3.org/ns/iana/language-code/de',
      'https://www.w3.org/ns/iana/language-code/fr'
    ])

    const nameStatements = publicIdStatements.map((node: any) => {
      return store.any(node, ns.schema('name'), null, doc)
    })
    expect(nameStatements.map((node: any) => node?.value)).toEqual(['German', 'French'])
    expect(nameStatements.map((node: any) => node?.lang)).toEqual(['en', 'en'])

    expect(insertionsCaptured.some((statement) => statement.predicate.value === ns.schema('knowsLanguage').value)).toBe(true)

    const legacyPublicIdLiteralStatements = store.statementsMatching(undefined, ns.solid('publicId'), literal('fr'), doc)
    expect(legacyPublicIdLiteralStatements).toHaveLength(0)
    expect(store.statementsMatching(legacyEntry1, ns.rdf('type'), ns.schema('Language'), doc)).toHaveLength(0)
  })

  it('returns reordered languages from the selector after saving orderedRows', async () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    const doc = subject.doc()
    const englishEntry = sym('https://example.com/profile/card#id-en')
    const frenchEntry = sym('https://example.com/profile/card#id-fr')

    store.add(subject, ns.schema('knowsLanguage'), new Collection([englishEntry, frenchEntry]), doc)
    store.add(englishEntry, ns.solid('publicId'), sym('https://www.w3.org/ns/iana/language-code/en'), doc)
    store.add(sym('https://www.w3.org/ns/iana/language-code/en'), ns.schema('name'), literal('English', 'en'), doc)
    store.add(frenchEntry, ns.solid('publicId'), sym('https://www.w3.org/ns/iana/language-code/fr'), doc)
    store.add(sym('https://www.w3.org/ns/iana/language-code/fr'), ns.schema('name'), literal('French', 'en'), doc)

    store.updater = {
      update: (deletions: any[], insertions: any[], callback: Function) => {
        deletions.forEach((statement) => store.remove(st(statement.subject, statement.predicate, statement.object, statement.why)))
        insertions.forEach((statement) => store.add(statement.subject, statement.predicate, statement.object, statement.why))
        callback('', true)
      }
    }

    await processLanguageMutations(
      store,
      subject,
      { create: [], update: [], remove: [] } as any,
      [
        { name: 'French', publicId: 'https://www.w3.org/ns/iana/language-code/fr', proficiency: '', sourceNode: frenchEntry.value, status: 'existing' },
        { name: 'English', publicId: 'https://www.w3.org/ns/iana/language-code/en', proficiency: '', sourceNode: englishEntry.value, status: 'existing' }
      ] as any
    )

    const languages = presentLanguages(subject, store)

    expect(languages.map((item) => item.publicId)).toEqual([
      'https://www.w3.org/ns/iana/language-code/fr',
      'https://www.w3.org/ns/iana/language-code/en'
    ])
    expect(languages.map((item) => item.name)).toEqual(['French', 'English'])
  })

  it('preserves existing language entry nodes and unrelated statements on reorder', async () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    const doc = subject.doc()
    const englishEntry = sym('https://example.com/profile/card#id-en')
    const frenchEntry = sym('https://example.com/profile/card#id-fr')

    store.add(subject, ns.schema('knowsLanguage'), new Collection([englishEntry, frenchEntry]), doc)
    store.add(englishEntry, ns.solid('publicId'), sym('https://www.w3.org/ns/iana/language-code/en'), doc)
    store.add(sym('https://www.w3.org/ns/iana/language-code/en'), ns.schema('name'), literal('English', 'en'), doc)
    store.add(frenchEntry, ns.solid('publicId'), sym('https://www.w3.org/ns/iana/language-code/fr'), doc)
    store.add(sym('https://www.w3.org/ns/iana/language-code/fr'), ns.schema('name'), literal('French', 'en'), doc)
    store.add(englishEntry, ns.rdf('type'), ns.schema('Language'), doc)

    store.updater = {
      update: (deletions: any[], insertions: any[], callback: Function) => {
        deletions.forEach((statement) => store.remove(st(statement.subject, statement.predicate, statement.object, statement.why)))
        insertions.forEach((statement) => store.add(statement.subject, statement.predicate, statement.object, statement.why))
        callback('', true)
      }
    }

    await processLanguageMutations(
      store,
      subject,
      { create: [], update: [], remove: [] } as any,
      [
        { name: 'French', publicId: 'https://www.w3.org/ns/iana/language-code/fr', proficiency: '', sourceNode: frenchEntry.value, status: 'existing' },
        { name: 'English', publicId: 'https://www.w3.org/ns/iana/language-code/en', proficiency: '', sourceNode: englishEntry.value, status: 'existing' }
      ] as any
    )

    const languages = presentLanguages(subject, store)

    expect(languages.map((item) => item.sourceNode.value)).toEqual([
      frenchEntry.value,
      englishEntry.value
    ])
    expect(store.statementsMatching(englishEntry, ns.rdf('type'), ns.schema('Language'), doc)).toHaveLength(1)
  })

  it('preserves stored schema:name triples on publicId nodes on reorder', async () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    const doc = subject.doc()
    const englishEntry = sym('https://example.com/profile/card#id-en')
    const frenchEntry = sym('https://example.com/profile/card#id-fr')
    const englishPublicId = sym('https://www.w3.org/ns/iana/language-code/en')
    const frenchPublicId = sym('https://www.w3.org/ns/iana/language-code/fr')

    store.add(subject, ns.schema('knowsLanguage'), new Collection([englishEntry, frenchEntry]), doc)
    store.add(englishEntry, ns.solid('publicId'), englishPublicId, doc)
    store.add(englishPublicId, ns.schema('name'), literal('English', 'en'), doc)
    store.add(frenchEntry, ns.solid('publicId'), frenchPublicId, doc)
    store.add(frenchPublicId, ns.schema('name'), literal('French', 'en'), doc)

    store.updater = {
      update: (deletions: any[], insertions: any[], callback: Function) => {
        deletions.forEach((statement) => store.remove(st(statement.subject, statement.predicate, statement.object, statement.why)))
        insertions.forEach((statement) => store.add(statement.subject, statement.predicate, statement.object, statement.why))
        callback('', true)
      }
    }

    await processLanguageMutations(
      store,
      subject,
      { create: [], update: [], remove: [] } as any,
      [
        { name: 'French', publicId: 'https://www.w3.org/ns/iana/language-code/fr', proficiency: '', sourceNode: frenchEntry.value, status: 'existing' },
        { name: 'English', publicId: 'https://www.w3.org/ns/iana/language-code/en', proficiency: '', sourceNode: englishEntry.value, status: 'existing' }
      ] as any
    )

    expect(store.statementsMatching(englishPublicId, ns.schema('name'), null, doc)).toHaveLength(1)
    expect(store.statementsMatching(frenchPublicId, ns.schema('name'), null, doc)).toHaveLength(1)
  })






  it('removes schema:name on publicId node when language row is deleted', async () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    const doc = subject.doc()
    const languageEntry = sym('https://example.com/profile/card#id-es')
    const publicIdNode = sym('https://www.w3.org/ns/iana/language-code/es')

    store.add(subject, ns.schema('knowsLanguage'), new Collection([languageEntry]), doc)
    store.add(languageEntry, ns.solid('publicId'), publicIdNode, doc)
    store.add(publicIdNode, ns.schema('name'), literal('Spanish', 'en'), doc)

    store.updater = {
      update: (deletions: any[], insertions: any[], callback: Function) => {
        deletions.forEach((statement) => store.remove(st(statement.subject, statement.predicate, statement.object, statement.why)))
        insertions.forEach((statement) => store.add(statement.subject, statement.predicate, statement.object, statement.why))
        callback('', true)
      }
    }

    await processLanguageMutations(
      store,
      subject,
      {
        create: [],
        update: [],
        remove: [{ name: 'Spanish', publicId: 'es', proficiency: '', sourceNode: languageEntry.value, status: 'deleted' }]
      } as any,
      []
    )

    expect(store.statementsMatching(subject, ns.schema('knowsLanguage'), null, doc)).toHaveLength(0)
    expect(store.statementsMatching(publicIdNode, ns.schema('name'), null, doc)).toHaveLength(0)
  })
})
