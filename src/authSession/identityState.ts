/**
 * One identity state per session.
 *
 * The session's identity is assembled from two sources — the OIDC session
 * itself and (on NSS localhost setups) a cookie-backed fallback — and is
 * observed by consumers that must invalidate what the previous identity
 * fetched. Doing that with independent flags and predicates per call site let
 * each new async path (a slow restore, a probe answering late, a refocus)
 * reintroduce the same class of bug, so the identity lives here, once:
 *
 * TEMPORARY, pending the uvdsl change: two mechanisms here exist only because
 * `@uvdsl/solid-oidc-client-browser` announces `sessionStateChange` when
 * `isActive` changes and nothing else — it does not report a WebID change that
 * keeps the session active, and it does not push a login/logout made in
 * another tab. Until it does (issue drafted), the cookie fallback is the only
 * way to see an NSS cookie identity change at all (see
 * `reportCookieIdentity`) and `watchTokenUpdates()` is the only way to see an
 * A -> B switch. Both are isolated here so they become a small deletion, not
 * a hunt, when uvdsl reports identity changes itself.
 *
 *   - `sessionIsActive()` is the single activity rule (`isActive` is
 *     authoritative, an explicit `false` wins over a cached WebID);
 *   - every observation (session event, token update, refocus resync, cookie
 *     probe result) is applied to ONE record, so a change is detected and
 *     reported once, whichever path noticed it;
 *   - the record carries a `version` (bumped when a transition is applied) and
 *     the newest refresh attempt, so an answer that belongs to an identity the
 *     session has since left — a restore started under Alice answering after
 *     Bob logged in — is dropped instead of being applied;
 *   - the transition is derived from the previous/next snapshots
 *     (`classifyTransition`, `identityReplaced`), not from flags: there is
 *     nothing to keep in sync, and an unchanged identity costs no event.
 *
 * Reported events (same vocabulary as before):
 *   'logout'            — the session went from active to inactive;
 *   'sessionChange'     — any other change of active state or WebID;
 *   'identityReplaced'  — an identity that WAS actively established is gone or
 *                         replaced, so data fetched under it must be dropped.
 * Start-up (none -> A) and a token refresh for the same identity are not
 * replacements.
 *
 * A session whose backing store no longer holds it (a cross-tab logout) is
 * marked `cleared` here: the local session object keeps reporting the previous
 * identity, so the mark is what makes the derived reads report logged out
 * until the session reports an identity again.
 *
 * DO NOT keep identity state anywhere else: `SolidAuthnLogic` reads it,
 * `authSession` publishes it (`info`, events) and `solidLogicSingleton`
 * decides from it whose credentials a request would carry.
 */

export type SessionLike = {
  isActive?: boolean
  webId?: string
  info?: { isLoggedIn?: boolean, webId?: string }
  addEventListener?: (type: string, listener: () => void) => void
  setTokenDetails?: (...args: unknown[]) => unknown
  restore?: () => Promise<unknown>
}

export type IdentityEvent = 'logout' | 'sessionChange' | 'identityReplaced'

/** The session's own view: what the raw session reports, cleared-aware. */
export type IdentitySnapshot = { isActive: boolean, webId?: string }

export type DocumentLike = {
  visibilityState?: string
  addEventListener?: (type: string, listener: () => void) => void
  removeEventListener?: (type: string, listener: () => void) => void
}

/**
 * Which legacy event a session transition should emit:
 *   'logout'        — the session went from active to inactive;
 *   'sessionChange' — any other change of active state or WebID (a login here
 *                     is also announced as 'login' by SolidAuthnLogic; the
 *                     duplicate is harmless — consumers only invalidate);
 *   null            — nothing changed, so a refocused tab with the same
 *                     identity costs no event and no invalidation.
 */
export function classifyTransition (
  prev: IdentitySnapshot,
  next: IdentitySnapshot
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
 * Only the transition OUT of an ACTIVELY established identity counts: once the
 * session has gone inactive (webId possibly retained), the replacement was
 * already reported — clearing the WebID afterwards or logging in as someone
 * else is not a second replacement.
 */
export function identityReplaced (prev: IdentitySnapshot, next: IdentitySnapshot): boolean {
  if (prev.webId === undefined) return false
  if (!prev.isActive) return false
  return next.webId !== prev.webId || !next.isActive
}

/**
 * Whether the session counts as active. `isActive` is authoritative — an
 * explicit `false` wins even when a WebID is still cached (a logout that has
 * not cleared it yet); the WebID only fills in an undefined state.
 */
export const sessionIsActive = (session: SessionLike): boolean =>
  session.isActive === true || (session.isActive === undefined && Boolean(session.webId))

/**
 * How long a refocus resync may delay the snapshot comparison.
 */
const RESYNC_TIMEOUT_MS = 2000

type Subscriber = {
  onEvent?: (event: IdentityEvent) => void
  /** The whole transition, once — for consumers that only invalidate. */
  onTransition?: (events: IdentityEvent[]) => void
  onRefocus?: () => void | Promise<void>
  resync?: () => unknown
}

type Attempt = {
  id: number
  /** The record version the attempt started from. */
  version: number
  /** The raw identity the attempt started from. */
  raw: { isActive: boolean, webId?: string }
  promise: Promise<unknown>
}

type Record = {
  session: SessionLike
  /** The last applied view of the session, cleared-aware. */
  raw: IdentitySnapshot
  /** The backing store no longer holds the session (a cross-tab logout). */
  cleared: boolean
  /** The cookie-probed identity, when the session does not own one. */
  cookieWebId: string | null
  /** Bumped whenever a session transition is applied. */
  version: number
  /** The newest resync attempt, or undefined when none is running. */
  attempt?: Attempt
  attemptId: number
  subscribers: Set<Subscriber>
  /** Whether the session state listener is attached (once per session). */
  listenerAttached: boolean
  /** Detaches the document listener when the last subscriber leaves. */
  detachDocument?: () => void
  /** Wrapped once per session, see watchTokenUpdates(). */
  watchingTokenUpdates: boolean
}

const records = new WeakMap<object, Record>()

// One restore at a time per session: `restore()` can mutate the session before
// it resolves, so two overlapping restores could write an older identity back
// over a newer one. Every caller (the refocus resync and `checkUser()`) goes
// through this lock, and one that arrives while a restore is in flight joins
// it instead of starting another.
const restoresInFlight = new WeakMap<object, Promise<unknown>>()

const recordOf = (session: SessionLike): Record | undefined => {
  if (typeof session !== 'object' || session === null) return undefined
  let record = records.get(session as object)
  if (!record) {
    record = {
      session,
      raw: { isActive: false },
      cleared: false,
      cookieWebId: null,
      version: 0,
      attemptId: 0,
      subscribers: new Set(),
      listenerAttached: false,
      watchingTokenUpdates: false
    }
    record.raw = snapshotOf(record)
    records.set(session as object, record)
  }
  return record
}

/**
 * Whether a session was reported cleared: its backing store lost the session
 * while this tab still had one, so its identity no longer holds here.
 */
export function sessionWasCleared (session: unknown): boolean {
  if (typeof session !== 'object' || session === null) return false
  return records.get(session as object)?.cleared === true
}

/**
 * Whether the session explicitly reports itself inactive. An explicit `false`
 * — `isActive` on the session or `isLoggedIn` on the legacy `info` shape —
 * wins over a retained WebID: a partial logout that has not cleared the cached
 * WebID must not keep identifying the previous user. Consumers that would
 * otherwise act on the WebID alone (authenticated fetch, currentUser) use this
 * to stand down.
 */
export function sessionExplicitlyInactive (session: SessionLike): boolean {
  if (sessionWasCleared(session)) return true
  return session?.isActive === false || session?.info?.isLoggedIn === false
}

/**
 * Whether the OIDC session currently owns the identity. A session that was
 * reported cleared does not, and neither does one that explicitly reports
 * itself logged out (a legacy shape that still carries a WebID would otherwise
 * pass `sessionIsActive()` alone).
 */
export function sessionOwnsIdentity (session: SessionLike): boolean {
  return !sessionExplicitlyInactive(session) && sessionIsActive(session)
}

/** The WebID the raw session publishes, or undefined when it owns none. */
export function sessionIdentityWebId (session: SessionLike): string | undefined {
  return sessionOwnsIdentity(session) ? session.webId : undefined
}

const snapshotOf = (record: Record): IdentitySnapshot => {
  // A cleared session answers as logged out until it reports an identity
  // again: the local session object may still carry the previous WebID.
  if (record.cleared) return { isActive: false }
  return { isActive: sessionIsActive(record.session), webId: record.session.webId }
}

/**
 * The identity a caller should act as: the session's own when it owns one, the
 * cookie-probed one when the session is inactive (or cleared) and a probe
 * established it, and undefined when neither does. This is the last word for
 * `currentUser()`, `info` consumers and the fetch bridge.
 */
export function effectiveIdentity (session: SessionLike): { webId?: string, source: 'none' | 'session' | 'cookie' } {
  const record = recordOf(session)
  if (!record) return { source: 'none' }
  if (sessionOwnsIdentity(session)) {
    return session.webId === undefined ? { source: 'none' } : { webId: session.webId, source: 'session' }
  }
  if (record.cookieWebId !== null) return { webId: record.cookieWebId, source: 'cookie' }
  // A session that only reports a logout keeps no identity — the retained
  // WebID must not be used (see sessionExplicitlyInactive).
  return { source: 'none' }
}

/**
 * The legacy `info` shape is session-derived and stays derived: callers
 * snapshot and restore it, so a retained value must never answer for the
 * session. `isLoggedIn` follows `sessionIsActive` — an explicit `isActive:
 * false` reports logged out even when a WebID is still cached, or the fetch
 * bridge would keep routing anonymous requests through the authenticated
 * fetch.
 */
export function legacySessionInfo (session: SessionLike): { webId?: string, isLoggedIn?: boolean } {
  if (sessionWasCleared(session)) return { webId: undefined, isLoggedIn: false }
  return { webId: session.webId, isLoggedIn: sessionIsActive(session) }
}

/**
 * Runs `session.restore()`, sharing an attempt that is already in flight.
 *
 * @returns the shared promise, or undefined when the session has no restore.
 */
export function restoreSession (session: SessionLike | undefined): Promise<unknown> | undefined {
  const restore = session?.restore
  if (typeof restore !== 'function' || typeof session !== 'object' || session === null) {
    return undefined
  }
  const key = session as object
  const inFlight = restoresInFlight.get(key)
  if (inFlight) return inFlight
  const started = Promise.resolve()
    .then(() => restore.call(session))
    .finally(() => { restoresInFlight.delete(key) })
  restoresInFlight.set(key, started)
  return started
}

/**
 * Reports one applied transition. `onEvent` receives each event separately
 * (the legacy vocabulary); `onTransition` receives the whole transition once,
 * so a consumer that only invalidates does not do its work twice when a
 * transition carries two events (a logout that also replaces the identity).
 *
 * Every subscriber's `onTransition` runs BEFORE any subscriber's `onEvent`:
 * a consumer that hears the event can rely on the transition having been
 * applied everywhere else (the store is already invalidated when the legacy
 * listeners run), instead of depending on the order subscriptions happened to
 * be created in.
 */
const deliver = (record: Record, events: IdentityEvent[]): void => {
  record.subscribers.forEach(subscriber => subscriber.onTransition?.(events))
  record.subscribers.forEach(subscriber => {
    events.forEach(event => subscriber.onEvent?.(event))
  })
}

/**
 * Re-reads the session and reports what changed since the last observation.
 * The cleared mark is dropped first when the session reports an identity
 * again, otherwise it would mask the new identity forever.
 */
function note (record: Record): void {
  if (record.cleared && sessionIsActive(record.session)) {
    record.cleared = false
  }
  // The session owns the identity again: a cookie identity remembered from
  // before it activated is stale — the probe only runs while the session is
  // inactive, and after a session logout the remembered cookie value must not
  // answer as if it had just been probed. Silent on purpose: the session
  // transition is what is reported, not this book-keeping.
  if (sessionOwnsIdentity(record.session)) record.cookieWebId = null
  const next = snapshotOf(record)
  const event = classifyTransition(record.raw, next)
  const replaced = identityReplaced(record.raw, next)
  const moved = event !== null || replaced
  record.raw = next
  if (!moved) return
  // The session moved on: an attempt that started before this transition is
  // answering about a state that no longer holds.
  record.version += 1
  const events: IdentityEvent[] = []
  if (event) events.push(event)
  if (replaced) events.push('identityReplaced')
  deliver(record, events)
}

/**
 * The backing store has no session while this tab still believes it is signed
 * in: report the logout and the replacement for the identity that was active,
 * once — a later refocus that still finds no session must not repeat it.
 */
function reportCleared (record: Record): void {
  if (record.cleared) return
  const wasActive = record.raw.isActive
  const wasEstablished = record.raw.webId !== undefined
  // Only a session that was actually in use has to be invalidated: an
  // anonymous tab is cleared already, and marking it would make snapshotOf()
  // report the cleared state — masking a later login until some other
  // observation happens to run.
  if (!wasActive || !wasEstablished) {
    record.raw = snapshotOf(record)
    if (wasActive) {
      record.version += 1
      deliver(record, ['logout'])
    }
    return
  }
  // The local session object still reports the old identity: the mark is what
  // makes the derived reads stop answering for it, and the cleared snapshot is
  // the baseline — a later activation is a new login, and a still-cleared
  // session cannot report the logout twice.
  record.cleared = true
  record.raw = snapshotOf(record)
  record.version += 1
  deliver(record, ['logout', 'identityReplaced'])
}

/**
 * Starts (or joins) the newest resync attempt. A caller that joins an attempt
 * in flight must judge its answer against the identity the ATTEMPT started
 * from, not the one it sees now — hence the baseline is stored with the
 * attempt.
 */
function startAttempt (record: Record, action: () => unknown): Attempt {
  if (record.attempt) return record.attempt
  const attempt: Attempt = {
    id: ++record.attemptId,
    version: record.version,
    raw: { isActive: sessionIsActive(record.session), webId: record.session.webId },
    promise: Promise.resolve()
      .then(action)
      .finally(() => { if (record.attempt === attempt) record.attempt = undefined })
  }
  record.attempt = attempt
  return attempt
}

/**
 * Re-reads the session through `resync` (when given) and reports the
 * transition, bounded by RESYNC_TIMEOUT_MS so a hung restore cannot stall a
 * refocus — but keeping the outcome: a restore that only finishes later can
 * still report the session gone, and dropping it would leave this tab on the
 * old identity until some other event.
 */
async function resyncThenNote (record: Record): Promise<void> {
  const resync = resyncActionOf(record)
  if (typeof resync !== 'function') {
    note(record)
    return
  }
  const runResync = resync
  const started = startAttempt(record, () => runResync())
  // This attempt's outcome only applies while it is still the newest one and no
  // transition was applied since the attempt (not this caller) started.
  const stale = (): boolean => started.id !== record.attemptId || record.version !== started.version
  // A `'cleared'` answer only applies while the session still reports the
  // identity the attempt started from: `restore()` rejects with "no session"
  // for the identity it was started for, so if the session reports a different
  // identity now, the answer is about the previous one and must not log the new
  // one out.
  const sameRawIdentity = (): boolean =>
    sessionIsActive(record.session) === started.raw.isActive && record.session.webId === started.raw.webId
  let outcome: unknown
  let done = false
  const attempt = started.promise.then(
    (value) => { outcome = value; done = true },
    () => { done = true } // compared as it stands
  )
  const apply = (): void => {
    if (stale()) return
    if (outcome === 'cleared') {
      if (sameRawIdentity()) reportCleared(record)
      return
    }
    // Any other result may have updated the session (a cross-tab login):
    // comparing again is what turns that into `sessionChange` /
    // `identityReplaced` instead of leaving this tab on the old identity.
    note(record)
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<void>((resolve) => { timer = setTimeout(resolve, RESYNC_TIMEOUT_MS) })
  try {
    await Promise.race([attempt, timeout])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
  if (done) {
    apply()
    return
  }
  note(record)
  void attempt.then(apply)
}

/**
 * The resync action lives with the subscriber that knows how to run it
 * (`authSession` maps a restore rejection to `'cleared'`); the module keeps
 * the newest one so a refocus started from any subscriber re-reads the
 * session.
 */
function resyncActionOf (record: Record): (() => unknown) | undefined {
  // Subscribers iterate in insertion order, so the last match is the newest.
  let newest: (() => unknown) | undefined
  for (const subscriber of record.subscribers) {
    if (subscriber.resync) newest = subscriber.resync
  }
  return newest
}

// uvdsl's session announces only changes of `isActive`; a WebID can change
// while both states stay active and would go unseen. Every token update goes
// through `setTokenDetails`, so compare the identity around it. Wrapped once
// per session.
//
// TEMPORARY, pending the uvdsl change: delete this wrapper when the library
// dispatches `sessionStateChange` for an active -> active WebID change too
// (see the module header). The state model does not depend on it: any
// observation path reports the same transition.
function watchTokenUpdates (record: Record): void {
  const session = record.session
  const original = session.setTokenDetails
  if (typeof original !== 'function' || record.watchingTokenUpdates) return
  record.watchingTokenUpdates = true
  session.setTokenDetails = (...args: unknown[]): unknown => {
    const before = snapshotOf(record)
    const changed = (): boolean => {
      const after = snapshotOf(record)
      return after.webId !== before.webId || after.isActive !== before.isActive
    }
    // Whatever the outcome — a token update can apply the new identity and
    // then fail (a failed persistence, for one) — the identity around the call
    // is what matters, so the change is reported and the failure passes on.
    let result: unknown
    try {
      result = original.apply(session, args)
    } catch (error) {
      if (changed()) note(record)
      throw error
    }
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      return (result as Promise<unknown>).then(
        (value: unknown) => {
          if (changed()) note(record)
          return value
        },
        (error: unknown) => {
          if (changed()) note(record)
          throw error
        }
      )
    }
    if (changed()) note(record)
    return result
  }
}

export type IdentitySubscription = {
  /**
   * Applies a cookie-probe result. Ignored once the subscription is released,
   * so a probe that answers after its owner was replaced cannot resurrect an
   * identity — and while the session owns the identity it must not be replaced
   * by a cookie one at all.
   */
  reportCookieIdentity: (webId: string | null) => void
  unsubscribe: () => void
}

/**
 * Observes the session for identity transitions, and for refocuses (one
 * document listener per session, removed when the last subscription is
 * released, so a replaced logic instance adds no second listener).
 *
 * `onEvent` receives the derived events; `onRefocus` runs on a refocus (the
 * cookie revalidation, in SolidAuthnLogic); `resync` re-reads the session
 * before the comparison (authSession owns it, because it knows that a restore
 * rejection means "no session").
 */
export function subscribeIdentity (
  session: SessionLike,
  options: Subscriber = {}
): IdentitySubscription {
  const record = recordOf(session)
  if (!record) {
    return { reportCookieIdentity: () => undefined, unsubscribe: () => undefined }
  }
  const subscriber: Subscriber = { ...options }
  record.subscribers.add(subscriber)
  if (!record.listenerAttached) {
    record.listenerAttached = true
    if (typeof session.addEventListener === 'function') {
      session.addEventListener('sessionStateChange', () => note(record))
    }
    watchTokenUpdates(record)
  }
  const doc: DocumentLike | undefined = typeof document === 'undefined' ? undefined : document
  if (record.subscribers.size === 1 && doc && typeof doc.addEventListener === 'function') {
    const handler = (): void => {
      if (doc.visibilityState !== 'visible') return
      // Wake up the session first; the cookie identity is invisible to it and
      // is revalidated in parallel by the subscriber that owns the probe.
      void resyncThenNote(record)
      record.subscribers.forEach(sub => { void sub.onRefocus?.() })
    }
    doc.addEventListener('visibilitychange', handler)
    record.detachDocument = () => doc.removeEventListener?.('visibilitychange', handler)
  }
  let released = false
  return {
    reportCookieIdentity: (webId: string | null): void => {
      if (released) return
      applyCookieIdentity(record, webId)
    },
    unsubscribe: (): void => {
      if (released) return
      released = true
      record.subscribers.delete(subscriber)
      if (record.subscribers.size === 0) {
        record.detachDocument?.()
        record.detachDocument = undefined
      }
    }
  }
}

/**
 * Applies a cookie-probe result to the record. Only cookie-backed changes are
 * reported: an OIDC identity change is already emitted by `note()`, and
 * reporting it again would duplicate the events — a reload consumer would
 * reload twice. While the session owns the identity a cookie one must not
 * replace it, and `sessionChange` is emitted only when it does not (an active
 * session already reported its own transition).
 */
function applyCookieIdentity (record: Record, webId: string | null): void {
  if (record.cookieWebId === webId) return
  // While the session owns the identity a cookie one must not replace it — a
  // probe only runs while the session is inactive for exactly that reason.
  if (sessionOwnsIdentity(record.session)) return
  const previousCookieBacked = record.cookieWebId !== null
  record.cookieWebId = webId
  // The replacement is owed whenever the identity being REPLACED was
  // cookie-backed — the session watcher could not see it. Adopting one is not
  // a replacement: there was nothing of a previous user to drop.
  const events: IdentityEvent[] = ['sessionChange']
  if (previousCookieBacked) events.push('identityReplaced')
  deliver(record, events)
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

/**
 * Re-reads the session and reports the transition, without a resync action
 * (a plain observation, used by tests and by callers that already know the
 * session was refreshed).
 */
export function observeSession (session: SessionLike): void {
  const record = recordOf(session)
  if (record) note(record)
}
