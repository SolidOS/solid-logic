import { describe, expect, it } from 'vitest'
import { blankNode, graph, literal, sym } from 'rdflib'
import { socialAccountOntologyFor } from '../src/profile/ontology/social/accounts'
import {
  getSocialAccounts,
  socialAccountHomepage,
  socialAccountIcon,
  socialAccountName
} from '../src/profile/sections/social/read'
import { ns } from '../src/util/ns'

const subject = sym('https://example.test/profile/card#me')
const document = subject.doc()
const github = socialAccountOntologyFor('https://solidos.github.io/profile-pane/src/ontology/socialMedia.ttl#GithubAccount')!

describe('social profile reads', () => {
  it('expands account RDF lists in order', () => {
    const store = graph()
    const first = sym('https://example.test/accounts/first')
    const second = sym('https://example.test/accounts/second')
    const list = blankNode('accounts')
    const tail = blankNode('accounts-tail')

    store.add(subject, ns.foaf('account'), list, document)
    store.add(list, ns.rdf('first'), first, document)
    store.add(list, ns.rdf('rest'), tail, document)
    store.add(tail, ns.rdf('first'), second, document)
    store.add(tail, ns.rdf('rest'), ns.rdf('nil'), document)
    store.add(first, ns.foaf('accountName'), literal('first'), document)
    store.add(second, ns.foaf('accountName'), literal('second'), document)

    expect(getSocialAccounts(subject, store).accounts.map(account => account.sourceNode.value)).toEqual([
      first.value,
      second.value
    ])
  })

  it('uses ontology metadata to resolve an account label, icon, and homepage', () => {
    const store = graph()
    const account = sym('https://example.test/accounts/github')

    store.add(account, ns.rdf('type'), sym(github.classUri), document)
    store.add(account, ns.foaf('accountName'), literal('octocat'), document)

    expect(socialAccountName(store, account)).toBe('Github')
    expect(socialAccountIcon(store, account)).toBe(github.icon)
    expect(socialAccountHomepage(store, account)).toBe('https://www.github.com/octocat')
  })

  it('deduplicates named accounts while retaining accounts without a name', () => {
    const store = graph()
    const duplicateOne = sym('https://example.test/accounts/duplicate-one')
    const duplicateTwo = sym('https://example.test/accounts/duplicate-two')
    const unnamedOne = sym('https://example.test/accounts/unnamed-one')
    const unnamedTwo = sym('https://example.test/accounts/unnamed-two')

    for (const account of [duplicateOne, duplicateTwo, unnamedOne, unnamedTwo]) {
      store.add(subject, ns.foaf('account'), account, document)
    }
    store.add(duplicateOne, ns.foaf('accountName'), literal('same-account'), document)
    store.add(duplicateTwo, ns.foaf('accountName'), literal('same-account'), document)

    expect(getSocialAccounts(subject, store).accounts.map(account => account.sourceNode.value)).toEqual([
      duplicateOne.value,
      unnamedOne.value,
      unnamedTwo.value
    ])
  })

  it('returns stable empty and fallback values for missing account data', () => {
    const store = graph()
    const account = sym('https://example.test/accounts/missing')

    store.add(subject, ns.foaf('account'), account, document)

    expect(getSocialAccounts(subject, store)).toEqual({
      accounts: [{
        name: 'Unknown Account',
        icon: '',
        homepage: '',
        sourceNode: account
      }]
    })
    expect(getSocialAccounts(sym('https://example.test/without-accounts#me'), store)).toEqual({ accounts: [] })
  })
})
