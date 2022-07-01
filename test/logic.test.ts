import { authn, store } from "../src/logic/solidLogicSingleton"
import { silenceDebugMessages } from "./helpers/setup"

silenceDebugMessages()

describe('store', () => {
  it('exists', () => {
    expect(store).toBeInstanceOf(Object)
  })
})

describe('store.fetcher', () => {
  it('exists', () => {
    expect(store.fetcher).toBeInstanceOf(Object)
  })
})

describe('store.updater', () => {
  it('exists', () => {
    expect(store.updater).toBeInstanceOf(Object)
  })
})

describe('authn', () => {
  it('exists', () => {
    expect(authn).toBeInstanceOf(Object)
  })
})


