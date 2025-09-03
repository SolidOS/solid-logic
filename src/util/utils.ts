import { NamedNode, sym } from 'rdflib'

export function newThing(doc: NamedNode): NamedNode {
    return sym(doc.uri + '#' + 'id' + ('' + Date.now()))
}

export function uniqueNodes (arr: NamedNode[]): NamedNode[] {
    const uris = arr.map(x => x.uri)
    const set = new Set(uris)
    const uris2 = Array.from(set)
    const arr2 = uris2.map(u => new NamedNode(u))
    return arr2 // Array.from(new Set(arr.map(x => x.uri))).map(u => sym(u))
}

export function getArchiveUrl(baseUrl: string, date: Date) {
    const year = date.getUTCFullYear()
    const month = ('0' + (date.getUTCMonth()+1)).slice(-2)
    const day = ('0' + (date.getUTCDate())).slice(-2)
    const parts = baseUrl.split('/')
    const filename = parts[parts.length -1 ]
    return new URL(`./archive/${year}/${month}/${day}/${filename}`, baseUrl).toString()
}

export function differentOrigin(doc): boolean {
    if (!doc) {
        return true
    }
    return (
        `${window.location.origin}/` !== new URL(doc.value).origin
    )
}

export function suggestPreferencesFile (me:NamedNode) {
    const stripped = me.uri.replace('/profile/', '/').replace('/public/', '/')
    // const stripped = me.uri.replace(\/[p|P]rofile/\g, '/').replace(\/[p|P]ublic/\g, '/')
    const folderURI = stripped.split('/').slice(0,-1).join('/') + '/Settings/'
    const fileURI = folderURI + 'Preferences.ttl'
    return sym(fileURI)
}

export function determineChatContainer(
    invitee: NamedNode,
    podRoot: NamedNode
): NamedNode {
    // Create chat
    // See https://gitter.im/solid/chat-app?at=5f3c800f855be416a23ae74a
    const chatContainerStr = new URL(
        `IndividualChats/${new URL(invitee.value).host}/`,
        podRoot.value
    ).toString()
    return new NamedNode(chatContainerStr)
}
