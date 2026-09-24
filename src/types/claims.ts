/**
 * Stage 2 · The Claim Spine.
 *
 * PRD v1.1.1 CAP-03 (§20, "Evidence model"), CAP-01 (§18), CAP-02 (§19),
 * principle 4, §51 always-1 and always-3, FR-2, FR-3, FR-9, FR-18, suite B.
 *
 * CAP-03's user value, verbatim: "Every statement in the decision is visibly
 * one of four things — observed, inferred, assumed, or unknown — and says where
 * it came from and what it is holding up."
 *
 * Three nouns in that sentence, and all three are structure rather than prose:
 *
 *   · WHICH KIND it is        → epistemicStatus
 *   · WHERE IT CAME FROM      → origin (a tagged union, not a free-text field)
 *   · WHAT IT IS HOLDING UP   → supports / loadBearing
 *
 * The types here are shared by the server, which builds the spine, and the
 * client, which displays it. The building, validation and measurement live in
 * `server/claims/`; nothing constructs a claim by hand.
 */

/**
 * The four kinds the PM sees, in the PRD's own words at CAP-03 and §51
 * always-1 — "observed, inferred, assumed, unknown".
 *
 * The identifiers are the PRD's, from suite B (§54.3): "Correct filing across
 * FACT, INFERENCE, ASSUMPTION, UNKNOWN, PM_STATEMENT and EVIDENCE". FACT is the
 * PRD's identifier for the observed kind; the interface says "observed",
 * because §11 prefers the word that describes what happened.
 */
export const CORE_EPISTEMIC_STATUSES = ['FACT', 'INFERENCE', 'ASSUMPTION', 'UNKNOWN'] as const;

/**
 * Suite B's full list. PM_STATEMENT and EVIDENCE are not additional kinds
 * invented here: they are the two remaining members of the PRD's own
 * classification, and CAP-03 requires them by naming its inputs as "statements
 * from the artifact reading, from the PM's answers, from pasted evidence, and
 * from the panel's reasoning". A PM's answer filed as FACT is precisely what
 * CAP-02 forbids — "answers become claims attributed to the PM, never promoted
 * to fact" — so the kind has to exist for that rule to be expressible.
 */
export const EPISTEMIC_STATUSES = [
  ...CORE_EPISTEMIC_STATUSES,
  'PM_STATEMENT',
  'EVIDENCE',
] as const;

export type EpistemicStatus = (typeof EPISTEMIC_STATUSES)[number];

/** The four-member core, kept as its own type because CAP-03's display groups by it. */
export type CoreEpistemicStatus = (typeof CORE_EPISTEMIC_STATUSES)[number];

/**
 * Where a claim came from.
 *
 * A tagged union rather than a string, because the brief's requirement — "do
 * not allow downstream code to reconstruct lineage from free text" — is only
 * met if each kind carries the thing that kind needs. An ARTIFACT origin with
 * no cited evidence and a MODEL_INFERENCE with no reasoning are both
 * unattributed statements, and CAP-03's failure state is explicit about those:
 * "A statement that cannot be attributed is not shown."
 */
export const ORIGIN_KINDS = [
  /** Read off the artifact. Carries the visible thing it rests on. */
  'ARTIFACT',
  /** Interpreted from something observable. Carries reasoning and its antecedents. */
  'MODEL_INFERENCE',
  /** Plausible but unestablished. Carries why it remains unverified. */
  'MODEL_ASSUMPTION',
  /** Typed by the product manager. Carries which field. */
  'PM_INPUT',
  /** Pasted by the product manager as evidence. */
  'PM_EVIDENCE',
  /** An answer the PM gave to an open question (CAP-02). */
  'PM_ANSWER',
  /** The PM corrected a claim. Carries the claim it supersedes (CAP-03, FR-3). */
  'PM_EDIT',
  /** Produced by a later stage from claims already in the spine. */
  'DERIVED_FROM_CLAIM',
] as const;

export type OriginKind = (typeof ORIGIN_KINDS)[number];

/** An opaque, stable claim identifier. See `server/claims/identity.ts`. */
export type ClaimId = string;

export interface ArtifactOrigin {
  kind: 'ARTIFACT';
  /** The visible element, text or layout component the statement rests on. */
  evidence: string;
  runId: string;
  stage: string;
}

export interface ModelInferenceOrigin {
  kind: 'MODEL_INFERENCE';
  /** Why the interpretation was reached. */
  reasoning: string;
  /** The claims it was derived from. Must resolve inside the spine. */
  derivedFrom: ClaimId[];
  runId: string;
  stage: string;
}

export interface ModelAssumptionOrigin {
  kind: 'MODEL_ASSUMPTION';
  /** Why it remains unverified by the artifact. */
  reason: string;
  runId: string;
  stage: string;
}

export interface PmInputOrigin {
  kind: 'PM_INPUT';
  /** Which field of the context the PM typed it into. */
  field: string;
}

export interface PmEvidenceOrigin {
  kind: 'PM_EVIDENCE';
  /** How the evidence arrived. Stage 2 has one route: the evidence box. */
  channel: 'pasted';
}

export interface PmAnswerOrigin {
  kind: 'PM_ANSWER';
  /** The open question this answers. Must resolve inside the spine. */
  answers: ClaimId;
}

export interface PmEditOrigin {
  kind: 'PM_EDIT';
  /** The claim this replaces. The original is kept (CAP-03). */
  supersedes: ClaimId;
}

export interface DerivedFromClaimOrigin {
  kind: 'DERIVED_FROM_CLAIM';
  derivedFrom: ClaimId[];
  reasoning: string;
  runId: string;
  stage: string;
}

export type ClaimOrigin =
  | ArtifactOrigin
  | ModelInferenceOrigin
  | ModelAssumptionOrigin
  | PmInputOrigin
  | PmEvidenceOrigin
  | PmAnswerOrigin
  | PmEditOrigin
  | DerivedFromClaimOrigin;

/**
 * §51 always-3: "Cite the statements a load-bearing claim rests on." §42 fixes
 * the meaning: a load-bearing statement is "a statement the call rests on".
 *
 * Which means load-bearing is derived from what depends on a claim, not
 * asserted about it. Stage 2 produces no conclusions, so every claim it mints
 * is NOT_YET_DETERMINED — the honest third state. Collapsing that into `false`
 * would be Stage 2 asserting that nothing is load-bearing, which it has not
 * established and cannot.
 */
export const LOAD_BEARING_STATUSES = [
  'LOAD_BEARING',
  'NOT_LOAD_BEARING',
  'NOT_YET_DETERMINED',
] as const;

export type LoadBearingStatus = (typeof LOAD_BEARING_STATUSES)[number];

/** What a later stage recorded as resting on a claim. */
export interface ClaimDependant {
  /** A stable handle for the conclusion: an opportunity id, a verdict id, a claim id. */
  dependantId: string;
  /** What kind of thing rests on it. */
  dependantKind: 'CLAIM' | 'OPPORTUNITY' | 'VERDICT' | 'SPECIALIST_POSITION' | 'AUDIT_FINDING';
  /** Which stage recorded the dependency. */
  stage: string;
}

export interface Claim {
  id: ClaimId;
  /** What the statement says, as the PM reads it. */
  text: string;
  epistemicStatus: EpistemicStatus;
  origin: ClaimOrigin;
  /**
   * What rests on this claim. CAP-03: "tracks what each one supports, and
   * carries both through every later stage."
   */
  supports: ClaimDependant[];
  loadBearing: LoadBearingStatus;
  /**
   * The model's own confidence, where the kind carries one. FACT statements do
   * not: a fact is either observable or it is not a fact. Present only when the
   * producing stage returned a figure — never defaulted.
   */
  confidence?: number;
  /** Which stage minted it. */
  producedBy: string;
  /** Which run minted it. */
  runId: string;
  createdAt: string;
  /**
   * Whether the product can show this claim to a PM. The denominator of
   * origin coverage (CAP-03: "100% of visible statements carry an origin").
   */
  surfaced: boolean;
}

/**
 * An UNKNOWN is a question, and CAP-02 requires it to carry enough to be asked,
 * ranked, skipped and answered. FR-15 and CAP-07 require the refusal form of
 * the same thing — what is missing, why it matters here, and the cheapest way
 * to get it.
 *
 * The question is itself a claim in the spine, so that a verdict can point at
 * what it did not know for the same reason it points at what it did.
 */
export interface OpenQuestion {
  /** The UNKNOWN claim this question is. */
  claimId: ClaimId;
  question: string;
  /** CAP-02: "each explaining why it matters". */
  whyItMatters: string;
  /** CAP-02: "ranks by how much it would move the decision". */
  decisionImpact: 'low' | 'medium' | 'high';
  /** FR-15 and CAP-07: the cheapest way to get it. */
  howToGetIt?: string;
  /** Claims this unknown undermines. Must resolve inside the spine. */
  blocks: ClaimId[];
  status: 'OPEN' | 'ANSWERED' | 'SKIPPED';
  /**
   * The PM_STATEMENT claim recording the answer. CAP-02: "Answers become
   * claims attributed to the PM, never promoted to fact."
   */
  answerClaimId?: ClaimId;
}

/** The serialised spine. Stage 3's Decision object stores this. */
export interface SerializedClaimSpine {
  version: 1;
  runId: string;
  claims: Claim[];
  openQuestions: OpenQuestion[];
}

/** The result of measuring CAP-03's origin-coverage criterion. */
export interface OriginCoverage {
  /** Surfaced claims whose origin is present and carries what its kind requires. */
  covered: number;
  /** Surfaced claims. */
  surfaced: number;
  /** covered / surfaced. 1 when there is nothing surfaced. */
  ratio: number;
  /** The claims that failed, with the reason each failed. */
  uncovered: Array<{ claimId: ClaimId; reason: string }>;
  /** CAP-03's bar. Not a setting. */
  threshold: number;
  passes: boolean;
}

/**
 * Stage 2.5 · FR-9. A position one specialist lens took, and the statements it
 * rests on.
 *
 * "Two specialist lenses take positions citing specific statements." Before
 * this, a lens returned prose and the statements it had read were gone by the
 * time anyone asked what the position was based on. A position now names the
 * claims it relies on, by id, and those ids are resolved against the run's
 * spine before the position is allowed any further.
 *
 * This is not a second claim model. A position is not a claim: it is a piece of
 * reasoning that *depends on* claims, which is why it carries ids rather than
 * text, and why each dependency is recorded on the claim it cites.
 */
export interface SpecialistPosition {
  /**
   * Derived from the run, the stage and the position text, the same way a
   * claim id is derived. It is what `supports` names on each cited claim.
   */
  id: string;
  /** What the lens holds. */
  position: string;
  /** Why it holds it, given the claims below. */
  reasoning: string;
  /** The claims it rests on. At least one, all resolving in the run's spine. */
  citedClaims: ClaimId[];
  /** The stage that took the position, e.g. `specialist_ux`. */
  producedBy: string;
  runId: string;
}
