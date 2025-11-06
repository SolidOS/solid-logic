import * as debug from '../util/debug'
import { authSession } from '../authSession/authSession'
import { createSolidLogic } from './solidLogic'

const _fetch = async (url, requestInit) => {
    const omitCreds = requestInit && requestInit.credentials && requestInit.credentials == 'omit'
    if (authSession.info.webId && !omitCreds) { // see https://github.com/solidos/solidos/issues/114
        // In fact fetch should respect credentials omit itself
        return authSession.fetch(url, requestInit)
    } else {
        return window.fetch(url, requestInit)
    }
}

// Global singleton pattern to ensure unique store across library versions
const SINGLETON_SYMBOL = Symbol.for('solid-logic-singleton')
const globalThis = (typeof window !== 'undefined' ? window : global) as any

function getOrCreateSingleton() {
    if (!globalThis[SINGLETON_SYMBOL]) {
        debug.log('SolidLogic: Creating new global singleton instance.')
        globalThis[SINGLETON_SYMBOL] = createSolidLogic({ fetch: _fetch }, authSession)
        debug.log('Unique quadstore initialized.')
    } else {
        debug.log('SolidLogic: Using existing global singleton instance.')
    }
    return globalThis[SINGLETON_SYMBOL]
}
//this const makes solidLogicSingleton global accessible in mashlib
const solidLogicSingleton = getOrCreateSingleton()

export { solidLogicSingleton }