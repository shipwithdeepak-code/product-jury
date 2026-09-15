import React, { useState } from 'react';
import { EvidenceStatus } from '../types';
import { ShieldCheck, Sparkles, HelpCircle, AlertCircle, Info } from 'lucide-react';

interface EvidenceBadgeProps {
  status: EvidenceStatus;
  showDefinition?: boolean;
  size?: 'sm' | 'md' | 'lg';
  interactive?: boolean;
}

export const evidenceDefinitions: Record<
  EvidenceStatus,
  { label: string; description: string; color: string; badgeClasses: string; borderClasses: string; icon: React.ReactNode }
> = {
  FACT: {
    label: 'FACT',
    description: 'Directly supported by supplied data, metrics, or verbatim customer evidence.',
    color: '#0D9488',
    badgeClasses: 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
    borderClasses: 'border-emerald-500/30',
    icon: <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />,
  },
  INFERENCE: {
    label: 'INFERENCE',
    description: 'A structured conclusion derived analytically from patterns in the evidence.',
    color: '#3B82F6',
    badgeClasses: 'bg-blue-50 text-blue-800 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
    borderClasses: 'border-blue-500/30',
    icon: <Sparkles className="w-3.5 h-3.5 text-blue-600" />,
  },
  ASSUMPTION: {
    label: 'ASSUMPTION',
    description: 'A working belief or premise that has not yet been experimentally validated.',
    color: '#D97706',
    badgeClasses: 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
    borderClasses: 'border-amber-500/30',
    icon: <AlertCircle className="w-3.5 h-3.5 text-amber-600" />,
  },
  UNKNOWN: {
    label: 'UNKNOWN',
    description: 'Critical information required for a confident decision but currently unavailable.',
    color: '#6B7280',
    badgeClasses: 'bg-stone-100 text-stone-700 border-stone-300 dark:bg-stone-800 dark:text-stone-300 dark:border-stone-700',
    borderClasses: 'border-stone-400/30',
    icon: <HelpCircle className="w-3.5 h-3.5 text-stone-500" />,
  },
};

export const EvidenceBadge: React.FC<EvidenceBadgeProps> = ({
  status,
  showDefinition = false,
  size = 'md',
  interactive = true,
}) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const def = evidenceDefinitions[status] || evidenceDefinitions.UNKNOWN;

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[10px] font-mono tracking-wider',
    md: 'px-2.5 py-1 text-xs font-mono tracking-wider',
    lg: 'px-3 py-1.5 text-sm font-mono tracking-wide',
  }[size];

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onClick={() => setShowTooltip((v) => !v)}
        className={`inline-flex items-center gap-1.5 font-semibold rounded-md border transition-all ${sizeClasses} ${def.badgeClasses} ${
          interactive ? 'cursor-pointer hover:shadow-xs' : 'cursor-default'
        }`}
        title={`${def.label}: ${def.description}`}
      >
        {def.icon}
        <span>{def.label}</span>
        {interactive && <Info className="w-3 h-3 opacity-60 hover:opacity-100" />}
      </button>

      {/* Floating tooltip popover for interactive exploration */}
      {showTooltip && (
        <div className="absolute bottom-full left-0 mb-2 z-50 w-64 p-3 bg-stone-900 text-stone-100 text-xs rounded-lg shadow-xl border border-stone-800 pointer-events-none">
          <div className="flex items-center gap-1.5 font-semibold mb-1 text-stone-200">
            {def.icon}
            <span>{def.label}</span>
          </div>
          <p className="text-stone-300 leading-relaxed font-sans text-[11px]">
            {def.description}
          </p>
        </div>
      )}

      {showDefinition && (
        <span className="ml-2 text-xs text-stone-600 dark:text-stone-400">
          {def.description}
        </span>
      )}
    </div>
  );
};
