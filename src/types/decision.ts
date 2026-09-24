/**
 * Stage 3 · The Decision object.
 *
 * PRD v1.1.1 §17 ("A Decision is not a Verdict", "And a Version is not a
 * Decision either"), CAP-12 (§29), CAP-13 (§30), CAP-19 (§32), FR-23, FR-24,
 * FR-25, FR-37, FR-38, FR-39, PR-4, PR-5, PR-8, TEL-2, TEL-3, TEL-9, §55.
 *
 * §17 fixes three levels and they are not interchangeable:
 *
 *   | Level    | What it is                              | Identity                  |
 *   | Decision | The durable object, while the question   | The decision question     |
 *   |          | is live                                  |                           |
 *   | Version  | The state of the decision at one point    | Decision + sequence no.   |
 *   | Verdict  | One position inside one version           | Belongs to its version    |
 *
 * So: the Decision persists, the Version is what changed, and the Verdict is a
 * field of a Version rather than an object anyone navigates to. The types below
 * are that table, made structural.
 *
 * What Stage 3 does NOT do, and must not be read as doing: it does not produce
 * a verdict, run a sufficiency gate, apply a confidence ceiling, cross-examine,
 * synthesise disagreement, or re-judge. `DecisionVersion.verdict` is the place
 * §17 says a verdict belongs, left explicitly `null` until the stage that owns
 * it fills it. An empty slot is not a capability.
 *
 * Two boundaries this file keeps apart, because collapsing them is a
 * confidentiality incident rather than a bug:
 *
 *   · The DECISION EVENT LOG (`DecisionEvent`) is the decision's own record.
 *     It stays with the decision, wherever the decision is stored, and it may
 *     carry a reason the PM typed — CAP-19 requires a loop to be closed "with a
 *     reason", and CAP-11 requires confidence never to move without one.
 *   · PRODUCT TELEMETRY (`server/integrity/telemetry.ts`) is content-free by
 *     schema (TEL-2) and leaves the browser. It is *derived* from the log
 *     (TEL-3) by `server/decision/telemetryProjection.ts`, which copies only
 *     §55's permitted fields and never the reason.
 */

import type { SerializedClaimSpine, SpecialistPosition, ClaimId } from './claims';
import type { MissingItem, RunProvenance, StageProvenance, Verdict, Opportunity } from './index';

/**
 * The version of the *serialised shape* of a Decision — not to be confused
 * with `DecisionVersion`, which is a version of the decision's content.
 *
 * Recorded here as a judgement call rather than a citation: the PRD does not
 * name a schema-version field anywhere. Stage 2's `SerializedClaimSpine`
 * already carries `version: 1` for the same reason, and this follows that
 * precedent so a stored decision can be refused rather than misread when the
 * shape changes.
 */
export const DECISION_SCHEMA_VERSION = 1;

/** `DEC-…`, `VER-…`, `LOOP-…`. See `server/decision/identity.ts`. */
export type DecisionId = string;
export type VersionId = string;
export type OpenLoopId = string;
export type SpecialistPositionId = string;

/**
 * What caused a version to exist.
 *
 * The four non-initial values are §55's `triggeredBy` enum verbatim, because
 * §56's revisit rate is computed from `version_created` carrying exactly those
 * labels. `initial` is the first committed state, which §55 records as
 * `decision_created` rather than `version_created` — see `DecisionEvent`.
 */
export const VERSION_TRIGGERS = [
  'initial',
  'evidence',
  'revision',
  'question_change',
  'rejudge',
] as const;

export type VersionTrigger = (typeof VERSION_TRIGGERS)[number];

/**
 * Who or what committed a version. Not a user account: MVP has no accounts
 * (§19 Q8), and this records the origin of the change, not an identity.
 */
export const VERSION_ORIGINS = ['pipeline', 'pm', 'legacy_import'] as const;
export type VersionOrigin = (typeof VERSION_ORIGINS)[number];

/**
 * §17: a verdict is "one position inside one version".
 *
 * This is the slot, and in Stage 3 it is only ever filled by converting a run
 * the existing pipeline already produced (`server/decision/fromLegacy.ts`).
 * The ceiling and its reason (TR-12), and the falsification contract (FR-17),
 * are named here as absent rather than quietly omitted: the stages that
 * produce them are not built.
 */
export interface VersionVerdict {
  outcome: Verdict;
  confidence: number;
  /** TR-3: a confidence figure is never shown without the reason for it. */
  confidenceRationale: string;
  executiveSummary: string;
  opportunities: Opportunity[];
  recommendedNextStep: string;
  /** CAP-06's binding ceiling. `null` until the stage that sets it is built. */
  confidenceCeiling: number | null;
  /** FR-17's contract. `null` until the stage that produces it is built. */
  falsificationContract: null;
}

/**
 * What the run behind a version actually came to.
 *
 * The three kinds are Stage 1's `RunOutcomeKind`, unchanged: a run that could
 * not execute is FAILED, a run that completed a sufficiency assessment and
 * judged the evidence cannot carry a call is INSUFFICIENT, and the two are
 * never interchangeable (FR-41, TR-13, §51 never-9). Stage 3 adds no fourth
 * kind and no emitter: it stores what the run reported.
 */
export type VersionOutcome =
  | { kind: 'VERDICT' }
  | { kind: 'INSUFFICIENT'; refusedAt: 'GATE' | 'CEILING'; missing: MissingItem[] }
  | { kind: 'FAILED'; code: string; userMessage: string; retryable: boolean; stage?: string };

/**
 * CAP-19, MVP. "An explicit open loop holding five things: what evidence is
 * expected, why it matters to this decision, the due date or review point, the
 * claims it bears on, and what should be re-evaluated when it lands."
 *
 * All five are required. A loop missing one is not a loop, because the whole
 * point of the object is that the thing the decision is waiting on is named.
 *
 * What is NOT here, by instruction and by the PRD's own split: the return
 * prompt (FR-31, P1, depends on Q9), the loop on the log surface (with
 * CAP-14), and the re-judge route (with CAP-15). Nothing in this file notifies
 * anyone of anything.
 */
export interface OpenLoop {
  id: OpenLoopId;
  decisionId: DecisionId;
  /** CAP-19 · 1. What evidence is expected. */
  expectedEvidence: string;
  /** CAP-19 · 2. Why it matters to this decision. */
  whyItMatters: string;
  /** CAP-19 · 3. The due date or review point, as the PM stated it. */
  duePoint: string;
  /** CAP-19 · 4. The claims it bears on. Must resolve in the version's spine. */
  bearsOnClaims: ClaimId[];
  /** CAP-19 · 5. What should be re-evaluated when it lands. */
  reEvaluateOnArrival: string;
  /** Which of CAP-19's two triggers created it. */
  createdBy: 'contract' | 'collect';
  /** The version it was created against. */
  versionId: VersionId;
  createdAt: string;
  status: 'OPEN' | 'CLOSED';
  closedAt?: string;
  /** CAP-19 MVP: "closing a loop by hand with a reason". Required to close. */
  closedReason?: string;
}

/** §55's event kinds are the only kinds the decision log records. */
export type DecisionEventKind =
  | 'decision_created'
  | 'statement_edited'
  | 'question_proposed'
  | 'question_confirmed'
  | 'unknown_shown'
  | 'unknown_answered'
  | 'evidence_added'
  | 'judge_started'
  | 'gate_refused'
  | 'ceiling_refused'
  | 'verdict_issued'
  | 'challenge_requested'
  | 'response_recorded'
  | 'loop_created'
  | 'loop_closed'
  | 'version_created'
  | 'decision_opened'
  | 'decision_deleted';

/**
 * One entry in the decision's append-only log.
 *
 * CAP-12: "Every change appends to a log that is never rewritten, only added
 * to." TEL-3: product telemetry is *derived* from this log, so the log is the
 * single record of what happened and the event stream is a projection of it.
 *
 * `seq` is dense and starts at 0. It is what makes "append-only" checkable
 * rather than merely intended.
 *
 * `reason` is decision content. It never reaches telemetry.
 */
export interface DecisionEvent {
  seq: number;
  kind: DecisionEventKind;
  at: string;
  /** Present when the entry concerns one version. */
  versionNumber?: number;
  /** Present when the entry concerns one open loop. */
  loopId?: OpenLoopId;
  /** Present on `version_created`. */
  trigger?: VersionTrigger;
  /** Present on `verdict_issued`, `gate_refused`, `ceiling_refused`. */
  outcome?: 'verdict' | 'insufficient' | 'failed';
  /** The PM's own words, where the PRD requires a reason. Stays local. */
  reason?: string;
}

/**
 * §17: "The state of the decision at one point in time — claims, evidence,
 * positions, verdict, confidence, falsification contract, what triggered it."
 *
 * A committed version is immutable. `server/decision/decision.ts` freezes it
 * deeply at commit, so "version 1 is not edited once version 2 exists" is
 * enforced by the runtime rather than promised in a comment.
 */
export interface DecisionVersion {
  id: VersionId;
  decisionId: DecisionId;
  /** §17: identity is "Decision + sequence number". Starts at 1. */
  versionNumber: number;
  createdAt: string;
  origin: VersionOrigin;
  trigger: VersionTrigger;
  /** FR-4b: the question is the identity of the decision, carried by the version it was judged under. */
  decisionQuestion: string;
  /** CAP-17 / FR-34, FR-35 — P1 pending CR-5. The slot exists; MVP leaves it null. */
  successCondition: string | null;
  /**
   * The Claim Spine as it stood. Not a list of strings: Stage 2's claims, with
   * their ids, epistemic statuses, origins, dependants and derived
   * load-bearing status, exactly as `ClaimSpine.toJSON()` produced them.
   */
  claimSpine: SerializedClaimSpine;
  /** Stage 2.5's positions, with their ids and the claim ids they cite. */
  specialistPositions: SpecialistPosition[];
  /** §17's "verdict". `null` until a stage that produces one fills it. */
  verdict: VersionVerdict | null;
  /** Stage 1's provenance, unchanged. The single record of what ran. */
  runMeta: RunProvenance;
  /** What the run came to. A stage list alone never means a run succeeded. */
  outcome: VersionOutcome;
}

/**
 * §17: "The durable object, for as long as the question is live." CAP-12: "one
 * question, one identity, for as long as it exists."
 *
 * `state` is deliberately absent as a stored field: CAP-12's list shows state,
 * and state that is stored can disagree with the versions it describes.
 * `decisionState()` in `server/decision/decision.ts` derives it.
 */
export interface Decision {
  id: DecisionId;
  schemaVersion: number;
  /** §17: the identity of the decision. */
  decisionQuestion: string;
  successCondition: string | null;
  createdAt: string;
  /** CAP-12: the list shows "last activity". */
  updatedAt: string;
  /** The version the decision currently stands at. */
  currentVersionId: VersionId;
  /** In order. Retained from the first commit (CAP-13, MVP). */
  versions: DecisionVersion[];
  openLoops: OpenLoop[];
  /** Append-only. Never rewritten. */
  eventLog: DecisionEvent[];
  /** TR-8: true only for the labelled demonstration decision. */
  isSample: boolean;
}

/**
 * CAP-12's "state the PM recognises". Derived, never stored.
 *
 * `waiting_on_a_check` is §17's own wording for a decision with an open loop.
 */
export type DecisionState =
  | 'provisional'
  | 'awaiting_evidence'
  | 'waiting_on_a_check'
  | 'failed';

/** The stage records a version carries. Stage 1's `StageProvenance`, not a new model. */
export type VersionStageOutcome = StageProvenance;
