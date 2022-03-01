import { NamedNode, LiveStore } from "rdflib";
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
  ): Promise<string[]> {
    if (!user) {
      user = await this.profile.loadMe();
    }
    const inbox = await this.profile.getMainInbox(user);
    const urls = await this.util.getContainerMembers(inbox.value);
    return urls.filter(url => !this.util.isContainer(url));
  }
  async createInboxFor(peerWebId: string, nick: string) {
    const myWebId: NamedNode = (await this.profile.loadMe());
    const podRoot: NamedNode = await this.profile.getPodRoot(myWebId);
    const ourInbox = `${podRoot.value}p2p-inboxes/${encodeURIComponent(nick)}/`;
    await this.util.createContainer(ourInbox);
    const aclDocUrl = await this.util.findAclDocUrl(ourInbox);
    await this.util.setSinglePeerAccess({
      ownerWebId: myWebId.value,
      peerWebId,
      accessToModes: 'acl:Append',
      target: ourInbox
    });
    return ourInbox;
  }
  async markAsRead(url: string, date: Date) {
    const downloaded = await this.util.fetcher.fetch(url);
    if (downloaded.status !== 200) {
      throw new Error(`Not OK! ${url}`);
    }
    const archiveUrl = this.util.getArchiveUrl(url, date);
    const options =  {
      method: 'PUT',
      body: await downloaded.text(),
      headers: [
        [ 'Content-Type', downloaded.headers.get('Content-Type') || 'application/octet-stream' ]
      ]
    };
    const uploaded = await this.util.fetcher.fetch(archiveUrl, options);
    if (uploaded.status.toString()[0] === '2') {
      await this.store.fetcher?._fetch(url, {
        method: 'DELETE'
      });
    }
  }
}
