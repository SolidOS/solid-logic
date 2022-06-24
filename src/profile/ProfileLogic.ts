import { NamedNode } from "rdflib";
import { solidLogicSingleton } from "../logic/solidLogicSingleton";
import * as debug from "../util/debug"
import solidNamespace from 'solid-namespace';
import * as $rdf from 'rdflib'
import { CrossOriginForbiddenError, NotFoundError, SameOriginForbiddenError, UnauthorizedError, FetchError } from "../logic/CustomError";
import { AuthenticationContext } from "../types";
import { followOrCreateLink } from "../util/utilityLogic";

const ns = solidNamespace($rdf)

export async function loadProfile(me: NamedNode): Promise<NamedNode> {
    /*
    // console.log('loadProfile cache ', solidLogicSingleton.cache)
    if (solidLogicSingleton.cache.profileDocument[me.value]) {
    return solidLogicSingleton.cache.profileDocument[me.value];
    }    @@ just use the cache in the store
    */
    console.log('loadProfile  me ', me)
    const profileDocument = me.doc()
    try {
        await solidLogicSingleton.store.fetcher.load(profileDocument);
        return profileDocument;
    } catch (err) {
    const message = `Cannot load profile ${profileDocument} : ${err}`;
    throw new Error(message);
    }
}

export async function loadPreferences(me: NamedNode): Promise<NamedNode> {
    
    await loadProfile(me) // Load pointer to pref file
    const preferencesFile = solidLogicSingleton.store.any(me, ns.space('preferencesFile'), null, me.doc());

    function differentOrigin(): boolean {
    if (!preferencesFile) {
        return true;
    }
    return (
        `${window.location.origin}/` !== new URL(preferencesFile.value).origin
    );
    }

    if (!preferencesFile) {
    throw new Error(
        `Can't find a preference file pointer in profile ${me.doc()}`
    );
    }

    // //// Load preference file
    try {
    await solidLogicSingleton.store.fetcher.load(preferencesFile as NamedNode, {
        withCredentials: true,
    });
    } catch (err) {
    // Really important to look at why
    const status = err.status;
    debug.log(`HTTP status ${status} for preference file ${preferencesFile}`);
    if (status === 401) {
        throw new UnauthorizedError();
    }
    if (status === 403) {
        if (differentOrigin()) {
        throw new CrossOriginForbiddenError();
        }
        throw new SameOriginForbiddenError();
    }
    if (status === 404) {
        throw new NotFoundError(preferencesFile.value);
    }
    throw new FetchError(err.status, err.message);
    }
    return preferencesFile as NamedNode;
}

export async function ensureLoadedPreferences (context: AuthenticationContext) {
    if (!context.me) throw new Error('@@ ensureLoadedPreferences: no user specified')
    context.publicProfile = await loadProfile(context.me)
    context.preferencesFile = await loadPreferences(context.me)
    return context
}

export async function loadPreferencesNEW (user: NamedNode): Promise <NamedNode | undefined> {
    await loadProfileNEW(user)

    const possiblePreferencesFile = solidLogicSingleton.profile.suggestPreferencesFile(user)

    const preferencesFile = await followOrCreateLink(user, ns.space('preferencesFile') as NamedNode, possiblePreferencesFile, user.doc())

    if (!preferencesFile) {
      const message = `User ${user} has no pointer in profile to preferences file.`
      console.warn(message)
      return undefined
    }
    let response
    try {
        response = await solidLogicSingleton.store.fetcher.load(preferencesFile as NamedNode)
    } catch (err) { // Maybe a permission problem or origin problem
      console.warn(err.response.status)
      console.warn(`Unable to load preference of user ${user}: ${err}`)
      return undefined
    }
    return preferencesFile as NamedNode
}
  
export async function loadProfileNEW (user: NamedNode):Promise <NamedNode> {
    if (!user) {
      throw new Error(`loadProfile: no user given.`)
    }
    try {
      await solidLogicSingleton.store.fetcher.load(user.doc())
    } catch (err) {
      throw new Error(`Unable to load profile of user ${user}: ${err}`)
    }
    return user.doc()
  }


