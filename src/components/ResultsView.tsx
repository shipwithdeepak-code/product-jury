import React, { useState } from 'react';
import { ProductReview } from '../types';
import { VerdictSpectrum, verdictConfigs } from './VerdictBadge';
import { ConfidenceMeter } from './ConfidenceMeter';
import { EvidenceBadge, evidenceDefinitions } from './EvidenceBadge';
import {
  ArrowLeft,
  Flame,
  UserCheck,
  Briefcase,
  Palette,
  CheckCircle2,
  Split,
  HelpCircle,
  ArrowRight,
  Sparkles,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Share2,
  Download,
  AlertTriangle,
  Lightbulb,
} from 'lucide-react';

interface ResultsViewProps {
  review: ProductReview;
  onBackToWorkspace: () => void;
  onChallengeDecision: () => void;
}

export const ResultsView: React.FC<ResultsViewProps> = ({
  review,
  onBackToWorkspace,
  onChallengeDecision,
}) => {
  const [showArtifactDrawer, setShowArtifactDrawer] = useState(false);
  const [expandedOpportunity, setExpandedOpportunity] = useState<string | null>(
    review.opportunities[0]?.id || null
  );

  const verdictMeta = verdictConfigs[review.verdict];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 sm:px-6 lg:px-8 space-y-10">
      {/* Top Action Bar & Epistemic Status Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-stone-200 dark:border-stone-800">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToWorkspace}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs font-medium text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors shadow-2xs"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Workspace</span>
          </button>

          <div className="h-4 w-px bg-stone-200 dark:bg-stone-800 hidden sm:block" />

          <div>
            <h1 className="text-xl font-bold tracking-tight text-stone-900 dark:text-stone-100 flex items-center gap-2">
              <span>{review.context.name || 'Product Review'}</span>
              <span className="text-xs font-mono font-normal px-2 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400">
                Evaluation Dossier
              </span>
            </h1>
            <p className="text-xs text-stone-500 font-mono">
              Evaluated: {new Date(review.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          {review.context.screenshotUrl && (
            <button
              onClick={() => setShowArtifactDrawer(!showArtifactDrawer)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs font-medium text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors shadow-2xs"
            >
              <ImageIcon className="w-3.5 h-3.5 text-stone-500" />
              <span>{showArtifactDrawer ? 'Hide Screen' : 'View Screen'}</span>
            </button>
          )}

          {/* Secondary CTA: Challenge this decision */}
          <button
            onClick={onChallengeDecision}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-900 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-900/60 border border-rose-300 dark:border-rose-800 transition-colors cursor-pointer"
          >
            <Flame className="w-3.5 h-3.5 text-rose-600" />
            <span>Challenge this decision</span>
          </button>
        </div>
      </div>

      {/* Engine Status Banner */}
      {review.isMock ? (
        <div className="p-3 bg-stone-100 dark:bg-stone-850 rounded-lg border border-stone-200 dark:border-stone-800 text-xs text-stone-600 dark:text-stone-400 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>
              <strong className="text-stone-800 dark:text-stone-200">Demonstration Mode:</strong> Sample dossier evaluation simulated for UX Researcher, Product Manager, and Design Critic.
            </span>
          </div>
          <span className="font-mono text-[10px] text-stone-500 bg-white dark:bg-stone-900 px-2 py-0.5 rounded border border-stone-200 dark:border-stone-800">
            Dossier: Sample Dataset
          </span>
        </div>
      ) : (
        <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/30 rounded-lg border border-emerald-200/80 dark:border-emerald-800/60 text-xs text-emerald-900 dark:text-emerald-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>
              <strong className="text-emerald-950 dark:text-emerald-100 font-semibold">Live Multi-Agent Deliberation:</strong> Real-time cross-examination by Gemini agents (UX Researcher, Product Strategist, Evidence Auditor, and Jury Decision Chair).
            </span>
          </div>
          <span className="font-mono text-[10px] text-emerald-700 dark:text-emerald-300 bg-white/80 dark:bg-stone-900 px-2 py-0.5 rounded border border-emerald-300 dark:border-emerald-700">
            Gemini Multimodal Multi-Agent v1.2
          </span>
        </div>
      )}

      {/* Screen Artifact Drawer if toggled */}
      {showArtifactDrawer && review.context.screenshotUrl && (
        <div className="p-4 rounded-xl bg-stone-950 border border-stone-800 text-stone-100 animate-in fade-in duration-200">
          <div className="flex items-center justify-between mb-3 px-1 text-xs">
            <span className="font-mono text-stone-400 flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5" />
              Screen Artifact: {review.context.screenshotName || 'screen-input.png'}
            </span>
            <button
              onClick={() => setShowArtifactDrawer(false)}
              className="text-stone-400 hover:text-stone-200 text-xs font-mono underline"
            >
              Close preview
            </button>
          </div>
          <div className="flex justify-center max-h-96 overflow-hidden rounded-lg bg-stone-900 p-2">
            <img
              src={review.context.screenshotUrl}
              alt="Evaluated interface artifact"
              className="max-h-88 w-auto object-contain rounded"
            />
          </div>
        </div>
      )}

      {/* 1. VERDICT & EXECUTIVE SUMMARY CARD */}
      <section className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 pb-6 border-b border-stone-100 dark:border-stone-800">
          <div className="space-y-1">
            <div className="text-[11px] font-mono tracking-wider font-semibold uppercase text-stone-400">
              SECTION 1 • JURY DECISION
            </div>
            <div className="flex items-baseline gap-3">
              <span className="text-3xl sm:text-4xl font-black tracking-tight font-mono text-stone-900 dark:text-stone-50">
                {review.verdict}
              </span>
              <span className="text-sm font-medium text-stone-500 dark:text-stone-400">
                — {verdictMeta.sublabel}
              </span>
            </div>
          </div>

          {/* Verdict Spectrum Selector Bar */}
          <div className="w-full lg:w-auto">
            <VerdictSpectrum activeVerdict={review.verdict} />
          </div>
        </div>

        {/* Confidence Meter & Summary Grid */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {/* Executive Summary (2 cols) */}
          <div className="lg:col-span-2 space-y-3">
            <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-stone-400">
              SECTION 2 • Executive Summary
            </h2>
            <p className="text-sm sm:text-base text-stone-800 dark:text-stone-200 leading-relaxed font-serif">
              &ldquo;{review.executiveSummary}&rdquo;
            </p>
          </div>

          {/* Confidence Meter (1 col) */}
          <div className="p-4 rounded-xl bg-stone-50 dark:bg-stone-850/60 border border-stone-200/80 dark:border-stone-800">
            <ConfidenceMeter
              score={review.confidenceScore}
              rationale={review.confidenceRationale}
            />
          </div>
        </div>
      </section>

      {/* EPISTEMIC LEGEND (Principles callout) */}
      <div className="p-4 rounded-xl bg-stone-50 dark:bg-stone-850/40 border border-stone-200 dark:border-stone-800">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-700 dark:text-stone-300 font-mono uppercase tracking-wider">
            <Lightbulb className="w-3.5 h-3.5 text-amber-600" />
            <span>Epistemic Evidence Framework</span>
          </div>
          <span className="text-[11px] text-stone-400">Distinguishing hard data from opinions</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {(['FACT', 'INFERENCE', 'ASSUMPTION', 'UNKNOWN'] as const).map((status) => {
            const def = evidenceDefinitions[status];
            return (
              <div
                key={status}
                className="p-2.5 rounded-lg bg-white dark:bg-stone-900 border border-stone-200/70 dark:border-stone-800 text-xs flex flex-col gap-1"
              >
                <div className="flex items-center gap-1.5">
                  {def.icon}
                  <span className="font-mono font-bold text-[11px] tracking-wide text-stone-900 dark:text-stone-100">
                    {def.label}
                  </span>
                </div>
                <p className="text-[11px] text-stone-500 leading-snug">
                  {def.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. TOP OPPORTUNITIES */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-stone-400">
              SECTION 3 • Priority Opportunities
            </h2>
            <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100 tracking-tight">
              Top 3 Product Problems
            </h3>
          </div>
          <span className="text-xs font-mono text-stone-400">Ranked by friction × user impact</span>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {review.opportunities.map((opp, idx) => {
            const isExpanded = expandedOpportunity === opp.id;

            return (
              <div
                key={opp.id}
                className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 overflow-hidden shadow-2xs transition-all hover:border-stone-300 dark:hover:border-stone-700"
              >
                {/* Header Row */}
                <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-md bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 font-mono text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                      0{idx + 1}
                    </span>
                    <div>
                      <h4 className="text-sm sm:text-base font-semibold text-stone-900 dark:text-stone-100 leading-snug">
                        {opp.problem}
                      </h4>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <EvidenceBadge status={opp.evidenceStatus} size="sm" />
                        <span className="text-[11px] font-mono text-stone-500 dark:text-stone-400">
                          Confidence: {opp.confidence}%
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() =>
                      setExpandedOpportunity(isExpanded ? null : opp.id)
                    }
                    className="self-end sm:self-center inline-flex items-center gap-1 text-xs font-medium text-stone-500 hover:text-stone-900 dark:hover:text-stone-200 px-2.5 py-1 rounded-md hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                  >
                    <span>{isExpanded ? 'Less details' : 'View impacts'}</span>
                    {isExpanded ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {/* Expanded Impact Details */}
                {isExpanded && (
                  <div className="px-5 pb-5 pt-2 border-t border-stone-100 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-850/40">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs mt-2">
                      <div className="p-3.5 rounded-lg bg-white dark:bg-stone-900 border border-stone-200/80 dark:border-stone-800">
                        <span className="font-mono text-[10px] uppercase font-bold text-stone-400 block mb-1">
                          USER IMPACT
                        </span>
                        <p className="text-stone-700 dark:text-stone-300 leading-relaxed">
                          {opp.userImpact}
                        </p>
                      </div>

                      <div className="p-3.5 rounded-lg bg-white dark:bg-stone-900 border border-stone-200/80 dark:border-stone-800">
                        <span className="font-mono text-[10px] uppercase font-bold text-stone-400 block mb-1">
                          BUSINESS IMPACT
                        </span>
                        <p className="text-stone-700 dark:text-stone-300 leading-relaxed">
                          {opp.businessImpact}
                        </p>
                      </div>
                    </div>

                    {opp.evidenceContext && (
                      <div className="mt-3 p-3 rounded-lg bg-stone-100 dark:bg-stone-800/60 text-[11px] text-stone-600 dark:text-stone-400 font-mono">
                        <strong className="text-stone-800 dark:text-stone-200">Evidence Basis: </strong>
                        {opp.evidenceContext}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 4. AGENT PERSPECTIVES (Specialist Cards) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-stone-400">
              SECTION 4 • Specialist Panel
            </h2>
            <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100 tracking-tight">
              Agent Perspectives
            </h3>
          </div>
          <span className="text-xs text-stone-400">3 distinct specialist lenses</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {review.agentReviews.map((agent) => {
            const roleIcons = {
              UX_RESEARCHER: <UserCheck className="w-4 h-4 text-emerald-600" />,
              PRODUCT_MANAGER: <Briefcase className="w-4 h-4 text-blue-600" />,
              DESIGN_CRITIC: <Palette className="w-4 h-4 text-purple-600" />,
            };

            return (
              <div
                key={agent.role}
                className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-5 flex flex-col justify-between shadow-xs transition-all hover:border-stone-300 dark:hover:border-stone-700"
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-stone-100 dark:bg-stone-800 flex items-center justify-center">
                        {roleIcons[agent.role]}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-stone-900 dark:text-stone-100 font-mono uppercase tracking-wide">
                          {agent.roleTitle}
                        </h4>
                        <span className="text-[10px] text-stone-400">{agent.agentName}</span>
                      </div>
                    </div>

                    <span className="text-[11px] font-mono font-bold text-stone-700 dark:text-stone-300 bg-stone-100 dark:bg-stone-800 px-2 py-0.5 rounded">
                      {agent.confidence}% conf
                    </span>
                  </div>

                  {/* Key Observation (Mandatory in prompt) */}
                  <div className="p-3 rounded-lg bg-stone-50 dark:bg-stone-850/60 border border-stone-200/60 dark:border-stone-800 mb-3">
                    <span className="text-[10px] font-mono uppercase tracking-wider font-semibold text-stone-400 block mb-1">
                      Key Observation
                    </span>
                    <p className="text-xs font-semibold text-stone-800 dark:text-stone-200 leading-snug">
                      &ldquo;{agent.keyObservation}&rdquo;
                    </p>
                  </div>

                  {/* Recommendation */}
                  <div className="space-y-1 mb-3">
                    <span className="text-[10px] font-mono uppercase tracking-wider font-semibold text-stone-400 block">
                      Recommendation
                    </span>
                    <p className="text-xs text-stone-700 dark:text-stone-300 leading-relaxed font-medium">
                      {agent.recommendation}
                    </p>
                  </div>
                </div>

                {/* Core Argument */}
                <div className="pt-3 border-t border-stone-100 dark:border-stone-800">
                  <p className="text-[11px] text-stone-500 dark:text-stone-400 leading-relaxed">
                    {agent.coreArgument}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 5. AGREEMENT & DISAGREEMENT */}
      <section className="space-y-4">
        <div>
          <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-stone-400">
            SECTION 5 • Consensus & Divergence
          </h2>
          <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100 tracking-tight">
            Agreement & Disagreement
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Where Agents Agree */}
          <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-5 shadow-xs flex flex-col">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-stone-100 dark:border-stone-800">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <h4 className="text-xs font-mono font-bold uppercase tracking-wide text-stone-900 dark:text-stone-100">
                Where Agents Agree
              </h4>
            </div>
            <ul className="space-y-2.5 text-xs text-stone-700 dark:text-stone-300 leading-relaxed flex-1">
              {review.agreementDisagreement.agreements.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-emerald-600 font-bold">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Where Agents Disagree */}
          <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-5 shadow-xs flex flex-col">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-stone-100 dark:border-stone-800">
              <Split className="w-4 h-4 text-amber-600" />
              <h4 className="text-xs font-mono font-bold uppercase tracking-wide text-stone-900 dark:text-stone-100">
                Where Agents Disagree
              </h4>
            </div>
            <div className="space-y-3 text-xs text-stone-700 dark:text-stone-300 leading-relaxed flex-1">
              {review.agreementDisagreement.disagreements.map((dis, idx) => (
                <div key={idx} className="space-y-2">
                  <span className="font-semibold text-stone-900 dark:text-stone-100 block">
                    {dis.topic}
                  </span>
                  <div className="space-y-1.5 pl-1">
                    {dis.agentPositions.map((pos, pIdx) => (
                      <div
                        key={pIdx}
                        className="text-[11px] p-2 rounded bg-stone-50 dark:bg-stone-850 border border-stone-200/60 dark:border-stone-800"
                      >
                        <span className="font-mono font-bold text-stone-800 dark:text-stone-200">
                          {pos.roleTitle}:{' '}
                        </span>
                        <span className="text-stone-600 dark:text-stone-400">{pos.view}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* What Is Still Unknown */}
          <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-5 shadow-xs flex flex-col">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-stone-100 dark:border-stone-800">
              <HelpCircle className="w-4 h-4 text-stone-500" />
              <h4 className="text-xs font-mono font-bold uppercase tracking-wide text-stone-900 dark:text-stone-100">
                What is Still Unknown
              </h4>
            </div>
            <ul className="space-y-2.5 text-xs text-stone-700 dark:text-stone-300 leading-relaxed flex-1">
              {review.agreementDisagreement.unknowns.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-stone-400 font-mono">?</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* 6. RECOMMENDED NEXT STEP */}
      <section className="bg-stone-900 text-stone-100 rounded-2xl p-6 sm:p-8 border border-stone-800 shadow-md">
        <div className="flex items-center gap-2 text-[11px] font-mono tracking-wider uppercase font-semibold text-amber-400 mb-2">
          <span>SECTION 6 • Immediate PM Action</span>
        </div>
        <h3 className="text-lg sm:text-xl font-bold tracking-tight text-white mb-3">
          Recommended Next Step
        </h3>

        <div className="p-4 rounded-xl bg-stone-850 border border-stone-700/80 mb-4">
          <p className="text-base sm:text-lg font-medium text-amber-200 leading-relaxed font-sans">
            &ldquo;{review.recommendedNextStep}&rdquo;
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-stone-400">
          <p>
            Synthesized from high-friction discovery signals and missing dwell telemetry before committing engineering resources to a full canvas rewrite.
          </p>

          <button
            onClick={onChallengeDecision}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-medium transition-colors shrink-0"
          >
            <Flame className="w-3.5 h-3.5" />
            <span>Challenge this action</span>
          </button>
        </div>
      </section>

      {/* FOOTER ACTIONS */}
      <div className="pt-4 border-t border-stone-200 dark:border-stone-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-stone-500">
        <div className="flex items-center gap-2 font-mono">
          <span>Product Jury • Decision Defense Engine</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-300 hover:bg-stone-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Print Dossier</span>
          </button>
          <button
            onClick={onBackToWorkspace}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 font-medium"
          >
            <span>Start Another Review</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
