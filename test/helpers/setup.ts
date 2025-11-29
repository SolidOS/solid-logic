import fetchMock from 'jest-fetch-mock'
import { TextEncoder, TextDecoder } from 'util'

global.TextEncoder = TextEncoder as any
global.TextDecoder = TextDecoder as any

fetchMock.enableMocks()