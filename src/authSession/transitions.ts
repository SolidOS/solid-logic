/**
 * Session identity transitions.
 *
 * The uvdsl session announces a state change in this tab through its
 * `sessionStateChange` event. Two gaps are closed here:
 *
 *   - an identity that changes while the tab stays open (A -> B) is not a
 *     'logout' and would otherwise go unnoticed;
 *   - a login/logout made in ANOTHER TAB is not broadcast by the uvdsl
 *     SharedWorker (it only carries refresh results), and is therefore
 *     noticed when this tab is refocused.
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
}

export type DocumentLike = {
  visibilityState?: string
  addEventListener?: (type: string, listener: () => void) => void
}

const snapshotOf = (session: SessionLike): SessionSnapshot => ({
  isActive: session.isActive === true || Boolean(session.webId),
  webId: session.webId
})

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
  if (doc && typeof doc.addEventListener === 'function') {
    doc.addEventListener('visibilitychange', () => {
      if (doc.visibilityState === 'visible') note()
    })
  }
}
