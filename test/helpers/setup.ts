import { error, log, trace, warn } from '../../src/util/debug'
import fetchMock from "jest-fetch-mock";

fetchMock.enableMocks();
// We don't want to output debug messages to console as part of the tests
jest.mock('../../src/util/debug')

export function silenceDebugMessages () {
  (log as any).mockImplementation(() => null)
  ;(warn as any).mockImplementation(() => null)
  ;(error as any).mockImplementation(() => null)
  ;(trace as any).mockImplementation(() => null)
}