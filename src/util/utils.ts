import { NamedNode, sym } from "rdflib";

export function newThing(doc: NamedNode): NamedNode {
    return sym(doc.uri + "#" + "id" + ("" + Date.now()));
}

export function uniqueNodes (arr: NamedNode[]): NamedNode[] {
    const uris = arr.map(x => x.uri)
    const set = new Set(uris)
    const uris2 = Array.from(set)
    const arr2 = uris2.map(u => new NamedNode(u))
    return arr2 // Array.from(new Set(arr.map(x => x.uri))).map(u => sym(u))
}

export function getArchiveUrl(baseUrl: string, date: Date) {
    const year = date.getUTCFullYear();
    const month = ('0' + (date.getUTCMonth()+1)).slice(-2);
    const day = ('0' + (date.getUTCDate())).slice(-2);
    const parts = baseUrl.split('/');
    const filename = parts[parts.length -1 ];
    return new URL(`./archive/${year}/${month}/${day}/${filename}`, baseUrl).toString();
}
