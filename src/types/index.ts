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
  isCapacityFallback?: boolean;
  fallbackNotice?: string;
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
  isCapacityFallback?: boolean;
  fallbackNotice?: string;
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
  isMock: boolean;
  evidenceAudit?: EvidenceAuditResult;
}

export interface AnalysisProgressStep {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'completed';
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
