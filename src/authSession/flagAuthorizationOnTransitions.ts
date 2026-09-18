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
 * identity's access. It is wired HERE, once, subscribed to the session's
 * identity state — so it covers every transition whichever path noticed it
 * (a session event, a token update, a refocus resync, a cookie probe), rather
 * than whichever events a call site remembered to listen for.
 *
 * A document is repaired by a FORCE refresh — `fetcher.refresh()` sets
 * `force: true, clearPreviousData: true` and records a fresh response —
 * wrapped by `refreshDocumentAuthorization()` below for call sites that need
 * the answer immediately. On rdflib 2.4.0 a plain load cannot repair it:
 * `load()` looked the recorded request up as a NamedNode while the fetcher
 * records a string literal (linkeddata/rdflib.js#427) and answered from the
 * cache. From 2.4.1 `load()` matches the literal and refetches a document
 * whose recorded answers are all flagged, so `checkEditable()` heals too —
 * the force path stays because it is deterministic and works on both.
 */

import * as debug from '../util/debug'
import { subscribeIdentity, type SessionLike } from './identityState'

export type TransitionStore = {
  updater?: { flagAuthorizationMetadata?: () => void }
}

/**
 * Flags the store's authorization metadata on every identity transition.
 *
 * @returns the unsubscribe function — the caller owns the lifetime (it ends
 * with the session's subscription).
 */
export function flagAuthorizationOnSessionTransitions (
  store: TransitionStore,
  session: SessionLike
): () => void {
  const flag = (): void => {
    const state = storeState(store)
    state.generation += 1
    try {
      const invalidate = store.updater?.flagAuthorizationMetadata
      if (typeof invalidate !== 'function') {
        // A store without the API cannot be invalidated — that is a failure,
        // not a success: the decision points must not trust its answers.
        throw new Error('flagAuthorizationMetadata is unavailable')
      }
      invalidate.call(store.updater)
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
  // One call per applied transition (not per event: a logout that also
  // replaces the identity is one invalidation).
  const subscription = subscribeIdentity(session, { onTransition: () => flag() })
  return () => subscription.unsubscribe()
}

export type RefreshableStore = {
  fetcher?: {
    refresh?: (doc: unknown, callback?: (...args: unknown[]) => void) => unknown
    load?: (doc: unknown) => unknown
  }
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
 *
 * Returns `undefined` whenever the answer cannot be established under the
 * current identity: no refresh capability, a failed refresh, or an identity
 * that changed throughout every attempt. A failed refresh must NOT fall back
 * to the recorded answer — when the store could not be invalidated that
 * answer belongs to the previous identity.
 */
export async function refreshDocumentAuthorization (
  store: RefreshableStore,
  doc: unknown
): Promise<string | boolean | undefined> {
  const state = storeState(store)
  for (let attempt = 0; attempt < REFRESH_ATTEMPTS; attempt++) {
    const generation = state.generation
    const refreshed = await forceRefresh(store, doc)
    if (!refreshed) return undefined
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
 *
 * Returns whether the answer was established. `false` means a repair was
 * needed and could not complete (no refresh capability, a failed refresh, or
 * an identity that changed throughout): the caller must not consume cached
 * triples from that document and must not offer a write on it.
 */
export async function ensureDocumentAuthorization (
  store: RefreshableStore,
  doc: unknown
): Promise<boolean> {
  const state = storeState(store)
  if (!state.refreshRequired && store.updater?.editable?.(doc) !== undefined) {
    return true
  }
  return (await refreshDocumentAuthorization(store, doc)) !== undefined
}

/**
 * Load a document and make sure its cached triples can be read under the
 * current identity. The load itself is generation-checked: a response begun
 * under the previous identity can be recorded AFTER
 * `flagAuthorizationMetadata()` ran (the flag only marks response nodes that
 * already existed), which leaves a definitive-looking answer from the old
 * identity behind — so an overtaken load is force-refreshed instead of being
 * trusted.
 *
 * Returns whether the document can be consumed (see
 * ensureDocumentAuthorization). Load errors propagate, as a plain `load()`
 * would.
 */
export async function loadAuthorizedDocument (
  store: RefreshableStore,
  doc: unknown
): Promise<boolean> {
  const state = storeState(store)
  const generation = state.generation
  await store.fetcher?.load?.(doc)
  if (generation !== state.generation) {
    return (await refreshDocumentAuthorization(store, doc)) !== undefined
  }
  return ensureDocumentAuthorization(store, doc)
}

/**
 * rdflib's `refresh(term, callback)` is callback-based and returns void —
 * it delegates to `nowOrWhenFetched(term, { force: true, clearPreviousData:
 * true }, callback)` and the callback is the completion signal. Awaiting the
 * call itself would read `editable()` before the fresh response is recorded,
 * so wait for the callback (a promise-returning wrapper is awaited too).
 *
 * Resolves `true` only when a refresh actually completed; a missing refresh
 * capability, a callback that reports failure, a rejected promise or a
 * synchronous throw all resolve `false`, with a warning — the caller must not
 * read the recorded answer in that case.
 */
async function forceRefresh (store: RefreshableStore, doc: unknown): Promise<boolean> {
  const refresh = store.fetcher?.refresh
  if (typeof refresh !== 'function') return false
  return await new Promise<boolean>((resolve) => {
    let settled = false
    const done = (ok?: unknown, message?: unknown): void => {
      if (settled) return
      settled = true
      if (ok === false) {
        debug.warn(`Could not refresh ${String(doc)}: ${String(message)}`)
        resolve(false)
      } else {
        resolve(true)
      }
    }
    try {
      const result = refresh.call(store.fetcher, doc, done)
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        void (result as Promise<unknown>).then(() => done(), (error) => done(false, error))
      }
    } catch (error) {
      debug.warn(`Could not refresh ${String(doc)}: ${String(error)}`)
      done(false)
    }
  })
}
