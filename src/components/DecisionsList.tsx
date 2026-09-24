import React from 'react';
import type { DecisionListing } from '../../server/decision/decision';
import type { StoredDecisions } from '../services/decisionPersistence';

/**
 * Stage 7 · CAP-12's decisions list.
 *
 * It reads `DecisionStore.listDecisions()` and nothing else. Not
 * `reviewHistory`, not a `ProductReview`, not a second array kept in step by
 * hand — this component does not know those exist, and the listing type it
 * renders carries no version contents for it to leak.
 *
 * The ordering is the store's: most recent activity first, tie-broken on the
 * decision id so two decisions from the same second do not swap places between
 * reads. Nothing is sorted again here, and no second ordering field exists.
 */

export const DECISIONS_LIST_TESTID = 'decisions-list';

const STATE_LABELS: Record<DecisionListing['state'], string> = {
  provisional: 'Provisional',
  awaiting_evidence: 'Awaiting evidence',
  waiting_on_a_check: 'Waiting on a check',
  failed: 'Did not complete',
};

/**
 * The state, as a word and a shape rather than a colour. AR-4: a PM who cannot
 * distinguish the two ambers still reads the sentence.
 */
function StateBadge({ state }: { state: DecisionListing['state'] }) {
  const tone =
    state === 'awaiting_evidence'
      ? 'border-amber-300 text-amber-800 dark:border-amber-900/70 dark:text-amber-300'
      : state === 'failed'
      ? 'border-rose-300 text-rose-800 dark:border-rose-900/70 dark:text-rose-300'
      : 'border-stone-300 text-stone-700 dark:border-stone-700 dark:text-stone-300';

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone}`}
    >
      {STATE_LABELS[state]}
    </span>
  );
}

function when(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return at.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function DecisionsList({
  state,
  onOpen,
  onStartNew,
}: {
  state: StoredDecisions | { status: 'loading' };
  onOpen: (id: string) => void;
  onStartNew: () => void;
}) {
  return (
    <section
      data-testid={DECISIONS_LIST_TESTID}
      className="max-w-3xl mx-auto px-4 sm:px-6 py-10"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
          Decisions
        </h1>
        <button
          type="button"
          onClick={onStartNew}
          className="text-sm text-stone-600 dark:text-stone-400 underline underline-offset-4 hover:text-stone-900 dark:hover:text-stone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-500 rounded-sm"
        >
          Make a new decision
        </button>
      </div>

      <p className="mt-2 text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
        Kept on this device only. Nothing here has been sent anywhere.
      </p>

      {/* §15: four states, each said plainly, and none of them pretending a
          model is running. Reading a local database is not deliberation. */}
      {state.status === 'loading' && (
        <p role="status" className="mt-8 text-sm text-stone-500 dark:text-stone-400">
          Reading the decisions kept on this device…
        </p>
      )}

      {state.status === 'error' && (
        <p
          role="status"
          className="mt-8 rounded-lg border border-stone-300 dark:border-stone-700 px-4 py-3 text-sm text-stone-700 dark:text-stone-300 leading-relaxed"
        >
          {state.userMessage}
        </p>
      )}

      {state.status === 'loaded' && state.listings.length === 0 && (
        <p className="mt-8 text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
          No decisions yet. One is kept here each time a deliberation reaches an outcome — a
          verdict, or a finding that the evidence cannot carry one.
        </p>
      )}

      {state.status === 'loaded' && state.listings.length > 0 && (
        <ul className="mt-8 border-t border-stone-200 dark:border-stone-800">
          {state.listings.map((listing) => (
            <li key={listing.id} className="border-b border-stone-200 dark:border-stone-800">
              {/*
                A button, so it is in the tab order, reachable with Enter and
                Space, and has an accessible name without an aria-label: the
                question is the name, which is also what CAP-12 asks the list
                to lead with.
              */}
              <button
                type="button"
                onClick={() => onOpen(listing.id)}
                className="w-full text-left py-4 px-1 group focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-stone-950 rounded-sm"
              >
                <span className="block text-[15px] font-medium text-stone-900 dark:text-stone-100 leading-snug group-hover:underline underline-offset-4">
                  {listing.decisionQuestion}
                </span>
                <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-stone-500 dark:text-stone-400">
                  <StateBadge state={listing.state} />
                  <span>Last activity {when(listing.lastActivityAt)}</span>
                  {listing.openLoops > 0 && (
                    <span>
                      {listing.openLoops} open {listing.openLoops === 1 ? 'check' : 'checks'}
                    </span>
                  )}
                  {listing.isSample && (
                    <span className="uppercase tracking-wider text-[10px] font-medium">Sample</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
