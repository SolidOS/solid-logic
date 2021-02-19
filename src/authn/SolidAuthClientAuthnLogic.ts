import {sym} from "rdflib";
import {AuthnLogic, Session} from "./index";

/**
 * Implements AuthnLogic relying on solid-auth-client
 */
export class SolidAuthClientAuthnLogic implements AuthnLogic {
    private session?: Session;

    constructor(solidAuthClient) {
        solidAuthClient.trackSession(session => {
            this.session = session
        })
    }

    currentUser() {
        return this.session?.webId ? sym(this.session?.webId) : null
    }
}