import React from 'react';
import { AlertTriangle, HelpCircle, RotateCcw, ServerCrash, Scale } from 'lucide-react';
import { AnalysisProgressStep, FailedRun, InsufficientRun, RunProvenance } from '../types';

/**
 * Stage 1 · The two non-verdict outcomes, rendered differently.
 *
 * PRD v1.1.1 FR-41 ("INSUFFICIENT and FAILED are distinct states and render
 * differently"), TR-13, CAP-07 ("a surface with the same weight as a verdict —
 * not an error, not a warning"), CAP-18, §51 never-9.
 *
 * The two components below are deliberately built to look like different kinds
 * of thing, because that is the requirement:
 *
 *  - `InsufficientView` has a verdict's weight. Same container, same heading
 *    scale, same amber-on-stone treatment the verdict uses. It is an answer.
 *  - `FailureView` is an error. Rose, an error icon, a retry, and a sentence
 *    saying in as many words that nothing was judged.
 *
 * The sentence "this is not a statement about your evidence" is on the failure
 * surface on purpose. It is the one place a user could mistake a failure for a
 * refusal, and §51 calls that misreading the most serious defect the product
 * can have.
 */

export const FAILURE_TESTID = 'run-failed';
export const INSUFFICIENT_TESTID = 'run-insufficient';

function StageList({ provenance }: { provenance?: RunProvenance }) {
  if (!provenance || provenance.stages.length === 0) return null;

  return (
    <details className="mt-4 text-xs">
      <summary className="cursor-pointer text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-500 rounded">
        Which stages ran
      </summary>
      <ul className="mt-2 space-y-1.5 pl-1">
        {provenance.stages.map((stage) => (
          <li key={stage.stage} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="font-mono text-[11px] text-stone-700 dark:text-stone-300">{stage.stage}</span>
            <span
              className={
                stage.status === 'completed'
                  ? 'text-[11px] font-medium text-emerald-700 dark:text-emerald-400'
                  : stage.status === 'failed'
                  ? 'text-[11px] font-medium text-rose-700 dark:text-rose-400'
                  : 'text-[11px] font-medium text-stone-500 dark:text-stone-400'
              }
            >
              {stage.status === 'completed'
                ? 'ran'
                : stage.status === 'failed'
                ? 'failed'
                : 'did not run'}
            </span>
            {stage.modelId && (
              <span className="text-[11px] text-stone-500 dark:text-stone-400 font-mono">{stage.modelId}</span>
            )}
            {stage.reason && (
              <span className="text-[11px] text-stone-500 dark:text-stone-400 basis-full">{stage.reason}</span>
            )}
          </li>
        ))}
      </ul>
      {provenance.servedByUnevaluatedTier && (
        <p className="mt-3 text-[11px] text-stone-500 dark:text-stone-400 leading-relaxed">
          At least one stage was served by a model tier that has not been evaluated against a fixed
          case set, so the same inputs may not produce the same result.
        </p>
      )}
    </details>
  );
}

/**
 * FAILED. An error surface. Nothing here implies anything about the evidence.
 */
export function FailureView({
  failure,
  onRetry,
  onBackToWorkspace,
}: {
  failure: FailedRun;
  onRetry?: () => void;
  onBackToWorkspace?: () => void;
}) {
  return (
    <section
      data-testid={FAILURE_TESTID}
      role="alert"
      aria-live="assertive"
      className="max-w-2xl mx-auto px-4 sm:px-6 py-10"
    >
      <div className="rounded-2xl border border-rose-300 dark:border-rose-900 bg-rose-50/60 dark:bg-rose-950/20 p-6">
        <div className="flex items-start gap-3 mb-4">
          <ServerCrash className="w-6 h-6 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="text-[11px] font-mono uppercase tracking-wider text-rose-700 dark:text-rose-400 mb-1">
              Technical failure
            </p>
            <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
              Nothing was judged
            </h2>
          </div>
        </div>

        <p className="text-sm text-stone-700 dark:text-stone-200 leading-relaxed mb-3">
          {failure.message}
        </p>

        <p className="text-sm text-stone-600 dark:text-stone-300 leading-relaxed mb-4">
          This is a failure of the product, not a statement about your evidence. No verdict was
          produced, no confidence was calculated, and nothing was substituted for the stages that
          did not run.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {failure.retryable && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 hover:bg-stone-800 dark:hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-stone-500"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              Try again
            </button>
          )}
          {onBackToWorkspace && (
            <button
              type="button"
              onClick={onBackToWorkspace}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-stone-500"
            >
              Back to the workspace
            </button>
          )}
        </div>

        <p className="mt-4 text-[11px] font-mono text-stone-500 dark:text-stone-400">
          {failure.code}
          {failure.stage ? ` · ${failure.stage}` : ''}
        </p>

        <StageList provenance={failure.provenance} />
      </div>
    </section>
  );
}

/**
 * INSUFFICIENT. A verdict-weight surface, with the same container and scale the
 * verdict uses. CAP-07: "not an error, not a warning".
 *
 * Nothing in Stage 1 produces this in normal use, because the sufficiency gate
 * that emits it (CAP-18) is not built. It exists so that the state, its
 * rendering and its distinctness from failure are settled before the gate is
 * wired to anything.
 */
export function InsufficientView({
  refusal,
  onSupplyEvidence,
}: {
  refusal: InsufficientRun;
  onSupplyEvidence?: () => void;
}) {
  return (
    <section
      data-testid={INSUFFICIENT_TESTID}
      aria-live="polite"
      className="max-w-3xl mx-auto px-4 sm:px-6 py-10"
    >
      <div className="rounded-2xl border border-amber-300 dark:border-amber-900/70 bg-white dark:bg-stone-900 overflow-hidden">
        <div className="px-6 py-5 border-b border-amber-200 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-950/20">
          <div className="flex items-center gap-2.5 mb-2">
            <Scale className="w-5 h-5 text-amber-700 dark:text-amber-400" aria-hidden="true" />
            <p className="text-[11px] font-mono uppercase tracking-wider text-amber-800 dark:text-amber-400">
              Outcome &middot; refused at the {refusal.refusedAt === 'GATE' ? 'sufficiency gate' : 'evidence audit'}
            </p>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
            Not enough to judge this
          </h2>
          <p className="mt-2 text-sm text-stone-700 dark:text-stone-300 leading-relaxed">
            The panel ran and assessed the evidence. It cannot carry a defensible call on the
            question as asked. That is an answer, not a fault: a verdict here would have been
            fluent and unfounded.
          </p>
        </div>

        <div className="px-6 py-5">
          <h3 className="text-xs font-mono uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-3">
            What would unlock it
          </h3>
          <ul className="space-y-4">
            {refusal.missing.map((item, index) => (
              <li key={`${item.item}-${index}`} className="border-l-2 border-amber-400 dark:border-amber-700 pl-3.5">
                <p className="text-sm font-medium text-stone-900 dark:text-stone-100">{item.item}</p>
                <p className="mt-1 text-xs text-stone-600 dark:text-stone-300 leading-relaxed">
                  <span className="font-medium text-stone-700 dark:text-stone-200">Why it matters here:</span>{' '}
                  {item.whyItMatters}
                </p>
                <p className="mt-1 text-xs text-stone-600 dark:text-stone-300 leading-relaxed">
                  <span className="font-medium text-stone-700 dark:text-stone-200">Cheapest way to get it:</span>{' '}
                  {item.howToGetIt}
                </p>
              </li>
            ))}
          </ul>

          {onSupplyEvidence && (
            <button
              type="button"
              onClick={onSupplyEvidence}
              className="mt-5 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 hover:bg-stone-800 dark:hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-stone-500"
            >
              Supply one of these
            </button>
          )}

          <StageList provenance={refusal.provenance} />
        </div>
      </div>
    </section>
  );
}

/**
 * NFR-4. Stage state, drawn from run state only. There is no timer behind this
 * component and it never marks a stage complete on its own.
 */
export function RunProgress({ steps }: { steps: AnalysisProgressStep[] }) {
  if (steps.length === 0) return null;

  return (
    <ul className="space-y-2" aria-live="polite">
      {steps.map((step) => (
        <li key={step.id} className="flex items-start gap-2.5 text-xs">
          <span aria-hidden="true" className="mt-0.5">
            {step.status === 'completed' ? (
              <span className="text-emerald-600 dark:text-emerald-400">&#10003;</span>
            ) : step.status === 'failed' ? (
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
            ) : step.status === 'running' ? (
              <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
            ) : (
              <HelpCircle className="w-3.5 h-3.5 text-stone-400" />
            )}
          </span>
          <span className="flex-1">
            <span className="text-stone-800 dark:text-stone-200">{step.label}</span>
            {/* AR-4: state is never carried by colour alone. */}
            <span className="ml-2 text-[10px] font-mono uppercase tracking-wider text-stone-500 dark:text-stone-400">
              {step.status === 'completed'
                ? 'ran'
                : step.status === 'failed'
                ? 'failed'
                : step.status === 'running'
                ? 'running'
                : 'did not run'}
            </span>
            {step.reason && (
              <span className="block mt-0.5 text-[11px] text-stone-500 dark:text-stone-400 leading-relaxed">
                {step.reason}
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
