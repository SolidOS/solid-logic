import { NamedNode } from "rdflib";

export interface AuthnLogic {
  currentUser: () => NamedNode | null;
}
