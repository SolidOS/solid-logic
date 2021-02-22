import { NamedNode } from "rdflib";

export interface Session {
  webId: string;
}

export interface AuthnLogic {
  currentUser: () => NamedNode | null;
}
