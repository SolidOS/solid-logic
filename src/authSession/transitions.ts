/**
 * Session identity transitions.
 *
 * The uvdsl session announces a state change in this tab through its
 * `sessionStateChange` event. Three gaps are closed here:
 *
 *   - an identity that changes while the tab stays open (A -> B) is not a
 *     'logout' and would otherwise go unnoticed;
 *   - a login/logout made in ANOTHER TAB is not broadcast by the uvdsl
 *     SharedWorker (it only carries refresh results), and is therefore
 *     noticed when this tab is refocused;
 *   - uvdsl dispatches `sessionStateChange` only when `isActive` changes, so a
 *     WebID that changes while both states stay active (a worker
 *     TOKEN_DETAILS for another identity, e.g. a login made in another
 *     window) is caught by comparing the identity around `setTokenDetails`,
 *     the single entry point for token updates.
 *
 * It also reports `identityReplaced` when a session that HAD a WebID no longer
 * reports the same one, or no longer reports being active: that is the signal
 * for a consumer holding data fetched under the previous identity — it cannot
 * be re-validated document by document, so it should discard its cache
 * (reloading the page is the pragmatic form, see `reloadOnIdentityReplaced`).
 * Start-up and same-identity token refreshes are deliberately not replacements.
 *
 * Consumers invalidate identity-derived state on these events — see
 * flagAuthorizationOnTransitions.ts.
 */

export type SessionSnapshot = { isActive: boolean; webId?: string }

/**
 * Which legacy event a transition should emit:
 *   'logout'        — the session went from active to inactive;
 *   'sessionChange' — any other change of active state or WebID (a login here
 *                     is also announced as 'login' by SolidAuthnLogic; the
 *                     duplicate is harmless — consumers only invalidate);
 *   null            — nothing changed, so a refocused tab with the same
 *                     identity costs no event and no invalidation.
 */
export function classifySessionTransition (
  prev: SessionSnapshot,
  next: SessionSnapshot
): 'logout' | 'sessionChange' | null {
  if (prev.isActive !== next.isActive) return next.isActive ? 'sessionChange' : 'logout'
  return next.webId !== prev.webId ? 'sessionChange' : null
}

/**
 * Whether an established identity was replaced or cleared — a session that had
 * a WebID no longer reports the same one (A -> B), or no longer reports being
 * active (A -> logged out, A -> none). Data fetched under the previous
 * identity cannot be re-validated document by document, so this is the signal
 * to discard it.
 *
 * Start-up (no identity -> A) and a token refresh for the same identity are
 * not replacements: there is nothing of a previous user to drop.
 */
export function identityReplaced (prev: SessionSnapshot, next: SessionSnapshot): boolean {
  if (prev.webId === undefined) return false
  // Only the transition OUT of an ACTIVELY established identity is a
  // replacement: once the session has gone inactive (webId possibly retained),
  // the replacement was already reported — clearing the WebID afterwards or
  // logging in as someone else is not a second replacement.
  if (!prev.isActive) return false
  return next.webId !== prev.webId || !next.isActive
}

/**
 * Reload the page when the identity that was active in this tab is replaced or
 * cleared — the pragmatic way to drop everything fetched under the previous
 * identity (store, panes, editability), instead of repairing every read path.
 *
 * Consumer-side on purpose: navigation is an application decision (solid-ui,
 * mashlib), and tests inject their own action.
 */
export function reloadOnIdentityReplaced (
  events: { on?: (event: 'identityReplaced', handler: () => void) => void } | undefined,
  reload: () => void = () => {
    if (typeof window !== 'undefined') window.location.reload()
  }
): void {
  if (!events || typeof events.on !== 'function') return
  events.on('identityReplaced', reload)
}

export type SessionLike = {
  isActive?: boolean
  webId?: string
  addEventListener?: (type: string, listener: () => void) => void
  setTokenDetails?: (...args: unknown[]) => unknown
}

/**
 * Whether the session counts as active. `isActive` is authoritative — an
 * explicit `false` wins even when a WebID is still cached (a logout that has
 * not cleared it yet); the WebID only fills in an undefined state. Every
 * identity snapshot and the legacy `info` shape use this one rule.
 */
export const sessionIsActive = (session: SessionLike): boolean =>
  session.isActive === true || (session.isActive === undefined && Boolean(session.webId))

/**
 * Sessions whose backing store no longer holds a session (a cross-tab logout):
 * the local session object keeps reporting the previous identity, so every
 * consumer that reads it would keep answering for that user. Such a session is
 * marked here, which makes the transition watcher AND the derived reads
 * (`sessionExplicitlyInactive()`, `legacySessionInfo()`) report the cleared
 * state until the session reports an identity again.
 *
 * The mark is deliberately kept outside the session object: the library owns
 * its state, and clearing it there would also wipe the shared (per-origin)
 * session database that another tab may just have written.
 */
const clearedSessions = new WeakSet<object>()

/**
 * Whether a session was reported cleared: its backing store lost the session
 * while this tab still had one, so its identity no longer holds here.
 */
export function sessionWasCleared (session: unknown): boolean {
  return typeof session === 'object' && session !== null && clearedSessions.has(session)
}

/**
 * Whether the session explicitly reports itself inactive. An explicit `false`
 * — `isActive` on the session or `isLoggedIn` on the legacy `info` shape —
 * wins over a retained WebID: a partial logout that has not cleared the
 * cached WebID must not keep identifying the previous user. Consumers that
 * would otherwise act on the WebID alone (authenticated fetch, currentUser)
 * use this to stand down.
 */
export function sessionExplicitlyInactive (session: {
  isActive?: boolean
  info?: { isLoggedIn?: boolean }
}): boolean {
  // A session that was reported cleared (its backing store lost the session)
  // answers as logged out even though the local session object still carries
  // the previous identity — see sessionWasCleared().
  if (sessionWasCleared(session)) return true
  return session?.isActive === false || session?.info?.isLoggedIn === false
}

export type DocumentLike = {
  visibilityState?: string
  addEventListener?: (type: string, listener: () => void) => void
}

/** How long a refocus resync may delay the snapshot comparison. */
const RESYNC_TIMEOUT_MS = 2000

const snapshotOf = (session: SessionLike): SessionSnapshot => {
  // A session that was reported cleared answers as logged out until it
  // reports an identity again (see sessionWasCleared): the local object may
  // still carry the previous WebID.
  const cleared = sessionWasCleared(session)
  return {
    isActive: !cleared && sessionIsActive(session),
    webId: cleared ? undefined : session.webId
  }
}

// uvdsl's session announces only changes of `isActive`; a WebID can change
// while both states stay active and would go unseen (see the header). Every
// token update goes through `setTokenDetails`, so compare the identity around
// it. Wrapped once per session.
const wrapping = new WeakSet<object>()

function watchTokenUpdates (session: SessionLike, note: () => void): void {
  const original = session.setTokenDetails
  if (typeof original !== 'function' || wrapping.has(session)) return
  wrapping.add(session)
  session.setTokenDetails = (...args: unknown[]): unknown => {
    const before = snapshotOf(session)
    const changed = (): boolean => {
      const after = snapshotOf(session)
      return after.webId !== before.webId || after.isActive !== before.isActive
    }
    const result = original.apply(session, args)
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      return (result as Promise<unknown>).then((value) => {
        if (changed()) note()
        return value
      })
    }
    if (changed()) note()
    return result
  }
}

/**
 * Watch a session for identity transitions and report them through `emit`.
 * Attaches the in-tab state listener when the session supports it, and a
 * visibility listener (when a document exists) so a transition made in
 * another tab is caught on refocus — re-reading the session through `resync`
 * first, since the session may not push another tab's change.
 */
export function watchSessionTransitions (
  session: SessionLike,
  emit: (event: 'logout' | 'sessionChange' | 'identityReplaced') => void,
  doc: DocumentLike | undefined = typeof document === 'undefined' ? undefined : document,
  resync?: () => unknown
): void {
  let previous = snapshotOf(session)
  let clearedReported = false
  // Bumped whenever a transition is applied. A resync that started before such
  // a transition is answering about an older state and must not be applied: a
  // slow restore begun while A was active can resolve after B logged in, and
  // reporting that as 'cleared' would log out the identity that now owns the
  // session.
  let revision = 0
  // The newest resync attempt: an older attempt that answers after a newer
  // refocus started is superseded.
  let resyncAttempt = 0
  const note = (): void => {
    // The session reports an identity again: the cleared state is superseded,
    // so drop the mark before comparing (otherwise it would mask the new
    // identity and no login would ever be noticed again).
    if (sessionWasCleared(session) && sessionIsActive(session)) {
      clearedSessions.delete(session as object)
    }
    const next = snapshotOf(session)
    const event = classifySessionTransition(previous, next)
    const replaced = identityReplaced(previous, next)
    const moved = event !== null || replaced
    previous = next
    if (moved) {
      // The session moved on again: a later 'cleared' resync is a new fact, and
      // any resync that started before this transition is now stale.
      clearedReported = false
      revision += 1
    }
    if (event) emit(event)
    if (replaced) emit('identityReplaced')
  }
  // The backing store has no session while this tab still believes it is
  // signed in: report the logout and the replacement for the identity that was
  // active. Reported once per session state — a later refocus that still finds
  // no session must not repeat it.
  const reportCleared = (): void => {
    if (clearedReported) return
    clearedReported = true
    const wasActive = previous.isActive
    const wasEstablished = previous.webId !== undefined
    // The local session object still reports the old identity: mark it cleared
    // so the derived reads stop answering for it, and baseline the comparison
    // on that cleared state — a later activation is then a new login, and a
    // still-cleared session cannot report the logout twice.
    clearedSessions.add(session as object)
    previous = snapshotOf(session)
    revision += 1
    if (wasActive) emit('logout')
    if (wasActive && wasEstablished) emit('identityReplaced')
  }
  // A session that cannot receive another tab's change as a pushed event has
  // to be re-read before the snapshots are compared, or the change is simply
  // invisible here. The wait is bounded so a hung session cannot stall the
  // comparison — but the outcome is kept: a restore that only finishes later
  // can still report the session gone, and dropping it would leave this tab on
  // the old identity until some other visibility event.
  const syncThenNote = async (): Promise<void> => {
    if (typeof resync !== 'function') {
      note()
      return
    }
    const attemptId = ++resyncAttempt
    const baselineRevision = revision
    // This attempt's outcome only applies while it is still the newest one and
    // no transition was applied since it started.
    const stale = (): boolean => attemptId !== resyncAttempt || revision !== baselineRevision
    let outcome: unknown
    let done = false
    const attempt = Promise.resolve()
      .then(() => resync())
      .then(
        (value) => { outcome = value; done = true },
        () => { done = true } // compared as it stands
      )
    await Promise.race([
      attempt,
      new Promise<void>((resolve) => setTimeout(resolve, RESYNC_TIMEOUT_MS))
    ])
    if (done) {
      if (stale()) return
      if (outcome === 'cleared') reportCleared()
      else note()
      return
    }
    note()
    void attempt.then(() => {
      if (stale()) return
      // Whatever the slow resync answers is worth acting on: 'cleared' means
      // the session is gone, and any other result may have updated the session
      // (a cross-tab login) — comparing again is what turns that into
      // `sessionChange`/`identityReplaced` instead of leaving this tab on the
      // old identity until the next refocus.
      if (outcome === 'cleared') reportCleared()
      else note()
    })
  }
  if (typeof session.addEventListener === 'function') {
    session.addEventListener('sessionStateChange', note)
  }
  watchTokenUpdates(session, note)
  if (doc && typeof doc.addEventListener === 'function') {
    doc.addEventListener('visibilitychange', () => {
      if (doc.visibilityState === 'visible') void syncThenNote()
    })
  }
}
