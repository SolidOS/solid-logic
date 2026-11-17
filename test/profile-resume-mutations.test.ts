import { describe, expect, it } from 'vitest'
import { blankNode, graph, literal, st, sym } from 'rdflib'
import { ns } from '../src/util/ns'
import { presentCV } from '../src/profile/sections/resume/selectors'
import { processResumeMutations } from '../src/profile/sections/resume/mutations'
import { saveResumeUpdatesFailedMessageText, updaterUnsupportedStoreErrorMessageText } from '../src/profile/texts'

describe('Resume selectors and mutations', () => {
  it('selector returns empty roles from empty store', () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')

    expect(presentCV(subject, store)).toEqual([])
  })

  it('mutation surfaces unsupported store updater errors', async () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')

    const plan = { create: [], update: [], remove: [] }
    let thrownError: any

    try {
      await processResumeMutations(store, subject, plan as any)
    } catch (error) {
      thrownError = error
    }

    expect(thrownError).toBeInstanceOf(Error)
    expect(thrownError?.message).toBe(saveResumeUpdatesFailedMessageText)
    expect(thrownError?.cause).toBeInstanceOf(Error)
    expect(thrownError?.cause?.message).toBe(updaterUnsupportedStoreErrorMessageText)
  })

  it('creates resume membership and organization nodes with #id + 13 digits', async () => {
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
      create: [{
        title: 'Engineer',
        startDate: undefined,
        endDate: undefined,
        isCurrentRole: true,
        orgName: 'Acme Corp',
        orgType: 'Corporation',
        orgLocation: 'Remote',
        orgHomePage: 'https://acme.example',
        description: 'Build things',
        entryNode: '',
        status: 'new'
      }],
      update: [],
      remove: []
    }

    await processResumeMutations(store, subject, plan as any)

    const idPattern = /^https:\/\/example\.com\/profile\/card#id\d{13}$/
    const membershipNode = insertionsCaptured.find((statement) => statement.predicate.value === ns.org('member').value)?.subject

    expect(membershipNode?.value).toMatch(idPattern)

    const organizationNode = insertionsCaptured.find(
      (statement) => statement.subject.value === membershipNode.value && statement.predicate.value === ns.org('organization').value
    )?.object

    expect(organizationNode?.value).toMatch(idPattern)

    const organizationTypeValues = insertionsCaptured
      .filter((statement) =>
        statement.subject.value === organizationNode.value &&
        statement.predicate.value === ns.rdf('type').value
      )
      .map((statement) => statement.object.value)

    expect(organizationTypeValues).toContain(ns.vcard('Organization').value)
    expect(organizationTypeValues).toContain(ns.schema('Corporation').value)
    expect(insertionsCaptured.find((statement) =>
      statement.subject.value === organizationNode.value &&
      statement.predicate.value === ns.schema('uri').value
    )?.object.termType).toBe('NamedNode')
    expect(insertionsCaptured.some((statement) =>
      statement.subject.value === organizationNode.value &&
      statement.predicate.value === ns.org('classification').value
    )).toBe(false)
  })

  it('writes solid role class type consistent with role timing', async () => {
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
      create: [
        {
          title: 'Current Role',
          startDate: literal('2024-01-01'),
          endDate: undefined,
          isCurrentRole: true,
          orgName: 'Now Inc',
          entryNode: '',
          status: 'new'
        },
        {
          title: 'Past Role',
          startDate: literal('2019-01-01'),
          endDate: literal('2020-01-01'),
          isCurrentRole: false,
          orgName: 'Old Inc',
          entryNode: '',
          status: 'new'
        },
        {
          title: 'Future Role',
          startDate: literal('2099-01-01'),
          endDate: undefined,
          isCurrentRole: false,
          orgName: 'Future Inc',
          entryNode: '',
          status: 'new'
        }
      ],
      update: [],
      remove: []
    }

    await processResumeMutations(store, subject, plan as any)

    const typeStatements = insertionsCaptured.filter(
      (statement) => statement.predicate.value === ns.rdf('type').value
    )
    const typeValues = typeStatements.map((statement) => statement.object.value)

    expect(typeValues).toContain(ns.solid('CurrentRole').value)
    expect(typeValues).toContain(ns.solid('PastRole').value)
    expect(typeValues).toContain(ns.solid('FutureRole').value)

    const dateStatements = insertionsCaptured.filter(
      (statement) => statement.predicate.value === ns.schema('startDate').value || statement.predicate.value === ns.schema('endDate').value
    )
    expect(dateStatements.length).toBeGreaterThan(0)
    expect(dateStatements.every((statement) => statement.object.datatype?.value === ns.xsd('date').value)).toBe(true)
  })

  it('selector derives orgType from linked organization node type', () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    const doc = subject.doc()

    const membership = sym('https://example.com/profile/card#id123')
    const organization = sym('https://example.com/profile/card#id456')

    store.add(membership, ns.org('member'), subject, doc)
    store.add(membership, ns.rdf('type'), ns.solid('PastRole'), doc)
    store.add(membership, ns.vcard('role'), literal('Software Engineer'), doc)
    store.add(membership, ns.org('organization'), organization, doc)
    store.add(membership, ns.schema('startDate'), literal('2000-03-12'), doc)
    store.add(membership, ns.schema('endDate'), literal('2004-04-12'), doc)
    store.add(organization, ns.rdf('type'), ns.schema('Corporation'), doc)
    store.add(organization, ns.schema('name'), literal('Inrupt'), doc)

    const roles = presentCV(subject, store)
    expect(roles).toHaveLength(1)
    expect(roles[0].orgType).toBe('Corporation')
    expect(roles[0].roleType).toBe('PastRole')
  })

  it('selector includes linked organization solid publicId', () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    const doc = subject.doc()

    const membership = sym('https://example.com/profile/card#id123')
    const organization = sym('https://example.com/profile/card#id456')
    const publicId = sym('https://example.com/catalog/org/nasa')

    store.add(membership, ns.org('member'), subject, doc)
    store.add(membership, ns.rdf('type'), ns.solid('PastRole'), doc)
    store.add(membership, ns.vcard('role'), literal('Engineer'), doc)
    store.add(membership, ns.org('organization'), organization, doc)
    store.add(organization, ns.schema('name'), literal('NASA'), doc)
    store.add(organization, ns.solid('publicId'), publicId, doc)

    const roles = presentCV(subject, store)
    expect(roles).toHaveLength(1)
    expect(roles[0].orgPublicId).toBe(publicId.value)
  })

  it('does not write the occupation presentation prefix back into the role title', async () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    const doc = subject.doc()
    const membership = sym('https://example.com/profile/card#role')
    const occupation = sym('https://example.com/catalog/occupation/software-developer')

    store.add(membership, ns.org('member'), subject, doc)
    store.add(membership, ns.rdf('type'), ns.solid('CurrentRole'), doc)
    store.add(membership, ns.vcard('role'), literal('Engineer'), doc)
    store.add(membership, ns.org('role'), occupation, doc)
    store.add(occupation, ns.schema('name'), literal('Software Developer'), doc)
    store.updater = {
      update: (deletions: any[], insertions: any[], callback: Function) => {
        deletions.forEach((statement) => store.remove(statement))
        insertions.forEach((statement) => store.add(statement.subject, statement.predicate, statement.object, statement.why))
        callback('', true)
      }
    }

    const row = presentCV(subject, store)[0]
    expect(row.title).toBe('Software Developer - Engineer')

    await processResumeMutations(store, subject, {
      create: [],
      remove: [],
      update: [{ ...row, sourceNode: membership.value, status: 'modified' }]
    } as any)

    expect(store.any(membership, ns.vcard('role'), null, doc)?.value).toBe('Engineer')
    expect(presentCV(subject, store)[0].title).toBe('Software Developer - Engineer')
  })

  it('preserves an organization still referenced by another membership', async () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    const doc = subject.doc()
    const membership = sym('https://example.com/profile/card#role')
    const otherMembership = sym('https://example.com/profile/card#other-role')
    const organization = sym('https://example.com/profile/card#organization')

    for (const roleNode of [membership, otherMembership]) {
      store.add(roleNode, ns.org('member'), subject, doc)
      store.add(roleNode, ns.rdf('type'), ns.solid('CurrentRole'), doc)
      store.add(roleNode, ns.org('organization'), organization, doc)
    }
    store.add(membership, ns.vcard('role'), literal('Engineer'), doc)
    store.add(otherMembership, ns.vcard('role'), literal('Manager'), doc)
    store.add(organization, ns.rdf('type'), ns.vcard('Organization'), doc)
    store.add(organization, ns.schema('name'), literal('Shared Company'), doc)

    store.updater = {
      update: (deletions: any[], insertions: any[], callback: Function) => {
        deletions.forEach((statement) => store.remove(statement))
        insertions.forEach((statement) => store.add(statement.subject, statement.predicate, statement.object, statement.why))
        callback('', true)
      }
    }

    const row = presentCV(subject, store).find((item) => item.sourceNode.equals(membership))
    expect(row).toBeTruthy()
    await processResumeMutations(store, subject, {
      create: [],
      remove: [],
      update: [{ ...row, sourceNode: membership.value, title: 'Senior Engineer', status: 'modified' }]
    } as any)

    expect(store.holds(otherMembership, ns.org('organization'), organization, doc)).toBe(true)
    expect(store.any(organization, ns.schema('name'), null, doc)?.value).toBe('Shared Company')
    expect(store.holds(membership, ns.org('organization'), organization, doc)).toBe(true)
  })

  it('deduplicates membership and linked-organization deletions', async () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    const doc = subject.doc()
    const membership = sym('https://example.com/profile/card#role')
    const organization = sym('https://example.com/profile/card#organization')
    const deletionsCaptured: any[] = []

    store.add(membership, ns.org('member'), subject, doc)
    store.add(membership, ns.org('organization'), organization, doc)
    store.add(membership, ns.vcard('role'), literal('Engineer'), doc)
    store.add(organization, ns.schema('name'), literal('Company'), doc)
    store.updater = {
      update: (deletions: any[], _insertions: any[], callback: Function) => {
        deletionsCaptured.push(...deletions)
        callback('', true)
      }
    }

    await processResumeMutations(store, subject, {
      create: [],
      update: [],
      remove: [{ sourceNode: membership.value, status: 'deleted' }]
    } as any)

    expect(new Set(deletionsCaptured.map((statement) => statement.toNT())).size).toBe(deletionsCaptured.length)
  })

  it('does not write role classes as organization rdf:type', async () => {
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
      create: [{
        title: 'Engineer',
        startDate: literal('2000-03-12'),
        endDate: literal('2004-04-12'),
        isCurrentRole: false,
        orgName: 'Inrupt',
        orgType: 'PastRole',
        entryNode: '',
        status: 'new'
      }],
      update: [],
      remove: []
    }

    await processResumeMutations(store, subject, plan as any)

    const organizationLink = insertionsCaptured.find(
      (statement) => statement.predicate.value === ns.org('organization').value
    )
    expect(organizationLink).toBeTruthy()

    const organizationTypeValues = insertionsCaptured
      .filter((statement) =>
        statement.subject.value === organizationLink.object.value &&
        statement.predicate.value === ns.rdf('type').value
      )
      .map((statement) => statement.object.value)

    expect(organizationTypeValues).toContain(ns.vcard('Organization').value)
    expect(organizationTypeValues).not.toContain(ns.schema('PastRole').value)
    expect(organizationTypeValues).not.toContain(ns.solid('PastRole').value)
  })

  it('writes organization solid publicId when provided', async () => {
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
      create: [{
        title: 'Engineer',
        startDate: undefined,
        endDate: undefined,
        isCurrentRole: true,
        orgName: '',
        orgPublicId: 'https://example.com/catalog/org/nasa',
        orgType: '',
        orgLocation: '',
        orgHomePage: '',
        description: '',
        entryNode: '',
        status: 'new'
      }],
      update: [],
      remove: []
    }

    await processResumeMutations(store, subject, plan as any)

    const organizationLink = insertionsCaptured.find(
      (statement) => statement.predicate.value === ns.org('organization').value
    )
    expect(organizationLink).toBeTruthy()

    const publicIdStatement = insertionsCaptured.find(
      (statement) =>
        statement.subject.value === organizationLink.object.value &&
        statement.predicate.value === ns.solid('publicId').value
    )

    expect(publicIdStatement?.object.value).toBe('https://example.com/catalog/org/nasa')
  })

  it('migrates blank-node memberships without losing linked or extra data', async () => {
    const store = graph() as any
    const subject = sym('https://example.com/profile/card#me')
    const doc = subject.doc()
    const oldMembership = blankNode()
    const oldOrganization = blankNode()

    store.add(oldMembership, ns.org('member'), subject, doc)
    store.add(oldMembership, ns.rdf('type'), ns.solid('PastRole'), doc)
    store.add(oldMembership, ns.vcard('role'), literal('Old role'), doc)
    store.add(oldMembership, ns.rdf('type'), ns.schema('AdditionalRoleType'), doc)
    store.add(oldMembership, ns.org('role'), sym('https://example.com/occupations/engineer'), doc)
    store.add(oldMembership, ns.org('organization'), oldOrganization, doc)
    store.add(oldOrganization, ns.schema('name'), literal('Old organization'), doc)
    store.updater = {
      update: (deletions: any[], insertions: any[], callback: Function) => {
        deletions.forEach((statement) => store.remove(st(statement.subject, statement.predicate, statement.object, statement.why)))
        insertions.forEach((statement) => store.add(statement.subject, statement.predicate, statement.object, statement.why))
        callback('', true)
      }
    }

    await processResumeMutations(store, subject, {
      create: [],
      update: [{
        title: 'New role',
        roleType: 'CurrentRole',
        isCurrentRole: true,
        orgName: 'New organization',
        sourceNode: oldMembership.value,
        status: 'updated'
      }],
      remove: []
    } as any)

    expect(store.statementsMatching(oldMembership, null, null, doc)).toHaveLength(0)
    expect(store.any(oldOrganization, ns.schema('name'), null, doc)?.value).toBe('Old organization')
    const memberships = store.each(null, ns.org('member'), subject, doc)
    expect(memberships).toHaveLength(1)
    expect(memberships[0].termType).toBe('NamedNode')
    expect(store.any(memberships[0], ns.vcard('role'), null, doc)?.value).toBe('New role')
    expect(store.holds(memberships[0], ns.rdf('type'), ns.schema('AdditionalRoleType'), doc)).toBe(true)
    expect(store.holds(memberships[0], ns.org('role'), sym('https://example.com/occupations/engineer'), doc)).toBe(true)
    expect(store.holds(memberships[0], ns.org('organization'), oldOrganization, doc)).toBe(true)
  })



  it('uses explicit roleType when persisting membership type', async () => {
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
      create: [{
        title: 'Software Engineer',
        roleType: 'PastRole',
        startDate: literal('2099-01-01'),
        endDate: undefined,
        isCurrentRole: false,
        orgName: 'Inrupt',
        orgType: 'Corporation',
        entryNode: '',
        status: 'new'
      }],
      update: [],
      remove: []
    }

    await processResumeMutations(store, subject, plan as any)

    const membershipTypeValues = insertionsCaptured
      .filter((statement) => statement.predicate.value === ns.rdf('type').value)
      .map((statement) => statement.object.value)

    expect(membershipTypeValues).toContain(ns.solid('PastRole').value)
    expect(membershipTypeValues).not.toContain(ns.solid('FutureRole').value)
  })


})
