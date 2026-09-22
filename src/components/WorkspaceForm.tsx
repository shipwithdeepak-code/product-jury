import React, { useRef, useState } from 'react';
import { ProductContext, ArtifactUnderstanding } from '../types';
import {
  Upload,
  Link2,
  Image as ImageIcon,
  X,
  FileText,
  Lightbulb,
  Sparkles,
  ArrowRight,
  Info,
  Layers,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Compass,
  FileQuestion,
  RotateCcw,
  ArrowDown,
  Check,
  Lock,
  Loader2,
} from 'lucide-react';
import {
  sampleProductContext,
  sampleRawEvidence,
} from '../data/sampleReview';
import { ArtifactUnderstandingCard } from './ArtifactUnderstandingCard';
import { ContextAlignmentCard } from './ContextAlignmentCard';
import { analyzeArtifactViaServer, compareContextViaServer } from '../services/contextAnalystClient';
import { SAMPLE_PRESETS, SamplePreset } from '../utils/sampleImageGenerator';
import { deriveContextFromText } from '../utils/contextDerivation';

interface WorkspaceFormProps {
  context: ProductContext;
  rawEvidence: string;
  onChangeContext: (updates: Partial<ProductContext>) => void;
  onChangeEvidence: (evidence: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  onPreloadSample: () => void;
  onResetWorkspace?: () => void;
  /**
   * PR-1 (launch blocker). Every path that is about to send an artifact to the
   * provider goes through this first. It calls back once this browser has been
   * told where the artifact goes, and never calls back if the PM declines.
   */
  requestUploadConsent: (proceed: () => void) => void;
}

export const WorkspaceForm: React.FC<WorkspaceFormProps> = ({
  context,
  rawEvidence,
  onChangeContext,
  onChangeEvidence,
  onSubmit,
  isLoading,
  onPreloadSample,
  onResetWorkspace,
  requestUploadConsent,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const contextSectionRef = useRef<HTMLDivElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isAnalyzingArtifact, setIsAnalyzingArtifact] = useState(false);
  const [artifactAnalysisError, setArtifactAnalysisError] = useState<string | null>(null);
  const [embeddedInstructionNotice, setEmbeddedInstructionNotice] = useState<string | null>(null);
  const [isComparingContext, setIsComparingContext] = useState(false);
  const [contextComparisonError, setContextComparisonError] = useState<string | null>(null);
  const [compareSuccessStatus, setCompareSuccessStatus] = useState<string | null>(null);
  const [userEditedFields, setUserEditedFields] = useState<{
    name?: boolean;
    whatBuilding?: boolean;
    targetUser?: boolean;
  }>({});

  const hasArtifact = Boolean(context.screenshotUrl || (context.productUrl && context.productUrl.trim().length > 3));
  const hasEnteredProductContext = Boolean(context.additionalContext?.trim());
  /*
   * Stage 1 \u00b7 CAP-01 failure state, \u00a751 never-1.
   *
   * This used to fall back to createDefaultArtifactUnderstanding(), which built
   * a reading out of the file name and the URL whenever a real one was absent.
   * An absent reading is now absent: the understanding card is not rendered and
   * the failure is stated instead.
   */
  const currentUnderstanding: ArtifactUnderstanding | undefined = context.artifactUnderstanding;

  const analyzeImage = (dataUrl: string, fileName?: string, mimeType?: string) => {
    // PR-1: the disclosure precedes the first upload, not the first result.
    requestUploadConsent(() => {
      void runArtifactAnalysis(dataUrl, fileName, mimeType);
    });
  };

  const runArtifactAnalysis = async (
    dataUrl: string,
    fileName?: string,
    mimeType?: string
  ) => {
    setIsAnalyzingArtifact(true);
    setArtifactAnalysisError(null);
    setEmbeddedInstructionNotice(null);
    setContextComparisonError(null);
    setCompareSuccessStatus(null);
    setIsComparingContext(false);
    setValidationError(null);
    setUserEditedFields({});

    // Reset file input element so re-uploading works smoothly
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    const cleanProductName = fileName
      ? fileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ')
      : 'Product Experience';

    // CRITICAL: When uploading or replacing a screenshot, clear previous
    // Product Context, previous Artifact Understanding, and previous Context Alignment.
    // The user must enter fresh context for the new review.
    onChangeContext({
      screenshotUrl: dataUrl,
      screenshotName: fileName || 'screenshot.png',
      name: cleanProductName,
      additionalContext: '', // Explicitly cleared on upload / replace
      artifactUnderstanding: undefined, // Explicitly reset
      whatBuilding: '',
      targetUser: '',
      primaryGoal: '',
      currentProblem: '',
      productUrl: '',
    });
    onChangeEvidence('');

    try {
      const detectedMime = mimeType || (dataUrl.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png');
      const { understanding, observations } = await analyzeArtifactViaServer(
        dataUrl,
        fileName || 'artifact.png',
        detectedMime
      );

      /*
       * SR-8. Instructions found inside the artifact are recorded and shown,
       * never obeyed. The server has already treated the artifact as data; this
       * is the disclosure half of the same requirement.
       */
      setEmbeddedInstructionNotice(
        observations.length > 0
          ? `This artifact contains text that reads as an instruction (${observations
              .map((o) => o.kind)
              .join(', ')}). It was treated as content to judge, not as a direction to follow.`
          : null
      );

      // Successfully received visual-only understanding
      // Keep contextAlignment undefined - do NOT run context alignment during visual analysis
      onChangeContext({
        screenshotUrl: dataUrl,
        screenshotName: fileName || 'artifact.png',
        name: cleanProductName,
        additionalContext: '', // Ensure context remains empty for the new review
        artifactUnderstanding: {
          ...understanding,
          contextAlignment: undefined,
        },
        whatBuilding: understanding.detectedJourney,
        targetUser: understanding.likelyUser,
      });
      setValidationError(null);
    } catch (err: any) {
      console.warn('Gemini multimodal visual analysis error:', err);
      const rawMsg = err.message || 'Gemini analysis encountered a temporary issue. You can retry or edit manually.';
      setArtifactAnalysisError(rawMsg);
      /*
       * CAP-01 failure state: "If the artifact cannot be read, the product says
       * so, gives the real reason, and offers a retry. It never shows an
       * understanding it did not derive, and it never guesses from a filename."
       *
       * The screenshot is kept so the retry has something to retry with. The
       * reading stays undefined.
       */
      onChangeContext({
        screenshotUrl: dataUrl,
        screenshotName: fileName || 'artifact.png',
        additionalContext: '',
        artifactUnderstanding: undefined,
      });
    } finally {
      setIsAnalyzingArtifact(false);
    }
  };

  const handleFile = (file: File) => {
    if (!file.type.match('image/(png|jpeg|jpg|webp)')) {
      setValidationError('Please upload a valid PNG, JPG, or WebP screenshot.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      analyzeImage(dataUrl, file.name, file.type);
    };
    reader.readAsDataURL(file);
  };

  const handleSelectPreset = (preset: SamplePreset) => {
    setValidationError(null);
    const dataUrl = preset.generateDataUrl();
    analyzeImage(dataUrl, `${preset.name}.png`, 'image/png');
  };

  const handleCompareContext = async () => {
    const trimmedContext = (context.additionalContext || '').trim();
    if (!trimmedContext) {
      setContextComparisonError('Please enter product context to compare with Gemini.');
      return;
    }
    if (!context.screenshotUrl) {
      setContextComparisonError('Please upload a screenshot artifact first.');
      return;
    }

    setIsComparingContext(true);
    setContextComparisonError(null);
    setCompareSuccessStatus(null);

    try {
      const visualFindings = context.artifactUnderstanding ? {
        productType: context.artifactUnderstanding.productType,
        likelyUser: context.artifactUnderstanding.likelyUser,
        detectedJourney: context.artifactUnderstanding.detectedJourney,
      } : undefined;

      const alignment = await compareContextViaServer(
        context.screenshotUrl,
        trimmedContext,
        context.screenshotName || 'artifact.png',
        'image/png',
        visualFindings
      );

      // An alignment belongs to a reading. Without one there is nothing to
      // attach it to, and inventing the reading is what \u00a751 forbids.
      if (!context.artifactUnderstanding) {
        setContextComparisonError(
          'There is no artifact reading to attach this comparison to. Read the artifact first.'
        );
        return;
      }
      onChangeContext({
        artifactUnderstanding: {
          ...context.artifactUnderstanding,
          contextAlignment: alignment,
        },
      });

      const labelMap: Record<string, string> = {
        aligned: 'Aligned',
        partially_aligned: 'Partially Aligned',
        conflict: 'Conflict Detected',
        insufficient_evidence: 'Insufficient Evidence',
      };
      setCompareSuccessStatus(`Context alignment evaluated: ${labelMap[alignment.status] || alignment.status}`);
    } catch (err: any) {
      console.warn('Context comparison error:', err);
      setContextComparisonError(err?.message || 'Failed to compare context with Gemini.');
    } finally {
      setIsComparingContext(false);
    }
  };

  const handleRetryAnalysis = () => {
    if (context.screenshotUrl) {
      analyzeImage(
        context.screenshotUrl,
        context.screenshotName || 'artifact.png',
        'image/png'
      );
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleAdditionalContextChange = (newVal: string) => {
    const derived = deriveContextFromText(newVal);
    const updates: Partial<ProductContext> = {
      additionalContext: newVal,
      artifactUnderstanding: context.artifactUnderstanding
        ? { ...context.artifactUnderstanding, contextAlignment: undefined }
        : undefined,
    };

    // Synchronize reliably derived fields into the shared context model
    // if the user has not manually customized them in Step 3
    if (derived.whatBuilding && !userEditedFields.whatBuilding) {
      updates.whatBuilding = derived.whatBuilding;
    } else if (!newVal.trim() && !userEditedFields.whatBuilding) {
      updates.whatBuilding = currentUnderstanding?.detectedJourney || '';
    }

    if (derived.targetUser && !userEditedFields.targetUser) {
      updates.targetUser = derived.targetUser;
    } else if (!newVal.trim() && !userEditedFields.targetUser) {
      updates.targetUser = currentUnderstanding?.likelyUser || '';
    }

    if (derived.productName && !userEditedFields.name) {
      const isDefaultName =
        !context.name ||
        context.name === 'Product Experience' ||
        context.name === (context.screenshotName ? context.screenshotName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ') : '');
      if (isDefaultName) {
        updates.name = derived.productName;
      }
    }

    onChangeContext(updates);
    if (compareSuccessStatus) setCompareSuccessStatus(null);
    if (contextComparisonError) setContextComparisonError(null);
  };

  const handleConfirmUnderstanding = () => {
    /*
     * There is nothing to confirm without a reading. Confirming an absent one
     * is how the old default reading entered the record (§51 never-1).
     */
    if (!currentUnderstanding) {
      setValidationError(
        'There is no artifact reading to confirm yet. Read the artifact first, or retry if the read failed.'
      );
      return;
    }
    const updated = {
      ...currentUnderstanding,
      isConfirmed: true,
    };
    const derived = deriveContextFromText(context.additionalContext || '');
    onChangeContext({
      artifactUnderstanding: updated,
      whatBuilding: context.whatBuilding || derived.whatBuilding || updated.detectedJourney,
      targetUser: context.targetUser || derived.targetUser || updated.likelyUser,
      name:
        context.name ||
        derived.productName ||
        (context.screenshotName ? context.screenshotName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ') : 'Product Experience'),
    });
    setValidationError(null);

    // Smooth scroll down to the revealed context questions
    setTimeout(() => {
      contextSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleUpdateUnderstanding = (updated: ArtifactUnderstanding) => {
    onChangeContext({
      artifactUnderstanding: updated,
      whatBuilding: updated.detectedJourney,
      targetUser: updated.likelyUser,
    });
  };

  const handleRemoveArtifact = () => {
    // Reset file input element so re-selecting any file fires onChange
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    // Reset local states in WorkspaceForm
    setIsAnalyzingArtifact(false);
    setArtifactAnalysisError(null);
    setIsComparingContext(false);
    setContextComparisonError(null);
    setCompareSuccessStatus(null);
    setValidationError(null);
    setUserEditedFields({});

    // Reset all review context to clean initial empty state
    onChangeContext({
      name: '',
      whatBuilding: '',
      targetUser: '',
      primaryGoal: '',
      currentProblem: '',
      productUrl: '',
      additionalContext: '', // Clear product context textarea value
      screenshotUrl: undefined, // Clear screenshot data
      screenshotName: undefined, // Clear screenshot filename
      artifactUnderstanding: undefined, // Clear artifact understanding and context alignment
    });
    onChangeEvidence('');

    onResetWorkspace?.();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!hasArtifact) {
      setValidationError('Please provide a screenshot artifact or product URL first.');
      return;
    }

    if (!currentUnderstanding) {
      setValidationError(
        'The artifact has not been read yet, so there is nothing for the panel to judge. Retry the read above.'
      );
      return;
    }

    if (!currentUnderstanding?.isConfirmed) {
      setValidationError('Please confirm or refine the artifact understanding above before running the jury.');
      return;
    }

    if (!context.whatBuilding?.trim()) {
      setValidationError('Please specify what you are building.');
      return;
    }
    if (!context.targetUser?.trim()) {
      setValidationError('Please specify who the target user is.');
      return;
    }
    if (!context.primaryGoal?.trim()) {
      setValidationError('Please specify the primary product or business goal.');
      return;
    }
    setValidationError(null);
    onSubmit();
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-stone-200 dark:border-stone-800">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 text-xs font-mono mb-2">
              <Layers className="w-3.5 h-3.5 text-stone-500" />
              <span>ARTIFACT-FIRST REVIEW • SPECIALIST JURY</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
              New Product Review
            </h1>
            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
              Start with your screen artifact or URL. The AI analyzes visual friction, extracts knowledge, and only asks for missing critical context.
            </p>
          </div>

          <button
            type="button"
            onClick={onPreloadSample}
            className="self-start sm:self-center inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-800 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700 border border-stone-300 dark:border-stone-700 transition-colors shadow-2xs cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>Load Demo SaaS Flow</span>
          </button>
        </div>

        {/* Workflow Progression Stepper */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div
            className={`p-3 rounded-lg border text-xs flex items-center gap-3 transition-colors ${
              hasArtifact
                ? 'bg-stone-50 dark:bg-stone-900 border-stone-300 dark:border-stone-700 text-stone-900 dark:text-stone-100 font-medium'
                : 'bg-stone-900 dark:bg-stone-100 border-transparent text-white dark:text-stone-900 font-semibold shadow-xs'
            }`}
          >
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center font-mono text-xs ${
                hasArtifact
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-white/20 text-white dark:bg-stone-800 dark:text-white'
              }`}
            >
              {hasArtifact ? <Check className="w-3.5 h-3.5" /> : '1'}
            </div>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-stone-400">Step 1</div>
              <div>Provide Screen Artifact</div>
            </div>
          </div>

          <div
            className={`p-3 rounded-lg border text-xs flex items-center gap-3 transition-colors ${
              !hasArtifact
                ? 'opacity-40 border-stone-200 dark:border-stone-800 text-stone-500'
                : !currentUnderstanding?.isConfirmed
                ? 'bg-stone-900 dark:bg-stone-100 border-transparent text-white dark:text-stone-900 font-semibold shadow-xs'
                : 'bg-stone-50 dark:bg-stone-900 border-stone-300 dark:border-stone-700 text-stone-900 dark:text-stone-100 font-medium'
            }`}
          >
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center font-mono text-xs ${
                currentUnderstanding?.isConfirmed
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300'
              }`}
            >
              {currentUnderstanding?.isConfirmed ? <Check className="w-3.5 h-3.5" /> : '2'}
            </div>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-wider opacity-75">Step 2</div>
              <div>Artifact Understanding</div>
            </div>
          </div>

          <div
            className={`p-3 rounded-lg border text-xs flex items-center gap-3 transition-colors ${
              !currentUnderstanding?.isConfirmed
                ? 'opacity-40 border-stone-200 dark:border-stone-800 text-stone-500'
                : 'bg-stone-900 dark:bg-stone-100 border-transparent text-white dark:text-stone-900 font-semibold shadow-xs'
            }`}
          >
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center font-mono text-xs ${
                currentUnderstanding?.isConfirmed
                  ? 'bg-white/20 text-white dark:bg-stone-800 dark:text-white'
                  : 'bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300'
              }`}
            >
              3
            </div>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-wider opacity-75">Step 3</div>
              <div>Confirm Critical Context</div>
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* STEP 1: Product Artifact (Screenshot / URL) */}
        <section className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="inline-flex items-center gap-2 text-xs font-mono font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                <span>1. Product Artifact</span>
                {hasArtifact && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-400 font-normal">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Loaded</span>
                  </span>
                )}
              </div>
              <h2 className="text-base font-bold text-stone-900 dark:text-stone-100 mt-0.5">
                Upload Screenshot or Provide Product URL
              </h2>
            </div>
            <span className="text-xs font-mono text-stone-400">Primary Starting Point</span>
          </div>

          <div className="space-y-5">
            {/* Screenshot upload zone or preview */}
            <div>
              <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-2">
                Screenshot / Screen Recording Still <span className="text-stone-400 font-normal">(PNG, JPG, WebP)</span>
              </label>

              {/* Hidden file input for initial upload, dropzone fallback, and replacement */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFile(e.target.files[0]);
                  }
                }}
              />

              {context.screenshotUrl ? (
                /* Artifact Active Preview Container */
                <div className="rounded-xl border border-stone-200 dark:border-stone-700 overflow-hidden bg-stone-950 p-3">
                  <div className="relative max-h-72 flex items-center justify-center overflow-hidden rounded-lg bg-stone-900">
                    <img
                      src={context.screenshotUrl}
                      alt="Uploaded product screen preview"
                      className="max-h-64 w-auto object-contain"
                    />
                  </div>
                  <div className="mt-3 flex items-center justify-between px-2 text-xs text-stone-300 font-mono">
                    <div className="flex items-center gap-2 truncate">
                      <ImageIcon className="w-4 h-4 text-stone-400 shrink-0" />
                      <span className="truncate font-semibold">{context.screenshotName || 'screen-artifact.png'}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-xs text-stone-300 hover:text-white underline underline-offset-2 transition-colors cursor-pointer"
                      >
                        Replace
                      </button>
                      <button
                        type="button"
                        onClick={handleRemoveArtifact}
                        className="inline-flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300 transition-colors cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Remove</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Dropzone Container */
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragActive(true);
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                    dragActive
                      ? 'border-stone-900 bg-stone-50 dark:border-stone-300 dark:bg-stone-800/60'
                      : 'border-stone-200 dark:border-stone-700 hover:border-stone-400 dark:hover:border-stone-600 bg-stone-50/50 dark:bg-stone-850/40'
                  }`}
                >
                  <div className="flex flex-col items-center justify-center gap-2.5">
                    <div className="w-12 h-12 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-stone-600 dark:text-stone-300 shadow-2xs">
                      <Upload className="w-5 h-5" />
                    </div>
                    <div className="text-sm text-stone-800 dark:text-stone-200 font-semibold">
                      <span className="underline underline-offset-2 text-stone-900 dark:text-white">Click to upload screenshot</span> or drag and drop
                    </div>
                    <p className="text-xs text-stone-500 dark:text-stone-400 max-w-md">
                      PNG, JPG, or WebP up to 10MB. Gemini multimodal inspection extracts detected product type, user role, primary journey, friction signals, facts, inferences, assumptions, and unknowns.
                    </p>

                    {/* Quick Test Presets */}
                    <div className="pt-3 w-full max-w-xl">
                      <div className="text-[11px] font-mono text-stone-500 dark:text-stone-400 mb-2 flex items-center justify-center gap-1.5">
                        <Sparkles className="w-3 h-3 text-amber-500" />
                        <span>Or test Gemini analysis with 1 click on sample screens:</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-left">
                        {SAMPLE_PRESETS.map((preset) => (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectPreset(preset);
                            }}
                            className="p-2.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 hover:border-stone-400 dark:hover:border-stone-500 hover:shadow-xs transition-all text-left group cursor-pointer"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-stone-100 dark:bg-stone-700 text-stone-700 dark:text-stone-300">
                                {preset.badge}
                              </span>
                              <span className="text-[10px] text-stone-400 group-hover:text-amber-500 transition-colors">
                                Run ➔
                              </span>
                            </div>
                            <div className="text-xs font-semibold text-stone-900 dark:text-stone-100 leading-tight">
                              {preset.name.split(' (')[0]}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Optional URL input */}
            <div className="pt-2 border-t border-stone-100 dark:border-stone-800">
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="product-url"
                  className="block text-xs font-medium text-stone-700 dark:text-stone-300"
                >
                  Product / Staging URL <span className="text-stone-400 font-normal">(Optional or Alternative to Screenshot)</span>
                </label>
                <span className="text-[11px] font-mono text-stone-400 bg-stone-100 dark:bg-stone-800 px-2 py-0.5 rounded">
                  Automated scraping in v1.1
                </span>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-stone-400">
                  <Link2 className="w-4 h-4" />
                </div>
                <input
                  id="product-url"
                  type="url"
                  placeholder="https://app.yourproduct.com/onboarding or staging wizard URL"
                  value={context.productUrl || ''}
                  onChange={(e) => {
                    // A URL the product has not fetched establishes nothing, so
                    // typing one no longer produces an artifact reading
                    // (\u00a751 never-1; \u00a747 rules out fetching it).
                    onChangeContext({ productUrl: e.target.value });
                  }}
                  className="w-full pl-9 pr-4 py-2 text-sm bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700 rounded-lg text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-900 dark:focus:ring-stone-400"
                />
              </div>
            </div>

            {/* Additional Product Context (Optional) */}
            <div className="pt-3 border-t border-stone-100 dark:border-stone-800 space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="additional-product-context"
                  className="block text-xs font-medium text-stone-700 dark:text-stone-300"
                >
                  Additional Product Context
                </label>
                <span className="text-[11px] font-mono text-stone-400 bg-stone-100 dark:bg-stone-800 px-2 py-0.5 rounded border border-stone-200 dark:border-stone-700/60">
                  Optional
                </span>
              </div>
              <textarea
                id="additional-product-context"
                rows={3}
                placeholder="Optional. Tell Gemini what this product is intended to support. For example: This is an internal employee dashboard for HR managers."
                value={context.additionalContext || ''}
                onChange={(e) => handleAdditionalContextChange(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700 rounded-lg text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-900 dark:focus:ring-stone-400 resize-none transition-colors"
              />
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
                  Optional. Tell Gemini what this product is intended to support. Gemini will only evaluate context alignment when you click "Compare Context with Gemini".
                </p>
                <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                  {compareSuccessStatus && (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>{compareSuccessStatus}</span>
                    </span>
                  )}
                  {hasArtifact && context.screenshotUrl && (
                    <button
                      type="button"
                      onClick={handleCompareContext}
                      disabled={isComparingContext || !context.additionalContext?.trim()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:hover:bg-white dark:text-stone-900 transition-colors shrink-0 shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {isComparingContext ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />
                          <span>Comparing context...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                          <span>Compare Context with Gemini</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
              {contextComparisonError && (
                <p className="text-xs text-rose-600 dark:text-rose-400 pt-1 font-medium">
                  {contextComparisonError}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* STEP 2: Gemini Artifact Understanding & Context Alignment */}
        {hasArtifact ? (
          <section className="space-y-4">
            {/* SR-8: what the artifact tried to tell the model, reported rather than followed. */}
            {embeddedInstructionNotice && (
              <div className="p-3.5 rounded-lg bg-stone-100 dark:bg-stone-800/60 border border-stone-300 dark:border-stone-700 text-xs text-stone-700 dark:text-stone-300 flex items-start gap-2.5">
                <Info className="w-4 h-4 text-stone-500 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{embeddedInstructionNotice}</span>
              </div>
            )}

            {currentUnderstanding ? (
              <ArtifactUnderstandingCard
                understanding={currentUnderstanding}
                onConfirm={handleConfirmUnderstanding}
                onUpdate={handleUpdateUnderstanding}
                screenshotUrl={context.screenshotUrl}
                screenshotName={context.screenshotName}
                productUrl={context.productUrl}
                onResetArtifact={handleRemoveArtifact}
                isAnalyzing={isAnalyzingArtifact}
                analysisError={artifactAnalysisError}
                onRetryAnalysis={handleRetryAnalysis}
              />
            ) : (
              /*
               * CAP-01 failure state. There is no reading, so none is drawn.
               * The card used to be rendered against a default understanding
               * assembled from the file name, which is the fabrication the
               * audit found first.
               */
              <div className="p-6 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 space-y-3">
                <div className="flex items-start gap-3">
                  {isAnalyzingArtifact ? (
                    <Loader2 className="w-5 h-5 text-amber-500 animate-spin shrink-0 mt-0.5" aria-hidden="true" />
                  ) : (
                    <FileQuestion className="w-5 h-5 text-stone-400 shrink-0 mt-0.5" aria-hidden="true" />
                  )}
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                      {isAnalyzingArtifact
                        ? 'Reading the artifact'
                        : artifactAnalysisError
                        ? 'The artifact was not read'
                        : 'No reading yet'}
                    </h3>
                    <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
                      {isAnalyzingArtifact
                        ? 'Nothing is shown until the read returns.'
                        : artifactAnalysisError
                        ? artifactAnalysisError
                        : 'Upload a screen, or provide one of the sample screens above, to have it read.'}
                    </p>
                    {!isAnalyzingArtifact && artifactAnalysisError && (
                      <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
                        Nothing was inferred from the file name in its place, and no understanding is
                        shown that the read did not produce.
                      </p>
                    )}
                  </div>
                </div>
                {!isAnalyzingArtifact && context.screenshotUrl && (
                  <button
                    type="button"
                    onClick={handleRetryAnalysis}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Read it again</span>
                  </button>
                )}
              </div>
            )}

            <ContextAlignmentCard
              hasArtifact={Boolean(context.screenshotUrl)}
              productContext={context.additionalContext || ''}
              contextAlignment={context.artifactUnderstanding?.contextAlignment}
              isComparingContext={isComparingContext}
              comparisonError={contextComparisonError}
              onCompareContext={handleCompareContext}
              onRetryComparison={handleCompareContext}
              onFocusContextInput={() => {
                const el = document.getElementById('additional-product-context');
                el?.focus();
                el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }}
            />
          </section>
        ) : (
          /* Placeholder prompt when no artifact uploaded yet */
          <div className="p-8 rounded-xl border-2 border-dashed border-stone-200 dark:border-stone-800 bg-stone-50/40 dark:bg-stone-900/30 text-center space-y-2">
            <div className="w-10 h-10 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center mx-auto text-stone-400">
              <Compass className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold text-stone-700 dark:text-stone-300">
              Step 2: Artifact Understanding will appear after upload
            </h3>
            <p className="text-xs text-stone-400 max-w-sm mx-auto">
              Once you upload a screen artifact or load the demo flow, the AI will extract detected product types, friction signals, facts, inferences, and unknowns.
            </p>
          </div>
        )}

        {/* STEP 3: Missing Critical Context */}
        {hasArtifact && (
          <div ref={contextSectionRef}>
            {currentUnderstanding?.isConfirmed ? (
              /* Unlocked Critical Context Form */
              <section className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-6 shadow-xs space-y-6 transition-all">
                <div className="flex items-center justify-between pb-4 border-b border-stone-100 dark:border-stone-800">
                  <div>
                    <div className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>3. Strategic Deliberation Context (UNLOCKED)</span>
                    </div>
                    <h2 className="text-base font-bold text-stone-900 dark:text-stone-100 mt-0.5">
                      Supply the Unknowns Needed for Jury Deliberation
                    </h2>
                    <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
                      {hasEnteredProductContext
                        ? 'Your product context has been connected. Review the pre-filled fields and supply the remaining strategic unknowns below.'
                        : 'The AI knows the visual surface, but needs your strategic intent to deliberate effectively.'}
                    </p>
                  </div>
                  <span className="text-xs font-mono text-stone-400 bg-stone-100 dark:bg-stone-800 px-2.5 py-1 rounded">
                    Final Step
                  </span>
                </div>

                {/* Progressive Disclosure Notice when context was provided in Step 1 */}
                {hasEnteredProductContext && (
                  <div className="p-4 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/25 border border-emerald-200/80 dark:border-emerald-800/60 flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </div>
                    <div className="space-y-1 text-xs">
                      <div className="font-bold text-emerald-950 dark:text-emerald-200">
                        Some context has already been provided. Review or complete the remaining details below.
                      </div>
                      <p className="text-stone-600 dark:text-stone-300 leading-relaxed text-[11px]">
                        We connected your Step 1 product context (<span className="font-medium text-stone-800 dark:text-stone-200 italic">“{context.additionalContext!.length > 120 ? context.additionalContext!.slice(0, 120) + '…' : context.additionalContext}”</span>) to pre-fill the product purpose and target user. You can edit any details below.
                      </p>
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  {/* Section: Established / Inferred Context */}
                  <div className="space-y-3.5">
                    {/* Product Name */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label
                          htmlFor="product-name"
                          className="block text-xs font-medium text-stone-700 dark:text-stone-300"
                        >
                          Product / Feature Name
                        </label>
                        {context.name && (
                          <span className="text-[10px] font-mono text-stone-400">
                            {userEditedFields.name
                              ? 'User Edited'
                              : hasEnteredProductContext
                              ? 'Pre-filled from context'
                              : 'Pre-filled'}
                          </span>
                        )}
                      </div>
                      <input
                        id="product-name"
                        type="text"
                        placeholder="e.g. FlowPilot (Customer Journey Automations)"
                        value={context.name}
                        onChange={(e) => {
                          setUserEditedFields((prev) => ({ ...prev, name: true }));
                          onChangeContext({ name: e.target.value });
                        }}
                        className="w-full px-3.5 py-2 text-sm bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700 rounded-lg text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-900 dark:focus:ring-stone-400"
                      />
                    </div>

                    {/* What are you building? */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label
                          htmlFor="what-building"
                          className="block text-xs font-medium text-stone-700 dark:text-stone-300"
                        >
                          What are you building? <span className="text-rose-500">*</span>
                        </label>
                        <span
                          className={`text-[11px] font-mono px-2 py-0.5 rounded ${
                            hasEnteredProductContext
                              ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-800/60'
                              : 'text-stone-400'
                          }`}
                        >
                          {userEditedFields.whatBuilding
                            ? 'User Edited'
                            : hasEnteredProductContext
                            ? 'Pre-filled from Additional Product Context'
                            : 'Pre-filled from Detected Journey'}
                        </span>
                      </div>
                      <textarea
                        id="what-building"
                        rows={2}
                        placeholder="Describe the experience, capability, or user flow being reviewed..."
                        value={context.whatBuilding}
                        onChange={(e) => {
                          setUserEditedFields((prev) => ({ ...prev, whatBuilding: true }));
                          onChangeContext({ whatBuilding: e.target.value });
                        }}
                        className="w-full px-3.5 py-2 text-sm bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700 rounded-lg text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-900 dark:focus:ring-stone-400"
                        required
                      />
                    </div>

                    {/* Target User */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label
                          htmlFor="target-user"
                          className="block text-xs font-medium text-stone-700 dark:text-stone-300"
                        >
                          Who is the target user? <span className="text-rose-500">*</span>
                        </label>
                        <span
                          className={`text-[11px] font-mono px-2 py-0.5 rounded ${
                            hasEnteredProductContext
                              ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-800/60'
                              : 'text-stone-400'
                          }`}
                        >
                          {userEditedFields.targetUser
                            ? 'User Edited'
                            : hasEnteredProductContext
                            ? 'Pre-filled from Additional Product Context'
                            : 'Pre-filled from Detected Persona'}
                        </span>
                      </div>
                      <input
                        id="target-user"
                        type="text"
                        placeholder="e.g. Mid-market RevOps Managers and Growth Product Managers"
                        value={context.targetUser}
                        onChange={(e) => {
                          setUserEditedFields((prev) => ({ ...prev, targetUser: true }));
                          onChangeContext({ targetUser: e.target.value });
                        }}
                        className="w-full px-3.5 py-2 text-sm bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700 rounded-lg text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-900 dark:focus:ring-stone-400"
                        required
                      />
                    </div>
                  </div>

                  {/* Section: Truly Missing Strategic Unknowns */}
                  <div className="pt-2 border-t border-stone-100 dark:border-stone-800 space-y-4">
                    {/* Primary goal (CRITICAL UNKNOWN) */}
                    <div className="p-4 rounded-xl bg-purple-50/40 dark:bg-purple-950/20 border border-purple-200/60 dark:border-purple-900/40 space-y-2">
                      <div className="flex items-center justify-between">
                        <label
                          htmlFor="primary-goal"
                          className="block text-xs font-bold font-mono uppercase tracking-wider text-purple-900 dark:text-purple-200"
                        >
                          Primary Product / Business Goal <span className="text-rose-500">*</span>
                        </label>
                        <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-purple-200/70 dark:bg-purple-900/60 text-purple-900 dark:text-purple-200">
                          KEY UNKNOWN #1
                        </span>
                      </div>
                      <p className="text-xs text-purple-950/80 dark:text-purple-300/80">
                        The AI cannot know your business targets from screens or descriptions alone. What business or conversion metric determines success?
                      </p>
                      <input
                        id="primary-goal"
                        type="text"
                        placeholder="e.g. Achieve 45% day-14 activation rate by enabling self-serve users to publish their first live automation within 30 minutes"
                        value={context.primaryGoal}
                        onChange={(e) => onChangeContext({ primaryGoal: e.target.value })}
                        className="w-full px-3.5 py-2 text-sm bg-white dark:bg-stone-900 border border-purple-300/80 dark:border-purple-800 rounded-lg text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-purple-600"
                        required
                      />
                    </div>

                    {/* Observed Problem (EPISTEMIC UNKNOWN #2) */}
                    <div>
                      <label
                        htmlFor="current-problem"
                        className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1"
                      >
                        What problem or drop-off are you currently observing? <span className="text-stone-400 font-normal">(Optional)</span>
                      </label>
                      <textarea
                        id="current-problem"
                        rows={2}
                        placeholder="e.g. Signups are healthy (~800/wk), but only 18% activate. Amplitude shows 62% funnel loss at step 3 (Schema Mapping)..."
                        value={context.currentProblem || ''}
                        onChange={(e) => onChangeContext({ currentProblem: e.target.value })}
                        className="w-full px-3.5 py-2 text-sm bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700 rounded-lg text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-900 dark:focus:ring-stone-400"
                      />
                    </div>

                    {/* Grounding Evidence */}
                    <div className="pt-2">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <label
                            htmlFor="raw-evidence"
                            className="block text-xs font-medium text-stone-700 dark:text-stone-300"
                          >
                            Grounding Evidence & Research Log <span className="text-stone-400 font-normal">(Optional)</span>
                          </label>
                          <p className="text-[11px] text-stone-400">
                            Paste user interview quotes, funnel drop-off metrics, Hotjar heatmaps, or support tickets.
                          </p>
                        </div>
                        <span className="text-xs text-stone-400 font-mono">Transforms Assumptions into Facts</span>
                      </div>

                      <textarea
                        id="raw-evidence"
                        rows={4}
                        placeholder="Paste raw qualitative and quantitative evidence here... e.g.&#10;- Amplitude: 62% funnel loss at Step 3&#10;- User interview A: 'Didn't understand whether I could test dummy leads first'&#10;- Hotjar: 48% clicked docs instead of CTA"
                        value={rawEvidence}
                        onChange={(e) => onChangeEvidence(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-xs font-mono bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700 rounded-lg text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-900 dark:focus:ring-stone-400 leading-relaxed"
                      />
                    </div>
                  </div>
                </div>
              </section>
            ) : (
              /* Locked placeholder for Step 3 until Step 2 is confirmed */
              <div className="p-6 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/40 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-stone-200 dark:bg-stone-800 flex items-center justify-center text-stone-500">
                    <Lock className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-mono uppercase tracking-wider text-stone-400 font-semibold">
                      Step 3: Missing Critical Context (Locked)
                    </div>
                    <div className="text-sm font-semibold text-stone-800 dark:text-stone-200">
                      Confirm or edit the Artifact Understanding above to unlock the context questions
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleConfirmUnderstanding}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white shadow-2xs transition-colors cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Confirm & Unlock</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Validation error display */}
        {validationError && (
          <div className="p-3.5 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-800 dark:text-rose-300 flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{validationError}</span>
          </div>
        )}

        {/* Primary CTA Bar */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-stone-200 dark:border-stone-800">
          <div className="text-xs text-stone-500 dark:text-stone-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-stone-400" />
            <span>
              {/*
                Stage 1 · The Design Critic was named here and never ran: no
                agent, no prompt, no output. Naming a panelist the product does
                not have is the roster version of a fabricated review
                (§51 never-2). Two specialists exist, so two are named.
              */}
              Panel: <span className="font-semibold text-stone-700 dark:text-stone-300">UX Researcher</span> and <span className="font-semibold text-stone-700 dark:text-stone-300">Product Manager</span>, with an evidence audit and a jury chair.
            </span>
          </div>

          <button
            type="submit"
            disabled={isLoading || !hasArtifact || !currentUnderstanding?.isConfirmed}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-6 py-3 rounded-lg text-sm font-semibold tracking-wide bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white shadow-sm transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                <span>Convening Jury...</span>
              </>
            ) : (
              <>
                <span>Run Product Jury</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
