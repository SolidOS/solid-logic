import { TextDecoder, TextEncoder } from 'node:util'
import { enableFetchMocks, mockFetchIf } from './fetch-mock'
import { mockFetchFunction } from '../unit/setup'

Object.defineProperty(globalThis, 'TextEncoder', {
  value: TextEncoder,
  configurable: true,
  writable: true,
})

Object.defineProperty(globalThis, 'TextDecoder', {
  value: TextDecoder,
  configurable: true,
  writable: true,
})

enableFetchMocks()
mockFetchIf(/^https?.*$/, mockFetchFunction)
