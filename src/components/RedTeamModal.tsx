import React, { useState } from 'react';
import {
  X,
  ShieldAlert,
  Flame,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  HelpCircle,
  AlertTriangle,
} from 'lucide-react';
import { ProductReview } from '../types';

interface RedTeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  review: ProductReview;
}

export const RedTeamModal: React.FC<RedTeamModalProps> = ({
  isOpen,
  onClose,
  review,
}) => {
  const [simulatedAttack, setSimulatedAttack] = useState<boolean>(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/75 backdrop-blur-xs">
      <div className="w-full max-w-2xl bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-850">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-rose-100 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 flex items-center justify-center text-rose-700 dark:text-rose-400">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-stone-900 dark:text-stone-100">
                  Challenge This Decision (Red Team)
                </h3>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 font-medium">
                  COMING IN V1.1
                </span>
              </div>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Adversarial AI agent designed to stress-test your decision defense.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 hover:bg-stone-200 dark:hover:bg-stone-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          <div className="p-4 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50">
            <h4 className="text-xs font-mono font-semibold uppercase tracking-wider text-rose-900 dark:text-rose-300 mb-1">
              Current Jury Verdict Under Challenge:
            </h4>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-sm font-bold text-stone-900 dark:text-stone-100">
                {review.verdict}
              </span>
              <span className="text-xs text-stone-600 dark:text-stone-400">
                — {review.executiveSummary.slice(0, 140)}...
              </span>
            </div>
          </div>

          <div className="space-y-3 text-xs text-stone-600 dark:text-stone-300 leading-relaxed">
            <p className="font-medium text-stone-900 dark:text-stone-100">
              What will the Red Team Agent do in the next version?
            </p>
            <ul className="space-y-2 list-disc pl-4">
              <li>
                <strong className="text-stone-800 dark:text-stone-200">Adversarial Devil&apos;s Advocate:</strong> The agent acts as an aggressive executive or skeptical board member questioning whether this is friction or poor acquisition quality.
              </li>
              <li>
                <strong className="text-stone-800 dark:text-stone-200">Assumption Hunting:</strong> Flags premises tagged as <span className="font-mono font-semibold text-amber-700 dark:text-amber-400">ASSUMPTION</span> and generates counter-hypotheses.
              </li>
              <li>
                <strong className="text-stone-800 dark:text-stone-200">Blind Spot Synthesis:</strong> Exposes what happens if your proposed usability fix succeeds on UX metrics but fails on business LTV.
              </li>
            </ul>
          </div>

          {/* Simulated Red Team Teaser */}
          <div className="p-4 rounded-xl bg-stone-50 dark:bg-stone-850 border border-stone-200 dark:border-stone-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-rose-600" />
                Sample Red Team Challenge for FlowPilot:
              </span>
              <button
                type="button"
                onClick={() => setSimulatedAttack(!simulatedAttack)}
                className="text-[11px] font-mono text-stone-500 hover:text-stone-900 dark:hover:text-stone-200 underline"
              >
                {simulatedAttack ? 'Hide probe' : 'Preview probe'}
              </button>
            </div>

            {simulatedAttack ? (
              <div className="mt-3 p-3 rounded bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-xs text-stone-700 dark:text-stone-300 space-y-2 font-mono">
                <div className="text-rose-600 dark:text-rose-400 font-semibold">
                  [RED TEAM PROBE #1] False Attribution Trap
                </div>
                <p className="leading-relaxed">
                  &ldquo;You are attributing the 62% dropoff at Step 3 to UX friction. What if your top-of-funnel acquisition is attracting unqualified hobbyist users who never had CRM admin rights in the first place? If you hide the schema mapping behind a dummy sandbox, you might inflate initial test activations while tanking day-30 paid conversion. Defend why schema gating isn&apos;t actually your best qualification filter.&rdquo;
                </p>
              </div>
            ) : (
              <p className="text-[11px] text-stone-500 dark:text-stone-400">
                Click &ldquo;Preview probe&rdquo; to view a sample adversarial critique designed to probe decision blind spots.
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-stone-50 dark:bg-stone-850 border-t border-stone-200 dark:border-stone-800 flex items-center justify-between">
          <span className="text-[11px] text-stone-500 dark:text-stone-400">
            Orchestration hook: <code className="font-mono text-stone-700 dark:text-stone-300">services/redTeamService.ts</code>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white rounded-lg transition-colors"
          >
            Got it, Return to Review
          </button>
        </div>
      </div>
    </div>
  );
};
