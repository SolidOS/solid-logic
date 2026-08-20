function getHttpStatus(value: { status?: number, response?: { status?: number } } | null | undefined) {
  return value?.status ?? value?.response?.status
}

function isMissingStatus(status: number | undefined) {
  return status === 404 || status === 410
}

export function assertSuccessfulHttpResponse(response: Response, method: string, options: { allowNotFound?: boolean } = {}) {
  if (response.ok) return

  if (options.allowNotFound && isMissingStatus(response.status)) return

  const message = response.status === 412
    ? 'Error: File changed by someone else'
    : `HTTP error on ${method}! Status: ${response.status}`
  throw new Error(message)
}

export function isMissingError(error: any): boolean {
  if (isMissingStatus(getHttpStatus(error))) return true
  const text = `${error?.message || error || ''}`
  return text.includes('404') || text.includes('Not Found')
}
