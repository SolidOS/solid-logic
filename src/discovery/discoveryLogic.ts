import { NamedNode, Namespace, LiveStore } from "rdflib";

type TypeIndex = {  label: string, index: NamedNode, agent: NamedNode } ;

const ns ={
  solid: Namespace('http://www.w3.org/ns/solid/terms#'),
  space: Namespace('http://www.w3.org/ns/pim/space#')
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
  if (preferencesFile) {
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
