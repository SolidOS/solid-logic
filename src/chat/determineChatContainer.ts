import {NamedNode} from "rdflib";

export function determineChatContainer(invitee, podRoot) {
    // Create chat
    // See https://gitter.im/solid/chat-app?at=5f3c800f855be416a23ae74a
    const chatContainerStr = new URL(`IndividualChats/${new URL(invitee.value).host}/`, podRoot.value).toString()
    return new NamedNode(chatContainerStr)
}