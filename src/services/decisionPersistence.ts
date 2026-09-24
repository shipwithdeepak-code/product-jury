import type { Decision } from '../types/decision';
import type { DecisionListing } from '../../server/decision/decision';
import { DecisionStorageError, type DecisionStore } from '../../server/decision/store';
import { IndexedDbDecisionStore } from '../storage/indexedDbDecisionStore';

/**
 * Stage 6 · CAP-12. The one place the application reaches the store.
 *
 * The rest of the app depends on `DecisionStore`, never on IndexedDB: this
 * module is where the browser's database is named, and it is the only one.
 * Swapping the adapter — for a server-backed store, for a test double — is a
 * change to `useStore` and to nothing else.
 *
 * WHY A PERSISTENCE FAILURE DOES NOT TOUCH THE RUN.
 *
 * §51 never-9 and TR-13 exist because a technical failure dressed as an
 * epistemic one is the worst defect this product can have. A browser that will
 * not keep a decision has said nothing about the evidence, so `persist` never
 * changes the outcome, never converts anything into FAILED or INSUFFICIENT,
 * and never throws into the run. It returns what the PM should be told, and
 * the PM is told it beside a verdict that is still perfectly good.
 *
 * What it does not do is swallow the failure silently. A decision the product
 * said it would keep and did not keep is exactly the thing CAP-12 calls out:
 * "If a decision cannot be kept, the product says so at the time."
 */

let store: DecisionStore | null = null;
let unavailable: DecisionStorageError | null = null;

/**
 * The process-wide store, built on first use.
 *
 * Built lazily because constructing it touches `indexedDB`, and a module that
 * touched it at import time could not be imported by anything that does not
 * have one.
 */
export function useStore(): DecisionStore {
  if (store) return store;
  if (unavailable) throw unavailable;
  try {
    store = new IndexedDbDecisionStore();
    return store;
  } catch (error) {
    // Remembered, so a browser with storage switched off is asked once rather
    // than on every run.
    unavailable = error instanceof DecisionStorageError
      ? error
      : new DecisionStorageError('STORAGE_UNAVAILABLE', 'the store could not be built', { cause: error });
    throw unavailable;
  }
}

/** Test and reset use. Not called by the application. */
export function setStoreForTests(replacement: DecisionStore | null): void {
  store = replacement;
  unavailable = null;
}

export interface PersistResult {
  stored: boolean;
  /**
   * What to tell the PM when it was not stored. Always a sentence from the
   * storage taxonomy, never a DOMException, a quota figure or a stack.
   */
  userMessage?: string;
}

/**
 * Keep the canonical Decision. The run's own result is not an argument here,
 * and cannot be affected by what happens.
 */
export async function persistDecision(decision: Decision): Promise<PersistResult> {
  try {
    const existing = await useStore().getDecision(decision.id);
    if (existing) {
      await useStore().saveDecision(decision);
    } else {
      await useStore().createDecision(decision);
    }
    return { stored: true };
  } catch (error) {
    if (error instanceof DecisionStorageError) {
      console.error(`[storage] ${error.code}`, error.cause ?? error);
      return { stored: false, userMessage: error.userMessage };
    }
    console.error('[storage] the decision could not be kept', error);
    return {
      stored: false,
      userMessage:
        'This decision could not be kept on this device. What is on screen is unaffected, and ' +
        'nothing was changed in storage.',
    };
  }
}

/**
 * Stage 7 · What the Decisions surface asks for, and what it can be told.
 *
 * Four states, named, because §15 asks for four and because a surface that
 * cannot tell "not there" from "would not open" ends up showing an empty
 * decision for both.
 */
export type StoredDecisions =
  | { status: 'loaded'; listings: DecisionListing[] }
  | { status: 'error'; userMessage: string };

export type StoredDecision =
  | { status: 'loaded'; decision: Decision }
  | { status: 'not_found' }
  | { status: 'error'; userMessage: string };

function storageMessage(error: unknown): string {
  if (error instanceof DecisionStorageError) {
    console.error(`[storage] ${error.code}`, error.cause ?? error);
    return error.userMessage;
  }
  console.error('[storage] the decision store could not be read', error);
  return (
    'The decisions kept on this device could not be read. Nothing has been changed or removed.'
  );
}

/** CAP-12's question-first list, from the store and from nowhere else. */
export async function listStoredDecisions(): Promise<StoredDecisions> {
  try {
    return { status: 'loaded', listings: await useStore().listDecisions() };
  } catch (error) {
    return { status: 'error', userMessage: storageMessage(error) };
  }
}

/**
 * One stored decision.
 *
 * `not_found` and `error` are different answers and stay different: a decision
 * that was deleted is not a decision that would not open, and the second is
 * not allowed to read as the first — a corrupt record must not look like an
 * absent one, or the PM would conclude they had lost something they still
 * have.
 */
export async function openStoredDecision(id: string): Promise<StoredDecision> {
  try {
    const decision = await useStore().getDecision(id);
    return decision ? { status: 'loaded', decision } : { status: 'not_found' };
  } catch (error) {
    return { status: 'error', userMessage: storageMessage(error) };
  }
}
