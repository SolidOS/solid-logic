import { NamedNode, Namespace, LiveStore, sym, st } from "rdflib";
import * as debug from '../util/debug'
// import { getContainerMembers } from '../util/UtilityLogic'
import { solidLogicSingleton } from "../logic/solidLogicSingleton"

const {  getContainerMembers, authn } = solidLogicSingleton
const { currentUser } = authn

type TypeIndexScope = { label: string, index: NamedNode, agent: NamedNode } ;
type ScopedApp = { instance: NamedNode, scope: TypeIndexScope }

const ns ={
  rdf:   Namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#'),
  solid: Namespace('http://www.w3.org/ns/solid/terms#'),
  space: Namespace('http://www.w3.org/ns/pim/space#')
}

/** Create a resource if it really does not exist
 *  Be absolutely sure something does not exist before creating a new empty file
 * as otherwise existing could  be deleted.
 * @param doc {NamedNode} - The resource
 */
export async function loadOrCreateIfNotExists (store: LiveStore, doc: NamedNode) {
    let response
    try {
      response = await store.fetcher.load(doc)
    } catch (err) {
        if (err.response.status === 404) {
          debug.log('createIfNotExists doc does NOT exist, will create: ' + doc)
          try {
            store.fetcher.webOperation('PUT', doc.uri, {data: '', contentType: 'text/turtle'})
          } catch (err) {
            const msg = 'createIfNotExists doc FAILED: ' + doc + ': ' + err
            debug.log(msg)
            throw new Error(msg)
          }
          delete store.fetcher.requested[doc.uri] // delete cached 404 error
          debug.log('createIfNotExists doc created ok ' + doc)
        } else {
          const msg =  'createIfNotExists doc load error NOT 404:  ' + doc + ': ' + err
          debug.log(msg)
          throw new Error(msg) // @@ add nested errors
        }
    }
    debug.log('createIfNotExists doc exists, all good ' + doc)
    return response
}

export function HTTPStatus (doc: NamedNode): Number {
  return 200 // @@ TBD
}
export function makePreferencesFileURI (store:LiveStore, me:NamedNode) {
  const stripped = me.uri.replace('/profile/', '/').replace('/public/', '/')
  // const stripped = me.uri.replace(\/[p|P]rofile/\g, '/').replace(\/[p|P]ublic/\g, '/')
  const folderURI = stripped.split('/').slice(0,-1).join('/') + '/Settings/'
  const fileURI = folderURI + 'Preferences.ttl'
  const folder = sym(folderURI)

  const folderStat = HTTPStatus(folder)
  if (folderStat === 200) {

  } else if (folderStat === 404) {

  } else {
    console.log('Abort Preferences creation: Settings folder HTTP status: ' + folderStat)
    return null
  }
  // @@ To be completed TBC

}
/* Follow link from this doc to another thing, or else make a new link
**
**  null return means new one created
*/
export async function followOrCreateLink(store: LiveStore, subject: NamedNode, predicate: NamedNode,
     object: NamedNode, doc:NamedNode):Promise<NamedNode | null> {
  const result = store.any(subject, predicate, null, doc)
  if (result) return result as NamedNode
  if (!store.updater.editable(doc)) throw new Error(`followOrCreateLink: Cannot modify ${doc} to make link to ${object}`)
  await store.updater.update([], [ st(subject, predicate, object, doc)])
  return object
}

export async function loadProfile(store: LiveStore, user) {
  if (!user) {
    throw new Error(`loadProfile: no user given.`)
  }
  // try {
    await store.fetcher.load(user.doc())
  // } catch (err) {
  //  throw new Error(`Unable to load profile of user ${user}: ${err}`)
  //}
  return user.doc()
}

export async function loadPreferences(store: LiveStore, user): Promise <NamedNode | undefined > {
  const profile = await loadProfile(store as LiveStore, user)
  const preferencesFile = store.any(user, ns.space('preferencesFile'), undefined, profile)
  if (!preferencesFile) {
    const message = `User ${user} has no pointer in profile to preferences file.`
    console.warn(message)
    // throw new Error()
    return undefined
  }
  try {
    store.fetcher.load(preferencesFile as NamedNode)
  } catch (err) { // Mabeb a permission propblem or origin problem
    return undefined
    // throw new Error(`Unable to load preferences file ${preferencesFile} of user <${user}>: ${err}`)
  }
  return preferencesFile as NamedNode
}

export async function loadTypeIndexesFor(store: LiveStore, user:NamedNode): Promise<Array<TypeIndexScope>> {
  if (!user) throw new Error(`loadTypeIndexesFor: No user given`)
  const profile = await loadProfile(store, user)
  const publicTypeIndex = store.any(user, ns.solid('publicTypeIndex'), undefined, profile)
  if (publicTypeIndex) {
    try {
      await store.fetcher.load(publicTypeIndex as NamedNode)
    } catch {
      // never mind
    }
  }
  const  pub = publicTypeIndex ? [ { label: 'public', index: publicTypeIndex as NamedNode, agent: user } ] : []

  const preferencesFile = await loadPreferences(store, user)
  if (preferencesFile) { // watch out - can be in either as spec was not clear
    const privateTypeIndexes = store.each(user, ns.solid('privateTypeIndex'), undefined, preferencesFile as NamedNode)
      .concat(store.each(user, ns.solid('privateTypeIndex'), undefined, profile))
    const priv = privateTypeIndexes.length > 0 ? [ { label: 'private', index: privateTypeIndexes[0] as NamedNode, agent: user } ] : []
    return pub.concat(priv)
  }
  return pub
}

export async function loadCommunityTypeIndexes (store:LiveStore, user:NamedNode): Promise<TypeIndexScope[][]> {
  const preferencesFile = await loadPreferences(store, user)
  if (preferencesFile) { // For now, pick up communities as simple links from the preferences file.
    const communities = store.each(user, ns.solid('community'), undefined, preferencesFile as NamedNode)
    const communityTypeIndexesPromises = communities.map(async community => await loadTypeIndexesFor(store, community as NamedNode))
    const result1 = Promise.all(communityTypeIndexesPromises)
    // const result2 = Promise.all(result1)
    // const flat = result2.flat()
    return result1
    // const communityTypeIndexes = await Promise.all(communityTypeIndexesPromise)
      /*
    let result = [] as TypeIndexScope[]
    for(const community of communities) {
      result = result.concat(await loadTypeIndexesFor(store, community as NamedNode)) as TypeIndexScope[] // @@ how oto make functional with async?
    }
    */
    // return communityTypeIndexesPromise.resolve()
  }
  return []
}

export async function loadAllTypeIndexes (store:LiveStore, user:NamedNode) {
  return (await loadTypeIndexesFor(store, user)).concat((await loadCommunityTypeIndexes(store, user)).flat())
}


export function uniqueNodes (arr: NamedNode[]): NamedNode[] {
  return Array.from(new Set(arr.map(x => x.uri))).map(u => sym(u))
}


export async function getScopedAppsFrommIndex (store, scope, theClass: NamedNode) {
  const index = scope.index
  const registrations = store.each(undefined, ns.solid('forClass'), theClass, index)
  const relevant = registrations.filter(reg => store.holds(reg, ns.rdf('type'), ns.solid('TypeRegistration'), index))
  const instances0 = relevant.map(reg => store.any(reg as NamedNode, ns.solid('instance'), null, index))

/*    .map(ix =>
    .reduce((acc, curr) => acc.concat(curr), [])
  const instances0 = registrations
    .map(reg => store.each(reg as NamedNode, ns.solid('instance')))
    .reduce((acc, curr) => acc.concat(curr), [])
*/
  const containers0 = relevant.map(reg => store.each(reg as NamedNode, ns.solid('instanceContainer')))

  let instances = instances0
  instances = uniqueNodes(instances.concat(instances as NamedNode[]))
  const containers = uniqueNodes(containers0)
  if (!containers.length) {
    return instances.map(instance => { return {instance, scope}})
  }
  // If the index gives containers, then look up all things within them
  console.log('@@ CONTAINERS   ', JSON.stringify(containers))

  try {
    await store.fetcher.load(containers as NamedNode[])
  } catch (err) {
    const e = new Error(`[FAI] Unable to load containers${err}`)
    debug.log(e) // complain
    // widgets.complain(context, `Error looking for ${utils.label(theClass)}:  ${err}`)
    // but then ignore it
    // throw new Error(e)
  }
  for (let i = 0; i < containers.length; i++) {
    const cont = containers[i]
    instances = instances.concat(
      (await getContainerMembers(cont.value)).map(uri => store.sym(uri)) // @@ warning: uses strings not NN
    )
  }
  return instances.map(instance => { return {instance, scope}})
}


export async function getScopedAppInstances (store:LiveStore, klass: NamedNode, user: NamedNode):Promise<ScopedApp[]> {
  const scopes = await loadAllTypeIndexes(store, user)
  let scopedApps = []
  for (const scope of scopes) {
    const scopedApps0 = await getScopedAppsFrommIndex(store, scope, klass)
    scopedApps = scopedApps.concat(scopedApps0)
  }
  return scopedApps
}
// This is the function signature which used to be in solid-ui/logic
export async function getAppInstances (store:LiveStore, klass: NamedNode): Promise<NamedNode[]> {
  const user = currentUser()
  if (!user) throw new Error('getAppInstances: Must be logged in to find apps.')
  const scopedAppInstances = await getScopedAppInstances(store, klass, user)
  return scopedAppInstances.map(scoped => scoped.instance)
}

// ENDS
