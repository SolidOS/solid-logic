import { NamedNode, st, sym } from "rdflib"
import * as debug from '../util/debug'
import solidNamespace from 'solid-namespace'
import * as $rdf from 'rdflib'
import { newThing } from "../util/uri"
import { AuthenticationContext } from "../types"
import { solidLogicSingleton } from "../logic/solidLogicSingleton"

export const ns = solidNamespace($rdf)

/**
 * Resolves with the same context, outputting
 * output: index.public, index.private
 *
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
context.index.private = indexes.private || context.index.private
context.index.public = indexes.public || context.index.public
return context
}

export async function loadTypeIndexes (context: AuthenticationContext) {
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
export async function ensureTypeIndexes (context: AuthenticationContext): Promise<AuthenticationContext> {
await ensureOneTypeIndex(context, true)
await ensureOneTypeIndex(context, false)
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
async function ensureOneTypeIndex (context: AuthenticationContext, isPublic: boolean): Promise<AuthenticationContext | void> {
    async function makeIndexIfNecessary (context, isPublic) {
        const relevant = isPublic ? context.publicProfile : context.preferencesFile
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

    try {
        await loadIndex(context, isPublic)
        if (context.index) {
        debug.log(
            `ensureOneTypeIndex: Type index exists already ${isPublic
            ? context.index.public[0]
            : context.index.private[0]
            }`
        )
        }
        return context
    } catch (error) {
        await makeIndexIfNecessary(context, isPublic)
        // widgets.complain(context, 'calling loadIndex:' + error)
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
isPublic: boolean
): Promise<AuthenticationContext> {
    await ensureOneTypeIndex(context, isPublic)
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