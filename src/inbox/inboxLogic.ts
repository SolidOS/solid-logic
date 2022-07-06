import { NamedNode, LiveStore, sym } from "rdflib";
import { ProfileLogic } from "../profile/ProfileLogic";
import { SolidNamespace } from "../types";
import { UtilityLogic } from "../util/UtilityLogic";

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
  ): Promise<NamedNode[]> {
    if (!user) {
      user = await this.profile.loadMe();
    }
    const inbox = await this.profile.getMainInbox(user);
    const urls = await this.util.getContainerMembers(inbox);
    return urls.filter(url => !this.util.isContainer(url));
  }
  async createInboxFor(ourPeerWebId: NamedNode, nick: string) {
    const myWebId: NamedNode = (await this.profile.loadMe());
    const podRoot: NamedNode = await this.profile.getPodRoot(myWebId);
    const ourInbox = `${podRoot.value}p2p-inboxes/${encodeURIComponent(nick)}/`;
    const toNode: NamedNode = sym(ourInbox);
    await this.util.createContainer(toNode);
    const aclDocUrl = await this.util.findAclDocUrl(toNode);
    await this.util.setSinglePeerAccess({
      ownerWebId: myWebId.value,
      peerWebId: ourPeerWebId.value,
      accessToModes: 'acl:Append',
      target: ourInbox
    });
    return ourInbox;
  }
  async markAsRead(url: NamedNode, date: Date) {
    const nodeToStr = url.value;
    const downloaded = await this.store.fetcher._fetch(nodeToStr);
    if (downloaded.status !== 200) {
      throw new Error(`Not OK! ${url}`);
    }
    const archiveUrl = this.util.getArchiveUrl(nodeToStr, date);
    const options =  {
      method: 'PUT',
      body: await downloaded.text(),
      headers: [
        [ 'Content-Type', downloaded.headers.get('Content-Type') || 'application/octet-stream' ]
      ]
    };
    const uploaded = await this.store.fetcher._fetch(archiveUrl, options);
    if (uploaded.status.toString()[0] === '2') {
      await this.store.fetcher?._fetch(nodeToStr, {
        method: 'DELETE'
      });
    }
  }
}
