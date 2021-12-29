import { NamedNode, sym } from "rdflib";
import { AuthnLogic } from "../index";
import { Session } from "@inrupt/solid-client-authn-browser";

/**
 * Implements AuthnLogic relying on solid-auth-client
 */
export class SolidAuthnLogic implements AuthnLogic {
  private session?: Session;

  constructor(solidAuthSession: Session) {
    this.session = solidAuthSession;
  }

  currentUser(): NamedNode | null {
    return this.session?.info.webId ? sym(this.session.info.webId) : null;
  }
}
