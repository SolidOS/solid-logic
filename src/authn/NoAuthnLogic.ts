import { AuthnLogic } from "./index";

/**
 * Fallback, if no auth client has been provided to solid-logic
 */
export class NoAuthnLogic implements AuthnLogic {
  constructor() {
    console.warn(
      "no auth client passed to solid-logic, logic that relies on auth is not available"
    );
  }

  currentUser(): null {
    return null;
  }
}
