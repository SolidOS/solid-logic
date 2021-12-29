import { NamedNode, sym } from "rdflib";

export function newThing(doc: NamedNode): NamedNode {
  return sym(doc.uri + "#" + "id" + ("" + Date.now()));
}
