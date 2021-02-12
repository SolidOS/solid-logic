import {NamedNode} from 'rdflib'
import {LiveStore} from "../index";
import {AuthnLogic} from "../authn";


export class ProfileLogic {

    store: LiveStore
    ns: any
    authn: AuthnLogic

    constructor(store, ns, authn) {
        this.store = store
        this.ns = ns
        this.authn = authn
    }

    async loadMe() {
        const me = this.authn.currentUser()
        if (me === null) {
            throw new Error('Current user not found! Not logged in?')
        }
        await this.store.fetcher.load(me.doc())
        return me
    }

    getPodRoot(user: NamedNode): NamedNode {
        const podRoot = this.findStorage(user)
        if (!podRoot) {
            throw new Error('User pod root not found!')
        }
        return podRoot as NamedNode
    }

    private findStorage(me: NamedNode) {
        return this.store.any(me, this.ns.space('storage'), undefined, me.doc());
    }
}