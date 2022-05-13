import { NamedNode, st, sym } from "rdflib"
import * as debug from '../util/debug'
import solidNamespace from 'solid-namespace'
import * as $rdf from 'rdflib'
import { newThing } from "../util/uri"
import { AuthenticationContext } from "../types"
import { solidLogicSingleton } from "../logic/solidLogicSingleton"
// import { ensureLoadedPreferences } from '../logic/logic'
import { loadPreferences, loadProfile } from '../discovery/discoveryLogic'
export const ns = solidNamespace($rdf)

const store = solidLogicSingleton.store

async function ensureLoadedPreferences (context:AuthenticationContext) {
  if (!context.me) throw new Error('@@ ensureLoadedPreferences: no user specified')
  context.publicProfile = await loadProfile(store, context.me)
  context.preferencesFile = await loadPreferences(store, context.me)
  return context
}

/**
 * Resolves with the same context, outputting
 * output: index.public, index.private
 *  @@ This is a very bizare function
 * @see https://github.com/solid/solid/blob/main/proposals/data-discovery.md#discoverability
 */
export async function loadIndex (
context: AuthenticationContext,
isPublic: boolean
): Promise<AuthenticationContext> {
const indexes = await solidLogicSingleton.loadIndexes(
    context.me as NamedNode,
    (isPublic ? context.publicProfile || null : null),
    (isPublic ? null : context.preferencesFile || null),
    // async (err: Error) => widgets.complain(context, err.message)
    async (err: Error) => debug.error(err.message) as undefined
)
context.index = context.index || {}
context.index.private = indexes.private.concat(context.index.private)
context.index.public = indexes.public.concat(context.index.public)
return context
}

export async function loadTypeIndexes (context: AuthenticationContext) {
if (!context.me) throw new Error('loadTypeIndexes: not logged in')
const context2 = await loadPreferences(solidLogicSingleton.store, context.me)
const indexes = await solidLogicSingleton.loadIndexes(
    context.me as NamedNode,
    context.publicProfile || null,
    context.preferencesFile || null,
    // async (err: Error) => widgets.complain(context, err.message)
    async (err: Error) => debug.warn(err.message) as undefined
)
context.index = context.index || {}
context.index.private = indexes.private || context.index.private
context.index.public = indexes.public || context.index.public
return context
}

/**
 * Resolves with the same context, outputting
 * @see https://github.com/solid/solid/blob/main/proposals/data-discovery.md#discoverability
 */
export async function ensureTypeIndexes (context: AuthenticationContext, agent?: NamedNode): Promise<AuthenticationContext> {
if (!context.me) {
  throw new Error(`ensureTypeIndexes: @@ no user`)
}
await ensureOneTypeIndex(context, true, agent)
await ensureOneTypeIndex(context, false, agent)
return context
}

/**
 * Load or create ONE type index
 * Find one or make one or fail
 * Many reasons for failing including script not having permission etc
 *
 * Adds its output to the context
 * @see https://github.com/solid/solid/blob/main/proposals/data-discovery.md#discoverability
 */
async function ensureOneTypeIndex (context: AuthenticationContext, isPublic: boolean, agent?: NamedNode): Promise<AuthenticationContext | void> {
    async function makeIndexIfNecessary (context, isPublic) {
        const relevant = isPublic ? context.publicProfile : context.preferencesFile
        if (!relevant) alert ('@@@@ relevent null')
        const visibility = isPublic ? 'public' : 'private'

        async function putIndex (newIndex) {
            try {
                await solidLogicSingleton.createEmptyRdfDoc(newIndex, 'Blank initial Type index')
                return context
            } catch (e) {
                const msg = `Error creating new index ${e}`
                // widgets.complain(context, msg)
                debug.warn(msg)
            }
        } // putIndex


        context.index = context.index || {}
        context.index[visibility] = context.index[visibility] || []
        let newIndex
        if (context.index[visibility].length === 0) {
            if (!store.updater.editable(relevant)) {
              debug.log(`Not adding new type index as ${relevant} is not editable`)
              return
            }
            newIndex = sym(`${relevant.dir().uri + visibility}TypeIndex.ttl`)
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
            await putIndex(newIndex)
            context.index[visibility].push(newIndex) // @@ wait
        } else {
        // officially exists
          const ixs = context.index[visibility]
          try {
              await solidLogicSingleton.load(ixs)
          } catch (err) {
              const msg = `ensureOneTypeIndex: loading indexes ${err}`
              debug.warn(msg)
              // widgets.complain(context, `ensureOneTypeIndex: loading indexes ${err}`)
          }
        }
    } // makeIndexIfNecessary

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
        await makeIndexIfNecessary(context2, isPublic)
    } catch (error) {
        await makeIndexIfNecessary(context2, isPublic)
        // widgets.complain(context2, 'calling loadIndex:' + error)
    }
}

/**
 * Register a new app in a type index
 * used in chat in bookmark.js (solid-ui)
 */
export async function registerInTypeIndex (
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
        // See https://github.com/solid/solid/blob/main/proposals/data-discovery.md
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
