import { solidLogicSingleton } from '../src/logic/solidLogicSingleton'
import { silenceDebugMessages } from './helpers/setup'

silenceDebugMessages()

describe('store', () => {
  it('exists', () => {
    expect(solidLogicSingleton.store).toBeInstanceOf(Object)
  })
})

describe('store.fetcher', () => {
  it('exists', () => {
    expect(solidLogicSingleton.store.fetcher).toBeInstanceOf(Object)
  })
})

describe('store.updater', () => {
  it('exists', () => {
    expect(solidLogicSingleton.store.updater).toBeInstanceOf(Object)
  })
})

describe('authn', () => {
  it('exists', () => {
    expect(solidLogicSingleton.authn).toBeInstanceOf(Object)
  })
})

