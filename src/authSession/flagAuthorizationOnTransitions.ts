/**
 * Session transitions invalidate the store's cached HTTP authorization
 * metadata.
 *
 * `UpdateManager.editable()` is a synchronous read of the responses recorded
 * under `fetcher.appNode`. Those responses are not keyed by identity, so a
 * document fetched anonymously (before a restore completed) or under a
 * previous WebID keeps answering for the old identity: a writable document
 * can look read-only after login, and a read-only one can look writable after
 * logout.
 *
 * `UpdateManager.flagAuthorizationMetadata()` marks every recorded response
 * out-of-date. `fetcher.load()` clears the mark for a document and re-fetches
 * it with the current credentials, so editability answers definitively again
 * on the next load. Call sites that need the answer immediately use the async
 * `UpdateManager.checkEditable()` instead.
 *
 * Wired here rather than in UI code so the invalidation happens where the
 * identity change is known, store-wide.
 */

// Every transition that can change whose credentials a request would carry.
// 'login'/'sessionRestore' are emitted by SolidAuthnLogic; 'logout' and
// 'sessionChange' by the transition watcher in authSession.ts.
export const SESSION_TRANSITIONS = ['login', 'sessionRestore', 'logout', 'sessionChange'] as const
export type SessionTransition = (typeof SESSION_TRANSITIONS)[number]

export type TransitionStore = {
  updater?: { flagAuthorizationMetadata?: () => void }
}

export type TransitionSession = {
  events?: { on?: (event: SessionTransition, handler: () => void) => void }
}

export function flagAuthorizationOnSessionTransitions (
  store: TransitionStore,
  session: TransitionSession
): void {
  const flag = (): void => {
    try {
      store.updater?.flagAuthorizationMetadata?.()
    } catch {
      // A store that cannot be reached must not take the session handling
      // with it — the next load still re-fetches.
    }
  }
  const events = session?.events
  if (!events || typeof events.on !== 'function') return
  for (const transition of SESSION_TRANSITIONS) {
    events.on(transition, flag)
  }
}
