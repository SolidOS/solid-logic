import * as $rdf from 'rdflib'
import * as rdf from "rdflib"
import { NamedNode, st, sym } from 'rdflib'
import solidNamespace from 'solid-namespace'
import { solidLogicSingleton } from "../logic/solidLogicSingleton"
import { ensureLoadedPreferences, loadPreferences, loadProfile } from "../profile/profileLogic"
import { AuthenticationContext, ScopedApp, TypeIndexScope } from '../types'
import * as debug from "../util/debug"
import { createEmptyRdfDoc, followOrCreateLink } from "../util/utilityLogic"
import { newThing, uniqueNodes } from "../util/utils"

const store = solidLogicSingleton.store
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
    // console.log('getTypeIndex', store.each(me, undefined, undefined, preferencesFile), isPublic, preferencesFile)
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

async function loadTypeIndexesFor (user: NamedNode): Promise<Array<TypeIndexScope>> {
    if (!user) throw new Error(`loadTypeIndexesFor: No user given`)
    const profile = await loadProfile(user)

    const suggestion = suggestPublicTypeIndex(user)
    let publicTypeIndex
    try {
        publicTypeIndex = await followOrCreateLink(user, ns.solid('publicTypeIndex') as NamedNode, suggestion, profile)
    } catch (err) {
        const message = `User ${user} has no pointer in profile to publicTypeIndex file.`
        debug.warn(message)
    }
    const publicScopes = publicTypeIndex ? [ { label: 'public', index: publicTypeIndex as NamedNode, agent: user } ] : []

    let preferencesFile
    try {
        preferencesFile = await loadPreferences(user)
    } catch (err) {
        preferencesFile = null
    }

    let privateScopes
    if (preferencesFile) { // watch out - can be in either as spec was not clear.  Legacy is profile.
      // If there is a legacy one linked from the profile, use that.
      // Otherwiae use or make one linked from Preferences
        const suggestedPrivateTypeIndex = suggestPrivateTypeIndex(preferencesFile)
        let privateTypeIndex
        try {
            privateTypeIndex = solidLogicSingleton.store.any(user, ns.solid('privateTypeIndex'), undefined, profile) ||
                await followOrCreateLink(user, ns.solid('privateTypeIndex') as NamedNode, suggestedPrivateTypeIndex, preferencesFile);
        } catch (err) {
            const message = `User ${user} has no pointer in preference file to privateTypeIndex file.`
            debug.warn(message)
        }
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
        debug.warn('Problems loading type index: ', err)
    }
    return scopes
}

async function loadCommunityTypeIndexes (user: NamedNode): Promise<TypeIndexScope[][]> {
    let preferencesFile
    try {
        preferencesFile = await loadPreferences(user)
    } catch (err) {
        const message = `User ${user} has no pointer in profile to preferences file.`
        debug.warn(message)
    }
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
        const scopedApps0 = await getScopedAppsFromIndex(scope, klass) as any
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

function suggestPublicTypeIndex (me: NamedNode) {
    return sym(me.doc().dir()?.uri + 'publicTypeIndex.ttl')
}
// Note this one is based off the pref file not the profile

function suggestPrivateTypeIndex (preferencesFile: NamedNode) {
    return sym(preferencesFile.doc().dir()?.uri + 'privateTypeIndex.ttl')
}

/*
* Register a new app in a type index
* used in chat in bookmark.js (solid-ui)
* Returns the registration object if successful else null
*/
async function registerInstanceInTypeIndex (
instance: NamedNode,
index: NamedNode,
theClass: NamedNode,
// agent: NamedNode
): Promise<NamedNode | null> {
const registration = newThing(index)
    const ins = [
        // See https://github.com/solid/solid/blob/main/proposals/data-discovery.md
        st(registration, ns.rdf('type'), ns.solid('TypeRegistration'), index),
        st(registration, ns.solid('forClass'), theClass, index),
        st(registration, ns.solid('instance'), instance, index)
    ]
    try {
        await store.updater.update([], ins)
    } catch (err) {
        const msg = `Unable to register ${instance} in index ${index}: ${err}`
        console.warn(msg)
        return null
    }
    return registration
}

async function deleteTypeIndexRegistration (item) {
    const reg = store.the(null, ns.solid('instance'), item.instance, item.scope.index) as NamedNode
    if (!reg) throw new Error(`deleteTypeIndexRegistration: No registration found for ${item.instance}`)
    const statements = store.statementsMatching(reg, null, null, item.scope.index)
    await store.updater.update(statements, [])
}

async function getScopedAppsFromIndex (scope, theClass: NamedNode | null) {
    const index = scope.index
    const registrations = store.statementsMatching(null, ns.solid('instance'), null, index)
        .concat(store.statementsMatching(null, ns.solid('instanceContainer'), null, index))
        .map(st => st.subject)
    const relevant = theClass ? registrations.filter(reg => store.any(reg, ns.solid('forClass'), null, index)?.sameTerm(theClass))
        : registrations
    const directInstances = relevant.map(reg => store.each(reg, ns.solid('instance'), null, index).map(one => sym(one.value))).flat()
    let instances = uniqueNodes(directInstances)

    const instanceContainers = relevant.map(
        reg => store.each(reg, ns.solid('instanceContainer'), null, index).map(one => sym(one.value))).flat()

    //  instanceContainers may be deprocatable if no one has used them
    const containers = uniqueNodes(instanceContainers)
    if (containers.length > 0) { console.log('@@ getScopedAppsFromIndex containers ', containers)}
    for (let i = 0; i < containers.length; i++) {
        const cont = containers[i]
        await store.fetcher.load(cont)
        const contents = store.each(cont, ns.ldp('contains'), null, cont).map(one => sym(one.value))
        instances = instances.concat(contents)
    }
    return instances.map(instance => { return {instance, scope}})
}

export {
    ensureTypeIndexes,
    loadTypeIndexes,
    registerInTypeIndex,
    loadIndex,
    ensureOneTypeIndex,
    putIndex,
    makeIndexIfNecessary,
    loadIndexes,
    getTypeIndex,
    getRegistrations,
    loadTypeIndexesFor,
    loadCommunityTypeIndexes,
    loadAllTypeIndexes,
    getScopedAppInstances,
    getAppInstances,
    suggestPublicTypeIndex,
    suggestPrivateTypeIndex,
    registerInstanceInTypeIndex,
    deleteTypeIndexRegistration,
    getScopedAppsFromIndex
}
