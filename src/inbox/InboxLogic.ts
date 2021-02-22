import { NamedNode, Node, st, term } from "rdflib";
import { LiveStore, SolidNamespace } from "../index";
import { ProfileLogic } from "../profile/ProfileLogic";
import { UtilityLogic } from "../util/UtilityLogic";
import { newThing } from "../uri";

interface NewPaneOptions {
  me?: NamedNode;
  newInstance?: NamedNode;
  newBase: string;
}

interface CreatedPaneOptions {
  newInstance: NamedNode;
}

/**
 * Inbox-related logic
 */
export class InboxLogic {
  store: LiveStore;
  ns: SolidNamespace;
  profile: ProfileLogic;
  util: UtilityLogic;

  constructor(store: LiveStore, ns: SolidNamespace, profile: ProfileLogic, util: UtilityLogic) {
    this.store = store;
    this.ns = ns;
    this.profile = profile;
    this.util = util;
  }

  async getNewMessages(
    user?: NamedNode
  ): Promise<string[]> {
    if (!user) {
      user = await this.profile.loadMe();
    }
    const inbox = await this.profile.getMainInbox(user);
    const urls = await this.util.getContainerMembers(inbox);
    return urls.filter(url => !this.util.isContainer(url));
  }
}
