import React, { useCallback, useEffect, useState } from 'react';
import { Header } from './components/Header';
import { WorkspaceForm } from './components/WorkspaceForm';
import { ResultsView } from './components/ResultsView';
import { AnalysisLoadingModal } from './components/AnalysisLoadingModal';
import { RedTeamModal } from './components/RedTeamModal';
import { HistoryDrawer } from './components/HistoryDrawer';
import { StandingLimitations } from './components/StandingLimitations';
import { PrivacyDisclosure } from './components/PrivacyDisclosure';
import { FailureView, InsufficientView } from './components/RunOutcomeView';
import { DecisionsList } from './components/DecisionsList';
import { DecisionDetail } from './components/DecisionDetail';
import {
  AnalysisProgressStep,
  ProductContext,
  ProductReview,
  RunResult,
} from './types';
import {
  sampleProductContext,
  sampleRawEvidence,
  sampleProductReview,
  sampleDecisionQuestion,
} from './data/sampleReview';
import { reviewService } from './services/reviewService';
import {
  listStoredDecisions,
  openStoredDecision,
  persistDecision,
  type StoredDecision,
  type StoredDecisions,
} from './services/decisionPersistence';
import { navigate, useRoute } from './routing/route';
import * as telemetry from './services/telemetryClient';
import type { EditDistanceBand } from './integrity/decisionQuestion';
import {
  deleteLocalData,
  hasAcknowledgedPrivacy,
} from './integrity/disclosures';

const emptyContext: ProductContext = {
  name: '',
  whatBuilding: '',
  targetUser: '',
  primaryGoal: '',
  currentProblem: '',
  productUrl: '',
  additionalContext: '',
  screenshotUrl: undefined,
  screenshotName: undefined,
  artifactUnderstanding: undefined,
};

export default function App() {
  const [currentTab, setCurrentTab] = useState<'workspace' | 'results'>('workspace');
  const [context, setContext] = useState<ProductContext>(emptyContext);
  const [rawEvidence, setRawEvidence] = useState<string>('');

  /**
   * Stage 4 · CAP-04. The confirmed decision question, held beside the context
   * rather than inside it. It identifies the decision; `ProductContext`
   * describes the product, and two dozen modules read that.
   */
  const [decisionQuestion, setDecisionQuestion] = useState<string | null>(null);

  /**
   * Stage 1 · The result is the run outcome, not a review.
   *
   * FR-41: VERDICT, INSUFFICIENT and FAILED are three states the interface
   * holds and renders differently. Before this, a failure reached
   * `console.error` inside a catch and the user saw the form again with no
   * message at all (NFR-6).
   */
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [reviewHistory, setReviewHistory] = useState<ProductReview[]>([]);
  /*
   * Stage 6 · CAP-12: "If a decision cannot be kept, the product says so at
   * the time." One sentence, from the storage taxonomy, never a browser error.
   * Null is the ordinary case, including when there was nothing to store.
   */
  const [storageNotice, setStorageNotice] = useState<string | null>(null);
  /*
   * Stage 7 · §10. The path to the decision this run was kept as.
   *
   * It is the id the pipeline already minted and Stage 6 already stored — no
   * second decision, no second id, and nothing re-derived from the review.
   */
  const [keptDecisionId, setKeptDecisionId] = useState<string | null>(null);

  /*
   * Stage 7 · The decisions surface.
   *
   * Both pieces of state hold what the store answered, including when the
   * answer was "not there" or "would not open". Neither is a cache: the route
   * is what decides when they are read, and nothing writes to them but the
   * effect below.
   */
  const route = useRoute();
  const [decisionsState, setDecisionsState] = useState<StoredDecisions | { status: 'loading' }>({
    status: 'loading',
  });
  const [decisionState, setDecisionState] = useState<StoredDecision | { status: 'loading' }>({
    status: 'loading',
  });

  useEffect(() => {
    let current = true;
    if (route.name === 'decisions') {
      setDecisionsState({ status: 'loading' });
      void listStoredDecisions().then((next) => {
        if (current) setDecisionsState(next);
      });
    } else if (route.name === 'decision') {
      setDecisionState({ status: 'loading' });
      void openStoredDecision(route.id).then((next) => {
        if (current) setDecisionState(next);
      });
    }
    // The route changing mid-read must not let a stale answer land.
    return () => {
      current = false;
    };
  }, [route.name, route.name === 'decision' ? route.id : '']);

  const [decisionId, setDecisionId] = useState<string>(() => telemetry.mintDecisionId());
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progressSteps, setProgressSteps] = useState<AnalysisProgressStep[]>([]);
  const [isRedTeamModalOpen, setIsRedTeamModalOpen] = useState(false);
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);

  // PR-1: the disclosure gates the first upload, and the upload it gates is
  // resumed once it is acknowledged.
  const [privacyGateOpen, setPrivacyGateOpen] = useState(false);
  const pendingUploadRef = React.useRef<(() => void) | null>(null);

  const currentReview = runResult?.kind === 'VERDICT' ? runResult.review : null;

  const handleUpdateContext = (updates: Partial<ProductContext>) => {
    setContext((prev) => ({ ...prev, ...updates }));
  };

  /**
   * PR-1. Any code path that is about to send an artifact to the provider calls
   * this first. It resolves immediately once this browser has acknowledged.
   */
  const requestUploadConsent = useCallback((proceed: () => void) => {
    if (hasAcknowledgedPrivacy()) {
      proceed();
      return;
    }
    pendingUploadRef.current = proceed;
    setPrivacyGateOpen(true);
  }, []);

  const handlePrivacyAcknowledged = () => {
    setPrivacyGateOpen(false);
    const pending = pendingUploadRef.current;
    pendingUploadRef.current = null;
    pending?.();
  };

  const handlePrivacyCancelled = () => {
    setPrivacyGateOpen(false);
    pendingUploadRef.current = null;
  };

  /**
   * CAP-04's primary action, and §56.1's measurement of it. The band is the
   * only thing about the wording that is ever emitted: §55 has no field that
   * could carry the sentence, and this does not add one.
   */
  /** §55: emitted when a proposal actually arrives, never when one is absent. */
  const handleQuestionProposed = () => {
    telemetry.emit('question_proposed', { decisionId });
  };

  const handleConfirmDecisionQuestion = (question: string, band: EditDistanceBand) => {
    setDecisionQuestion(question);
    telemetry.emit('question_confirmed', { decisionId, editDistanceBand: band });
  };

  const handlePreloadSample = () => {
    // TR-8: the sample is labelled as a sample wherever it appears, and it is
    // the only thing in the product that carries isSample.
    setContext(sampleProductContext);
    setRawEvidence(sampleRawEvidence);
    // TR-8 again: the sample carries the sample's own question, and it is
    // labelled a sample everywhere it appears.
    setDecisionQuestion(sampleDecisionQuestion);
    setRunResult({ kind: 'VERDICT', review: sampleProductReview });
  };

  const handleResetToBlank = () => {
    setContext(emptyContext);
    setRawEvidence('');
    setDecisionQuestion(null);
    setRunResult(null);
    setProgressSteps([]);
    setDecisionId(telemetry.mintDecisionId());
    setCurrentTab('workspace');
  };

  /**
   * PR-4, PR-8, TEL-9. What deletion can reach in this build: the decision in
   * the page and what this browser stored. The disclosure on the limitations
   * surface already states what it does not reach.
   */
  const handleDeleteEverything = () => {
    telemetry.emit('decision_deleted', { decisionId });
    void telemetry.flush();
    setContext(emptyContext);
    setRawEvidence('');
    setDecisionQuestion(null);
    setRunResult(null);
    setReviewHistory([]);
    setProgressSteps([]);
    deleteLocalData();
    telemetry.discardQueued();
    setDecisionId(telemetry.mintDecisionId());
    setCurrentTab('workspace');
  };

  const handleRunReview = async () => {
    setIsAnalyzing(true);
    setProgressSteps([]);
    telemetry.emit('judge_started', { decisionId });

    const startedAt = Date.now();
    const result = await reviewService.runReview(
      { context, decisionQuestion: decisionQuestion ?? '', rawEvidence },
      (steps) => setProgressSteps(steps)
    );

    setRunResult(result);

    /*
     * Stage 6 · CAP-12. The canonical Decision becomes durable here, and this
     * is the only place it is stored.
     *
     * What is persisted is `result.decision` — the Decision the server built
     * and validated — never `result.review`, which is presentation state for
     * the surfaces that have not moved yet. A run with no decision (a sample,
     * or a response this build could not read) stores nothing rather than
     * assembling one out of the review.
     *
     * The await is deliberate: the PM is told before the results tab opens,
     * rather than finding out later that nothing was kept. It cannot change
     * the outcome — `persistDecision` returns, it does not throw.
     */
    setStorageNotice(null);
    setKeptDecisionId(null);
    if (result.kind !== 'FAILED' && result.decision) {
      const kept = await persistDecision(result.decision);
      if (!kept.stored) setStorageNotice(kept.userMessage ?? null);
      // §10: the decision the PM can now open is the one just stored, by the
      // id it was stored under. A refusal is stored too, and is just as
      // openable — CAP-18's outcome is a decision, not a failed attempt.
      else setKeptDecisionId(result.decision.id);
    }

    // §55. Three outcomes, three events. A failure is not a refusal and does
    // not emit a refusal event (E1's correction is the reason both refusal
    // kinds exist and neither covers a failure).
    if (result.kind === 'VERDICT') {
      telemetry.emit('verdict_issued', {
        decisionId,
        outcome: 'verdict',
        durationMs: Date.now() - startedAt,
      });
      setReviewHistory((prev) => [result.review, ...prev.filter((r) => r.id !== result.review.id)]);
    } else if (result.kind === 'INSUFFICIENT') {
      telemetry.emit(result.refusedAt === 'CEILING' ? 'ceiling_refused' : 'gate_refused', {
        decisionId,
        refusedAt: result.refusedAt === 'CEILING' ? 'ceiling' : 'gate',
        durationMs: Date.now() - startedAt,
      });
    }
    // A FAILED run emits nothing: §55 has no event kind for it, because a
    // technical failure is not a decision outcome. Adding one would put a
    // failure in the denominators that measure refusals.

    setIsAnalyzing(false);
    setCurrentTab('results');
  };

  const handleSelectReviewFromHistory = (selected: ProductReview) => {
    setRunResult({ kind: 'VERDICT', review: selected });
    setContext(selected.context);
    setRawEvidence(selected.evidenceRaw || '');
    telemetry.emit('decision_opened', { decisionId });
    setCurrentTab('results');
  };

  return (
    <div className="min-h-screen flex flex-col bg-stone-100/60 dark:bg-stone-950 text-stone-900 dark:text-stone-100 font-sans antialiased selection:bg-amber-500/20 selection:text-amber-900">
      <Header
        currentTab={currentTab}
        hasResults={runResult !== null}
        onNavigate={(tab) => {
          navigate({ name: 'run' });
          setCurrentTab(tab);
        }}
        onOpenHistory={() => setIsHistoryDrawerOpen(true)}
        onLoadSample={() => {
          navigate({ name: 'run' });
          handlePreloadSample();
          setCurrentTab('workspace');
        }}
        onNewReview={() => {
          navigate({ name: 'run' });
          handleResetToBlank();
        }}
        onOpenDecisions={() => navigate({ name: 'decisions' })}
        decisionsActive={route.name !== 'run'}
      />

      <main className="flex-1 pb-4">
        {/*
          Stage 7 · Two addresses, and the run surface everything else lives
          on. The decisions surface renders the canonical Decision the store
          answered with; it is never assembled from the run that is in memory.
        */}
        {route.name === 'decisions' ? (
          <DecisionsList
            state={decisionsState}
            onOpen={(id) => {
              telemetry.emit('decision_opened', { decisionId });
              navigate({ name: 'decision', id });
            }}
            onStartNew={() => {
              navigate({ name: 'run' });
              handleResetToBlank();
            }}
          />
        ) : route.name === 'decision' ? (
          <DecisionDetail state={decisionState} onBack={() => navigate({ name: 'decisions' })} />
        ) : (
          <>
        {/*
          CAP-12's failure state, said at the time and said once. It is not an
          alert and not a modal: the deliberation succeeded, and only the
          keeping of it did not.
        */}
        {keptDecisionId && currentTab === 'results' && (
          <p className="max-w-3xl mx-auto px-4 sm:px-6 pt-4 text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
            Kept on this device.{' '}
            <button
              type="button"
              onClick={() => navigate({ name: 'decision', id: keptDecisionId })}
              className="underline underline-offset-4 hover:text-stone-900 dark:hover:text-stone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-500 rounded-sm"
            >
              Open this decision
            </button>
          </p>
        )}
        {storageNotice && currentTab === 'results' && (
          <p
            role="status"
            className="max-w-3xl mx-auto px-4 sm:px-6 pt-4 text-xs text-stone-600 dark:text-stone-400 leading-relaxed"
          >
            {storageNotice}
          </p>
        )}
        {currentTab === 'workspace' ? (
          <WorkspaceForm
            context={context}
            rawEvidence={rawEvidence}
            onChangeContext={handleUpdateContext}
            onChangeEvidence={(val) => setRawEvidence(val)}
            onSubmit={handleRunReview}
            isLoading={isAnalyzing}
            onPreloadSample={handlePreloadSample}
            onResetWorkspace={handleResetToBlank}
            decisionQuestion={decisionQuestion}
            onConfirmDecisionQuestion={handleConfirmDecisionQuestion}
            onQuestionProposed={handleQuestionProposed}
            requestUploadConsent={requestUploadConsent}
          />
        ) : runResult?.kind === 'FAILED' ? (
          <FailureView
            failure={runResult}
            onRetry={() => {
              setCurrentTab('workspace');
              void handleRunReview();
            }}
            onBackToWorkspace={() => setCurrentTab('workspace')}
          />
        ) : runResult?.kind === 'INSUFFICIENT' ? (
          <InsufficientView
            refusal={runResult}
            onSupplyEvidence={() => setCurrentTab('workspace')}
          />
        ) : (
          currentReview && (
            <ResultsView
              review={currentReview}
              provenance={runResult?.kind === 'VERDICT' ? runResult.provenance : undefined}
              onBackToWorkspace={() => setCurrentTab('workspace')}
              onChallengeDecision={() => {
                telemetry.emit('challenge_requested', { decisionId });
                setIsRedTeamModalOpen(true);
              }}
            />
          )
        )}
          </>
        )}
      </main>

      {/* §53, TR-11: permanent, on every surface, and not a modal. */}
      <StandingLimitations />

      <AnalysisLoadingModal isOpen={isAnalyzing} steps={progressSteps} />

      {privacyGateOpen && (
        <PrivacyDisclosure
          onAcknowledge={handlePrivacyAcknowledged}
          onCancel={handlePrivacyCancelled}
        />
      )}

      {currentReview && (
        <RedTeamModal
          isOpen={isRedTeamModalOpen}
          onClose={() => setIsRedTeamModalOpen(false)}
          review={currentReview}
        />
      )}

      <HistoryDrawer
        isOpen={isHistoryDrawerOpen}
        onClose={() => setIsHistoryDrawerOpen(false)}
        reviews={reviewHistory}
        onSelectReview={handleSelectReviewFromHistory}
        onDeleteEverything={handleDeleteEverything}
        activeReviewId={currentReview?.id}
      />
    </div>
  );
}
