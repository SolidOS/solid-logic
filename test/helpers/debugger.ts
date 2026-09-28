import { vi } from 'vitest'

// We don't want to output debug messages to console as part of the tests
import * as debug from '../../src/util/debug'

export function silenceDebugMessages () {
  vi.spyOn(debug, 'log').mockImplementation(() => {})
  vi.spyOn(debug, 'warn').mockImplementation(() => {})
  vi.spyOn(debug, 'error').mockImplementation(() => {})
  vi.spyOn(debug, 'trace').mockImplementation(() => {})
}