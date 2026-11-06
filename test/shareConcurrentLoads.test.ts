import { describe, expect, it, vi } from 'vitest'
import * as rdf from 'rdflib'
import { shareConcurrentLoads } from '../src/util/shareConcurrentLoads'

function deferred () {
  let resolve!: (value: unknown) => void
  let reject!: (error: unknown) => void
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function fetcherWith (load: (...args: unknown[]) => Promise<unknown>) {
  const fetcher = { load } as unknown as rdf.Fetcher
  shareConcurrentLoads(fetcher)
  return fetcher
}

describe('shareConcurrentLoads', () => {
  const doc = rdf.sym('https://alice.example/profile/card')

  it('shares one request between concurrent plain loads of the same document', async () => {
    const response = deferred()
    const load = vi.fn(() => response.promise)
    const fetcher = fetcherWith(load)

    const first = fetcher.load(doc)
    const second = fetcher.load(rdf.sym('https://alice.example/profile/card#me').doc())
    const third = fetcher.load('https://alice.example/profile/card#me', {})
    response.resolve('ok')

    await expect(Promise.all([first, second, third])).resolves.toEqual(['ok', 'ok', 'ok'])
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('loads again once the shared request has settled', async () => {
    const load = vi.fn(async () => 'ok')
    const fetcher = fetcherWith(load)

    await fetcher.load(doc)
    await fetcher.load(doc)

    expect(load).toHaveBeenCalledTimes(2)
  })

  it('lets a failed load be retried', async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce('ok')
    const fetcher = fetcherWith(load)

    await expect(fetcher.load(doc)).rejects.toThrow('offline')
    await expect(fetcher.load(doc)).resolves.toBe('ok')
  })

  it('does not share forced loads, loads with options, or batches', async () => {
    const response = deferred()
    const load = vi.fn(() => response.promise)
    const fetcher = fetcherWith(load)

    const plain = fetcher.load(doc)
    const forced = fetcher.load(doc, { force: true })
    const withHeaders = fetcher.load(doc, { headers: { accept: 'text/turtle' } } as any)
    const batch = fetcher.load([doc])
    response.resolve('ok')
    await Promise.all([plain, forced, withHeaders, batch])

    expect(load).toHaveBeenCalledTimes(4)
  })

  it('does not let a batch re-enter the sharing wrapper', async () => {
    const load = vi.fn(async (target: unknown) => {
      if (Array.isArray(target)) {
        return Promise.all(target.map(member => (fetcher.load as any)(member)))
      }
      return target
    })
    const fetcher = fetcherWith(load)

    await expect(fetcher.load([doc, rdf.sym('https://bob.example/profile/card')])).resolves.toHaveLength(2)

    expect(load).toHaveBeenCalledTimes(2)
    expect(load.mock.calls.every(([target]) => !Array.isArray(target))).toBe(true)
  })

  it('does not share a pending request across an identity transition', async () => {
    const response = deferred()
    const load = vi.fn(() => response.promise)
    const fetcher = { load } as unknown as rdf.Fetcher
    const invalidate = shareConcurrentLoads(fetcher)

    const beforeTransition = fetcher.load(doc)
    invalidate()
    const afterTransition = fetcher.load(doc)
    response.resolve('old identity')

    expect(await beforeTransition).toBe('old identity')
    expect(load).toHaveBeenCalledTimes(2)
    expect(await afterTransition).toBe('old identity')
  })

  it('does not share loads of different documents', async () => {
    const load = vi.fn(async () => 'ok')
    const fetcher = fetcherWith(load)

    await Promise.all([fetcher.load(doc), fetcher.load(rdf.sym('https://bob.example/profile/card'))])

    expect(load).toHaveBeenCalledTimes(2)
  })
})
