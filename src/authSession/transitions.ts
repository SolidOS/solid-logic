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
  if (next.webId !== prev.webId) return true
  // The same WebID can be retained through a partial logout ({ isActive: false,
  // webId: A }): only the transition OUT of an active session is a
  // replacement, so a steady partial-logout snapshot does not report one —
  // and repeat one — on every refocus.
  return prev.isActive && !next.isActive
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
  return session?.isActive === false || session?.info?.isLoggedIn === false
}

export type DocumentLike = {
  visibilityState?: string
  addEventListener?: (type: string, listener: () => void) => void
}

const snapshotOf = (session: SessionLike): SessionSnapshot => ({
  isActive: sessionIsActive(session),
  webId: session.webId
})

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
 * another tab is caught on refocus.
 */
export function watchSessionTransitions (
  session: SessionLike,
  emit: (event: 'logout' | 'sessionChange' | 'identityReplaced') => void,
  doc: DocumentLike | undefined = typeof document === 'undefined' ? undefined : document,
  resync?: () => unknown
): void {
  let previous = snapshotOf(session)
  const note = (): void => {
    const next = snapshotOf(session)
    const event = classifySessionTransition(previous, next)
    const replaced = identityReplaced(previous, next)
    previous = next
    if (event) emit(event)
    if (replaced) emit('identityReplaced')
  }
  // A session that cannot receive another tab's change as a pushed event has
  // to be re-read before the snapshots are compared, or the change is simply
  // invisible here. Workers push it, so no resync is passed for them.
  const syncThenNote = async (): Promise<void> => {
    if (typeof resync === 'function') {
      try {
        await resync()
      } catch {
        // A session that cannot be re-read is compared as it stands.
      }
    }
    note()
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
