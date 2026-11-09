import { describe, expect, it, vi } from 'vitest'
import { blankNode, literal, st, Store, sym } from 'rdflib'
import type { LiveStore, NamedNode } from 'rdflib'
import { ns } from '../src/util/ns'
import { ensureProjectDocumentsLoaded, presentProjects } from '../src/profile/sections/projects/selectors'

const subject = sym('https://example.test/profile/card#me')
const profile = subject.doc()

describe('project selectors', () => {
  it('reads direct, literal, blank-node, and RDF-list community links', async () => {
    const store = new Store()
    const direct = sym('https://example.test/projects/direct#it')
    const literalProject = sym('https://example.test/projects/literal#it')
    const blankProject = sym('https://example.test/projects/blank#it')
    const listProject = sym('https://example.test/projects/list#it')
    const blankLink = blankNode('project-link')
    const listHead = blankNode('projects')
    const listTail = blankNode('projects-tail')

    store.add(st(subject, ns.solid('community'), direct, profile))
    store.add(st(subject, ns.solid('community'), literal(literalProject.value), profile))
    store.add(st(subject, ns.solid('community'), blankLink, profile))
    store.add(st(blankLink, ns.schema('url'), blankProject, profile))
    store.add(st(subject, ns.solid('community'), listHead, profile))
    store.add(st(listHead, ns.rdf('first'), listProject, profile))
    store.add(st(listHead, ns.rdf('rest'), listTail, profile))
    store.add(st(listTail, ns.rdf('first'), direct, profile))
    store.add(st(listTail, ns.rdf('rest'), ns.rdf('nil'), profile))

    store.add(st(direct, ns.foaf('name'), literal('Direct project'), direct.doc()))
    store.add(st(direct, ns.vcard('organization-name'), literal('Direct org'), direct.doc()))
    store.add(st(direct, ns.rdf('type'), ns.schema('Project'), direct.doc()))
    store.add(st(direct, ns.foaf('img'), sym('https://example.test/direct.png'), direct.doc()))
    store.add(st(literalProject, ns.foaf('name'), literal('Literal project'), literalProject.doc()))
    store.add(st(literalProject, ns.rdf('type'), ns.schema('Community'), literalProject.doc()))
    store.add(st(blankProject, ns.foaf('name'), literal('Blank project'), blankProject.doc()))
    store.add(st(listProject, ns.foaf('name'), literal('List project'), listProject.doc()))

    await expect(presentProjects(subject, store as unknown as LiveStore)).resolves.toEqual([
      expect.objectContaining({
        url: direct.value,
        title: 'Direct project',
        orgName: 'Direct org',
        imageUrl: 'https://example.test/direct.png',
        category: 'project',
        sourceNode: direct
      }),
      expect.objectContaining({
        url: literalProject.value,
        title: 'Literal project',
        category: 'community'
      }),
      expect.objectContaining({ url: blankProject.value, title: 'Blank project', category: 'unknown' }),
      expect.objectContaining({ url: listProject.value, title: 'List project', category: 'unknown' })
    ])
  })

  it('deduplicates normalized URLs and continues loading after an individual error', async () => {
    const store = new Store()
    const available = sym('https://example.test/projects/available#one')
    const unavailable = sym('https://example.test/projects/unavailable#one')
    const load = vi.fn(async (doc: NamedNode) => {
      if (doc.value === unavailable.doc().value) throw new Error('Not found')
    })
    const requested: Record<string, unknown> = { [unavailable.doc().value]: 404 }
    ;(store as any).fetcher = { load, requested }

    store.add(st(subject, ns.solid('community'), available, profile))
    store.add(st(subject, ns.solid('community'), literal(available.value), profile))
    store.add(st(subject, ns.solid('community'), unavailable, profile))

    await expect(ensureProjectDocumentsLoaded(subject, store as unknown as LiveStore)).resolves.toBeUndefined()
    expect(load).toHaveBeenCalledTimes(2)
    expect(requested).not.toHaveProperty(unavailable.doc().value)
  })
})
