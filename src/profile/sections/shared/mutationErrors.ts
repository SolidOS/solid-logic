import { error as debugError } from '../../../util/debug'

export function logAndThrowMutationError(error: unknown): never {
  const rootError = error instanceof Error ? error : new Error(String(error))
  debugError(rootError)
  throw rootError
}
