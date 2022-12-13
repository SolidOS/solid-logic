import { NamedNode } from "rdflib";
import { InboxLogic } from "../types";
import { getArchiveUrl } from "../util/utils";

export function createInboxLogic(store, profileLogic, utilityLogic, containerLogic, aclLogic): InboxLogic {

    async function createInboxFor(peerWebId: string, nick: string) {
      const myWebId: NamedNode = await profileLogic.loadMe();
      const podRoot: NamedNode = await profileLogic.getPodRoot(myWebId);
      const ourInbox = `${podRoot.value}p2p-inboxes/${encodeURIComponent(nick)}/`;
      await containerLogic.createContainer(ourInbox);
      // const aclDocUrl = await aclLogic.findAclDocUrl(ourInbox);
      await utilityLogic.setSinglePeerAccess({
        ownerWebId: myWebId.value,
        peerWebId,
        accessToModes: 'acl:Append',
        target: ourInbox
      });
      return ourInbox;
  }

  async function getNewMessages(
      user?: NamedNode
    ): Promise<string[]> {
      if (!user) {
        user = await profileLogic.loadMe();
      }
      const inbox = await profileLogic.getMainInbox(user);
      const urls = await containerLogic.getContainerMembers(inbox.value);
      return urls.filter(url => !containerLogic.isContainer(url));
  }

  async function markAsRead(url: string, date: Date) {
    const downloaded = await store.fetcher._fetch(url);
    if (downloaded.status !== 200) {
      throw new Error(`Not OK! ${url}`);
    }
    const archiveUrl = getArchiveUrl(url, date);
    const options = {
      method: 'PUT',
      body: await downloaded.text(),
      headers: [
        ['Content-Type', downloaded.headers.get('Content-Type') || 'application/octet-stream']
      ]
    };
    const uploaded = await store.fetcher._fetch(archiveUrl, options);
    if (uploaded.status.toString()[0] === '2') {
      await store.fetcher._fetch(url, {
        method: 'DELETE'
      });
    }
  }
  return {
    createInboxFor,
    getNewMessages,
    markAsRead
  }
}
