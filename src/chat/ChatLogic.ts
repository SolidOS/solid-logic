import { NamedNode, Node, st, term } from "rdflib";
import { LiveStore, SolidNamespace } from "../index";
import { ProfileLogic } from "../profile/ProfileLogic";
import { newThing } from "../uri";
import { determineChatContainer } from "./determineChatContainer";

const CHAT_LOCATION_IN_CONTAINER = "index.ttl#this";

interface NewPaneOptions {
  me?: NamedNode;
  newInstance?: NamedNode;
  newBase: string;
}

interface CreatedPaneOptions {
  newInstance: NamedNode;
}

/**
 * Chat-related logic
 */
export class ChatLogic {
  store: LiveStore;
  ns: SolidNamespace;
  profile: ProfileLogic;

  constructor(store: LiveStore, ns: SolidNamespace, profile: ProfileLogic) {
    this.store = store;
    this.ns = ns;
    this.profile = profile;
  }

  async setAcl(
    chatContainer: NamedNode,
    me: NamedNode,
    invitee: NamedNode
  ): Promise<void> {
    // Some servers don't present a Link http response header
    // if the container doesn't exist yet, so refetch the container
    // now that it has been created:
    await this.store.fetcher.load(chatContainer);

    // FIXME: check the Why value on this quad:
    const chatAclDoc = this.store.any(
      chatContainer,
      new NamedNode("http://www.iana.org/assignments/link-relations/acl")
    );
    if (!chatAclDoc) {
      throw new Error("Chat ACL doc not found!");
    }

    const aclBody = `
@prefix acl: <http://www.w3.org/ns/auth/acl#>.
<#owner>
    a acl:Authorization;
    acl:agent <${me.value}>;
    acl:accessTo <.>;
    acl:default <.>;
    acl:mode
        acl:Read, acl:Write, acl:Control.
<#invitee>
    a acl:Authorization;
    acl:agent <${invitee.value}>;
    acl:accessTo <.>;
    acl:default <.>;
    acl:mode
        acl:Read, acl:Append.
`;
    await this.store.fetcher.webOperation("PUT", chatAclDoc.value, {
      data: aclBody,
      contentType: "text/turtle",
    });
  }

  private async addToPrivateTypeIndex(chatThing, me) {
    // Add to private type index
    const privateTypeIndex = this.store.any(
      me,
      this.ns.solid("privateTypeIndex")
    ) as NamedNode | null;
    if (!privateTypeIndex) {
      throw new Error("Private type index not found!");
    }
    await this.store.fetcher.load(privateTypeIndex);
    const reg = newThing(privateTypeIndex);
    const ins = [
      st(
        reg,
        this.ns.rdf("type"),
        this.ns.solid("TypeRegistration"),
        privateTypeIndex.doc()
      ),
      st(
        reg,
        this.ns.solid("forClass"),
        this.ns.meeting("LongChat"),
        privateTypeIndex.doc()
      ),
      st(reg, this.ns.solid("instance"), chatThing, privateTypeIndex.doc()),
    ];
    await new Promise((resolve, reject) => {
      this.store.updater.update([], ins, function (_uri, ok, errm) {
        if (!ok) {
          reject(new Error(errm));
        } else {
          resolve(null);
        }
      });
    });
  }

  private async findChat(invitee: NamedNode) {
    const me = await this.profile.loadMe();
    const podRoot = await this.profile.getPodRoot(me);
    const chatContainer = determineChatContainer(invitee, podRoot);
    let exists = true;
    try {
      await this.store.fetcher.load(
        new NamedNode(chatContainer.value + "index.ttl#this")
      );
    } catch (e) {
      exists = false;
    }
    return { me, chatContainer, exists };
  }

  private async createChatThing(
    chatContainer: NamedNode,
    me: NamedNode
  ): Promise<NamedNode> {
    const created = await this.mintNew({
      me,
      newBase: chatContainer.value,
    });
    return created.newInstance;
  }

  private mintNew(newPaneOptions: NewPaneOptions): Promise<CreatedPaneOptions> {
    const kb = this.store;
    const updater = kb.updater;
    if (newPaneOptions.me && !newPaneOptions.me.uri) {
      throw new Error("chat mintNew:  Invalid userid " + newPaneOptions.me);
    }

    const newInstance = (newPaneOptions.newInstance =
      newPaneOptions.newInstance ||
      kb.sym(newPaneOptions.newBase + CHAT_LOCATION_IN_CONTAINER));
    const newChatDoc = newInstance.doc();

    kb.add(
      newInstance,
      this.ns.rdf("type"),
      this.ns.meeting("LongChat"),
      newChatDoc
    );
    kb.add(newInstance, this.ns.dc("title"), "Chat channel", newChatDoc);
    kb.add(
      newInstance,
      this.ns.dc("created"),
      term<Node>(new Date(Date.now())),
      newChatDoc
    );
    if (newPaneOptions.me) {
      kb.add(newInstance, this.ns.dc("author"), newPaneOptions.me, newChatDoc);
    }

    return new Promise(function (resolve, reject) {
      updater.put(
        newChatDoc,
        kb.statementsMatching(undefined, undefined, undefined, newChatDoc),
        "text/turtle",
        function (uri2, ok, message) {
          if (ok) {
            resolve({
              ...newPaneOptions,
              newInstance,
            });
          } else {
            reject(
              new Error(
                "FAILED to save new chat channel at: " + uri2 + " : " + message
              )
            );
          }
        }
      );
    });
  }

  /**
   * Find (and optionally create) an individual chat between the current user and the given invitee
   * @param invitee - The person to chat with
   * @param createIfMissing - Whether the chat should be created, if missing
   * @returns null if missing, or a node referring to an already existing chat, or the newly created chat
   */
  async getChat(
    invitee: NamedNode,
    createIfMissing = true
  ): Promise<NamedNode | null> {
    const { me, chatContainer, exists } = await this.findChat(invitee);
    if (exists) {
      return new NamedNode(chatContainer.value + CHAT_LOCATION_IN_CONTAINER);
    }

    if (createIfMissing) {
      const chatThing = await this.createChatThing(chatContainer, me);
      await this.sendInvite(invitee, chatThing);
      await this.setAcl(chatContainer, me, invitee);
      await this.addToPrivateTypeIndex(chatThing, me);
      return chatThing;
    }
    return null;
  }

  private async sendInvite(invitee: NamedNode, chatThing: NamedNode) {
    await this.store.fetcher.load(invitee.doc());
    const inviteeInbox = this.store.any(
      invitee,
      this.ns.ldp("inbox"),
      undefined,
      invitee.doc()
    );
    if (!inviteeInbox) {
      throw new Error(`Invitee inbox not found! ${invitee.value}`);
    }
    const inviteBody = `
<> a <http://www.w3.org/ns/pim/meeting#LongChatInvite> ;
${this.ns.rdf("seeAlso")} <${chatThing.value}> .
  `;

    const inviteResponse = await this.store.fetcher.webOperation(
      "POST",
      inviteeInbox.value,
      {
        data: inviteBody,
        contentType: "text/turtle",
      }
    );
    const locationStr = inviteResponse.headers.get("location");
    if (!locationStr) {
      throw new Error(`Invite sending returned a ${inviteResponse.status}`);
    }
  }
}
