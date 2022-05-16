import * as debug from "../util/debug"
import { authSession } from "../authSession/authSession"
import { SolidLogic } from "./SolidLogic"

const _fetch = async (url, requestInit) => {
    const omitCreds = requestInit && requestInit.credentials && requestInit.credentials == 'omit'
    if (authSession.info.webId && !omitCreds) { // see https://github.com/solid/solidos/issues/114
        // In fact ftech should respect crentials omit itself
        return authSession.fetch(url, requestInit)
    } else {
        return window.fetch(url, requestInit)
    }
}

//this const makes solidLogicSingleton global accessible in mashlib
const solidLogicSingleton = new SolidLogic({ fetch: _fetch }, authSession)

debug.log('Unique quadstore initialized.')

export { solidLogicSingleton }