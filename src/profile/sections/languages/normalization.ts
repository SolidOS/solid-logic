import { profileVocabularies } from '../shared/profileVocabularies'
import { trimText } from '../shared/text'

export const ianaLanguageVocabularyUri = profileVocabularies.ianaLanguage

export function normalizeLanguageCode(value: string | null | undefined): string {
  return trimText(value).toLowerCase()
}

export function languageCodeFromPublicId(value: string | null | undefined): string {
  const normalized = normalizeLanguageCode(value)
  return normalized.startsWith(ianaLanguageVocabularyUri)
    ? normalized.slice(ianaLanguageVocabularyUri.length)
    : normalized
}

export function isIanaLanguageUri(value: string | null | undefined): boolean {
  return trimText(value).startsWith(ianaLanguageVocabularyUri)
}
