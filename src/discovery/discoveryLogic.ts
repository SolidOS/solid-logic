import { NamedNode, Namespace, LiveStore, sym } from "rdflib";
import * as debug from '../util/debug'

type TypeIndex = {  label: string, index: NamedNode, agent: NamedNode } ;

const ns ={
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
  const stripped = me.uri.replace('/profile/', '/').replace('/public', '/')
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

export async function followOrCreateLink(doc:NamedNode, subject: NamedNode , predicate: NamedNode , object: NamedNode ) {
  // @@ to be continued
}

export async function loadProfile(store: LiveStore, user) {
  if (!user) {
    throw new Error(`loadProfile: no user given.`)
  }
  try {
    await store.fetcher.load(user.doc())
  } catch (err) {
    throw new Error(`Unable to load profile of user <${user}>: ${err}`)
  }
  return user.doc()
}

export async function loadPreferences(store: LiveStore, user): Promise <NamedNode | undefined > {
  const profile = await loadProfile(store as LiveStore, user)
  const preferencesFile = store.any(user, ns.space('preferencesFile'), undefined, profile)
  if (!preferencesFile) {
    // throw new Error(`USer ${user} has no pointer in profile to preferences file.`)
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

export async function loadTypeIndexesFor(store: LiveStore, user:NamedNode): Promise<Array<TypeIndex>> {
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
    const priv = privateTypeIndexes.length > 0 ? [ { label: 'priSo @@@@@vate', index: privateTypeIndexes[0] as NamedNode, agent: user } ] : []
    return pub.concat(priv)
  }
  return pub
}

export async function loadCommunityTypeIndexes (store:LiveStore, user:NamedNode): Promise<TypeIndex[][]> {
  const preferencesFile = await loadPreferences(store, user)
  if (preferencesFile) { // For now, pick up communities as simple links from the preferences file.
    const communities = store.each(user, ns.solid('community'), undefined, preferencesFile as NamedNode)
    const communityTypeIndexesPromise = communities.map(async community => await loadTypeIndexesFor(store, community as NamedNode))
    const result1 = Promise.all(communityTypeIndexesPromise)
    // const result2 = Promise.all(result1)
    // const flat = result2.flat()
    return result1
    // const communityTypeIndexes = await Promise.all(communityTypeIndexesPromise)
      /*
    let result = [] as TypeIndex[]
    for(const community of communities) {
      result = result.concat(await loadTypeIndexesFor(store, community as NamedNode)) as TypeIndex[] // @@ how oto make functional with async?
    }
    */
    // return communityTypeIndexesPromise.resolve()
  }
  return []
}

export async function loadAllTypeIndexes (store:LiveStore, user:NamedNode) {
  return (await loadTypeIndexesFor(store, user)).concat((await loadCommunityTypeIndexes(store, user)).flat())
}

/*
export async function getAppInstances (store:LiveStore, klass: NamedNode) {

}
*/
