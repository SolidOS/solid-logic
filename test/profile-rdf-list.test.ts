import { describe, expect, it } from 'vitest'
import { graph, literal, st, sym } from 'rdflib'
import { expandRdfList } from '../src/profile/sections/shared/rdfList'
import { ns } from '../src/util/ns'

describe('RDF list expansion', () => {
  it('stops at a self-referential list node', () => {
    const store = graph()
    const head = sym('https://example.com/profile/card#list')
    const value = literal('first')

    store.add(st(head, ns.rdf('first'), value))
    store.add(st(head, ns.rdf('rest'), head))

    expect(expandRdfList(store, head)).toEqual([value])
  })

  it('stops when a list cycle returns to an earlier node', () => {
    const store = graph()
    const first = sym('https://example.com/profile/card#first')
    const second = sym('https://example.com/profile/card#second')
    const firstValue = literal('first')
    const secondValue = literal('second')

    store.add(st(first, ns.rdf('first'), firstValue))
    store.add(st(first, ns.rdf('rest'), second))
    store.add(st(second, ns.rdf('first'), secondValue))
    store.add(st(second, ns.rdf('rest'), first))

    expect(expandRdfList(store, first)).toEqual([firstValue, secondValue])
  })
})
