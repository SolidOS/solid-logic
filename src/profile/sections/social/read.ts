import { NamedNode, Node, Store } from 'rdflib'
import { socialAccountOntologyFor } from '../../ontology/social/accounts'
import { ns } from '../../../util/ns'
import { expandRdfList } from '../shared/rdfList'
import type { Account, SocialPresentation } from './types'

function accountTypes (store: Store, accountNode: NamedNode) {
  return store.each(accountNode, ns.rdf('type'))
    .filter((node): node is NamedNode => node.termType === 'NamedNode')
    .map(node => socialAccountOntologyFor(node.value))
    .filter((ontology): ontology is NonNullable<typeof ontology> => Boolean(ontology))
}

export function socialAccountName (store: Store, accountNode: NamedNode): string {
  const explicitName = store.any(accountNode, ns.foaf('name')) || store.any(accountNode, ns.rdfs('label'))
  if (explicitName?.value) return explicitName.value

  return accountTypes(store, accountNode)[0]?.label || 'Unknown Account'
}

export function socialAccountIcon (store: Store, accountNode: NamedNode): string {
  const explicitIcon = store.any(accountNode, ns.foaf('icon'))
  if (explicitIcon?.value) return explicitIcon.value

  return accountTypes(store, accountNode)[0]?.icon || ''
}

export function socialAccountHomepage (store: Store, accountNode: NamedNode): string {
  const explicitHomepage = store.any(accountNode, ns.foaf('homepage'))
  if (explicitHomepage?.value) return explicitHomepage.value

  const accountName = store.any(accountNode, ns.foaf('accountName'))?.value.trim() || ''
  if (/^https?:\/\//i.test(accountName)) return accountName

  const userProfilePrefix = accountTypes(store, accountNode)[0]?.userProfilePrefix
  return userProfilePrefix && accountName ? `${userProfilePrefix}${accountName}` : ''
}

function accountPresentation (store: Store, sourceNode: NamedNode): Account {
  return {
    name: socialAccountName(store, sourceNode),
    icon: socialAccountIcon(store, sourceNode),
    homepage: socialAccountHomepage(store, sourceNode),
    sourceNode
  }
}

/**
 * Reads `foaf:account` values in RDF list order. Accounts without an
 * `foaf:accountName` have no stable duplicate key, so each is retained.
 */
export function getSocialAccounts (subject: NamedNode, store: Store): SocialPresentation {
  const accountNodes = store.each(subject, ns.foaf('account')) as Node[]
  const expandedAccounts = accountNodes.flatMap(accountNode => expandRdfList(store, accountNode))
  const accountNames = new Set<string>()
  const accounts: Account[] = []

  for (const accountNode of expandedAccounts) {
    if (accountNode.termType !== 'NamedNode') continue
    const namedAccount = accountNode as NamedNode

    const accountName = store.any(namedAccount, ns.foaf('accountName'))?.value
    if (accountName && accountNames.has(accountName)) continue
    if (accountName) accountNames.add(accountName)

    accounts.push(accountPresentation(store, namedAccount))
  }

  return { accounts }
}
