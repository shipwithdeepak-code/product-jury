export type Verdict = 'SHIP' | 'ITERATE' | 'TEST' | 'KILL';

export type EvidenceStatus = 'FACT' | 'INFERENCE' | 'ASSUMPTION' | 'UNKNOWN';

export interface DetailedAttribute {
  value: string;
  confidence: number;
  evidence: string;
  confidenceType?: 'evidence' | 'inference';
}

export interface DetailedFrictionSignal {
  signal: string;
  severity: 'low' | 'medium' | 'high';
  evidence: string;
}

export interface DetailedFact {
  statement: string;
  evidence: string;
}

export interface DetailedInference {
  statement: string;
  reasoning: string;
  confidence: number;
}

export interface DetailedAssumption {
  statement: string;
  reason: string;
  confidence: number;
}

export interface DetailedUnknown {
  question: string;
  whyItMatters: string;
  priority: 'low' | 'medium' | 'high';
}

export type AlignmentStatus = 'aligned' | 'partially_aligned' | 'conflict' | 'insufficient_evidence';

export interface ContextAlignment {
  status: AlignmentStatus;
  summary: string;
  visualEvidence: string;
  contextClaim: string;
  needsClarification: boolean;
}

export interface ContextAnalysisResponse {
  productType: DetailedAttribute;
  likelyUser: DetailedAttribute;
  primaryJourney: DetailedAttribute;
  frictionSignals: DetailedFrictionSignal[];
  facts: DetailedFact[];
  inferences: DetailedInference[];
  assumptions: DetailedAssumption[];
  unknowns: DetailedUnknown[];
  contextAlignment?: ContextAlignment;
}

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
