import { describe, expect, it } from 'vitest'
import { blankNode, graph, literal, st, sym } from 'rdflib'
import { ns } from '../src/util/ns'
import { presentProjects } from '../src/profile/sections/projects/selectors'
import { processProjectsMutations } from '../src/profile/sections/projects/mutations'
import { saveProjectsUpdatesFailedMessageText } from '../src/profile/texts'

describe('Projects selectors and mutations', () => {
  it('selector returns empty projects from empty store', async () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')

    await expect(presentProjects(subject, store)).resolves.toEqual([])
  })

  it('mutation surfaces unsupported store updater errors', async () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')

    const plan = {
      create: [{ url: 'https://example.org/project-a', sourceNode: '', status: 'new' }],
      update: [],
      remove: []
    }
    await expect(processProjectsMutations(store, subject, plan as any)).rejects.toMatchObject({
      message: saveProjectsUpdatesFailedMessageText,
      cause: expect.objectContaining({
        message: 'Project updates are not supported by this store updater.'
      })
    })
  })

  it('selector reads projects from solid:community links', async () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    const doc = subject.doc()

    store.add(subject, ns.solid('community'), sym('https://example.org/community'), doc)

    const projects = await presentProjects(subject, store)
    expect(projects).toHaveLength(1)
    expect(projects[0].url).toBe('https://example.org/community')
  })

  it('selector reads projects from blank-node community entries with solid:publicId', async () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    const doc = subject.doc()
    const communityEntry = blankNode()
    const linkedWebId = sym('https://example.org/project/profile/card#me')

    store.add(subject, ns.solid('community'), communityEntry, doc)
    store.add(communityEntry, ns.solid('publicId'), linkedWebId, doc)

    const projects = await presentProjects(subject, store)
    expect(projects).toHaveLength(1)
    expect(projects[0].url).toBe('https://example.org/project/profile/card#me')
  })

  it('selector reads projects when solid:community is stored as an RDF list', async () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    const doc = subject.doc()
    const listHead = blankNode()
    const listTail = blankNode()
    const linkedWebId = sym('https://example.org/project-list-item#me')

    store.add(subject, ns.solid('community'), listHead, doc)
    store.add(listHead, ns.rdf('first'), linkedWebId, doc)
    store.add(listHead, ns.rdf('rest'), listTail, doc)
    store.add(listTail, ns.rdf('first'), sym('https://example.org/ignored-second-item#me'), doc)
    store.add(listTail, ns.rdf('rest'), ns.rdf('nil'), doc)

    const projects = await presentProjects(subject, store)
    expect(projects.length).toBeGreaterThan(0)
    expect(projects.some((project) => project.url === 'https://example.org/project-list-item#me')).toBe(true)
  })

  it('removes a project when solid:community is stored as an RDF list', async () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    const doc = subject.doc()
    const listHead = blankNode()
    const listTail = blankNode()
    const keepProject = sym('https://example.org/keep-project#me')
    const removeProject = sym('https://example.org/remove-project#me')

    store.add(subject, ns.solid('community'), listHead, doc)
    store.add(listHead, ns.rdf('first'), keepProject, doc)
    store.add(listHead, ns.rdf('rest'), listTail, doc)
    store.add(listTail, ns.rdf('first'), removeProject, doc)
    store.add(listTail, ns.rdf('rest'), ns.rdf('nil'), doc)

    store.updater = {
      update: (deletions: any[], insertions: any[], callback: Function) => {
        deletions.forEach((statement) => store.remove(st(statement.subject, statement.predicate, statement.object, statement.why)))
        insertions.forEach((statement) => store.add(statement.subject, statement.predicate, statement.object, statement.why))
        callback('', true)
      }
    }

    await processProjectsMutations(store, subject, {
      create: [],
      update: [],
      remove: [{ url: removeProject.value, sourceNode: removeProject.value, status: 'deleted' }]
    } as any)

    const links = store.statementsMatching(subject, ns.solid('community'), null, doc)
    expect(links).toHaveLength(1)
    expect(links[0].object.value).toBe(keepProject.value)
    expect(store.statementsMatching(listHead, null, null, doc)).toHaveLength(0)
    expect(store.statementsMatching(listTail, null, null, doc)).toHaveLength(0)
  })

  it('removes a blank-node community by its resolved project URL', async () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    const doc = subject.doc()
    const communityEntry = blankNode()
    const projectUrl = sym('https://example.org/blank-project#me')

    store.add(subject, ns.solid('community'), communityEntry, doc)
    store.add(communityEntry, ns.schema('url'), projectUrl, doc)
    store.updater = {
      update: (deletions: any[], insertions: any[], callback: Function) => {
        deletions.forEach((statement) => store.remove(st(statement.subject, statement.predicate, statement.object, statement.why)))
        insertions.forEach((statement) => store.add(statement.subject, statement.predicate, statement.object, statement.why))
        callback('', true)
      }
    }

    await processProjectsMutations(store, subject, {
      create: [],
      update: [],
      remove: [{
        url: projectUrl.value,
        sourceNode: communityEntry.value,
        status: 'deleted'
      }]
    } as any)

    expect(store.statementsMatching(subject, ns.solid('community'), null, doc)).toHaveLength(0)
    expect(store.statementsMatching(communityEntry, null, null, doc)).toHaveLength(0)
  })

  it('selector resolves literal URL values in community entries', async () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    const doc = subject.doc()

    store.add(subject, ns.solid('community'), literal('https://example.org/literal-project#me'), doc)

    const projects = await presentProjects(subject, store)
    expect(projects).toHaveLength(1)
    expect(projects[0].url).toBe('https://example.org/literal-project#me')
  })

  it('mutation stores only solid:community links', async () => {
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
      create: [{ url: 'https://example.org/project-a', sourceNode: '', status: 'new' }],
      update: [],
      remove: []
    }

    await processProjectsMutations(store, subject, plan as any)

    const links = store.statementsMatching(subject, ns.solid('community'), null, doc)
    expect(links).toHaveLength(1)
    expect(links[0].object.value).toBe('https://example.org/project-a')
    expect(store.statementsMatching(subject, ns.schema('memberOf'), null, doc)).toHaveLength(0)
  })

  it('dedupes created project URLs after normalization', async () => {
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

    await processProjectsMutations(store, subject, {
      create: [
        { url: ' https://example.org/project-a#first ', sourceNode: '', status: 'new' },
        { url: 'https://example.org/project-a#second', sourceNode: '', status: 'new' },
        { url: 'not a url', sourceNode: '', status: 'new' }
      ],
      update: [],
      remove: []
    } as any)

    const links = store.statementsMatching(subject, ns.solid('community'), null, doc)
    expect(links).toHaveLength(1)
    expect(links[0].object.value).toBe('https://example.org/project-a#first')
  })



})
