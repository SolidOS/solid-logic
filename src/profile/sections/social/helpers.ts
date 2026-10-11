import { LiveStore, NamedNode } from 'rdflib'
import { ns } from '../../../util/ns'
import { socialAccountOntologies, socialAccountOntologyFor } from '../../ontology/social/accounts'
import { SocialAccountOption } from './types'

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[#:/]/g, ' ').replace(/account\b/g, '').replace(/[^a-z0-9]/g, '')
}

export function findSocialAccountOption (options: SocialAccountOption[], value: string): SocialAccountOption | undefined {
  const lower = value.trim().toLowerCase()
  return options.find(option => option.classUri.toLowerCase() === lower || option.label.toLowerCase() === lower || normalize(option.label) === normalize(value) || normalize(option.classUri) === normalize(value))
}

export function getSocialAccountOptions (store: LiveStore): SocialAccountOption[] {
  const classes = store.statementsMatching(undefined, ns.rdfs('subClassOf'), ns.foaf('OnlineAccount'))
    .map(statement => statement.subject)
    .filter((node): node is NamedNode => node.termType === 'NamedNode')
  const options = classes.map(classNode => ({
    classUri: classNode.value,
    label: store.any(classNode, ns.rdfs('label'))?.value || classNode.value,
    icon: store.any(classNode, ns.foaf('icon'))?.value || '',
    homepage: store.any(classNode, ns.foaf('homepage'))?.value,
    userProfilePrefix: store.any(classNode, ns.foaf('userProfilePrefix'))?.value
  }))
  return options.length
    ? options
    : socialAccountOntologies.map(({ classUri, label, icon, homepage, userProfilePrefix }) => ({
      classUri,
      label,
      icon: icon || '',
      homepage,
      userProfilePrefix
    }))
}

export function nameForAccount (store: LiveStore, accountNode: NamedNode): string {
  return store.any(accountNode, ns.foaf('name'))?.value || store.any(accountNode, ns.rdfs('label'))?.value || 'Unknown Account'
}

export function iconForAccount (store: LiveStore, accountNode: NamedNode): string {
  const explicitIcon = store.any(accountNode, ns.foaf('icon'))?.value
  if (explicitIcon) return explicitIcon
  const classUri = store.any(accountNode, ns.rdf('type'))?.value
  return (classUri && socialAccountOntologyFor(classUri)?.icon) || ''
}

export function homepageForAccount (store: LiveStore, accountNode: NamedNode): string {
  const explicitHomepage = store.any(accountNode, ns.foaf('homepage'))?.value
  if (explicitHomepage) return explicitHomepage
  const accountName = store.any(accountNode, ns.foaf('accountName'))?.value
  const classUri = store.any(accountNode, ns.rdf('type'))?.value
  const prefix = classUri && socialAccountOntologyFor(classUri)?.userProfilePrefix
  if (accountName?.startsWith('http://') || accountName?.startsWith('https://')) return accountName
  return accountName && prefix ? `${prefix}${accountName}` : ''
}
