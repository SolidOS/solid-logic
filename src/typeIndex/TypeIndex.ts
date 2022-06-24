import { LiveStore, NamedNode, st, sym } from 'rdflib'
import { Profile } from '../profile/Profile'
import { AuthnLogic, SolidNamespace } from '../types'
import { newThing, uniqueNodes } from "../util/utils"

export class TypeIndex {
  store: LiveStore;
  ns: SolidNamespace;
  authn: AuthnLogic;
  profile: Profile;

  constructor(store: LiveStore, ns: SolidNamespace, authn: AuthnLogic, profile: Profile) {
    this.store = store;
    this.ns = ns;
    this.authn = authn;
    this.profile = profile;
  }

  suggestPublicTypeIndex (me: NamedNode) {
    return sym(me.doc().dir()?.uri + 'publicTypeIndex.ttl')
  }
  // Note this one is based off the pref file not the profile

  suggestPrivateTypeIndex (preferencesFile: NamedNode) {
    return sym(preferencesFile.doc().dir()?.uri + 'privateTypeIndex.ttl')
  }

  /*
  * Register a new app in a type index
  * used in chat in bookmark.js (solid-ui)
  * Returns the registration object if successful else null
  */
  async registerInstanceInTypeIndex (
    store: LiveStore,
    instance: NamedNode,
    index: NamedNode,
    theClass: NamedNode,
    // agent: NamedNode
  ): Promise<NamedNode | null> {
    const registration = newThing(index)
      const ins = [
          // See https://github.com/solid/solid/blob/main/proposals/data-discovery.md
          st(registration, this.ns.rdf('type'), this.ns.solid('TypeRegistration'), index),
          st(registration, this.ns.solid('forClass'), theClass, index),
          st(registration, this.ns.solid('instance'), instance, index)
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

  async deleteTypeIndexRegistration (item) {
    const reg = this.store.the(null, this.ns.solid('instance'), item.instance, item.scope.index) as NamedNode
    if (!reg) throw new Error(`deleteTypeIndexRegistration: No registration found for ${item.instance}`)
    const statements = this.store.statementsMatching(reg, null, null, item.scope.index)
    await this.store.updater.update(statements, [])
  }

// ---------- new 
  async getScopedAppsFromIndex (scope, theClass: NamedNode | null) {
    const index = scope.index
    const registrations = this.store.statementsMatching(null, this.ns.solid('instance'), null, index)
      .concat(this.store.statementsMatching(null, this.ns.solid('instanceContainer'), null, index))
      .map(st => st.subject)
    const relevant = theClass ? registrations.filter(reg => this.store.any(reg, this.ns.solid('forClass'), null, index)?.sameTerm(theClass))
                              : registrations
    const directInstances = relevant.map(reg => this.store.each(reg, this.ns.solid('instance'), null, index).map(one => sym(one.value))).flat()
    let instances = uniqueNodes(directInstances)

    const instanceContainers = relevant.map(
      reg => this.store.each(reg, this.ns.solid('instanceContainer'), null, index).map(one => sym(one.value))).flat()

    //  instanceContainers may be deprocatable if no one has used them
    const containers = uniqueNodes(instanceContainers)
    if (containers.length > 0) { console.log('@@ getScopedAppsFromIndex containers ', containers)}
    for (let i = 0; i < containers.length; i++) {
      const cont = containers[i]
      await this.store.fetcher.load(cont)
      const contents = this.store.each(cont, this.ns.ldp('contains'), null, cont).map(one => sym(one.value))
      instances = instances.concat(contents)
    }
    return instances.map(instance => { return {instance, scope}})
  }

}