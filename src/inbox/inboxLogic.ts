import { NamedNode } from "rdflib";
import { findAclDocUrl } from "../acl/aclLogic";
import { getMainInbox, loadMe, getPodRoot } from "../profile/profileLogic";
import { setSinglePeerAccess } from "../util/utilityLogic";
import { getArchiveUrl } from "../util/utils";
import { solidLogicSingleton } from "../logic/solidLogicSingleton";
import { getContainerMembers, isContainer, createContainer } from "../util/containerLogic";

const store = solidLogicSingleton.store

export async function createInboxFor(peerWebId: string, nick: string) {
    const myWebId: NamedNode = (await loadMe());
    const podRoot: NamedNode = await getPodRoot(myWebId);
    const ourInbox = `${podRoot.value}p2p-inboxes/${encodeURIComponent(nick)}/`;
    await createContainer(ourInbox);
    const aclDocUrl = await findAclDocUrl(ourInbox);
    await setSinglePeerAccess({
      ownerWebId: myWebId.value,
      peerWebId,
      accessToModes: 'acl:Append',
      target: ourInbox
    });
    return ourInbox;
}

export async function getNewMessages(
    user?: NamedNode
  ): Promise<string[]> {
    if (!user) {
      user = await loadMe();
    }
    const inbox = await getMainInbox(user);
    const urls = await getContainerMembers(inbox.value);
    return urls.filter(url => !isContainer(url));
}

export async function markAsRead(url: string, date: Date) {
  const downloaded = await store.fetcher._fetch(url);
    if (downloaded.status !== 200) {
      throw new Error(`Not OK! ${url}`);
    }
    const archiveUrl = getArchiveUrl(url, date);
    const options =  {
      method: 'PUT',
      body: await downloaded.text(),
      headers: [
        [ 'Content-Type', downloaded.headers.get('Content-Type') || 'application/octet-stream' ]
      ]
    };
    const uploaded = await store.fetcher._fetch(archiveUrl, options);
    if (uploaded.status.toString()[0] === '2') {
      await store.fetcher._fetch(url, {
        method: 'DELETE'
      });
    }
}