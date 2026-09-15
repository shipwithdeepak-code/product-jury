import React from 'react';
import { Verdict } from '../types';
import { CheckCircle2, RefreshCw, FlaskConical, XCircle } from 'lucide-react';

interface VerdictBadgeProps {
  verdict: Verdict;
  size?: 'sm' | 'md' | 'lg' | 'hero';
}

export const verdictConfigs: Record<
  Verdict,
  {
    label: string;
    sublabel: string;
    bgClasses: string;
    textClasses: string;
    borderClasses: string;
    activeRing: string;
    icon: React.ReactNode;
  }
> = {
  SHIP: {
    label: 'SHIP',
    sublabel: 'High validation; proceed to deployment',
    bgClasses: 'bg-emerald-50 text-emerald-900 border-emerald-300',
    textClasses: 'text-emerald-900',
    borderClasses: 'border-emerald-300',
    activeRing: 'ring-2 ring-emerald-500/20 bg-emerald-500 text-white',
    icon: <CheckCircle2 className="w-4 h-4 text-emerald-600" />,
  },
  ITERATE: {
    label: 'ITERATE',
    sublabel: 'Critical friction detected; refine experience before launch',
    bgClasses: 'bg-amber-50 text-amber-950 border-amber-300',
    textClasses: 'text-amber-950',
    borderClasses: 'border-amber-300',
    activeRing: 'ring-2 ring-amber-500/20 bg-amber-600 text-white',
    icon: <RefreshCw className="w-4 h-4 text-amber-600" />,
  },
  TEST: {
    label: 'TEST',
    sublabel: 'Empirical gap; run controlled A/B experiment',
    bgClasses: 'bg-blue-50 text-blue-900 border-blue-300',
    textClasses: 'text-blue-900',
    borderClasses: 'border-blue-300',
    activeRing: 'ring-2 ring-blue-500/20 bg-blue-600 text-white',
    icon: <FlaskConical className="w-4 h-4 text-blue-600" />,
  },
  KILL: {
    label: 'KILL',
    sublabel: 'Severe anti-pattern or negative business ROI; abandon',
    bgClasses: 'bg-rose-50 text-rose-950 border-rose-300',
    textClasses: 'text-rose-950',
    borderClasses: 'border-rose-300',
    activeRing: 'ring-2 ring-rose-500/20 bg-rose-600 text-white',
    icon: <XCircle className="w-4 h-4 text-rose-600" />,
  },
};

export const VerdictSpectrum: React.FC<{ activeVerdict: Verdict }> = ({ activeVerdict }) => {
  const allVerdicts: Verdict[] = ['SHIP', 'ITERATE', 'TEST', 'KILL'];

  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-1.5 bg-stone-100 dark:bg-stone-900/60 rounded-xl border border-stone-200 dark:border-stone-800">
      {allVerdicts.map((v) => {
        const isActive = v === activeVerdict;
        const config = verdictConfigs[v];

        return (
          <div
            key={v}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold tracking-wider font-mono transition-all ${
              isActive
                ? `${config.activeRing} shadow-sm font-bold scale-[1.02]`
                : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-300 opacity-60'
            }`}
          >
            <span>{config.label}</span>
            {isActive && (
              <span className="text-[10px] uppercase font-sans font-medium px-1.5 py-0.5 rounded bg-black/20 text-white tracking-normal">
                Verdict
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};
