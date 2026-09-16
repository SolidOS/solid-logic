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
 * out-of-date, so `editable()` answers "unknown" instead of the previous
 * identity's access.
 *
 * A document is repaired by a FORCE refresh, not by a plain load: on rdflib
 * 2.4.0 `fetcher.load()` looks recorded requests up with a NamedNode
 * (`kb.sym(docuri)`) while the fetcher records them as a string literal
 * (linkeddata/rdflib.js#427), finds nothing, keeps the out-of-date mark and
 * returns the cached copy — so neither `load()` nor the `checkEditable()`
 * that wraps it re-answers for an already-loaded document. `fetcher.refresh()`
 * sets `force: true, clearPreviousData: true` and records a fresh response;
 * `refreshDocumentAuthorization()` below wraps that for call sites that need
 * the answer immediately. (Once rdflib's `load` matches the literal form,
 * `checkEditable()` heals too.)
 *
 * Wired here rather than in UI code so the invalidation happens where the
 * identity change is known, store-wide.
 */

import * as debug from '../util/debug'

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
    const state = storeState(store)
    state.generation += 1
    try {
      store.updater?.flagAuthorizationMetadata?.()
      // Every recorded response is invalidated; decision points see that as
      // "unknown" and repair from there.
      state.refreshRequired = false
    } catch (error) {
      // The store could not invalidate its metadata, so its answers stay
      // definitive for the previous identity. Do not take the session
      // handling down with it, but do not treat the warning as recovery
      // either: record that a fresh response is required and have the
      // decision points honour it (ensureDocumentAuthorization below).
      state.refreshRequired = true
      debug.warn(`Could not flag authorization metadata after a session transition: ${error}`)
    }
  }
  const events = session?.events
  if (!events || typeof events.on !== 'function') return
  for (const transition of SESSION_TRANSITIONS) {
    events.on(transition, flag)
  }
}

export type RefreshableStore = {
  fetcher?: { refresh?: (doc: unknown, callback?: (...args: unknown[]) => void) => unknown }
  updater?: { editable?: (uri: unknown) => string | boolean | undefined }
}

type StoreAuthorizationState = {
  /** Identity transitions observed for this store. */
  generation: number
  /** The store could not invalidate its metadata — do not trust its answers. */
  refreshRequired: boolean
}

// Scoped per store: two `createSolidLogic` instances with different sessions
// must not overtake each other's refreshes, and a failed invalidation in one
// store says nothing about another.
const storeStates = new WeakMap<object, StoreAuthorizationState>()
const sharedState: StoreAuthorizationState = { generation: 0, refreshRequired: false }

function storeState (store: unknown): StoreAuthorizationState {
  if (store === null || typeof store !== 'object') return sharedState
  let state = storeStates.get(store)
  if (!state) {
    state = { generation: 0, refreshRequired: false }
    storeStates.set(store, state)
  }
  return state
}

/** How many times a refresh is repeated when the identity keeps changing. */
const REFRESH_ATTEMPTS = 3

/**
 * Force-refresh one document and answer its editability under the current
 * identity — the repair path for a flagged store (see above). It costs a
 * round-trip; decision points that need an immediate, correct answer use it.
 *
 * The identity can change while the refresh is in flight; the response then
 * belongs to the previous identity and must not answer for the current one,
 * or a caller could write under the new identity on the old identity's
 * authorization. Each attempt is stamped with the store's transition
 * generation and repeated under the new identity when it was overtaken; if
 * the identity keeps changing the answer stays "unknown" rather than stale.
 */
export async function refreshDocumentAuthorization (
  store: RefreshableStore,
  doc: unknown
): Promise<string | boolean | undefined> {
  const state = storeState(store)
  for (let attempt = 0; attempt < REFRESH_ATTEMPTS; attempt++) {
    const generation = state.generation
    await forceRefresh(store, doc)
    // The read below is synchronous, so a generation that still matches means
    // no transition slipped in between the response and the answer.
    if (generation === state.generation) {
      return store.updater?.editable?.(doc)
    }
  }
  return undefined
}

/**
 * Make the store able to answer for `doc` under the current identity before
 * its cached triples are read or its editability gates a write. A flagged
 * store answers `undefined` and is repaired here; a store whose flag FAILED
 * still answers definitively for the previous identity, so it is repaired
 * too (and keeps being repaired until a later transition flags successfully,
 * since the failure says nothing about which other documents are stale).
 */
export async function ensureDocumentAuthorization (
  store: RefreshableStore,
  doc: unknown
): Promise<void> {
  const state = storeState(store)
  if (state.refreshRequired || store.updater?.editable?.(doc) === undefined) {
    await refreshDocumentAuthorization(store, doc)
  }
}

/**
 * rdflib's `refresh(term, callback)` is callback-based and returns void —
 * it delegates to `nowOrWhenFetched(term, { force: true, clearPreviousData:
 * true }, callback)` and the callback is the completion signal. Awaiting the
 * call itself would read `editable()` before the fresh response is recorded,
 * so wait for the callback (a promise-returning wrapper is awaited too). A
 * failed refresh resolves anyway, with a warning: the answer stays unknown
 * and the caller decides.
 */
async function forceRefresh (store: RefreshableStore, doc: unknown): Promise<void> {
  const refresh = store.fetcher?.refresh
  if (typeof refresh !== 'function') return
  await new Promise<void>((resolve) => {
    let settled = false
    const done = (ok?: unknown, message?: unknown): void => {
      if (ok === false) {
        debug.warn(`Could not refresh ${String(doc)}: ${String(message)}`)
      }
      if (settled) return
      settled = true
      resolve()
    }
    try {
      const result = refresh.call(store.fetcher, doc, done)
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        void (result as Promise<unknown>).then(() => done(), (error) => done(false, error))
      }
    } catch (error) {
      debug.warn(`Could not refresh ${String(doc)}: ${String(error)}`)
      done()
    }
  })
}
