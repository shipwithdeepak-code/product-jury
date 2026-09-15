import React, { useState } from 'react';
import { Header } from './components/Header';
import { WorkspaceForm } from './components/WorkspaceForm';
import { ResultsView } from './components/ResultsView';
import { AnalysisLoadingModal } from './components/AnalysisLoadingModal';
import { RedTeamModal } from './components/RedTeamModal';
import { HistoryDrawer } from './components/HistoryDrawer';
import {
  ProductContext,
  ProductReview,
  AnalysisProgressStep,
} from './types';
import {
  sampleProductContext,
  sampleRawEvidence,
  sampleProductReview,
} from './data/sampleReview';
import { reviewService } from './services/reviewService';

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
  const [currentReview, setCurrentReview] = useState<ProductReview | null>(null);
  const [reviewHistory, setReviewHistory] = useState<ProductReview[]>([sampleProductReview]);

  // Modals & loading states
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState<AnalysisProgressStep | undefined>();
  const [isRedTeamModalOpen, setIsRedTeamModalOpen] = useState(false);
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);

  const handleUpdateContext = (updates: Partial<ProductContext>) => {
    setContext((prev) => ({ ...prev, ...updates }));
  };

  const handlePreloadSample = () => {
    setContext(sampleProductContext);
    setRawEvidence(sampleRawEvidence);
    setCurrentReview(sampleProductReview);
  };

  const handleResetToBlank = () => {
    setContext(emptyContext);
    setRawEvidence('');
    setCurrentReview(null);
    setCurrentTab('workspace');
  };

  const handleRunReview = async () => {
    setIsAnalyzing(true);
    try {
      const result = await reviewService.runReview(
        {
          context,
          rawEvidence,
        },
        (step) => {
          setAnalysisStep(step);
        }
      );

      setCurrentReview(result);
      // Append to local session review history
      setReviewHistory((prev) => [result, ...prev.filter((r) => r.id !== result.id)]);
      setCurrentTab('results');
    } catch (err) {
      console.error('Failed to run review:', err);
    } finally {
      setIsAnalyzing(false);
      setAnalysisStep(undefined);
    }
  };

  const handleSelectReviewFromHistory = (selected: ProductReview) => {
    setCurrentReview(selected);
    setContext(selected.context);
    setRawEvidence(selected.evidenceRaw || '');
    setCurrentTab('results');
  };

  return (
    <div className="min-h-screen flex flex-col bg-stone-100/60 dark:bg-stone-950 text-stone-900 dark:text-stone-100 font-sans antialiased selection:bg-amber-500/20 selection:text-amber-900">
      {/* Top Navigation */}
      <Header
        currentTab={currentTab}
        hasResults={currentReview !== null}
        onNavigate={(tab) => setCurrentTab(tab)}
        onOpenHistory={() => setIsHistoryDrawerOpen(true)}
        onLoadSample={() => {
          handlePreloadSample();
          setCurrentTab('workspace');
        }}
        onNewReview={handleResetToBlank}
      />

      {/* Main Workspace Content */}
      <main className="flex-1 pb-16">
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
          />
        ) : (
          currentReview && (
            <ResultsView
              review={currentReview}
              onBackToWorkspace={() => setCurrentTab('workspace')}
              onChallengeDecision={() => setIsRedTeamModalOpen(true)}
            />
          )
        )}
      </main>

      {/* Multi-agent loading pipeline modal */}
      <AnalysisLoadingModal
        isOpen={isAnalyzing}
        currentStep={analysisStep}
      />

      {/* Adversarial Red Team challenge placeholder */}
      {currentReview && (
        <RedTeamModal
          isOpen={isRedTeamModalOpen}
          onClose={() => setIsRedTeamModalOpen(false)}
          review={currentReview}
        />
      )}

      {/* Review History Drawer */}
      <HistoryDrawer
        isOpen={isHistoryDrawerOpen}
        onClose={() => setIsHistoryDrawerOpen(false)}
        reviews={reviewHistory}
        onSelectReview={handleSelectReviewFromHistory}
        activeReviewId={currentReview?.id}
      />
    </div>
  );
}
