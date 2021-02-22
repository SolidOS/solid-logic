import { NamedNode, sym } from "rdflib";
import { SolidAuthClient } from "..";
import { AuthnLogic, Session } from "./index";

/**
 * Implements AuthnLogic relying on solid-auth-client
 */
export class SolidAuthClientAuthnLogic implements AuthnLogic {
  private session?: Session;

  constructor(solidAuthClient: SolidAuthClient) {
    solidAuthClient.trackSession((session) => {
      this.session = session;
    });
  }

  currentUser(): NamedNode | null {
    return this.session?.webId ? sym(this.session?.webId) : null;
  }
}
