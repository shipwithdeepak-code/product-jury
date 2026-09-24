import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, HelpCircle, Pencil, Wand2 } from 'lucide-react';
import { DecisionQuestionOffer } from '../types';
import {
  EditDistanceBand,
  QUESTION_EXAMPLE,
  assessDecisionQuestion,
  editDistanceBand,
} from '../integrity/decisionQuestion';

/**
 * Stage 4 · CAP-04. The decision question, where the PM confirms it.
 *
 * PRD v1.1.1 CAP-04 (§21), FR-4, FR-4a, FR-4b.
 *
 * All eight of CAP-04's behaviours that have a surface are here and nowhere
 * else: the proposal is shown (1), it is editable (2), a weak or non-decision
 * question is flagged (3), the sharper alternative is offered whenever one is
 * flagged (4), and the PM can write their own when generation failed (5). The
 * remaining three — the question as the decision's identity, passed to every
 * later stage, answered by the verdict — are server-side and have no surface
 * of their own in this build.
 *
 * WHAT THIS COMPONENT NEVER DOES. It never composes a question. There is no
 * template here, nothing assembled out of the product name and the primary
 * goal, and no pre-filled sentence when the model produced none: the failure
 * path shows CAP-04's example *as an example*, beside an empty field, because
 * a sentence the PM did not write is not their decision question.
 *
 * It also never blocks on a weak question. CAP-04 says detect and offer; the
 * PM decides, and a PM who means the sentence they wrote keeps it.
 */

export interface DecisionQuestionCardProps {
  /** What the analyst step returned. `null` before an artifact has been read. */
  offer: DecisionQuestionOffer | null;
  /** The wording the PM has confirmed, if they have. */
  confirmed: string | null;
  /** CAP-04's primary action. The band is §56.1's edit-distance flag. */
  onConfirm: (question: string, band: EditDistanceBand) => void;
}

export const DecisionQuestionCard: React.FC<DecisionQuestionCardProps> = ({
  offer,
  confirmed,
  onConfirm,
}) => {
  const proposed = offer?.proposal?.question ?? null;
  const [draft, setDraft] = useState<string>(confirmed ?? proposed ?? '');
  const [isEditing, setIsEditing] = useState<boolean>(confirmed === null);

  /*
   * A new proposal belongs to a new artifact reading. It replaces the draft
   * rather than being appended beside it, because the previous draft was about
   * a different screen.
   */
  const lastProposed = useRef<string | null>(proposed);
  useEffect(() => {
    if (lastProposed.current === proposed) return;
    lastProposed.current = proposed;
    setDraft(proposed ?? '');
    setIsEditing(true);
  }, [proposed]);

  const assessment = assessDecisionQuestion(draft);
  const trimmed = draft.trim();

  /*
   * Behaviour 4. The sharper alternative is the product's own proposal — the
   * one sentence here that is decision-shaped and was read off the artifact's
   * statements. It is offered only when the PM's current text is flagged and
   * differs from it. When no proposal exists there is nothing sharper to
   * honestly offer, which is the case CAP-04's failure state covers with the
   * example below instead.
   */
  const sharperAlternative =
    !assessment.isDecisionShaped && proposed && proposed.trim() !== trimmed ? proposed : null;

  if (confirmed !== null && !isEditing) {
    return (
      <section className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-6 shadow-xs">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              <Check className="w-3.5 h-3.5" />
              <span>Decision question (confirmed)</span>
            </div>
            <p className="mt-2 text-base font-semibold text-stone-900 dark:text-stone-100">
              {confirmed}
            </p>
            <p className="mt-1.5 text-xs text-stone-500 dark:text-stone-400">
              Every part of the deliberation answers this, and the decision is filed under it.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setDraft(confirmed);
              setIsEditing(true);
            }}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
          >
            <Pencil className="w-3.5 h-3.5" />
            <span>Edit question</span>
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-6 shadow-xs space-y-4">
      <div>
        <div className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
          <HelpCircle className="w-3.5 h-3.5" />
          <span>Decision question</span>
        </div>
        <h2 className="text-base font-bold text-stone-900 dark:text-stone-100 mt-0.5">
          What are you deciding?
        </h2>
        <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
          {proposed
            ? 'Read from the statements above. Confirm it, edit it, or replace it with your own — the wording you confirm is the one the panel answers.'
            : 'The panel answers this question, so it has to be a call you are making rather than a request for an opinion.'}
        </p>
      </div>

      {/* CAP-04 failure state: the real reason, and an example. Never a
          manufactured question. */}
      {!proposed && offer?.unavailable && (
        <div className="p-3.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-xs text-amber-900 dark:text-amber-200 space-y-1.5">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-px" />
            <span>{offer.unavailable.userMessage}</span>
          </div>
          <p className="pl-6.5 text-amber-800/80 dark:text-amber-200/70">
            For example: <span className="font-medium">“{QUESTION_EXAMPLE}”</span>
          </p>
        </div>
      )}

      <textarea
        aria-label="Decision question"
        rows={2}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Should we …?"
        className="w-full px-3.5 py-2.5 text-sm bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700 rounded-lg text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-900 dark:focus:ring-stone-400 leading-relaxed"
      />

      {/* Behaviour 3, and behaviour 4 beside it. */}
      {trimmed.length > 0 && assessment.weakness && (
        <div className="p-3.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-xs text-amber-900 dark:text-amber-200 space-y-2.5">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-px" />
            <span>{assessment.weakness}</span>
          </div>
          {sharperAlternative && (
            <div className="pl-6.5 space-y-1.5">
              <p className="text-amber-800/80 dark:text-amber-200/70">
                A sharper one, read from this artifact:{' '}
                <span className="font-medium">“{sharperAlternative}”</span>
              </p>
              <button
                type="button"
                onClick={() => setDraft(sharperAlternative)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/40 dark:hover:bg-amber-900/60 text-amber-900 dark:text-amber-100 transition-colors cursor-pointer"
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span>Use this instead</span>
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-stone-400">
          {/* The product does not hold the PM to its own reading of the sentence. */}
          You can confirm this as it stands; the note above is an observation, not a gate.
        </p>
        <button
          type="button"
          disabled={trimmed.length === 0}
          onClick={() => onConfirm(trimmed, editDistanceBand(proposed, trimmed))}
          className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white shadow-2xs transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Check className="w-3.5 h-3.5" />
          <span>Confirm decision question</span>
        </button>
      </div>
    </section>
  );
};
