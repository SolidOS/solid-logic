import { NamedNode, st, sym } from 'rdflib'
import { ScopedApp, TypeIndexLogic, TypeIndexScope } from '../types'
import * as debug from '../util/debug'
import { ns as namespace } from '../util/ns'
import { newThing } from '../util/utils'

export function createTypeIndexLogic(store, authn, profileLogic, utilityLogic): TypeIndexLogic {
    const ns = namespace

    function getRegistrations(instance, theClass) {
        return store
            .each(undefined, ns.solid('instance'), instance)
            .filter((r) => {
                return store.holds(r, ns.solid('forClass'), theClass)
            })
    }

    async function loadTypeIndexesFor(user: NamedNode): Promise<Array<TypeIndexScope>> {
        if (!user) throw new Error('loadTypeIndexesFor: No user given')
        const profile = await profileLogic.loadProfile(user)

        const suggestion = suggestPublicTypeIndex(user)
        let publicTypeIndex
        try {
            publicTypeIndex = await utilityLogic.followOrCreateLink(user, ns.solid('publicTypeIndex') as NamedNode, suggestion, profile)
        } catch (err) {
            const message = `User ${user} has no pointer in profile to publicTypeIndex file.`
            debug.warn(message)
        }
        const publicScopes = publicTypeIndex ? [{ label: 'public', index: publicTypeIndex as NamedNode, agent: user }] : []

        let preferencesFile
        try {
            preferencesFile = await profileLogic.silencedLoadPreferences(user)
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
                privateTypeIndex = store.any(user, ns.solid('privateTypeIndex'), undefined, profile) ||
                    await utilityLogic.followOrCreateLink(user, ns.solid('privateTypeIndex') as NamedNode, suggestedPrivateTypeIndex, preferencesFile)
                } catch (err) {
                const message = `User ${user} has no pointer in preference file to privateTypeIndex file.`
                debug.warn(message)
            }
            privateScopes = privateTypeIndex ? [{ label: 'private', index: privateTypeIndex as NamedNode, agent: user }] : []
        } else {
            privateScopes = []
        }
        const scopes = publicScopes.concat(privateScopes)
        if (scopes.length === 0) return scopes
        const files = scopes.map(scope => scope.index)
        try {
            await store.fetcher.load(files)
        } catch (err) {
            debug.warn('Problems loading type index: ', err)
        }
        return scopes
    }

    async function loadCommunityTypeIndexes(user: NamedNode): Promise<TypeIndexScope[][]> {
        let preferencesFile
        try {
            preferencesFile = await profileLogic.silencedLoadPreferences(user)
        } catch (err) {
            const message = `User ${user} has no pointer in profile to preferences file.`
            debug.warn(message)
        }
        if (preferencesFile) { // For now, pick up communities as simple links from the preferences file.
            const communities = store.each(user, ns.solid('community'), undefined, preferencesFile as NamedNode).concat(
                store.each(user, ns.solid('community'), undefined, user.doc() as NamedNode)
            )
            let result = []
            for (const org of communities) {
                result = result.concat(await loadTypeIndexesFor(org as NamedNode) as any)
            }
            return result
        }
        return [] // No communities
    }

    async function loadAllTypeIndexes(user: NamedNode) {
        return (await loadTypeIndexesFor(user)).concat((await loadCommunityTypeIndexes(user)).flat())
    }

    async function getScopedAppInstances(klass: NamedNode, user: NamedNode): Promise<ScopedApp[]> {
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
    async function getAppInstances(klass: NamedNode): Promise<NamedNode[]> {
        const user = authn.currentUser()
        if (!user) throw new Error('getAppInstances: Must be logged in to find apps.')
        const scopedAppInstances = await getScopedAppInstances(klass, user)
        return scopedAppInstances.map(scoped => scoped.instance)
    }

    function suggestPublicTypeIndex(me: NamedNode) {
        return sym(me.doc().dir()?.uri + 'publicTypeIndex.ttl')
    }
    // Note this one is based off the pref file not the profile

    function suggestPrivateTypeIndex(preferencesFile: NamedNode) {
        return sym(preferencesFile.doc().dir()?.uri + 'privateTypeIndex.ttl')
    }

    /*
    * Register a new app in a type index
    * used in chat in bookmark.js (solid-ui)
    * Returns the registration object if successful else null
    */
    async function registerInTypeIndex(
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

    async function deleteTypeIndexRegistration(item) {
        const reg = store.the(null, ns.solid('instance'), item.instance, item.scope.index) as NamedNode
        if (!reg) throw new Error(`deleteTypeIndexRegistration: No registration found for ${item.instance}`)
        const statements = store.statementsMatching(reg, null, null, item.scope.index)
        await store.updater.update(statements, [])
    }

    async function getScopedAppsFromIndex(scope: TypeIndexScope, theClass: NamedNode | null): Promise<ScopedApp[]> {
        const index = scope.index
        const results: ScopedApp[] = []
        const registrations = store.statementsMatching(null, ns.solid('instance'), null, index)
            .concat(store.statementsMatching(null, ns.solid('instanceContainer'), null, index))
            .map(st => st.subject)
        for (const reg of registrations) {
          const klass = store.any(reg, ns.solid('forClass'), null, index)
          if (!theClass || klass.sameTerm(theClass)) {
            const instances = store.each(reg, ns.solid('instance'), null, index)
            for (const instance of instances) {
              results.push({ instance, type: klass, scope })
            }
            const containers = store.each(reg, ns.solid('instanceContainer'), null, index)
            for (const instance of containers) {
                await store.fetcher.load(instance)
                results.push({ instance: sym(instance.value), type: klass,  scope })
            }
          }
        }
        return results
    }

    return {
        registerInTypeIndex,
        getRegistrations,
        loadTypeIndexesFor,
        loadCommunityTypeIndexes,
        loadAllTypeIndexes,
        getScopedAppInstances,
        getAppInstances,
        suggestPublicTypeIndex,
        suggestPrivateTypeIndex,
        deleteTypeIndexRegistration,
        getScopedAppsFromIndex
    }
}
