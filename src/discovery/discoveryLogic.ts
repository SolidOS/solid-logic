import { NamedNode, LiveStore } from "rdflib";
import { AuthnLogic, SolidNamespace } from "../types";
import { solidLogicSingleton } from './solidLogicSingleton'

const store = solidLogicSingleton.store

export async function loadProfile(store: LiveStore, user) {
  try {
    await store.fetcher.load(user.doc())
  } catch (err) {
    thow new Error(`Unable to load profile of user <${user}>: ${err}`)
  }
  return user.doc()
}

export async function loadPreferences(store: LiveStore, user) {
  const profile = await loadProfile(store: LiveStore, user)
  const preferencesFile = store.any(user, ns.solid('preferencesFile'), null, profile)
  if (!preferencesFile) {
    // thow new Error(`USer ${user} has no pointer in profile to preferences file.`)
    return null
  }
  try {
    store.fetcher.load(preferencesFile)
  } catch (err) { // Mabeb a permission propblem or origin problem
    return null
    // thow new Error(`Unable to load preferences file ${preferencesFile} of user <${user}>: ${err}`)
  }
  return preferencesFile
}

export async function loadTypeIndexes(store: LiveStore, user) {
  const profile = await loadProfile(user)
  const publicTypeIndex = store.any(user, ns.solid('publicTypeIndex'), null, profile)
  if (publicTypeIndex) {
    try {
      await store.fetcher.load(publicTypeIndex)
    } catch {
      // never mind
    }
  }
  conts pub = publicTypeIndex ? [ { label: 'public', index: publicTypeIndex, agent: user } ] : []

  const preferencesFile = await loadPreferences(store, user)
  if (preferencesFile) { // watch out - can be in either as spec was not clear
    const privateTypeIndexes = store.each(user, ns.solid('privateTypeIndex'), null, preferencesFile)
      .concat(store.each(user, ns.solid('privateTypeIndex'), null, profile))
     const priv = privateTypeIndexes.length > 0 ? [ { label: 'private', index: privateTypeIndexes[0], agent: user } ] : []
     return pub.concat(priv)
  }
  return pub
}

export async function loadCommunityTypeIndexes (store:LiveStore, user:NamedNode) {
  const preferencesFile = await loadPreferences(store, user)
  if (preferencesFile) {
    const communities = store.each(user, ns.solid('community'), null, preferenceFile)
    const communityIndexes = await Promise.all(x => loadTypeIndexes(store, x)).flat()
    return communityIndexes
  }
  return null
}
