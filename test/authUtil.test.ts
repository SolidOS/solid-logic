/**
* @jest-environment jsdom
* 
*/
import * as authUtil from '../src/authn/authUtil'

describe('offlineTestID', () => {
    it('exists', () => {
        expect(authUtil.offlineTestID).toBeInstanceOf(Function)
    })
    it('runs', () => {
        expect(authUtil.offlineTestID()).toEqual(null)
    })
})

describe('appContext', () => {
    it('exists', () => {
        expect(authUtil.appContext).toBeInstanceOf(Function)
    })
    it('runs', () => {
        expect(authUtil.appContext()).toEqual({"viewingNoAuthPage": false,})
    })
})