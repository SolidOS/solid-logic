import { NamedNode, LiveStore } from "rdflib";
import { AuthnLogic, SolidNamespace } from "../types";

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
    await this.store.fetcher?.load(me.doc());
    return me;
  }

  getPodRoot(user: NamedNode): NamedNode {
    const podRoot = this.findStorage(user);
    if (!podRoot) {
      throw new Error("User pod root not found!");
    }
    return podRoot as NamedNode;
  }

  async getMainInbox(user: NamedNode): Promise<NamedNode> {
    await this.store.fetcher?.load(user);
    const mainInbox = this.store.any(user, this.ns.ldp("inbox"), undefined, user.doc());
    if (!mainInbox) {
      throw new Error("User main inbox not found!");
    }
    return mainInbox as NamedNode;
  }

  private findStorage(me: NamedNode) {
    return this.store.any(me, this.ns.space("storage"), undefined, me.doc());
  }
}
