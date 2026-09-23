import React from 'react';
import { Scale, PlusCircle, History, Sparkles, FileText, Layers } from 'lucide-react';

interface HeaderProps {
  currentTab: 'workspace' | 'results';
  hasResults: boolean;
  onNavigate: (tab: 'workspace' | 'results') => void;
  onOpenHistory: () => void;
  onLoadSample: () => void;
  onNewReview?: () => void;
  /**
   * Stage 7 · CAP-12. The way to the decisions kept on this device.
   *
   * It sits with the right-hand controls rather than in the tab nav above,
   * because that nav is `hidden md:flex` and a phone would have had no route
   * to the list at all (§14).
   */
  onOpenDecisions?: () => void;
  decisionsActive?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  hasResults,
  onNavigate,
  onOpenHistory,
  onLoadSample,
  onNewReview,
  onOpenDecisions,
  decisionsActive,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-stone-900 text-stone-100 border-b border-stone-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Tagline */}
          <div className="flex items-center gap-6">
            <button
              onClick={() => onNavigate('workspace')}
              className="flex items-center gap-3 text-left group transition-opacity hover:opacity-90"
            >
              <div className="w-9 h-9 rounded-lg bg-stone-800 border border-stone-700 flex items-center justify-center text-amber-400 group-hover:border-amber-400/50 transition-colors">
                <Scale className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold tracking-tight text-base text-white">
                    Product Jury
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono tracking-wider font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    PREVIEW v0.1
                  </span>
                </div>
                <p className="text-[11px] text-stone-400 font-normal tracking-tight hidden sm:block">
                  Challenge the product. Defend the decision.
                </p>
              </div>
            </button>

            {/* Navigation Tabs */}
            <nav className="hidden md:flex items-center gap-1 pl-4 border-l border-stone-800">
              <button
                onClick={() => {
                  if (onNewReview) {
                    onNewReview();
                  } else {
                    onNavigate('workspace');
                  }
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  currentTab === 'workspace'
                    ? 'bg-stone-800 text-white shadow-xs font-semibold'
                    : 'text-stone-400 hover:text-stone-200 hover:bg-stone-850'
                }`}
              >
                <PlusCircle className="w-3.5 h-3.5 text-stone-400" />
                <span>New Review</span>
              </button>

              <button
                onClick={() => hasResults && onNavigate('results')}
                disabled={!hasResults}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  !hasResults
                    ? 'opacity-40 cursor-not-allowed text-stone-500'
                    : currentTab === 'results'
                    ? 'bg-stone-800 text-white shadow-xs font-semibold'
                    : 'text-stone-400 hover:text-stone-200 hover:bg-stone-850'
                }`}
              >
                <FileText className="w-3.5 h-3.5 text-stone-400" />
                <span>Verdict & Results</span>
              </button>
            </nav>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-3">
            {/* Quick Demo Pre-fill */}
            <button
              onClick={onLoadSample}
              className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-stone-800/80 hover:bg-stone-800 text-stone-300 hover:text-white border border-stone-700/60 transition-colors"
              title="Preload realistic SaaS onboarding challenge"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Load Sample Case</span>
            </button>

            {onOpenDecisions && (
              <button
                onClick={onOpenDecisions}
                aria-current={decisionsActive ? 'page' : undefined}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                  decisionsActive
                    ? 'bg-stone-800 text-white border-stone-600'
                    : 'bg-stone-800/60 hover:bg-stone-800 text-stone-300 border-stone-700/50 hover:border-stone-600'
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-stone-400" />
                <span>Decisions</span>
              </button>
            )}

            {/* History Placeholder */}
            <button
              onClick={onOpenHistory}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-stone-800/60 hover:bg-stone-800 text-stone-300 border border-stone-700/50 hover:border-stone-600 transition-colors"
            >
              <History className="w-3.5 h-3.5 text-stone-400" />
              <span className="hidden sm:inline">Review History</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-stone-700 text-stone-300 font-mono">
                1
              </span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
