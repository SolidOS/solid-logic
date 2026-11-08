import { LiveStore, NamedNode } from 'rdflib'
import { ns } from '../../../util/ns'
import { Account, SocialPresentation } from './types'
import { expandRdfList } from '../shared/rdfList'
import {
  homepageForAccount,
  iconForAccount,
  nameForAccount
} from './helpers'


export function presentSocial(
  subject: NamedNode,
  store: LiveStore
): SocialPresentation {
  function accountAsObject (ac: NamedNode): Account {
    return {
      name: nameForAccount(store, ac),
      icon: iconForAccount(store, ac),
      homepage: homepageForAccount(store, ac),
      sourceNode: ac
    }

  }
  const accountNodes = store.each(subject, ns.foaf('account'))
  const accountThings = accountNodes.flatMap(node => expandRdfList(store, node))
  const accountNodeSet = new Set<string>()
  const accounts: Account[] = []
  for (const ac of accountThings) {
    if (ac.termType === 'NamedNode') {
      const dedupeKey = `${ac.termType}:${ac.value}`
      if (accountNodeSet.has(dedupeKey)) continue
      accountNodeSet.add(dedupeKey)
      accounts.push(accountAsObject(ac as NamedNode))
    }
  }
  if (!accounts.length) return { accounts: [] }
  return { accounts }
}
