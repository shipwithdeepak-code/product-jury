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
  SpecialistPosition,
} from './claims';

import type {
  CoreEpistemicStatus,
  OriginCoverage,
  SerializedClaimSpine,
  SpecialistPosition,
} from './claims';

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
  /*
   * Stage 3 · These three were on `server/integrity/provenance.ts` from Stage 1
   * and never on this copy, so the two declarations of one model had drifted by
   * three fields. A version stores its run metadata through this type, and a
   * stored decision that could not carry the cost of the run it records would
   * be losing NFR-9's own numbers on the way into storage. The two declarations
   * are still two declarations — unifying them is a refactor Stage 3 was told
   * not to make, and it is in the Stage 3 report as a remaining risk.
   */
  promptTokens?: number;
  responseTokens?: number;
  estimatedCostCents?: number;
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

/**
 * Stage 2.5 · FR-9. What each lens holds, and the statements it rests on.
 *
 * This replaces `AgentEvidenceItem`, which was a second evidence model: a lens
 * restated a claim in its own words with a status it chose, and nothing
 * connected that restatement to the statement it came from. A position cites
 * claim ids instead, so the connection is the record rather than a resemblance.
 */

export interface UXResearchResult {
  agentRole: 'UX_RESEARCHER';
  summary: string;
  strengths: string[];
  frictions: UXResearchFriction[];
  userRisks: UXResearchRisk[];
  researchQuestions: string[];
  recommendations: string[];
  confidence: number;
  /** FR-9: at least one, each citing claims that resolve in the run's spine. */
  positions: SpecialistPosition[];
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
  /** FR-9: at least one, each citing claims that resolve in the run's spine. */
  positions: SpecialistPosition[];
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

/**
 * Stage 3 · The Decision object.
 *
 * Re-exported here so that the durable domain and the transient run types are
 * imported from one place, and so it is visible in this file that there is one
 * domain model rather than two. `ProductReview` above remains the pipeline's
 * output type; `server/decision/fromLegacy.ts` is the only thing that turns
 * one into a Decision.
 */
export { DECISION_SCHEMA_VERSION, VERSION_ORIGINS, VERSION_TRIGGERS } from './decision';
export type {
  Decision,
  DecisionEvent,
  DecisionEventKind,
  DecisionId,
  DecisionState,
  DecisionVersion,
  OpenLoop,
  OpenLoopId,
  SpecialistPositionId,
  VersionId,
  VersionOrigin,
  VersionOutcome,
  VersionStageOutcome,
  VersionTrigger,
  VersionVerdict,
} from './decision';

/**
 * Stage 4 · CAP-04. The proposed decision question.
 *
 * PRD v1.1.1 CAP-04 (§21), FR-4, FR-4a, FR-4b.
 *
 * This is a *proposal*, not a domain object. The decision question itself is
 * the identity of a Decision and lives on `Decision` and `DecisionVersion`
 * above; what travels from the analyst step to the workspace is one sentence
 * the PM has not yet confirmed, plus what the product noticed about it.
 *
 * It is deliberately NOT on `ProductContext`: the question is a property of
 * the decision being made, not of the product being decided about, and
 * `ProductContext` is read by twenty-odd other modules that have no business
 * seeing it.
 */
export interface DecisionQuestionProposal {
  /** The sentence the model proposed, verbatim. Never composed by the product. */
  question: string;
  /** The claim ids the model named as what it read the call off. */
  groundedIn: string[];
  /** FR-4a, measured locally by `src/integrity/decisionQuestion.ts`. */
  isDecisionShaped: boolean;
  /** Why not, in the PM's language, when it is not. */
  weakness: string | null;
}

/**
 * What `/api/context/analyze` returns about the question, which is either a
 * proposal or the honest absence of one.
 *
 * CAP-04's failure state: "If a proposal cannot be generated, the PM writes it
 * unaided with an example shown. The requirement is never waived." So there is
 * no third shape here — nothing is generated locally to stand in for the
 * model, and `unavailable` carries the real reason rather than a blank.
 */
export interface DecisionQuestionOffer {
  proposal: DecisionQuestionProposal | null;
  /** Present exactly when `proposal` is null. SR-4: a code and a sentence. */
  unavailable: { code: string; userMessage: string } | null;
}
