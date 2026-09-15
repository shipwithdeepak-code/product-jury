import React from 'react';
import { Gauge } from 'lucide-react';

interface ConfidenceMeterProps {
  score: number; // 0 - 100
  rationale?: string;
  size?: 'sm' | 'md';
}

export const ConfidenceMeter: React.FC<ConfidenceMeterProps> = ({
  score,
  rationale,
  size = 'md',
}) => {
  const getTier = (val: number) => {
    if (val >= 80) return { label: 'High Confidence', color: 'text-emerald-700 dark:text-emerald-400', bar: 'bg-emerald-600' };
    if (val >= 60) return { label: 'Medium Confidence', color: 'text-amber-700 dark:text-amber-400', bar: 'bg-amber-500' };
    return { label: 'Low Confidence (High Uncertainty)', color: 'text-rose-700 dark:text-rose-400', bar: 'bg-rose-500' };
  };

  const tier = getTier(score);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-medium text-stone-600 dark:text-stone-400">
          <Gauge className="w-3.5 h-3.5" />
          <span>Epistemic Confidence</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono text-sm font-bold text-stone-900 dark:text-stone-100">
            {score}%
          </span>
          <span className={`text-xs font-semibold ${tier.color}`}>
            ({tier.label})
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-2 bg-stone-200 dark:bg-stone-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${tier.bar}`}
          style={{ width: `${score}%` }}
        />
      </div>

      {rationale && (
        <p className="text-[11px] text-stone-500 dark:text-stone-400 leading-relaxed mt-0.5">
          {rationale}
        </p>
      )}
    </div>
  );
};
