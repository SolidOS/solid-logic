export function trimText(value: string | null | undefined): string {
  return value?.trim() || ''
}

export function normalizeWhitespace(value: string | null | undefined): string {
  return trimText(value).replace(/\s+/g, ' ')
}
