import { NamedNode, Namespace, LiveStore, sym, st } from "rdflib";
// import * as debug from '../util/debug'
// import { getContainerMembers } from '../util/UtilityLogic'
import { solidLogicSingleton } from "../logic/solidLogicSingleton"

const {  authn } = solidLogicSingleton
const { currentUser } = authn

type TypeIndexScope = { label: string, index: NamedNode, agent: NamedNode } ;
type ScopedApp = { instance: NamedNode, scope: TypeIndexScope }

const ns ={
  dct:     Namespace('http://purl.org/dc/terms/'),
  ldp:     Namespace('http://www.w3.org/ns/ldp#'),
  meeting: Namespace('http://www.w3.org/ns/pim/meeting#'),
  rdf:     Namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#'),
  schema:  Namespace('http://schema.org/'),
  solid:   Namespace('http://www.w3.org/ns/solid/terms#'),
  space:   Namespace('http://www.w3.org/ns/pim/space#'),
  stat:    Namespace('http://www.w3.org/ns/posix/stat#'),
  vcard:   Namespace('http://www.w3.org/2006/vcard/ns#'),
  wf:      Namespace('http://www.w3.org/2005/01/wf/flow#'),
  xsd:     Namespace('http://www.w3.org/2001/XMLSchema#')

}

/** Create a resource if it really does not exist
 *  Be absolutely sure something does not exist before creating a new empty file
 * as otherwise existing could  be deleted.
 * @param doc {NamedNode} - The resource
 */
export async function loadOrCreateIfNotExists (store: LiveStore, doc: NamedNode) {
    let response
    // console.log('@@ loadOrCreateIfNotExists doc ', doc)
    try {
      response = await store.fetcher.load(doc)
    } catch (err) {
        if (err.response.status === 404) {
          // console.log('createIfNotExists doc does NOT exist, will create: ' + doc)
          try {
            store.fetcher.webOperation('PUT', doc, {data: '', contentType: 'text/turtle'})
          } catch (err) {
            const msg = 'createIfNotExists: PUT FAILED: ' + doc + ': ' + err
            // console.log(msg)
            throw new Error(msg)
          }
          delete store.fetcher.requested[doc.uri] // delete cached 404 error
          // console.log('createIfNotExists doc created ok ' + doc)
        } else {
          const msg =  'createIfNotExists doc load error NOT 404:  ' + doc + ': ' + err
          // console.log(msg)
          throw new Error(msg) // @@ add nested errors
        }
    }
    // console.log('createIfNotExists doc exists, all good ' + doc)
    return response
}

export function suggestPreferencesFile (me:NamedNode) {
  const stripped = me.uri.replace('/profile/', '/').replace('/public/', '/')
  // const stripped = me.uri.replace(\/[p|P]rofile/\g, '/').replace(\/[p|P]ublic/\g, '/')
  const folderURI = stripped.split('/').slice(0,-1).join('/') + '/Settings/'
  const fileURI = folderURI + 'Preferences.ttl'
  return sym(fileURI)
}

export function suggestPublicTypeIndex (me:NamedNode) {
  return sym(me.doc().dir().uri + 'publicTypeIndex.ttl')
}
// Note this one is based off the pref file not the profile

export function suggestPrivateTypeIndex (preferencesFile:NamedNode) {
  return sym(preferencesFile.doc().dir().uri + 'privateTypeIndex.ttl')
}
/* Follow link from this doc to another thing, or else make a new link
**
**  return: null no ld one and failed to make a new one
*/
export async function followOrCreateLink(store: LiveStore, subject: NamedNode, predicate: NamedNode,
     object: NamedNode, doc:NamedNode):Promise<NamedNode | null> {
  await store.fetcher.load(doc)
  const result = store.any(subject, predicate, null, doc)
  // console.log('@@ followOrCreateLink result ', result)

  if (result) return result as NamedNode
  if (!store.updater.editable(doc)) {
    // console.log(`followOrCreateLink:  Can't modify ${doc} so can't make new link to ${object}.`)
    // console.log('followOrCreateLink @@ connectedStatements', store.connectedStatements(subject))
    return null
  }
  try {
    await store.updater.update([], [ st(subject, predicate, object, doc)])
  } catch (err) {
    console.warn(`followOrCreateLink: Error making link in ${doc} to ${object}: ${err}`)
    return null
  }

  // console.log(`Success making link in ${doc} to ${object}` )

  try {
    await loadOrCreateIfNotExists(store, object)
    // store.fetcher.webOperation('PUT', object, { data: '', contentType: 'text/turtle'})
  } catch (err) {
    console.warn(`followOrCreateLink: Error loading or saving new linked document: ${object}: ${err}`)
  }
  // console.log(`followOrCreateLink: Success loading or saving new linked document: ${object}.`)
  return object
}

export async function loadProfile(store: LiveStore, user: NamedNode) {
  // console.log(' @@  loadProfile: user', user)
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

export async function loadPreferences(store: LiveStore, user: NamedNode): Promise <NamedNode | undefined > {
  // console.log('loadPreferences @@ user', user)
  await loadProfile(store as LiveStore, user)

  const possiblePreferencesFile = suggestPreferencesFile(user)

  const preferencesFile = await followOrCreateLink(store, user,  ns.space('preferencesFile'), possiblePreferencesFile, user.doc())
  // const preferencesFile = store.any(user, ns.space('preferencesFile'), undefined, profile)

  // console.log('loadPreferences @@ pref file', preferencesFile)
  if (!preferencesFile) {
    const message = `User ${user} has no pointer in profile to preferences file.`
    console.warn(message)
    // throw new Error()
    return undefined
  }
  try {
    await store.fetcher.load(preferencesFile as NamedNode)
  } catch (err) { // Mabeb a permission propblem or origin problem
    return undefined
    // throw new Error(`Unable to load preferences file ${preferencesFile} of user <${user}>: ${err}`)
  }
  return preferencesFile as NamedNode
}

export async function loadTypeIndexesFor(store: LiveStore, user:NamedNode): Promise<Array<TypeIndexScope>> {
  // console.log('@@ loadTypeIndexesFor user', user)
  if (!user) throw new Error(`loadTypeIndexesFor: No user given`)
  const profile = await loadProfile(store, user)

  const suggestion = suggestPublicTypeIndex(user)

  const publicTypeIndex = await followOrCreateLink(store, user, ns.solid('publicTypeIndex'), suggestion, profile)

  // const publicTypeIndex = store.any(user, ns.solid('publicTypeIndex'), undefined, profile)
  // console.log('@@ loadTypeIndexesFor publicTypeIndex', publicTypeIndex)

  const  publicScopes = publicTypeIndex ? [ { label: 'public', index: publicTypeIndex as NamedNode, agent: user } ] : []

  let preferencesFile
  try {
    preferencesFile = await loadPreferences(store, user)
  } catch (err) {
    preferencesFile = null
  }

  let privateScopes
  if (preferencesFile) { // watch out - can be in either as spec was not clear.  Legacy is profile.
    // If there is a legacy one linked from the profile, use that.
    // Otherwiae use or make one linked from Preferences
    const suggestedPrivateTypeIndex = suggestPrivateTypeIndex(preferencesFile)

    const privateTypeIndex = store.any(user, ns.solid('privateTypeIndex'), undefined, profile) ||

        await followOrCreateLink(store, user, ns.solid('privateTypeIndex'), suggestedPrivateTypeIndex, preferencesFile);

    privateScopes = privateTypeIndex ? [ { label: 'private', index: privateTypeIndex as NamedNode, agent: user } ] : []
  } else {
    privateScopes = []
  }
  const scopes =  publicScopes.concat(privateScopes)
  if (scopes.length === 0) return scopes
  const files = scopes.map(scope => scope.index)
  // console.log('@@ loadTypeIndexesFor files ', files)
  try {
    await store.fetcher.load(files)
  } catch (err) {
    console.warn('Problems loading type index: ', err)
  }
  return scopes
}

export async function loadCommunityTypeIndexes (store:LiveStore, user:NamedNode): Promise<TypeIndexScope[][]> {
  const preferencesFile = await loadPreferences(store, user)
  if (preferencesFile) { // For now, pick up communities as simple links from the preferences file.
    const communities = store.each(user, ns.solid('community'), undefined, preferencesFile as NamedNode)
    // console.log('loadCommunityTypeIndexes communities: ',communities)
    let result = []
    for (const org of communities) {
      result = result.concat(await loadTypeIndexesFor(store, org as NamedNode))
    }
    // const communityTypeIndexesPromises = communities.map(async community => await loadTypeIndexesFor(store, community as NamedNode))
    // const result1 = Promise.all(communityTypeIndexesPromises)
    return result
  }
  return [] // No communities
}

export async function loadAllTypeIndexes (store:LiveStore, user:NamedNode) {
  return (await loadTypeIndexesFor(store, user)).concat((await loadCommunityTypeIndexes(store, user)).flat())
}

// Utility: remove duplicates from Array of NamedNodes

export function uniqueNodes (arr: NamedNode[]): NamedNode[] {
  const uris = arr.map(x => x.uri)
  const set = new Set(uris)
  const uris2 = Array.from(set)
  const arr2 = uris2.map(u => new NamedNode(u))
  return arr2 // Array.from(new Set(arr.map(x => x.uri))).map(u => sym(u))
}

export async function getScopedAppsFrommIndex (store, scope, theClass: NamedNode) {
  // console.log(`getScopedAppsFrommIndex agent ${scope.agent} index: ${scope.index}` )
  const index = scope.index
  const registrations = store.each(undefined, ns.solid('forClass'), theClass, index)
  // console.log('    registrations', registrations )

  const directInstances = registrations.map(reg => store.each(reg as NamedNode, ns.solid('instance'), null, index)).flat()
  // console.log('    directInstances', directInstances )
  let instances = uniqueNodes(directInstances)

/*
  let instanceContainers = []
  for (const reg of registrations) {
    const cont = store.any(reg as NamedNode, ns.solid('instanceContainer'), null, index)
    if (cont) {
      // console.log('   @@ getScopedAppsFrommIndex got one: ', cont)
      instanceContainers.push(cont)
    }
  }
  */
 const instanceContainers = registrations.map(
     reg => store.each(reg as NamedNode, ns.solid('instanceContainer'), null, index)).flat()

  //  instanceContainers may be deprocatable if no one has used them

  const containers = uniqueNodes(instanceContainers)
  for (let i = 0; i < containers.length; i++) {
    const cont = containers[i]
    await store.fetcher.load(cont)
    const contents = store.each(cont, ns.ldp('contains'), null, cont)
    // if (contents.length) console.log('getScopedAppsFrommIndex @@ instanceContainer contents:', contents)
    instances = instances.concat(contents)
  }
  return instances.map(instance => { return {instance, scope}})
}


export async function getScopedAppInstances (store:LiveStore, klass: NamedNode, user: NamedNode):Promise<ScopedApp[]> {
  // console.log('getScopedAppInstances @@ ' + user)
  const scopes = await loadAllTypeIndexes(store, user)
  let scopedApps = []
  for (const scope of scopes) {
    const scopedApps0 = await getScopedAppsFrommIndex(store, scope, klass)
    scopedApps = scopedApps.concat(scopedApps0)
  }
  return scopedApps
}
// This is the function signature which used to be in solid-ui/logic
// Recommended to use getScopedAppInstances instead as it provides more information.
//
export async function getAppInstances (store:LiveStore, klass: NamedNode): Promise<NamedNode[]> {
  const user = currentUser()
  if (!user) throw new Error('getAppInstances: Must be logged in to find apps.')
  const scopedAppInstances = await getScopedAppInstances(store, klass, user)
  return scopedAppInstances.map(scoped => scoped.instance)
}

// ENDS
