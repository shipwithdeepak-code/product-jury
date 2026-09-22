import React, { useState } from 'react';
import { ArtifactUnderstanding } from '../types';
import {
  CheckCircle2,
  Edit3,
  AlertTriangle,
  HelpCircle,
  Compass,
  FileQuestion,
  Eye,
  Check,
  RotateCcw,
  Sparkles,
  Info,
  Plus,
  Trash2,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Clock,
} from 'lucide-react';

interface ArtifactUnderstandingCardProps {
  understanding: ArtifactUnderstanding;
  onConfirm: () => void;
  onUpdate: (updated: ArtifactUnderstanding) => void;
  screenshotUrl?: string;
  screenshotName?: string;
  productUrl?: string;
  onResetArtifact?: () => void;
  isAnalyzing?: boolean;
  analysisError?: string | null;
  onRetryAnalysis?: () => void;
}

export const ArtifactUnderstandingCard: React.FC<ArtifactUnderstandingCardProps> = ({
  understanding,
  onConfirm,
  onUpdate,
  screenshotUrl,
  screenshotName,
  productUrl,
  onResetArtifact,
  isAnalyzing = false,
  analysisError = null,
  onRetryAnalysis,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<ArtifactUnderstanding>({ ...understanding });

  const detailed = understanding.detailedAnalysis;

  // Artifact analysis status: Ready | Analyzing | Complete | Failed — Retry
  let analysisStatus: 'ready' | 'analyzing' | 'complete' | 'failed';
  if (analysisError) {
    analysisStatus = 'failed';
  } else if (isAnalyzing) {
    analysisStatus = 'analyzing';
  } else if (understanding?.facts?.length || understanding?.productType) {
    analysisStatus = 'complete';
  } else {
    analysisStatus = 'ready';
  }

  const statusBadgeConfig = {
    ready: {
      label: 'Ready',
      icon: <Clock className="w-3.5 h-3.5 text-stone-400" />,
      badgeClass: 'bg-stone-700/60 text-stone-300 border-stone-600',
    },
    analyzing: {
      label: 'Analyzing',
      icon: <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />,
      badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse',
    },
    complete: {
      label: 'Complete',
      icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />,
      badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-semibold',
    },
    failed: {
      label: 'Failed — Retry',
      icon: <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />,
      badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40 font-semibold',
    },
  };
  const currentBadge = statusBadgeConfig[analysisStatus];

  const handleStartEdit = () => {
    setEditForm({ ...understanding });
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setEditForm({ ...understanding });
    setIsEditing(false);
  };

  const handleSaveEdit = () => {
    onUpdate({
      ...editForm,
      isConfirmed: true,
    });
    setIsEditing(false);
  };

  const handleConfirmClick = () => {
    onConfirm();
  };

  return (
    <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 shadow-xs overflow-hidden transition-all">
      {/* Top Banner: Labeled as 'What Gemini observed' */}
      <div
        className={`border-b px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          analysisStatus === 'analyzing'
            ? 'bg-amber-500/15 border-amber-500/30 dark:bg-amber-500/20'
            : analysisStatus === 'failed'
            ? 'bg-red-500/10 border-red-500/20 dark:bg-red-950/30 text-red-800 dark:text-red-200'
            : 'bg-stone-850 dark:bg-stone-950 text-stone-200 border-stone-800'
        }`}
      >
        <div className="flex items-center gap-2 text-xs font-medium">
          {analysisStatus === 'analyzing' ? (
            <Loader2 className="w-4 h-4 text-amber-400 animate-spin shrink-0" />
          ) : analysisStatus === 'failed' ? (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
          )}
          <span className="font-semibold font-mono tracking-tight text-stone-100 dark:text-stone-100">
            What Gemini observed
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-stone-700 dark:bg-stone-800 text-stone-300 border border-stone-600">
            Multimodal Context Analyst
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* Status Badge: Ready | Analyzing | Complete | Failed — Retry */}
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs border ${currentBadge.badgeClass}`}
          >
            {currentBadge.icon}
            <span>{currentBadge.label}</span>
          </span>

          {onRetryAnalysis && !isAnalyzing && (
            <button
              onClick={onRetryAnalysis}
              className="inline-flex items-center gap-1.5 text-xs text-stone-300 hover:text-white transition-colors cursor-pointer"
              title="Re-run multimodal visual analysis on this artifact"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Re-analyze</span>
            </button>
          )}
          <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded bg-stone-700/60 dark:bg-stone-800 text-stone-300 shrink-0">
            Step 2 of 3
          </span>
        </div>
      </div>

      {/* Analysis Error Alert */}
      {analysisError && (
        <div className="p-4 bg-red-50 dark:bg-red-950/40 border-b border-red-200 dark:border-red-900/60 flex items-start justify-between gap-3 text-xs text-red-800 dark:text-red-300">
          <div className="flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Unable to update understanding</p>
              <p className="text-red-700 dark:text-red-400 mt-0.5">
                {analysisError.replace(/^Unable to update understanding:?\s*/i, '') ||
                  'The analysis encountered an error. You can retry with Gemini or adjust the findings manually.'}
              </p>
            </div>
          </div>
          {onRetryAnalysis && (
            <button
              type="button"
              onClick={onRetryAnalysis}
              className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold shrink-0 transition-colors cursor-pointer shadow-2xs"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/*
        Stage 1 · The "Gemini Upstream Demand Spike Handled Gracefully" banner
        that used to sit here is gone, along with the draft it announced.
        PRD v1.1.1 §51 never-1 and never-2: a reading the model did not produce
        is not shown, and a provider failure is reported as a failure rather
        than dressed as a graceful continuation. The failure banner above is
        now the only thing this card says when the read did not happen.
      */}

      {/* Active Analyzing State Banner */}
      {isAnalyzing && (
        <div className="p-8 bg-amber-500/5 dark:bg-amber-500/10 border-b border-amber-500/20 text-center space-y-3">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 mx-auto animate-pulse">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
          <div>
            <h4 className="text-base font-semibold text-stone-900 dark:text-stone-100">
              Analyzing artifact...
            </h4>
            <p className="text-xs text-stone-600 dark:text-stone-400 max-w-lg mx-auto mt-1">
              Gemini is conducting multimodal visual inspection for visible functionality, user journey, friction signals, directly observable facts, inferences, assumptions, and critical unknowns.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 text-[11px] font-mono text-stone-500 dark:text-stone-400">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
            <span>Evaluating layout hierarchy & visual affordances</span>
          </div>
        </div>
      )}

      <div className="p-6 space-y-6">
        {/* Unified Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-stone-100 dark:border-stone-800">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
                What Gemini observed
              </h3>
              {understanding.isConfirmed && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Confirmed by PM</span>
                </span>
              )}
            </div>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              Visual evidence extracted from your uploaded artifact. These findings are separate from any product context you provide.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {!isEditing ? (
              <button
                onClick={handleStartEdit}
                disabled={isAnalyzing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-stone-300 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit Findings</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCancelEdit}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:hover:bg-white dark:text-stone-900 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Save Edits</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 1. Core Visual Synthesis (Product Type, Likely User, Primary Journey) with Calibrated Confidence */}
        {!isEditing ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-stone-50 dark:bg-stone-850/50 border border-stone-200 dark:border-stone-800">
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-xs font-semibold text-stone-600 dark:text-stone-300">
                  Detected Product Type (Evidence / Visual Confirmation)
                </span>
                {detailed?.productType?.confidence !== undefined && (
                  <span
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-300"
                    title="Evidence confidence: Directly observable visual elements supporting this classification"
                  >
                    Evidence: {detailed.productType.confidence}%
                  </span>
                )}
              </div>
              <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
                {understanding.productType}
              </p>
              {detailed?.productType?.evidence && (
                <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-1.5 italic border-t border-stone-200 dark:border-stone-700/50 pt-1">
                  Observed: {detailed.productType.evidence}
                </p>
              )}
            </div>

            <div className="p-4 rounded-lg bg-stone-50 dark:bg-stone-850/50 border border-stone-200 dark:border-stone-800">
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-xs font-semibold text-stone-600 dark:text-stone-300">
                  Likely User Role (Inferred from UI layout)
                </span>
                {detailed?.likelyUser?.confidence !== undefined && (
                  <span
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200/60 dark:border-amber-900/40"
                    title="Inference confidence: Interpretation derived from terminology and UI affordances (calibrated to avoid 100% on inferred roles)"
                  >
                    Inference: {Math.min(80, detailed.likelyUser.confidence)}%
                  </span>
                )}
              </div>
              <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
                {understanding.likelyUser}
              </p>
              {detailed?.likelyUser?.evidence && (
                <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-1.5 italic border-t border-stone-200 dark:border-stone-700/50 pt-1">
                  Observed: {detailed.likelyUser.evidence}
                </p>
              )}
            </div>

            <div className="p-4 rounded-lg bg-stone-50 dark:bg-stone-850/50 border border-stone-200 dark:border-stone-800">
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-xs font-semibold text-stone-600 dark:text-stone-300">
                  Primary Journey (Inferred from interface affordances)
                </span>
                {detailed?.primaryJourney?.confidence !== undefined && (
                  <span
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200/60 dark:border-amber-900/40"
                    title="Inference confidence: Inferred progression and task sequence from visible controls"
                  >
                    Inference: {Math.min(85, detailed.primaryJourney.confidence)}%
                  </span>
                )}
              </div>
              <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
                {understanding.detectedJourney}
              </p>
              {detailed?.primaryJourney?.evidence && (
                <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-1.5 italic border-t border-stone-200 dark:border-stone-700/50 pt-1">
                  Observed: {detailed.primaryJourney.evidence}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-lg bg-stone-50 dark:bg-stone-850/50 border border-stone-200 dark:border-stone-800">
            <div>
              <label className="block text-xs font-semibold text-stone-600 dark:text-stone-300 mb-1">
                Detected Product Type (Evidence / Visual Confirmation)
              </label>
              <input
                type="text"
                value={editForm.productType}
                onChange={(e) => setEditForm({ ...editForm, productType: e.target.value })}
                className="w-full text-xs px-3 py-2 rounded-md border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-600 dark:text-stone-300 mb-1">
                Likely User Role (Inferred from UI layout)
              </label>
              <input
                type="text"
                value={editForm.likelyUser}
                onChange={(e) => setEditForm({ ...editForm, likelyUser: e.target.value })}
                className="w-full text-xs px-3 py-2 rounded-md border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-600 dark:text-stone-300 mb-1">
                Primary Journey (Inferred from interface affordances)
              </label>
              <input
                type="text"
                value={editForm.detectedJourney}
                onChange={(e) => setEditForm({ ...editForm, detectedJourney: e.target.value })}
                className="w-full text-xs px-3 py-2 rounded-md border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100"
              />
            </div>
          </div>
        )}

        {/* 2. Visible Friction Signals */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <h4 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                Visible Friction Signals
              </h4>
            </div>
            {isEditing && (
              <button
                type="button"
                onClick={() =>
                  setEditForm({
                    ...editForm,
                    frictionSignals: [...editForm.frictionSignals, 'New friction point observed'],
                  })
                }
                className="inline-flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400 hover:underline"
              >
                <Plus className="w-3 h-3" />
                <span>Add Signal</span>
              </button>
            )}
          </div>

          {!isEditing ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {understanding.frictionSignals.map((signal, idx) => {
                const detailedSignal = detailed?.frictionSignals?.[idx];
                const severity = detailedSignal?.severity || 'medium';
                return (
                  <div
                    key={idx}
                    className="p-3 rounded-lg bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/40 text-xs text-amber-950 dark:text-amber-200"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0"></span>
                        <span className="font-medium leading-relaxed">{signal}</span>
                      </div>
                      <span
                        className={`text-[10px] font-mono uppercase px-1.5 py-0.2 rounded shrink-0 ${
                          severity === 'high'
                            ? 'bg-red-200 text-red-800 dark:bg-red-900/60 dark:text-red-200 font-bold'
                            : severity === 'low'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                            : 'bg-amber-200 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200'
                        }`}
                      >
                        {severity}
                      </span>
                    </div>
                    {detailedSignal?.evidence && (
                      <p className="text-[11px] text-amber-800/80 dark:text-amber-400/80 mt-1 ml-3.5 italic">
                        Evidence: {detailedSignal.evidence}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2">
              {editForm.frictionSignals.map((signal, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={signal}
                    onChange={(e) => {
                      const updated = [...editForm.frictionSignals];
                      updated[idx] = e.target.value;
                      setEditForm({ ...editForm, frictionSignals: updated });
                    }}
                    className="flex-1 text-xs px-3 py-1.5 rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const updated = editForm.frictionSignals.filter((_, i) => i !== idx);
                      setEditForm({ ...editForm, frictionSignals: updated });
                    }}
                    className="text-stone-400 hover:text-red-500 p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 3. Epistemic Knowledge Quadrants */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400">
              Epistemic Classification
            </span>
            <span className="text-[11px] text-stone-400 dark:text-stone-500 hidden sm:inline">
              (Facts vs Inferences vs Assumptions vs Unknowns)
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* FACTS */}
            <div className="p-4 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-emerald-100 dark:border-emerald-900/40">
                <div className="flex items-center gap-1.5">
                  <Eye className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-xs font-bold font-mono tracking-wider text-emerald-900 dark:text-emerald-300">
                    FACTS
                  </span>
                </div>
                <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400">
                  Observable from screen
                </span>
              </div>
              <ul className="space-y-2">
                {(!isEditing ? understanding.facts : editForm.facts).map((fact, idx) => {
                  const detailedFact = detailed?.facts?.[idx];
                  return (
                    <li key={idx} className="text-xs text-stone-700 dark:text-stone-300">
                      <div className="flex items-start gap-2">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0"></span>
                        <div className="flex-1">
                          <span className="font-medium leading-relaxed">{fact}</span>
                          {!isEditing && detailedFact?.evidence && (
                            <p className="text-[11px] text-emerald-800 dark:text-emerald-400/80 mt-0.5 italic">
                              Visual Evidence: {detailedFact.evidence}
                            </p>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* INFERENCES */}
            <div className="p-4 rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-blue-100 dark:border-blue-900/40">
                <div className="flex items-center gap-1.5">
                  <Compass className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-xs font-bold font-mono tracking-wider text-blue-900 dark:text-blue-300">
                    INFERENCES
                  </span>
                </div>
                <span className="text-[10px] font-mono text-blue-700 dark:text-blue-400">
                  Derived from evidence
                </span>
              </div>
              <ul className="space-y-2">
                {(!isEditing ? understanding.inferences : editForm.inferences).map((inf, idx) => {
                  const detailedInf = detailed?.inferences?.[idx];
                  return (
                    <li key={idx} className="text-xs text-stone-700 dark:text-stone-300">
                      <div className="flex items-start gap-2">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0"></span>
                        <div className="flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-medium leading-relaxed">{inf}</span>
                            {!isEditing && detailedInf?.confidence !== undefined && (
                              <span className="text-[10px] font-mono text-blue-700 dark:text-blue-400 shrink-0">
                                {detailedInf.confidence}%
                              </span>
                            )}
                          </div>
                          {!isEditing && detailedInf?.reasoning && (
                            <p className="text-[11px] text-blue-800 dark:text-blue-300/80 mt-0.5 italic">
                              Reasoning: {detailedInf.reasoning}
                            </p>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* ASSUMPTIONS */}
            <div className="p-4 rounded-lg bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/50">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-purple-100 dark:border-purple-900/40">
                <div className="flex items-center gap-1.5">
                  <HelpCircle className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span className="text-xs font-bold font-mono tracking-wider text-purple-900 dark:text-purple-300">
                    ASSUMPTIONS
                  </span>
                </div>
                <span className="text-[10px] font-mono text-purple-700 dark:text-purple-400">
                  Unverified hypotheses
                </span>
              </div>
              <ul className="space-y-2">
                {(!isEditing ? understanding.assumptions : editForm.assumptions).map((assump, idx) => {
                  const detailedAssump = detailed?.assumptions?.[idx];
                  return (
                    <li key={idx} className="text-xs text-stone-700 dark:text-stone-300">
                      <div className="flex items-start gap-2">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-purple-500 mt-1.5 shrink-0"></span>
                        <div className="flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-medium leading-relaxed">{assump}</span>
                            {!isEditing && detailedAssump?.confidence !== undefined && (
                              <span className="text-[10px] font-mono text-purple-700 dark:text-purple-400 shrink-0">
                                {detailedAssump.confidence}%
                              </span>
                            )}
                          </div>
                          {!isEditing && detailedAssump?.reason && (
                            <p className="text-[11px] text-purple-800 dark:text-purple-300/80 mt-0.5 italic">
                              Why unverified: {detailedAssump.reason}
                            </p>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* UNKNOWNS */}
            <div className="p-4 rounded-lg bg-stone-100/70 dark:bg-stone-850 border border-stone-200 dark:border-stone-800">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-stone-200 dark:border-stone-700">
                <div className="flex items-center gap-1.5">
                  <FileQuestion className="w-4 h-4 text-stone-600 dark:text-stone-400" />
                  <span className="text-xs font-bold font-mono tracking-wider text-stone-900 dark:text-stone-200">
                    UNKNOWNS
                  </span>
                </div>
                <span className="text-[10px] font-mono text-stone-600 dark:text-stone-400 font-medium">
                  Cannot be established from artifact
                </span>
              </div>
              <ul className="space-y-2">
                {(!isEditing ? understanding.unknowns : editForm.unknowns).map((unk, idx) => {
                  const detailedUnk = detailed?.unknowns?.[idx];
                  return (
                    <li key={idx} className="text-xs text-stone-700 dark:text-stone-300">
                      <div className="flex items-start gap-2">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-stone-500 mt-1.5 shrink-0"></span>
                        <div className="flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-medium leading-relaxed">{unk}</span>
                            {!isEditing && detailedUnk?.priority && (
                              <span
                                className={`text-[10px] font-mono uppercase px-1.5 py-0.2 rounded shrink-0 ${
                                  detailedUnk.priority === 'high'
                                    ? 'bg-red-200 dark:bg-red-900/50 text-red-800 dark:text-red-200 font-bold'
                                    : 'bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-300'
                                }`}
                              >
                                {detailedUnk.priority}
                              </span>
                            )}
                          </div>
                          {!isEditing && detailedUnk?.whyItMatters && (
                            <p className="text-[11px] text-stone-600 dark:text-stone-400 mt-0.5 italic">
                              Why it matters: {detailedUnk.whyItMatters}
                            </p>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>

        {/* 4. Confirmation / Edit Prompt Bar */}
        <div className="p-4 rounded-xl bg-stone-100 dark:bg-stone-850/80 border border-stone-200 dark:border-stone-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                understanding.isConfirmed
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
              }`}
            >
              {understanding.isConfirmed ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : (
                <HelpCircle className="w-5 h-5" />
              )}
            </div>
            <div>
              <h4 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                {understanding.isConfirmed
                  ? 'Understanding Confirmed'
                  : 'Is this understanding correct?'}
              </h4>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                {understanding.isConfirmed
                  ? 'The AI will evaluate this artifact using this confirmed ground truth.'
                  : 'Review the facts and inferences above. Confirm or edit before providing remaining context.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            {!understanding.isConfirmed ? (
              <>
                <button
                  type="button"
                  onClick={handleStartEdit}
                  disabled={isAnalyzing}
                  className="px-4 py-2 text-xs font-medium rounded-lg border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:bg-white dark:hover:bg-stone-800 transition-colors disabled:opacity-50"
                >
                  Edit Understanding
                </button>
                <button
                  type="button"
                  onClick={handleConfirmClick}
                  disabled={isAnalyzing}
                  className="px-5 py-2 text-xs font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>Confirm Understanding</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleStartEdit}
                disabled={isAnalyzing}
                className="px-3.5 py-1.5 text-xs font-medium rounded-lg border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:bg-white dark:hover:bg-stone-800 transition-colors"
              >
                Modify Confirmed Context
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
