import * as debug from "../util/debug"
import { authSession } from "../authSession/authSession"
import { SolidLogic } from "./SolidLogic"

const fetcher = async (url, requestInit) => {
    if (authSession.info.webId) {
        return authSession.fetch(url, requestInit)
    } else {
        return window.fetch(url, requestInit)
    }
}

const solidLogicSingleton = new SolidLogic({ fetch: fetcher }, authSession)

debug.log('Unique quadstore initialized.')

export { solidLogicSingleton }