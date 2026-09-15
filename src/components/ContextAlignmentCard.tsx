import React from 'react';
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  HelpCircle,
  Sparkles,
  Loader2,
  RefreshCw,
  GitCompare,
  User,
  Eye,
  Info,
  ArrowRight,
} from 'lucide-react';
import { ContextAlignment } from '../types';

export interface ContextAlignmentCardProps {
  hasArtifact: boolean;
  productContext: string;
  contextAlignment?: ContextAlignment | null;
  isComparingContext: boolean;
  comparisonError?: string | null;
  onCompareContext: () => void;
  onRetryComparison?: () => void;
  onFocusContextInput?: () => void;
}

export const ContextAlignmentCard: React.FC<ContextAlignmentCardProps> = ({
  hasArtifact,
  productContext,
  contextAlignment,
  isComparingContext,
  comparisonError,
  onCompareContext,
  onRetryComparison,
  onFocusContextInput,
}) => {
  // Determine precise Context Alignment status
  // Options: 'not_evaluated' | 'ready_to_compare' | 'comparing' | 'aligned' | 'partially_aligned' | 'conflict' | 'insufficient_evidence' | 'failed'
  const hasContextText = Boolean(productContext && productContext.trim().length > 0);

  let status:
    | 'not_evaluated'
    | 'ready_to_compare'
    | 'comparing'
    | 'aligned'
    | 'partially_aligned'
    | 'conflict'
    | 'insufficient_evidence'
    | 'failed';

  if (!hasArtifact) {
    status = 'not_evaluated';
  } else if (comparisonError && !isComparingContext) {
    status = 'failed';
  } else if (isComparingContext) {
    status = 'comparing';
  } else if (contextAlignment) {
    status = contextAlignment.status;
  } else if (hasContextText) {
    status = 'ready_to_compare';
  } else {
    status = 'not_evaluated';
  }

  // Status configuration mapping matching user requirement:
  // "Context alignment: Not evaluated | Ready to compare | Comparing | Aligned | Partially aligned | Conflict detected | Insufficient evidence | Failed — Retry"
  const statusBadgeConfig = {
    not_evaluated: {
      label: 'Not evaluated',
      badgeClass: 'bg-stone-200/70 dark:bg-stone-800 text-stone-600 dark:text-stone-400 border-stone-300 dark:border-stone-700',
      icon: <HelpCircle className="w-3.5 h-3.5 text-stone-500" />,
      headerBg: 'bg-stone-100/60 dark:bg-stone-900 border-stone-200 dark:border-stone-800',
    },
    ready_to_compare: {
      label: 'Ready to compare',
      badgeClass: 'bg-blue-100/80 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-800',
      icon: <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />,
      headerBg: 'bg-blue-50/50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900/60',
    },
    comparing: {
      label: 'Comparing',
      badgeClass: 'bg-amber-100/80 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800 animate-pulse',
      icon: <Loader2 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 animate-spin" />,
      headerBg: 'bg-amber-50/50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/60',
    },
    aligned: {
      label: 'Aligned',
      badgeClass: 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 font-semibold',
      icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />,
      headerBg: 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/50',
    },
    partially_aligned: {
      label: 'Partially aligned',
      badgeClass: 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800 font-semibold',
      icon: <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />,
      headerBg: 'bg-amber-50/40 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50',
    },
    conflict: {
      label: 'Conflict detected',
      badgeClass: 'bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800 font-semibold',
      icon: <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />,
      headerBg: 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/50',
    },
    insufficient_evidence: {
      label: 'Insufficient evidence',
      badgeClass: 'bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border-stone-300 dark:border-stone-700',
      icon: <HelpCircle className="w-3.5 h-3.5 text-stone-500" />,
      headerBg: 'bg-stone-100/60 dark:bg-stone-900 border-stone-200 dark:border-stone-800',
    },
    failed: {
      label: 'Failed — Retry',
      badgeClass: 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800 font-semibold',
      icon: <RefreshCw className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />,
      headerBg: 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/50',
    },
  };

  const currentBadge = statusBadgeConfig[status];

  return (
    <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 shadow-xs overflow-hidden transition-all">
      {/* Top Header Bar */}
      <div
        className={`px-5 py-3 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${currentBadge.headerBg}`}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-stone-200/80 dark:bg-stone-800 flex items-center justify-center text-stone-700 dark:text-stone-300">
            <GitCompare className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                Context Alignment
              </h3>
              <span className="text-[11px] text-stone-500 dark:text-stone-400 font-normal">
                (PM Context vs Screenshot Evidence)
              </span>
            </div>
            <p className="text-[11px] text-stone-500 dark:text-stone-400">
              Evaluates whether stated product purpose aligns with observable visual affordances.
            </p>
          </div>
        </div>

        {/* Status Badge */}
        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border ${currentBadge.badgeClass}`}
          >
            {currentBadge.icon}
            <span>{currentBadge.label}</span>
          </span>
        </div>
      </div>

      {/* Card Body */}
      <div className="p-5 space-y-4">
        {/* CASE 1: NOT EVALUATED (No PM context provided) */}
        {status === 'not_evaluated' && (
          <div className="p-4 rounded-lg bg-stone-50 dark:bg-stone-850/50 border border-stone-200/80 dark:border-stone-800 space-y-2">
            <div className="flex items-start gap-2.5">
              <Info className="w-4 h-4 text-stone-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-xs font-semibold text-stone-800 dark:text-stone-200">
                  Context alignment has not been evaluated
                </h4>
                <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
                  Because product context is optional, no comparison against the screenshot has been performed. Artifact analysis above remains complete and valid on its own.
                </p>
                <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed pt-1">
                  To evaluate alignment, provide product context in Step 1 above and click{' '}
                  <span className="font-medium text-stone-700 dark:text-stone-300">
                    "Compare Context with Gemini"
                  </span>
                  .
                </p>
              </div>
            </div>
            {onFocusContextInput && (
              <div className="pt-2 pl-6.5">
                <button
                  type="button"
                  onClick={onFocusContextInput}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 transition-colors cursor-pointer"
                >
                  <span>Add product context in Step 1</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* CASE 2: READY TO COMPARE (PM provided context, comparison not run yet) */}
        {status === 'ready_to_compare' && (
          <div className="p-4.5 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/80 dark:border-blue-900/40 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-xs font-semibold text-blue-900 dark:text-blue-200">
                  Product Context Ready for Comparison
                </h4>
                <p className="text-xs text-blue-800/80 dark:text-blue-300/80 mt-0.5">
                  You have entered product context. Click compare to ask Gemini to evaluate whether this description aligns with observable visual evidence.
                </p>
              </div>
              <button
                type="button"
                onClick={onCompareContext}
                disabled={isComparingContext || !hasArtifact}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:hover:bg-white dark:text-stone-900 transition-colors shrink-0 shadow-2xs cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Compare Context with Gemini</span>
              </button>
            </div>

            <div className="p-3 rounded-lg bg-white dark:bg-stone-900 border border-blue-200 dark:border-blue-900/60 space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] font-mono font-semibold uppercase tracking-wider text-blue-800 dark:text-blue-300">
                <User className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>Pending PM Context</span>
              </div>
              <p className="text-xs text-stone-800 dark:text-stone-200 font-medium italic leading-relaxed">
                “{productContext.trim()}”
              </p>
            </div>
          </div>
        )}

        {/* CASE 3: COMPARING IN PROGRESS */}
        {status === 'comparing' && (
          <div className="p-6 rounded-xl bg-amber-50/40 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-center space-y-3">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 mx-auto animate-pulse">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-stone-900 dark:text-stone-100">
                Comparing context with Gemini...
              </h4>
              <p className="text-xs text-stone-600 dark:text-stone-400 max-w-md mx-auto mt-1">
                Evaluating your stated product purpose against observable UI elements, navigation hierarchies, and interactive affordances.
              </p>
            </div>
          </div>
        )}

        {/* CASE 4: FAILED — RETRY */}
        {status === 'failed' && (
          <div className="p-4 rounded-xl bg-rose-50/60 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 flex items-start justify-between gap-3 text-xs text-rose-900 dark:text-rose-200">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Context comparison failed:</span>{' '}
                <span className="text-rose-800 dark:text-rose-300">
                  {comparisonError || 'Unable to evaluate alignment.'}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onRetryComparison || onCompareContext}
              className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded border border-rose-300 dark:border-rose-800 bg-white dark:bg-stone-900 text-rose-800 dark:text-rose-200 hover:bg-rose-50 dark:hover:bg-rose-950 shrink-0 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          </div>
        )}

        {/* CASE 5: EVALUATED ALIGNMENT (Aligned, Partially Aligned, Conflict, Insufficient Evidence) */}
        {hasArtifact && contextAlignment && status !== 'comparing' && (
          <div className="space-y-3.5">
            {/* Alignment Summary */}
            {contextAlignment.summary && (
              <div className="p-3.5 rounded-lg bg-stone-50 dark:bg-stone-850/60 border border-stone-200/80 dark:border-stone-800">
                <p className="text-xs text-stone-700 dark:text-stone-300 leading-relaxed font-medium">
                  {contextAlignment.summary}
                </p>
              </div>
            )}

            {/* Side-by-side comparison: PM provided vs Screenshot supports */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* What the PM Provided */}
              <div className="p-3.5 rounded-lg bg-stone-50 dark:bg-stone-850/40 border border-stone-200 dark:border-stone-800 space-y-1.5">
                <div className="flex items-center gap-1.5 text-[11px] font-mono font-semibold uppercase tracking-wider text-stone-600 dark:text-stone-400">
                  <User className="w-3.5 h-3.5 text-stone-500" />
                  <span>What the PM Provided</span>
                </div>
                <p className="text-xs text-stone-900 dark:text-stone-100 font-medium italic leading-relaxed">
                  “{contextAlignment.contextClaim}”
                </p>
              </div>

              {/* What the Screenshot Supports */}
              <div className="p-3.5 rounded-lg bg-stone-50 dark:bg-stone-850/40 border border-stone-200 dark:border-stone-800 space-y-1.5">
                <div className="flex items-center gap-1.5 text-[11px] font-mono font-semibold uppercase tracking-wider text-stone-600 dark:text-stone-400">
                  <Eye className="w-3.5 h-3.5 text-stone-500" />
                  <span>What the Screenshot Supports</span>
                </div>
                <p className="text-xs text-stone-800 dark:text-stone-200 leading-relaxed">
                  {contextAlignment.visualEvidence}
                </p>
              </div>
            </div>

            {/* Clarification Callout */}
            {contextAlignment.needsClarification ? (
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs">
                <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  <span className="font-semibold">Clarification Recommended:</span> Certain claims in the supplied context cannot be verified from the screenshot alone or conflict with observable UI elements. The jury will evaluate these as unverified premises.
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-900 dark:text-emerald-200 text-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>
                  <span className="font-semibold">Direct Alignment:</span> Observable interface elements directly substantiate the stated product context.
                </span>
              </div>
            )}

            {/* Re-compare option */}
            <div className="flex items-center justify-between pt-1 text-xs text-stone-500 dark:text-stone-400">
              <span>Comparison is grounded strictly in visible UI elements.</span>
              <button
                type="button"
                onClick={onCompareContext}
                disabled={isComparingContext}
                className="inline-flex items-center gap-1 text-xs font-medium text-stone-700 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Re-compare Context</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
