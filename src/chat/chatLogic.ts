import { NamedNode, Node, st, term } from 'rdflib'
import { ChatLogic, CreatedPaneOptions, NewPaneOptions, Chat } from '../types'
import { ns as namespace } from '../util/ns'
import { determineChatContainer, newThing } from '../util/utils'

const CHAT_LOCATION_IN_CONTAINER = 'index.ttl#this'

export function createChatLogic(store, profileLogic): ChatLogic {
    const ns = namespace

    async function setAcl(
        chatContainer: NamedNode,
        me: NamedNode,
        invitee: NamedNode
    ): Promise<void> {
        // Some servers don't present a Link http response header
        // if the container doesn't exist yet, so refetch the container
        // now that it has been created:
        await store.fetcher.load(chatContainer)

        // FIXME: check the Why value on this quad:
        const chatAclDoc = store.any(
            chatContainer,
            new NamedNode('http://www.iana.org/assignments/link-relations/acl')
        )
        if (!chatAclDoc) {
            throw new Error('Chat ACL doc not found!')
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
            `
        await store.fetcher.webOperation('PUT', chatAclDoc.value, {
            data: aclBody,
            contentType: 'text/turtle',
        })
    }

    async function addToPrivateTypeIndex(chatThing, me) {
        // Add to private type index
        const privateTypeIndex = store.any(
            me,
            ns.solid('privateTypeIndex')
        ) as NamedNode | null
        if (!privateTypeIndex) {
            throw new Error('Private type index not found!')
        }
        await store.fetcher.load(privateTypeIndex)
        const reg = newThing(privateTypeIndex)
        const ins = [
            st(
                reg,
                ns.rdf('type'),
                ns.solid('TypeRegistration'),
                privateTypeIndex.doc()
            ),
            st(
                reg,
                ns.solid('forClass'),
                ns.meeting('LongChat'),
                privateTypeIndex.doc()
            ),
            st(reg, ns.solid('instance'), chatThing, privateTypeIndex.doc()),
        ]
        await new Promise((resolve, reject) => {
            store.updater.update([], ins, function (_uri, ok, errm) {
                if (!ok) {
                    reject(new Error(errm))
                } else {
                    resolve(null)
                }
            })
        })
    }

    async function findChat(invitee: NamedNode): Promise<Chat> {
        const me = await profileLogic.loadMe()
        const podRoot = await profileLogic.getPodRoot(me)
        const chatContainer = determineChatContainer(invitee, podRoot)
        let exists = true
        try {
            await store.fetcher.load(
                new NamedNode(chatContainer.value + 'index.ttl#this')
            )
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (e) {
            exists = false
        }
        return { me, chatContainer, exists }
    }

    async function createChatThing(
        chatContainer: NamedNode,
        me: NamedNode
    ): Promise<NamedNode> {
        const created = await mintNew({
            me,
            newBase: chatContainer.value,
        })
        return created.newInstance
    }

    function mintNew(newPaneOptions: NewPaneOptions): Promise<CreatedPaneOptions> {
        const kb = store
        const updater = kb.updater
        if (newPaneOptions.me && !newPaneOptions.me.uri) {
            throw new Error('chat mintNew:  Invalid userid ' + newPaneOptions.me)
        }

        const newInstance = (newPaneOptions.newInstance =
            newPaneOptions.newInstance ||
            kb.sym(newPaneOptions.newBase + CHAT_LOCATION_IN_CONTAINER))
        const newChatDoc = newInstance.doc()

        kb.add(
            newInstance,
            ns.rdf('type'),
            ns.meeting('LongChat'),
            newChatDoc
        )
        kb.add(newInstance, ns.dc('title'), 'Chat channel', newChatDoc)
        kb.add(
            newInstance,
            ns.dc('created'),
            term<Node>(new Date(Date.now())),
            newChatDoc
        )
        if (newPaneOptions.me) {
            kb.add(newInstance, ns.dc('author'), newPaneOptions.me, newChatDoc)
        }

        return new Promise(function (resolve, reject) {
            updater?.put(
                newChatDoc,
                kb.statementsMatching(undefined, undefined, undefined, newChatDoc),
                'text/turtle',
                function (uri2, ok, message) {
                    if (ok) {
                        resolve({
                            ...newPaneOptions,
                            newInstance,
                        })
                    } else {
                        reject(
                            new Error(
                                'FAILED to save new chat channel at: ' + uri2 + ' : ' + message
                            )
                        )
                    }
                }
            )
        })
    }

    /**
     * Find (and optionally create) an individual chat between the current user and the given invitee
     * @param invitee - The person to chat with
     * @param createIfMissing - Whether the chat should be created, if missing
     * @returns null if missing, or a node referring to an already existing chat, or the newly created chat
     */
    async function getChat(
        invitee: NamedNode,
        createIfMissing = true
    ): Promise<NamedNode | null> {
        const { me, chatContainer, exists } = await findChat(invitee)
        if (exists) {
            return new NamedNode(chatContainer.value + CHAT_LOCATION_IN_CONTAINER)
        }

        if (createIfMissing) {
            const chatThing = await createChatThing(chatContainer, me)
            await sendInvite(invitee, chatThing)
            await setAcl(chatContainer, me, invitee)
            await addToPrivateTypeIndex(chatThing, me)
            return chatThing
        }
        return null
    }

    async function sendInvite(invitee: NamedNode, chatThing: NamedNode) {
        await store.fetcher.load(invitee.doc())
        const inviteeInbox = store.any(
            invitee,
            ns.ldp('inbox'),
            undefined,
            invitee.doc()
        )
        if (!inviteeInbox) {
            throw new Error(`Invitee inbox not found! ${invitee.value}`)
        }
        const inviteBody = `
        <> a <http://www.w3.org/ns/pim/meeting#LongChatInvite> ;
        ${ns.rdf('seeAlso')} <${chatThing.value}> .
        `

        const inviteResponse = await store.fetcher?.webOperation(
            'POST',
            inviteeInbox.value,
            {
                data: inviteBody,
                contentType: 'text/turtle',
            }
        )
        const locationStr = inviteResponse?.headers.get('location')
        if (!locationStr) {
            throw new Error(`Invite sending returned a ${inviteResponse?.status}`)
        }
    }
    return {
        setAcl, addToPrivateTypeIndex, findChat, createChatThing, getChat, sendInvite, mintNew
    }
}
