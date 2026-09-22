import React from 'react';
import { X, History, ArrowRight, Clock, FileCheck, Database } from 'lucide-react';
import { ProductReview } from '../types';
import { verdictConfigs } from './VerdictBadge';
import { DELETION_DISCLOSURE } from '../integrity/disclosures';

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  reviews: ProductReview[];
  onSelectReview: (review: ProductReview) => void;
  /** PR-4: permanent deletion of everything this browser holds. */
  onDeleteEverything?: () => void;
  activeReviewId?: string;
}

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({
  isOpen,
  onClose,
  reviews,
  onSelectReview,
  onDeleteEverything,
  activeReviewId,
}) => {
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-stone-950/60 backdrop-blur-xs flex justify-end">
      <div className="w-full max-w-md bg-white dark:bg-stone-900 border-l border-stone-200 dark:border-stone-800 h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-5 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <History className="w-5 h-5 text-stone-500" />
            <div>
              <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                Review History
              </h3>
              <p className="text-xs text-stone-500">Evaluated decisions and verdicts</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/*
          Stage 1 \u00b7 PR-5 and \u00a749's storage risk.

          The previous text said persistent cloud sync "will be enabled in a
          later release", which implied a plan the product does not have and
          softened what is actually true. PR-5 asks for the limits of the
          storage to be stated plainly before they bite.
        */}
        <div className="p-3.5 mx-4 mt-4 rounded-lg bg-stone-50 dark:bg-stone-850 border border-stone-200 dark:border-stone-800 text-[11px] text-stone-600 dark:text-stone-400 flex items-start gap-2">
          <Database className="w-4 h-4 text-stone-400 shrink-0 mt-0.5" aria-hidden="true" />
          <p>
            <span className="font-semibold text-stone-700 dark:text-stone-300">Nothing is stored.</span>{' '}
            Decisions live in this page only. Reloading, closing the tab, or opening this on another
            device loses them, and there is no export yet.
          </p>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {reviews.length === 0 ? (
            <div className="text-center py-12 text-stone-400 text-xs">
              No saved reviews yet.
            </div>
          ) : (
            reviews.map((rev) => {
              const isActive = rev.id === activeReviewId;
              const config = verdictConfigs[rev.verdict];
              const dateStr = new Date(rev.timestamp).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <button
                  key={rev.id}
                  onClick={() => {
                    onSelectReview(rev);
                    onClose();
                  }}
                  className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                    isActive
                      ? 'border-stone-900 bg-stone-50 dark:border-stone-400 dark:bg-stone-800/80 shadow-xs'
                      : 'border-stone-200 dark:border-stone-800 hover:border-stone-400 dark:hover:border-stone-700 bg-white dark:bg-stone-900'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-xs text-stone-900 dark:text-stone-100 truncate pr-2">
                      {rev.context.name || 'Untitled Evaluation'}
                    </span>
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${config.bgClasses}`}
                    >
                      {rev.verdict}
                    </span>
                  </div>

                  <p className="text-[11px] text-stone-500 line-clamp-2 mb-2 leading-relaxed">
                    {rev.executiveSummary}
                  </p>

                  <div className="flex items-center justify-between text-[10px] text-stone-400 font-mono pt-2 border-t border-stone-100 dark:border-stone-800">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{dateStr}</span>
                    </div>
                    <div className="flex items-center gap-1 font-semibold text-stone-600 dark:text-stone-400">
                      <span>{rev.confidenceScore}% conf</span>
                      <ArrowRight className="w-3 h-3" />
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* PR-4 and TEL-9. */}
        {onDeleteEverything && (
          <div className="p-4 border-t border-stone-200 dark:border-stone-800">
            {confirmingDelete ? (
              <div className="space-y-2.5">
                <p className="text-[11px] text-stone-600 dark:text-stone-400 leading-relaxed">
                  {DELETION_DISCLOSURE}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteEverything();
                      setConfirmingDelete(false);
                      onClose();
                    }}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-rose-700 text-white hover:bg-rose-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-rose-500"
                  >
                    Delete everything
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-stone-500"
                  >
                    Keep them
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="text-xs font-medium text-stone-600 dark:text-stone-400 hover:text-rose-700 dark:hover:text-rose-400 underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-500 rounded"
              >
                Delete everything this browser holds
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
