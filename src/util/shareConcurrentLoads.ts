import type { Fetcher, NamedNode } from 'rdflib'

type LoadTarget = Parameters<Fetcher['load']>[0]
type IdentityTransition = () => void

function plainLoadKey (target: LoadTarget, options: unknown): string | undefined {
  if (options !== undefined && (typeof options !== 'object' || options === null || Object.keys(options).length > 0)) {
    return undefined
  }
  const uri = typeof target === 'string'
    ? target
    : (target as NamedNode | undefined)?.termType === 'NamedNode' ? (target as NamedNode).value : undefined
  return uri?.split('#')[0]
}

/**
 * Concurrent plain `load(doc)` calls share one request.
 *
 * rdflib already shares in-flight loads, except when it upgrades a load to
 * `force` itself: after login every earlier answer is flagged out-of-date, so
 * each startup caller of e.g. the profile document sent its own GET. Calls
 * with options (force, headers, ...) are not shared, and an entry only lives
 * while its request is pending, so later loads behave as before.
 */
export function shareConcurrentLoads (fetcher: Fetcher): IdentityTransition {
  const originalLoad = fetcher.load.bind(fetcher)
  const pending = new Map<string, Promise<unknown>>()

  fetcher.load = function (target: LoadTarget, options?: unknown) {
    if (Array.isArray(target)) {
      return Promise.all(target.map(member => (originalLoad as any)(member, options))) as any
    }
    const key = plainLoadKey(target, options)
    if (!key) return (originalLoad as any)(target, options)

    const existing = pending.get(key)
    if (existing) return existing as any

    const request = Promise.resolve((originalLoad as any)(target, options))
      .finally(() => {
        if (pending.get(key) === request) pending.delete(key)
      })
    pending.set(key, request)
    return request as any
  } as Fetcher['load']

  return () => {
    pending.clear()
  }
}
