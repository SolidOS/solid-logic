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

//this const makes solidLogicSingleton global accessible in mashlib
const solidLogicSingleton = createSolidLogic({ fetch: _fetch }, authSession)

debug.log('Unique quadstore initialized.')

export { solidLogicSingleton }