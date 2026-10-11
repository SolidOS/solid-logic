import { error as debugError } from '../../../util/debug'

export function logAndThrowMutationError(error: unknown, message?: string): never {
  const rootError = error instanceof Error ? error : new Error(String(error))
  debugError(rootError)
  if (!message) throw rootError
  const wrappedError = new Error(message)
  Object.defineProperty(wrappedError, 'message', { value: message, enumerable: true, configurable: true, writable: true })
  Object.assign(wrappedError, { cause: rootError })
  throw wrappedError
}
