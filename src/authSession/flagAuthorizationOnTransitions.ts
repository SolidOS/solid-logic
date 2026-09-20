/**
 * Session transitions invalidate the store's cached HTTP authorization
 * metadata.
 *
 * `UpdateManager.editable()` is a synchronous read of the responses recorded
 * under `fetcher.appNode`. Those responses are not keyed by identity, so a
 * document fetched anonymously (before a restore completed) or under a
 * previous WebID keeps answering for the old identity: a writable document can
 * look read-only after login, and a read-only one can look writable after
 * logout.
 *
 * `UpdateManager.flagAuthorizationMetadata()` marks every recorded response
 * out-of-date, so `editable()` answers "unknown" instead of the previous
 * identity's access. It is wired HERE, once, subscribed to the session's
 * identity state — so it covers every transition whichever path noticed it (a
 * session event, a token update, a refocus resync, a cookie probe), rather
 * than whichever events a call site remembered to listen for.
 *
 * The repair is then a plain `load()`: rdflib refetches a document whose
 * recorded answers are ALL flagged (linkeddata/rdflib.js#871, in 2.4.1), which
 * is exactly the state a transition leaves behind — and `checkEditable()`
 * heals the same way. Nothing forces a fetch by hand any more.
 *
 * REQUIRES rdflib >= 2.4.1: on 2.4.0 `load()` answered such a document from
 * the cache, so the decision points below could not re-establish an answer.
 */

import * as debug from '../util/debug'
import { subscribeIdentity, type SessionLike } from './identityState'

export type TransitionStore = {
  updater?: { flagAuthorizationMetadata?: () => void }
}

export type AuthorizationStore = {
  fetcher?: { load?: (doc: unknown) => unknown }
  updater?: {
    editable?: (uri: unknown) => string | boolean | undefined
    flagAuthorizationMetadata?: () => void
  }
}

/**
 * Marks every recorded response out-of-date.
 *
 * @returns whether the store could be invalidated. A store without the API, or
 * one that throws, cannot be trusted afterwards — its answers stay definitive
 * for the previous identity until a later transition flags successfully.
 */
function invalidate (store: AuthorizationStore): boolean {
  try {
    const flag = store.updater?.flagAuthorizationMetadata
    if (typeof flag !== 'function') {
      throw new Error('flagAuthorizationMetadata is unavailable')
    }
    flag.call(store.updater)
    return true
  } catch (error) {
    debug.warn(`Could not flag authorization metadata: ${String(error)}`)
    return false
  }
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
  const onTransition = (): void => {
    const state = storeState(store)
    // Whose credentials a request would carry changed: every answer recorded
    // under the previous identity is suspect from here on.
    state.generation += 1
    state.invalidationFailed = !invalidate(store)
  }
  const subscription = subscribeIdentity(session, { onTransition })
  return () => subscription.unsubscribe()
}

type StoreAuthorizationState = {
  /** Identity transitions observed for this store. */
  generation: number
  /**
   * The store could not invalidate its metadata on the last transition, so a
   * definitive answer is not evidence that it is current.
   */
  invalidationFailed: boolean
}

// Scoped per store: two `createSolidLogic` instances with different sessions
// must not overtake each other's repairs, and a failed invalidation in one
// store says nothing about another.
const storeStates = new WeakMap<object, StoreAuthorizationState>()
const sharedState: StoreAuthorizationState = { generation: 0, invalidationFailed: false }

function storeState (store: unknown): StoreAuthorizationState {
  if (store === null || typeof store !== 'object') return sharedState
  let state = storeStates.get(store)
  if (!state) {
    state = { generation: 0, invalidationFailed: false }
    storeStates.set(store, state)
  }
  return state
}

/** How many times a repair is repeated when the identity keeps changing. */
const REPAIR_ATTEMPTS = 3

/**
 * Re-establishes `doc`'s answer under the current identity: mark every
 * recorded response out-of-date — including one recorded AFTER the transition,
 * which the transition's own flag could not have marked — and load, which
 * refetches a fully flagged document.
 *
 * Each attempt is stamped with the store's transition generation and repeated
 * when the identity changed under it: the response then belongs to the
 * previous identity and must not answer for the current one, or a caller could
 * write under the new identity on the old identity's authorization. If the
 * identity keeps changing, the answer stays "unknown" — never stale.
 *
 * Returns `undefined` whenever the answer cannot be established: no load
 * capability, an invalidation that failed (the recorded answers are still
 * definitive for the previous identity), a failed load, or an identity that
 * changed throughout every attempt.
 */
async function repairDocument (
  store: AuthorizationStore,
  doc: unknown
): Promise<string | boolean | undefined> {
  const state = storeState(store)
  const load = store.fetcher?.load
  if (typeof load !== 'function') return undefined
  for (let attempt = 0; attempt < REPAIR_ATTEMPTS; attempt++) {
    const generation = state.generation
    if (!invalidate(store)) return undefined
    state.invalidationFailed = false
    try {
      await load.call(store.fetcher, doc)
    } catch (error) {
      debug.warn(`Could not reload ${String(doc)}: ${String(error)}`)
      return undefined
    }
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
 * store answers `undefined` and is repaired here; a store whose invalidation
 * FAILED still answers definitively for the previous identity, so it is
 * repaired too (and keeps being repaired until a later transition flags
 * successfully, since the failure says nothing about which other documents are
 * stale).
 *
 * Returns whether the answer was established. `false` means a repair was
 * needed and could not complete: the caller must not consume cached triples
 * from that document and must not offer a write on it.
 */
export async function ensureDocumentAuthorization (
  store: AuthorizationStore,
  doc: unknown
): Promise<boolean> {
  const state = storeState(store)
  if (!state.invalidationFailed && store.updater?.editable?.(doc) !== undefined) {
    return true
  }
  return (await repairDocument(store, doc)) !== undefined
}

/**
 * Load a document and make sure its cached triples can be read under the
 * current identity. The load itself is generation-checked: a response begun
 * under the previous identity can be recorded AFTER
 * `flagAuthorizationMetadata()` ran (the flag only marks response nodes that
 * already existed), which leaves a definitive-looking answer from the old
 * identity behind — so an overtaken load is repaired instead of being trusted.
 *
 * Returns whether the document can be consumed (see
 * ensureDocumentAuthorization). Load errors propagate, as a plain `load()`
 * would.
 */
export async function loadAuthorizedDocument (
  store: AuthorizationStore,
  doc: unknown
): Promise<boolean> {
  const state = storeState(store)
  const generation = state.generation
  const load = store.fetcher?.load
  if (typeof load !== 'function') {
    // A plain load() would fail on a store with no fetcher: this call loads
    // `doc`, so it must not answer "consumed" after skipping the load.
    throw new Error('fetcher.load is unavailable')
  }
  await load.call(store.fetcher, doc)
  if (generation !== state.generation) {
    return (await repairDocument(store, doc)) !== undefined
  }
  return ensureDocumentAuthorization(store, doc)
}
