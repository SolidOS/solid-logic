import * as rdf from "rdflib"
import { NamedNode, st } from 'rdflib'
import { solidLogicSingleton } from "../logic/solidLogicSingleton"
import { AuthenticationContext, ScopedApp, TypeIndexScope } from '../types'
import * as debug from "../util/debug"
import solidNamespace from 'solid-namespace'
import * as $rdf from 'rdflib'
import { ensureLoadedPreferences, loadPreferences, loadPreferencesNEW, loadProfileNEW } from "../profile/profileLogic"
import { suggestPrivateTypeIndex, suggestPublicTypeIndex } from "../discovery/discoveryLogic"
import { followOrCreateLink } from "../util/utilityLogic"
import { newThing } from "../util/utils"

const ns = solidNamespace($rdf)
/**
 * Resolves with the same context, outputting
 * @see https://github.com/solidos/solid/blob/main/proposals/data-discovery.md#discoverability
 */
async function ensureTypeIndexes(context: AuthenticationContext, agent?: NamedNode): Promise<AuthenticationContext> {
if (!context.me) {
    throw new Error(`ensureTypeIndexes: @@ no user`)
}
await ensureOneTypeIndex(context, true, agent)
await ensureOneTypeIndex(context, false, agent)
return context
}

async function loadTypeIndexes (context: AuthenticationContext) {
    try {
        await loadPreferences(context.me as NamedNode)
    } catch (error) {
        debug.warn(error.message) as undefined
    }
    try {
        const indexes = await loadIndexes(
            context.me as NamedNode,
            context.publicProfile || null,
            context.preferencesFile || null,
            // async (err: Error) => widgets.complain(context, err.message)
            // async (err: Error) => debug.warn(err.message) as undefined
        )
        context.index = context.index || {}
        context.index.private = indexes.private || context.index.private
        context.index.public = indexes.public || context.index.public
        return context
    } catch (error) {
        async (error: Error) => debug.warn(error.message) as undefined
    }
}

/**
 * Register a new app in a type index
 * used in chat in bookmark.js (solid-ui)
 */
async function registerInTypeIndex (
context: AuthenticationContext,
instance: NamedNode,
theClass: NamedNode,
isPublic: boolean,
agent?: NamedNode // Defaults to current user
): Promise<AuthenticationContext> {
    await ensureOneTypeIndex(context, isPublic, agent)
    if (!context.index) {
        throw new Error('registerInTypeIndex: No type index found')
    }
    const indexes = isPublic ? context.index.public : context.index.private
    if (!indexes.length) {
        throw new Error('registerInTypeIndex: What no type index?')
    }
    const index = indexes[0]
    const registration = newThing(index)
    const ins = [
        // See https://github.com/solidos/solid/blob/main/proposals/data-discovery.md
        st(registration, ns.rdf('type'), ns.solid('TypeRegistration'), index),
        st(registration, ns.solid('forClass'), theClass, index),
        st(registration, ns.solid('instance'), instance, index)
    ]
    try {
        await solidLogicSingleton.updatePromise([], ins)
    } catch (e) {
        debug.log(e)
        alert(e)
    }
    return context
}

/**
 * Resolves with the same context, outputting
 * output: index.public, index.private
 *  @@ This is a very bizare function
 * @see https://github.com/solidos/solid/blob/main/proposals/data-discovery.md#discoverability
 */
async function loadIndex(
context: AuthenticationContext,
isPublic: boolean
): Promise<AuthenticationContext> {
    const indexes = await loadIndexes(
        context.me as NamedNode,
        (isPublic ? context.publicProfile || null : null),
        (isPublic ? null : context.preferencesFile || null),
        // async (err: Error) => widgets.complain(context, err.message)
        async (err: Error) => debug.error(err.message) as undefined
    )
    context.index = context.index || {}
    context.index.private = indexes.private.concat(context.index.private || []) // otherwise concat will wrongly add 'undefined' as a private index
    context.index.public = indexes.public.concat(context.index.public || []) // otherwise concat will wrongly add 'undefined' as a public index
    return context
}

/**
 * Load or create ONE type index
 * Find one or make one or fail
 * Many reasons for failing including script not having permission etc
 *
 * Adds its output to the context
 * @see https://github.com/solidos/solid/blob/main/proposals/data-discovery.md#discoverability
 */
async function ensureOneTypeIndex (context: AuthenticationContext, isPublic: boolean, agent?: NamedNode): Promise<AuthenticationContext | void> {

    const context2 = await ensureLoadedPreferences(context)
    if (!context2.publicProfile) throw new Error(`@@ type index: no publicProfile`)
    if (!context2.preferencesFile) throw new Error(`@@ type index: no preferencesFile for profile  ${context2.publicProfile}`)
    const relevant = isPublic ? context2.publicProfile : context2.preferencesFile

    try {
        await loadIndex(context2, isPublic)
        const pp = isPublic ? 'public' : 'private'
        if (context2.index && context2.index[pp]&& context2.index[pp].length > 0) {
        debug.log(`ensureOneTypeIndex: Type index exists already ${context2.index[pp]}`)
        return context2
        }
        await makeIndexIfNecessary(context2, isPublic, solidLogicSingleton.store, ns)
    } catch (error) {
        await makeIndexIfNecessary(context2, isPublic, solidLogicSingleton.store, ns)
        // widgets.complain(context2, 'calling loadIndex:' + error)
    }
}

async function putIndex (newIndex, context) {
    try {
        await createEmptyRdfDoc(newIndex, 'Blank initial Type index')
        return context
    } catch (e) {
        const msg = `Error creating new index ${e}`
        // widgets.complain(context, msg)
        debug.warn(msg)
    }
} // putIndex
    
async function makeIndexIfNecessary (context, isPublic, store, ns) {
    const relevant = isPublic ? context.publicProfile : context.preferencesFile
    if (!relevant) alert ('@@@@ relevent null')
    const visibility = isPublic ? 'public' : 'private'

    context.index = context.index || {}
    context.index[visibility] = context.index[visibility] || []
    let newIndex
    if (context.index[visibility].length === 0) {
        if (!store.updater.editable(relevant)) {
            debug.log(`Not adding new type index as ${relevant} is not editable`)
            return
        }
        newIndex = rdf.sym(`${relevant.dir().uri + visibility}TypeIndex.ttl`)
        debug.log(`Linking to new fresh type index ${newIndex}`)
        if (!confirm(`OK to create a new empty index file at ${newIndex}, overwriting anything that is now there?`)) {
            throw new Error('cancelled by user')
        }
        debug.log(`Linking to new fresh type index ${newIndex}`)
        const addMe = [
            st(context.me, ns.solid(`${visibility}TypeIndex`), newIndex, relevant)
        ]
        try {
            await solidLogicSingleton.updatePromise([], addMe)
        } catch (err) {
            const msg = `Error saving type index link saving back ${newIndex}: ${err}`
            //widgets.complain(context, msg)
            debug.warn(msg)
            return context
        }

        debug.log(`Creating new fresh type index file${newIndex}`)
        await putIndex(newIndex, context)
        context.index[visibility].push(newIndex) // @@ wait
    } else {
    // officially exists
        const ixs = context.index[visibility]
        try {
            await solidLogicSingleton.store.fetcher.load(ixs)
        } catch (err) {
            const msg = `ensureOneTypeIndex: loading indexes ${err}`
            debug.warn(msg)
            // widgets.complain(context, `ensureOneTypeIndex: loading indexes ${err}`)
        }
    }
} // makeIndexIfNecessary

async function createEmptyRdfDoc(doc: NamedNode, comment: string) {
    await solidLogicSingleton.store.fetcher.webOperation("PUT", doc.uri, {
    data: `# ${new Date()} ${comment}
`,
    contentType: "text/turtle",
    });
}

async function loadIndexes(
    me: NamedNode | string,
    publicProfile: NamedNode | string | null,
    preferencesFile: NamedNode | string | null,
    onWarning = async (_err: Error) => {
        return undefined;
    }
): Promise<{
    private: any;
    public: any;
}> {
    let privateIndexes: any[] = [];
    let publicIndexes: any[] = [];
    if (publicProfile) {
    publicIndexes = getTypeIndex(me, publicProfile, true);
    try {
        await solidLogicSingleton.store.fetcher.load(publicIndexes as NamedNode[]);
    } catch (err) {
        onWarning(new Error(`loadIndex: loading public type index(es) ${err}`));
    }
    }
    if (preferencesFile) {
    privateIndexes = getTypeIndex(me, preferencesFile, false);
    // console.log({ privateIndexes })
    if (privateIndexes.length === 0) {
        await onWarning(
        new Error(
            `Your preference file ${preferencesFile} does not point to a private type index.`
        )
        );
    } else {
        try {
        await solidLogicSingleton.store.fetcher.load(privateIndexes);
        } catch (err) {
        onWarning(
            new Error(`loadIndex: loading private type index(es) ${err}`)
        );
        }
    }
    // } else {
    //   debug.log(
    //     'We know your preference file is not available, so we are not bothering with private type indexes.'
    //   )
    }

    return {
    private: privateIndexes,
    public: publicIndexes,
    };
}    

function getTypeIndex(
    me: NamedNode | string,
    preferencesFile: NamedNode | string,
    isPublic: boolean
): NamedNode[] {
    // console.log('getTypeIndex', this.store.each(me, undefined, undefined, preferencesFile), isPublic, preferencesFile)
    return solidLogicSingleton.store.each(
    me as NamedNode,
    isPublic ? ns.solid("publicTypeIndex") : ns.solid("privateTypeIndex"),
    undefined,
    preferencesFile as NamedNode
    ) as NamedNode[];
}

function getRegistrations(instance, theClass) {
    return solidLogicSingleton.store
    .each(undefined, ns.solid("instance"), instance)
    .filter((r) => {
        return solidLogicSingleton.store.holds(r, ns.solid("forClass"), theClass);
    });
}

//------- NEW
async function loadTypeIndexesFor (user: NamedNode): Promise<Array<TypeIndexScope>> {
    if (!user) throw new Error(`loadTypeIndexesFor: No user given`)
    const profile = await loadProfileNEW(user)

    const suggestion = suggestPublicTypeIndex(user)

    const publicTypeIndex = await followOrCreateLink(user, ns.solid('publicTypeIndex') as NamedNode, suggestion, profile)

    const publicScopes = publicTypeIndex ? [ { label: 'public', index: publicTypeIndex as NamedNode, agent: user } ] : []

    let preferencesFile
    try {
      preferencesFile = await loadPreferencesNEW(user)
    } catch (err) {
      preferencesFile = null
    }

    let privateScopes
    if (preferencesFile) { // watch out - can be in either as spec was not clear.  Legacy is profile.
      // If there is a legacy one linked from the profile, use that.
      // Otherwiae use or make one linked from Preferences
      const suggestedPrivateTypeIndex = suggestPrivateTypeIndex(preferencesFile)

      const privateTypeIndex = solidLogicSingleton.store.any(user, ns.solid('privateTypeIndex'), undefined, profile) ||

      await followOrCreateLink(user, ns.solid('privateTypeIndex') as NamedNode, suggestedPrivateTypeIndex, preferencesFile);

      privateScopes = privateTypeIndex ? [ { label: 'private', index: privateTypeIndex as NamedNode, agent: user } ] : []
    } else {
      privateScopes = []
    }
    const scopes = publicScopes.concat(privateScopes)
    if (scopes.length === 0) return scopes
    const files = scopes.map(scope => scope.index)
    try {
      await solidLogicSingleton.store.fetcher.load(files)
    } catch (err) {
      console.warn('Problems loading type index: ', err)
    }
    return scopes
}

async function loadCommunityTypeIndexes (user: NamedNode): Promise<TypeIndexScope[][]> {
    const preferencesFile = await loadPreferencesNEW(user)
    if (preferencesFile) { // For now, pick up communities as simple links from the preferences file.
      const communities = solidLogicSingleton.store.each(user, ns.solid('community'), undefined, preferencesFile as NamedNode).concat(
        solidLogicSingleton.store.each(user, ns.solid('community'), undefined, user.doc() as NamedNode)
      )
      let result = []
      for (const org of communities) {
        result = result.concat(await loadTypeIndexesFor(org as NamedNode) as any)
      }
      return result
    }
    return [] // No communities
  }

async function loadAllTypeIndexes (user: NamedNode) {
    return (await loadTypeIndexesFor(user)).concat((await loadCommunityTypeIndexes(user)).flat())
}

async function getScopedAppInstances (klass: NamedNode, user: NamedNode):Promise<ScopedApp[]> {
    const scopes = await loadAllTypeIndexes(user)
    let scopedApps = []
    for (const scope of scopes) {
        const scopedApps0 = await solidLogicSingleton.typeIndex.getScopedAppsFromIndex(scope, klass) as any
        scopedApps = scopedApps.concat(scopedApps0)
    }
    return scopedApps
}

// This is the function signature which used to be in solid-ui/logic
// Recommended to use getScopedAppInstances instead as it provides more information.
//
async function getAppInstances (klass: NamedNode): Promise<NamedNode[]> {
    const user = solidLogicSingleton.authn.currentUser()
    if (!user) throw new Error('getAppInstances: Must be logged in to find apps.')
    const scopedAppInstances = await getScopedAppInstances(klass, user)
    return scopedAppInstances.map(scoped => scoped.instance)
}
  
export {
    ensureTypeIndexes,
    loadTypeIndexes,
    getRegistrations,
    registerInTypeIndex,
    loadIndex,
    loadTypeIndexesFor,
    loadCommunityTypeIndexes,
    loadAllTypeIndexes,
    getScopedAppInstances,
    getAppInstances
}
