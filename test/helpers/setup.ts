import { error, log, trace, warn } from '../../src/util/debug'
import fetchMock from "jest-fetch-mock";
import { TextEncoder as UtilTextEncoder, TextDecoder as UtilTextDecoder } from 'util'

if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = UtilTextEncoder as unknown as { new (): TextEncoder; prototype: TextEncoder }
}
if (typeof global.TextDecoder === 'undefined') {
  global.TextDecoder = UtilTextDecoder as unknown as { new (): TextDecoder; prototype: TextDecoder }
}


fetchMock.enableMocks();
// We don't want to output debug messages to console as part of the tests
jest.mock('../../src/util/debug')

export function silenceDebugMessages () {
  (log as any).mockImplementation(() => null)
  ;(warn as any).mockImplementation(() => null)
  ;(error as any).mockImplementation(() => null)
  ;(trace as any).mockImplementation(() => null)
}