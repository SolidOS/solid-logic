import { NamedNode } from "rdflib";
import { findAclDocUrl } from "../acl/aclLogic";
import { solidLogicSingleton } from "../logic/solidLogicSingleton";
import { setSinglePeerAccess } from "../util/utilityLogic";

export async function createInboxFor(peerWebId: string, nick: string) {
    const myWebId: NamedNode = (await solidLogicSingleton.profile.loadMe());
    const podRoot: NamedNode = await solidLogicSingleton.profile.getPodRoot(myWebId);
    const ourInbox = `${podRoot.value}p2p-inboxes/${encodeURIComponent(nick)}/`;
    await solidLogicSingleton.container.createContainer(ourInbox);
    const aclDocUrl = await findAclDocUrl(ourInbox);
    await setSinglePeerAccess({
      ownerWebId: myWebId.value,
      peerWebId,
      accessToModes: 'acl:Append',
      target: ourInbox
    });
    return ourInbox;
}