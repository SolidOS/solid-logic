import { Literal, NamedNode, Store, Node, LiveStore, sym } from 'rdflib'
import { ns } from '../../../util/ns'
import { LanguageDetails } from './types'
import { expandRdfList, isRdfListNode } from '../shared/rdfList'
import { normalizeWhitespace } from '../shared/text'
import {
  ianaLanguageVocabularyUri,
  isIanaLanguageUri,
  languageCodeFromPublicId,
  normalizeLanguageCode
} from './normalization'

function languageNameFromCode(code: string): string {
  const normalized = normalizeLanguageCode(code)
  if (!normalized) return ''

  try {
    const DisplayNamesCtor = (Intl as any)?.DisplayNames
    if (typeof DisplayNamesCtor === 'function') {
      const displayNames = new DisplayNamesCtor(['en'], { type: 'language' })
      const localized = displayNames.of(normalized)
      if (localized) return localized
    }
  } catch {
    // Fallback below.
  }

  return normalized
}

function languageNameFromPublicId(publicIdValue: string): string {
  return languageNameFromCode(languageCodeFromPublicId(publicIdValue))
}

function preferredLiteralValue(
  store: Store,
  subject: NamedNode,
  predicate: NamedNode,
  fallbackToAnyLiteral = false
): string {
  const literals = store
    .statementsMatching(subject, predicate)
    .map((statement) => statement.object)
    .filter((node): node is Literal => node.termType === 'Literal')
  const englishLiteral = literals.find((literal) => literal.lang.toLowerCase().startsWith('en'))
  return englishLiteral?.value || (fallbackToAnyLiteral ? literals[0]?.value || '' : '')
}

function languageNameFromIanaNode(store: Store, node: NamedNode): string {
  const schemaName = preferredLiteralValue(store, node, ns.schema('name'), true)
  if (schemaName) return normalizeWhitespace(schemaName)

  const localLabel = preferredLiteralValue(store, node, ns.rdfs('label'))
  if (localLabel) return normalizeWhitespace(localLabel)

  if (isIanaLanguageUri(node.value)) {
    return languageNameFromPublicId(node.value)
  }

  return ''
}

function toStoredPublicIdValue(lan: Node, publicIdNode: Node | undefined): string | undefined {
  if (publicIdNode?.termType === 'NamedNode') {
    return publicIdNode.value
  }

  if (publicIdNode?.termType === 'Literal') {
    const code = normalizeLanguageCode(publicIdNode.value)
    return code || undefined
  }

  if (lan.termType === 'NamedNode' && isIanaLanguageUri(lan.value)) {
    return lan.value
  }

  return undefined
}

function languageNameFromLanguageNode(store: Store, lan: Node, publicIdNode: Node | undefined): string {
  if (publicIdNode?.termType === 'NamedNode') {
    const nodeName = languageNameFromIanaNode(store, publicIdNode as NamedNode)
    if (nodeName) return nodeName
    return languageNameFromPublicId(publicIdNode.value)
  }

  if (publicIdNode?.termType === 'Literal') {
    const code = normalizeLanguageCode(publicIdNode.value)
    if (!code) return ''

    const ianaNode = sym(`${ianaLanguageVocabularyUri}${code}`)
    const nodeName = languageNameFromIanaNode(store, ianaNode)
    if (nodeName) return nodeName
    return languageNameFromCode(code)
  }

  if (lan.termType === 'NamedNode') {
    const nodeName = languageNameFromIanaNode(store, lan as NamedNode)
    if (nodeName) return nodeName
  }

  return ''
}

export function languageAsText (store: Store, lan: Node):string {
  if (lan.termType === 'Literal') return lan.value // Not normal but allow this

  if (lan.termType !== 'NamedNode' && lan.termType !== 'BlankNode') return ''

  const publicIdNode = store.any(lan as NamedNode, ns.solid('publicId')) || undefined
  return languageNameFromLanguageNode(store, lan, publicIdNode)
}

export function presentLanguages(subject: NamedNode, store: LiveStore): LanguageDetails[] {
  const languageObjects = store.each(subject, ns.schema('knowsLanguage'))
  const expandedLists = languageObjects
    .filter((node) => isRdfListNode(store, node))
    .map((node) => expandRdfList(store, node))

  const standaloneNodes = languageObjects.filter((node) => !isRdfListNode(store, node))
  const languageNodes = [...expandedLists.flat(), ...standaloneNodes]

  const details: LanguageDetails[] = languageNodes
    .map((lan) => ({
      name: languageAsText(store, lan),
      publicId: toStoredPublicIdValue(lan, store.any(lan as NamedNode, ns.solid('publicId')) || undefined),
      proficiency: store.anyValue(lan as NamedNode, ns.schema('proficiencyLevel')) || undefined,
      sourceNode: lan
    }))
    .filter((item) => Boolean(item.name))

  const dedupedByLanguage = new Map<string, LanguageDetails>()
  details.forEach((item) => {
    const key = item.publicId || item.name
    if (!dedupedByLanguage.has(key)) {
      dedupedByLanguage.set(key, item)
    }
  })

  return Array.from(dedupedByLanguage.values())
}
