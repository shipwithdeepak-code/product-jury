export type Verdict = 'SHIP' | 'ITERATE' | 'TEST' | 'KILL';

export {
  CORE_EPISTEMIC_STATUSES,
  EPISTEMIC_STATUSES,
  LOAD_BEARING_STATUSES,
  ORIGIN_KINDS,
} from './claims';
export type {
  Claim,
  ClaimDependant,
  ClaimId,
  ClaimOrigin,
  CoreEpistemicStatus,
  EpistemicStatus,
  LoadBearingStatus,
  OpenQuestion,
  OriginCoverage,
  OriginKind,
  SerializedClaimSpine,
} from './claims';

import type { CoreEpistemicStatus, OriginCoverage, SerializedClaimSpine } from './claims';

/**
 * The four kinds a PM sees. Stage 2 makes this an alias of the Claim Spine's
 * core statuses rather than a second list, because two lists of the same four
 * names is how the product ends up with two competing claim models.
 */
export type EvidenceStatus = CoreEpistemicStatus;

/**
 * Stage 2 · The analyst wire contract.
 *
 * Every statement now carries a model-local `ref` so that the model can say
 * which statement another one rests on inside a single response. The refs are
 * consumed by `server/claims/fromAnalyst.ts` and never survive it: downstream,
 * statements are addressed by claim id.
 */

/** A short identifier the model mints for one statement, e.g. "F1". */
export type AnalystRef = string;

export interface AnalystAttribute {
  ref: AnalystRef;
  value: string;
  confidence: number;
  /** Why this reading of the artifact was reached. */
  evidence: string;
  /** The observations it rests on. */
  derivedFrom: AnalystRef[];
  confidenceType?: 'evidence' | 'inference';
}

export interface AnalystFrictionSignal {
  ref: AnalystRef;
  signal: string;
  severity: 'low' | 'medium' | 'high';
  evidence: string;
  derivedFrom: AnalystRef[];
}

export interface AnalystFact {
  ref: AnalystRef;
  statement: string;
  evidence: string;
}

export interface AnalystInference {
  ref: AnalystRef;
  statement: string;
  reasoning: string;
  derivedFrom: AnalystRef[];
  confidence: number;
}

export interface AnalystAssumption {
  ref: AnalystRef;
  statement: string;
  reason: string;
  confidence: number;
}

export interface AnalystUnknown {
  ref: AnalystRef;
  question: string;
  whyItMatters: string;
  /** CAP-02: how much answering it would move the decision. */
  decisionImpact: 'low' | 'medium' | 'high';
  /** FR-15 and CAP-07: the cheapest way to get it. */
  howToGetIt?: string;
  /** Statements this unknown undermines. */
  blocks?: AnalystRef[];
}

export type AlignmentStatus = 'aligned' | 'partially_aligned' | 'conflict' | 'insufficient_evidence';

export interface ContextAlignment {
  status: AlignmentStatus;
  summary: string;
  visualEvidence: string;
  contextClaim: string;
  needsClarification: boolean;
}

export interface AnalystReading {
  productType: AnalystAttribute;
  likelyUser: AnalystAttribute;
  primaryJourney: AnalystAttribute;
  frictionSignals: AnalystFrictionSignal[];
  facts: AnalystFact[];
  inferences: AnalystInference[];
  assumptions: AnalystAssumption[];
  unknowns: AnalystUnknown[];
  contextAlignment?: ContextAlignment;
}

/** Legacy names, kept so Stage 1's display code needs no rewrite. */
export type DetailedAttribute = AnalystAttribute;
export type DetailedFrictionSignal = AnalystFrictionSignal;
export type DetailedFact = AnalystFact;
export type DetailedInference = AnalystInference;
export type DetailedAssumption = AnalystAssumption;
export type DetailedUnknown = AnalystUnknown;
export type ContextAnalysisResponse = AnalystReading;

export interface ArtifactUnderstanding {
  productType: string;
  likelyUser: string;
  detectedJourney: string;
  frictionSignals: string[];
  facts: string[];
  inferences: string[];
  assumptions: string[];
  unknowns: string[];
  isConfirmed: boolean;
  isAnalyzedByGemini?: boolean;
  contextAlignment?: ContextAlignment;
  detailedAnalysis?: ContextAnalysisResponse;
  /**
   * Stage 2 · The Claim Spine for this reading.
   *
   * The arrays above are a display projection of it. This is the record: every
   * statement with a stable id, its kind, its origin and what rests on it
   * (CAP-03). It is serialisable so Stage 3's Decision object can hold it.
   */
  claimSpine?: SerializedClaimSpine;
  /** CAP-03's origin-coverage measurement for this reading. */
  originCoverage?: OriginCoverage;
}

export interface ProductContext {
  name: string;
  whatBuilding: string;
  targetUser: string;
  primaryGoal: string;
  currentProblem?: string;
  productUrl?: string;
  screenshotUrl?: string;
  screenshotName?: string;
  additionalContext?: string;
  artifactUnderstanding?: ArtifactUnderstanding;
}

export interface EvidenceItem {
  id: string;
  claim: string;
  status: EvidenceStatus;
  sourceDescription?: string;
}

export interface Opportunity {
  id: string;
  problem: string;
  userImpact: string;
  businessImpact: string;
  confidence: number; // 0 - 100
  evidenceStatus: EvidenceStatus;
  evidenceContext?: string;
}

export type AgentRole = 'UX_RESEARCHER' | 'PRODUCT_MANAGER' | 'DESIGN_CRITIC';

export interface AgentReview {
  role: AgentRole;
  roleTitle: string;
  agentName: string;
  recommendation: string;
  confidence: number; // 0 - 100
  keyObservation: string;
  coreArgument: string;
}

export interface AgentDisagreement {
  topic: string;
  frictionPoint: string;
  agentPositions: {
    roleTitle: string;
    view: string;
  }[];
}

export interface AgreementDisagreement {
  agreements: string[];
  disagreements: AgentDisagreement[];
  unknowns: string[];
}

export interface ProductReview {
  id: string;
  timestamp: string;
  context: ProductContext;
  evidenceRaw?: string;
  verdict: Verdict;
  confidenceScore: number;
  confidenceRationale: string;
  executiveSummary: string;
  opportunities: Opportunity[];
  agentReviews: AgentReview[];
  agreementDisagreement: AgreementDisagreement;
  recommendedNextStep: string;
  /** TR-8: true only for the labelled demonstration dossier. */
  isSample: boolean;
  evidenceAudit?: EvidenceAuditResult;
}

/**
 * Stage 1 · NFR-4. A step's status is only ever set from something the server
 * reported. There is no timer that advances it.
 */
export interface AnalysisProgressStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'not_run';
  /** For 'not_run' and 'failed': the real reason (NFR-6, TR-4). */
  reason?: string;
}

/**
 * Stage 1 · The three outcomes, FR-41.
 *
 * INSUFFICIENT is an epistemic outcome: the product ran and judged the evidence
 * cannot carry a call. FAILED is a technical outcome: the product could not
 * run. They render differently and neither is ever dressed as the other
 * (TR-13, §51 never-9).
 */
export type RunOutcomeKind = 'VERDICT' | 'INSUFFICIENT' | 'FAILED';

export interface MissingItem {
  item: string;
  whyItMatters: string;
  howToGetIt: string;
}

export interface StageProvenance {
  stage: string;
  status: 'completed' | 'failed' | 'skipped' | 'not_run';
  modelId?: string;
  tier?: string;
  attempts: number;
  durationMs: number;
  failureCode?: string;
  reason?: string;
}

export interface RunProvenance {
  runId: string;
  startedAt: string;
  finishedAt?: string;
  stages: StageProvenance[];
  /** §54.7: a tier with no evaluation behind it served this run. */
  servedByUnevaluatedTier: boolean;
  totalEstimatedCostCents: number;
  totalProviderCalls: number;
}

export interface VerdictRun {
  kind: 'VERDICT';
  review: ProductReview;
  provenance?: RunProvenance;
}

/** CAP-07. A complete outcome, not an error. */
export interface InsufficientRun {
  kind: 'INSUFFICIENT';
  refusedAt: 'GATE' | 'CEILING';
  /** FR-15: at least two. */
  missing: MissingItem[];
  provenance?: RunProvenance;
}

/** A technical failure. Never an epistemic statement about the evidence. */
export interface FailedRun {
  kind: 'FAILED';
  code: string;
  message: string;
  retryable: boolean;
  stage?: string;
  provenance?: RunProvenance;
}

export type RunResult = VerdictRun | InsufficientRun | FailedRun;

/** SR-8: an instruction found in supplied content, recorded not obeyed. */
export interface EmbeddedInstructionObservation {
  source: string;
  kind: string;
  observation: string;
}

export interface UXResearchFriction {
  friction: string;
  severity: 'low' | 'medium' | 'high';
  visualEvidence: string;
}

export interface UXResearchRisk {
  risk: string;
  severity: 'low' | 'medium' | 'high';
  whyItMatters: string;
}

export interface AgentEvidenceItem {
  claim: string;
  status: EvidenceStatus;
  source: string;
}

export interface UXResearchResult {
  agentRole: 'UX_RESEARCHER';
  summary: string;
  strengths: string[];
  frictions: UXResearchFriction[];
  userRisks: UXResearchRisk[];
  researchQuestions: string[];
  recommendations: string[];
  confidence: number;
  evidenceItems: AgentEvidenceItem[];
}

export interface StrategicRisk {
  risk: string;
  severity: 'low' | 'medium' | 'high';
  impact: string;
}

export interface ValueHypothesis {
  hypothesis: string;
  expectedPayoff: string;
  validationStatus: 'UNVALIDATED' | 'PARTIALLY_VALIDATED' | 'VALIDATED';
}

export interface ProductStrategyResult {
  agentRole: 'PRODUCT_MANAGER' | 'PRODUCT_STRATEGIST';
  summary: string;
  goalAlignment: {
    isAligned: boolean;
    score: number;
    rationale: string;
  };
  strategicRisks: StrategicRisk[];
  valueHypotheses: ValueHypothesis[];
  validationNeeds: string[];
  recommendations: string[];
  confidence: number;
  evidenceItems: AgentEvidenceItem[];
}

export interface EvidenceAuditResult {
  agentRole: 'EVIDENCE_AUDITOR';
  overallEvidenceQuality: 'STRONG' | 'MODERATE' | 'WEAK' | 'INSUFFICIENT';
  verifiedFacts: string[];
  supportedInferences: string[];
  unsupportedAssumptions: string[];
  criticalUnknowns: string[];
  contradictions: string[];
  auditWarnings: string[];
  confidence: number;
}

export interface DeliberationInput {
  context: ProductContext;
  rawEvidence?: string;
}
