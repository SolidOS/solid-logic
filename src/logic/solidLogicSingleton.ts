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

// Make this directly accessible as it is what you need most of the time
const authn = solidLogicSingleton.authn
const store = solidLogicSingleton.store

const chat = solidLogicSingleton.chat
const profile = solidLogicSingleton.profile

debug.log('Unique quadstore initialized.')

export { solidLogicSingleton, authn, store, chat, profile }