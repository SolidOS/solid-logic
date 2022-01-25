import * as authUtil from '../src/util/authUtil'

describe('offlineTestID', () => {
    it('exists', () => {
        expect(authUtil.offlineTestID).toBeInstanceOf(Function)
    })
    it('runs', () => {
        expect(authUtil.offlineTestID()).toEqual(null)
    })
})

describe('findOriginOwner', () => {
    it('exists', () => {
        expect(authUtil.findOriginOwner).toBeInstanceOf(Function)
    })
    it('runs', () => {
        expect(authUtil.findOriginOwner('')).toEqual(false)
    })
})