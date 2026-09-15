import React from 'react';
import { CheckCircle2, Loader2, Circle, Scale, Sparkles } from 'lucide-react';
import { AnalysisProgressStep } from '../types';

interface AnalysisLoadingModalProps {
  isOpen: boolean;
  currentStep?: AnalysisProgressStep;
}

const defaultSteps = [
  { id: '1', label: 'Analyzing product context, user goals & visual layout' },
  { id: '2', label: 'Consulting specialist panel (UX Researcher, PM, Design Critic)' },
  { id: '3', label: 'Classifying epistemic evidence (FACT / INFERENCE / ASSUMPTION / UNKNOWN)' },
  { id: '4', label: 'Mapping points of consensus vs. strategic disagreement' },
  { id: '5', label: 'Synthesizing Verdict & actionable PM decision defense' },
];

export const AnalysisLoadingModal: React.FC<AnalysisLoadingModalProps> = ({
  isOpen,
  currentStep,
}) => {
  if (!isOpen) return null;

  const currentStepIndex = currentStep
    ? defaultSteps.findIndex((s) => s.id === currentStep.id)
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/70 backdrop-blur-xs transition-opacity">
      <div className="w-full max-w-lg bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-2xl p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 dark:bg-amber-400/10 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
            <Scale className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-stone-900 dark:text-stone-100">
                Convening Product Jury
              </h3>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-medium">
                MOCK PIPELINE
              </span>
            </div>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Running multi-agent analysis & cross-specialist evaluation...
            </p>
          </div>
        </div>

        {/* Steps sequence */}
        <div className="space-y-3.5 mb-6">
          {defaultSteps.map((step, idx) => {
            const isCompleted = idx < currentStepIndex || (currentStep?.id === step.id && currentStep?.status === 'completed');
            const isActive = idx === currentStepIndex && currentStep?.status !== 'completed';
            const isPending = idx > currentStepIndex;

            return (
              <div
                key={step.id}
                className={`flex items-start gap-3 p-2.5 rounded-lg text-xs transition-colors ${
                  isActive
                    ? 'bg-stone-100 dark:bg-stone-800/80 text-stone-900 dark:text-stone-100 font-medium border border-stone-200 dark:border-stone-700'
                    : isCompleted
                    ? 'text-stone-700 dark:text-stone-300'
                    : 'text-stone-400 dark:text-stone-600 opacity-60'
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {isCompleted ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : isActive ? (
                    <Loader2 className="w-4 h-4 text-amber-600 dark:text-amber-400 animate-spin" />
                  ) : (
                    <Circle className="w-4 h-4 text-stone-300 dark:text-stone-700" />
                  )}
                </div>
                <div className="flex-1 leading-snug">
                  <span>{step.label}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer info */}
        <div className="p-3 rounded-lg bg-stone-50 dark:bg-stone-800/40 border border-stone-200/80 dark:border-stone-800 text-[11px] text-stone-500 dark:text-stone-400 flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span>
            Simulating specialist deliberations between UX Research, PM, and Design Critic.
          </span>
        </div>
      </div>
    </div>
  );
};
