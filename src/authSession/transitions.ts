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
  emit: (event: 'logout' | 'sessionChange') => void,
  doc: DocumentLike | undefined = typeof document === 'undefined' ? undefined : document
): void {
  let previous = snapshotOf(session)
  const note = (): void => {
    const next = snapshotOf(session)
    const event = classifySessionTransition(previous, next)
    previous = next
    if (event) emit(event)
  }
  if (typeof session.addEventListener === 'function') {
    session.addEventListener('sessionStateChange', note)
  }
  watchTokenUpdates(session, note)
  if (doc && typeof doc.addEventListener === 'function') {
    doc.addEventListener('visibilitychange', () => {
      if (doc.visibilityState === 'visible') note()
    })
  }
}
