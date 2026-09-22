import React from 'react';
import { Scale } from 'lucide-react';
import { AnalysisProgressStep } from '../types';
import { RunProgress } from './RunOutcomeView';

/**
 * Stage 1 · The waiting surface, with the fabricated pipeline removed.
 *
 * PRD v1.1.1 NFR-4 ("no simulated progress"), TR-4, §51 never-7 ("claim a
 * model ran when it did not").
 *
 * What was here: a hardcoded list of five stages, each marked complete by a
 * 2,800 ms timer in reviewService, under the heading "Running server-side
 * specialist deliberation" and a footer reading "Real-time specialist
 * deliberation between UX Researcher, Product Strategist, Evidence Auditor and
 * Jury Decision Agent". None of it was read from the run. On a run where three
 * stages failed, all five still turned green.
 *
 * What is here: the steps the caller passes, which come from run state only,
 * and a sentence that is true of this build — the response is not streamed, so
 * during the request the honest thing to say is that it is running.
 */

interface AnalysisLoadingModalProps {
  isOpen: boolean;
  steps: AnalysisProgressStep[];
}

export const AnalysisLoadingModal: React.FC<AnalysisLoadingModalProps> = ({ isOpen, steps }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/70">
      <div
        role="status"
        aria-live="polite"
        className="w-full max-w-lg bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-2xl p-6 sm:p-8"
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 dark:bg-amber-400/10 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
            <Scale className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">
              Running the deliberation
            </h2>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Nothing is shown until the run finishes or fails.
            </p>
          </div>
        </div>

        <RunProgress steps={steps} />

        <p className="mt-5 pt-4 border-t border-stone-200 dark:border-stone-800 text-[11px] text-stone-500 dark:text-stone-400 leading-relaxed">
          This build returns the whole run at once rather than streaming it, so no stage is reported
          as finished until they all are. If a stage fails, the run stops and you are told which one.
        </p>
      </div>
    </div>
  );
};
