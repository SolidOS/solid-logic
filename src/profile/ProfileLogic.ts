import { NamedNode } from "rdflib";
import { AuthnLogic } from "../authn";
import { LiveStore, SolidNamespace } from "../index";

export class ProfileLogic {
  store: LiveStore;
  ns: SolidNamespace;
  authn: AuthnLogic;

  constructor(store: LiveStore, ns: SolidNamespace, authn: AuthnLogic) {
    this.store = store;
    this.ns = ns;
    this.authn = authn;
  }

  async loadMe(): Promise<NamedNode> {
    const me = this.authn.currentUser();
    if (me === null) {
      throw new Error("Current user not found! Not logged in?");
    }
    await this.store.fetcher.load(me.doc());
    return me;
  }

  getPodRoot(user: NamedNode): NamedNode {
    const podRoot = this.findStorage(user);
    if (!podRoot) {
      throw new Error("User pod root not found!");
    }
    return podRoot as NamedNode;
  }

  private findStorage(me: NamedNode) {
    return this.store.any(me, this.ns.space("storage"), undefined, me.doc());
  }
}
