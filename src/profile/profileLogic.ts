import { NamedNode } from "rdflib";
import { CrossOriginForbiddenError, FetchError, NotEditableError, SameOriginForbiddenError, UnauthorizedError, WebOperationError } from "../logic/CustomError";
import * as debug from "../util/debug";
import { ns as namespace } from '../util/ns';
import { differentOrigin, suggestPreferencesFile } from "../util/utils";

export function createProfileLogic(store, authn, utilityLogic) {
    const ns = namespace

    /**
     * loads the preference without throwing errors - if it can create it it does so.
     * remark: it still throws error if it cannot load profile.
     * @param user 
     * @returns undefined if preferenceFile cannot be returned or NamedNode if it can find it or create it
     */
    async function silencedLoadPreferences(user: NamedNode): Promise <NamedNode | undefined> {
        try {
            return await loadPreferences(user)
        } catch (err) {
            return undefined
        }
    }

    /**
     * loads the preference without returning different errors if it cannot create or load it.
     * remark: it also throws error if it cannot load profile.
     * @param user 
     * @returns undefined if preferenceFile cannot be an Error or NamedNode if it can find it or create it
     */
    async function loadPreferences (user: NamedNode): Promise <NamedNode> {
        await loadProfile(user)

        const possiblePreferencesFile = suggestPreferencesFile(user)
        let preferencesFile
        try {
            preferencesFile = await utilityLogic.followOrCreateLink(user, ns.space('preferencesFile') as NamedNode, possiblePreferencesFile, user.doc())
        } catch (err) {
            const message = `User ${user} has no pointer in profile to preferences file.`
            debug.warn(message)
            // we are listing the possible errors
            if (err instanceof NotEditableError) { throw err }
            if (err instanceof WebOperationError) { throw err }
            if (err instanceof UnauthorizedError) { throw err }
            if (err instanceof CrossOriginForbiddenError) { throw err }
            if (err instanceof SameOriginForbiddenError) { throw err }
            if (err instanceof FetchError) { throw err }
            throw err
        }

        let response
        try {
            response = await store.fetcher.load(preferencesFile as NamedNode)
        } catch (err) { // Maybe a permission problem or origin problem
            const msg = `Unable to load preference of user ${user}: ${err}`
            debug.warn(msg)
            if (err.response.status === 401) {
                throw new UnauthorizedError();
            }
            if (err.response.status === 403) {
                if (differentOrigin(preferencesFile)) {
                throw new CrossOriginForbiddenError();
                }
                throw new SameOriginForbiddenError();
            }
            /*if (err.response.status === 404) {
                throw new NotFoundError();
            }*/
            throw new Error(msg)
        }
        return preferencesFile as NamedNode
    }

    async function loadProfile (user: NamedNode):Promise <NamedNode> {
        if (!user) {
            throw new Error(`loadProfile: no user given.`)
        }
        try {
            await store.fetcher.load(user.doc())
        } catch (err) {
            throw new Error(`Unable to load profile of user ${user}: ${err}`)
        }
        return user.doc()
    }

    async function loadMe(): Promise<NamedNode> {
        const me = authn.currentUser();
        if (me === null) {
            throw new Error("Current user not found! Not logged in?");
        }
        await store.fetcher.load(me.doc());
        return me;
    }

    function getPodRoot(user: NamedNode): NamedNode {
        const podRoot = findStorage(user);
        if (!podRoot) {
            throw new Error("User pod root not found!");
        }
        return podRoot as NamedNode;
    }

    async function getMainInbox(user: NamedNode): Promise<NamedNode> {
        await store.fetcher.load(user);
        const mainInbox = store.any(user, ns.ldp("inbox"), undefined, user.doc());
        if (!mainInbox) {
            throw new Error("User main inbox not found!");
        }
        return mainInbox as NamedNode;
    }

    function findStorage(me: NamedNode) {
        return store.any(me, ns.space("storage"), undefined, me.doc());
    }

    return {
        loadMe,
        getPodRoot,
        getMainInbox,
        findStorage,
        loadPreferences,
        loadProfile,
        silencedLoadPreferences
    }
}

