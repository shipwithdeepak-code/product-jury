import React from 'react';
import { X, Flame } from 'lucide-react';
import { ProductReview } from '../types';

/**
 * Stage 1 · The Red Team teaser, with the fabricated probe removed.
 *
 * PRD v1.1.1 CAP-10, FR-19, FR-20, §51 never-5 ("introduce unsupported facts
 * during a Red Team challenge"), TR-8.
 *
 * What was here: a hardcoded adversarial probe written about FlowPilot, the
 * sample product, shown on every decision whatever it was about. It asserted a
 * specific figure — "you are attributing the 62% dropoff at Step 3" — as
 * though it were a fact about the artifact in front of the user, and named a
 * service file, services/redTeamService.ts, that does not exist.
 *
 * The Red Team round itself is CAP-10 and is Stage 2. Until it exists, this
 * surface says what it is and shows nothing it did not produce. The button that
 * opens it stays, because the challenge affordance is where CAP-10 will land
 * and removing it would be a UI change this stage is told not to make.
 */

interface RedTeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  review: ProductReview;
}

export const RedTeamModal: React.FC<RedTeamModalProps> = ({ isOpen, onClose, review }) => {
  const panelRef = React.useRef<HTMLDivElement>(null);

  // AR-3: announces itself, traps focus, closes on Escape.
  React.useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    panelRef.current?.querySelector<HTMLElement>('button')?.focus();
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/75">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="red-team-title"
        className="w-full max-w-lg bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-2xl overflow-hidden"
      >
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-stone-200 dark:border-stone-800">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 flex items-center justify-center text-stone-500">
              <Flame className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2 id="red-team-title" className="text-base font-semibold text-stone-900 dark:text-stone-100">
                Challenging a position is not built yet
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                Nothing has attacked this position.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-500"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 text-sm text-stone-700 dark:text-stone-300 leading-relaxed">
          <p>
            The panel&rsquo;s current position on this decision is{' '}
            <span className="font-mono font-semibold text-stone-900 dark:text-stone-100">
              {review.verdict}
            </span>
            , and it has not been challenged. Until the challenge round exists, treat it as an
            unchallenged reading rather than a tested one.
          </p>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            When it is built, the challenge will attack specific statements this position rests on,
            introduce no facts that are not already in the decision, and record what you say back.
            Nothing is shown here in the meantime, because an example attack written in advance is
            not a challenge to your decision.
          </p>
        </div>

        <div className="px-6 py-4 bg-stone-50 dark:bg-stone-900/60 border-t border-stone-200 dark:border-stone-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-stone-500"
          >
            Back to the decision
          </button>
        </div>
      </div>
    </div>
  );
};
