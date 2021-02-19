import {NamedNode, sym} from "rdflib";

export function newThing(doc): NamedNode {
    return sym(doc.uri + '#' + 'id' + ('' + Date.now()))
}
