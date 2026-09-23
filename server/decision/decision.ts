import type { SerializedClaimSpine, SpecialistPosition, ClaimId } from '../../src/types/claims';
/*
 * The provenance type comes from `src/types`, not from
 * `server/integrity/provenance.ts`.
 *
 * Those two files declare the same two interfaces — `RunProvenance` and
 * `StageProvenance` — and have since Stage 1: the server's version narrows
 * `stage` to `PipelineStage` and `failureCode` to `FailureCode`, and the
 * client's is the same field list with both as strings. A server value is
 * assignable to the client type, so the stricter one keeps working at every
 * call site; the reverse is not, which is what makes the loose one the right
 * type for a version that has already been stored and read back.
 *
 * This is not a second provenance model introduced here. It is the one that
 * was already there, and unifying the two declarations is a refactor Stage 3
 * was told not to make. It is in the Stage 3 report as a remaining risk.
 */
import type { RunProvenance } from '../../src/types';
import {
  DECISION_SCHEMA_VERSION,
} from '../../src/types/decision';
import type {
  Decision,
  DecisionEvent,
  DecisionEventKind,
  DecisionState,
  DecisionVersion,
  OpenLoop,
  VersionOrigin,
  VersionOutcome,
  VersionStageOutcome,
  VersionTrigger,
  VersionVerdict,
} from '../../src/types/decision';
import { mintDecisionId, mintOpenLoopId, mintVersionId } from './identity';
import { DecisionValidationError, deserializeDecision, serializeDecision } from './serialization';

/**
 * Stage 3 · The Decision, and the operations that may change it.
 *
 * PRD v1.1.1 §17, CAP-12 (§29), CAP-13 (§30), CAP-19 (§32), FR-23, FR-24,
 * FR-25, FR-37, FR-39, TR-4, TR-8.
 *
 * Every operation here is a pure function returning a new `Decision`. Nothing
 * mutates the object it was given. That is not a style preference:
 *
 *   §17 — "A re-judgement, or a revision meaningful enough to move the
 *   position or the confidence, creates a new version — it never edits the
 *   current one in place."
 *
 * A committed version is deep-frozen the moment it is committed, so editing
 * version 1 after version 2 exists throws rather than silently succeeding. The
 * freeze is the enforcement; the sentence above is only the reason.
 *
 * WHAT IS NOT HERE. No stage runs from this file. Nothing judges, refuses,
 * scores, or produces a verdict. A version's outcome and verdict are whatever
 * the run that produced them reported, carried in unchanged.
 */

/** Deep-freeze. A committed version is a record of a moment, not a workspace. */
function freezeDeep<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  for (const key of Object.getOwnPropertyNames(value)) {
    freezeDeep((value as Record<string, unknown>)[key]);
  }
  return Object.freeze(value);
}

function now(clock?: () => string): string {
  return clock ? clock() : new Date().toISOString();
}

export interface VersionContent {
  decisionQuestion: string;
  /** CAP-17 / FR-34, P1 pending CR-5. Null in MVP. */
  successCondition?: string | null;
  claimSpine: SerializedClaimSpine;
  specialistPositions: SpecialistPosition[];
  runMeta: RunProvenance;
  outcome: VersionOutcome;
  /** §17's slot. Only ever what a run produced. */
  verdict?: VersionVerdict | null;
  origin?: VersionOrigin;
}

export interface CreateDecisionInput extends VersionContent {
  /** TR-8: true only for the labelled demonstration decision. */
  isSample?: boolean;
  /** Injected in tests so a round trip is comparable. */
  clock?: () => string;
  /** Injected in tests. Never derived from the question — see `identity.ts`. */
  id?: string;
}

/**
 * The §55 event a run outcome produces, or none.
 *
 * FAILED produces no event, and that is a statement rather than an omission:
 * §55's kind list has `gate_refused` and `ceiling_refused` for the two
 * epistemic refusals and `verdict_issued` for a verdict, and no kind at all
 * for a run that could not execute. Inventing one here would put a number into
 * §56's denominators that the PRD never defined. It is recorded in the report
 * as an open item instead.
 */
function outcomeEvent(outcome: VersionOutcome): Pick<DecisionEvent, 'kind' | 'outcome'> | undefined {
  if (outcome.kind === 'VERDICT') return { kind: 'verdict_issued', outcome: 'verdict' };
  if (outcome.kind === 'INSUFFICIENT') {
    return {
      kind: outcome.refusedAt === 'GATE' ? 'gate_refused' : 'ceiling_refused',
      outcome: 'insufficient',
    };
  }
  return undefined;
}

function append(
  log: readonly DecisionEvent[],
  entry: Omit<DecisionEvent, 'seq'>
): DecisionEvent[] {
  return [...log, { ...entry, seq: log.length }];
}

function buildVersion(
  decisionId: string,
  versionNumber: number,
  content: VersionContent,
  trigger: VersionTrigger,
  at: string
): DecisionVersion {
  // Cloned before it is frozen. A version is a snapshot of a moment, so it
  // must not hold a live reference to the spine the run is still working with,
  // and freezing the caller's own objects would be a surprise from a function
  // whose job is to record them.
  const snapshot = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

  return freezeDeep({
    id: mintVersionId(decisionId, versionNumber),
    decisionId,
    versionNumber,
    createdAt: at,
    origin: content.origin ?? 'pipeline',
    trigger,
    decisionQuestion: content.decisionQuestion,
    successCondition: content.successCondition ?? null,
    claimSpine: snapshot(content.claimSpine),
    specialistPositions: snapshot(content.specialistPositions),
    verdict: content.verdict ? snapshot(content.verdict) : null,
    runMeta: snapshot(content.runMeta),
    outcome: snapshot(content.outcome),
  });
}

/**
 * CAP-12: "Automatic and continuous from the moment an artifact is dropped.
 * Never a save action." The first committed state is version 1.
 *
 * Version 1's log entry is `decision_created`, not `version_created`. §55's
 * `version_created` carries a `triggeredBy` of evidence, revision,
 * question_change or rejudge — there is no value for "this is the first one" —
 * and §56 computes the revisit rate from `version_created`, whose whole point
 * is a version that came *after* the first. Emitting it for version 1 would
 * put every decision into the north-star numerator on creation.
 */
export function createDecision(input: CreateDecisionInput): Decision {
  const at = now(input.clock);
  const id = input.id ?? mintDecisionId();
  const version = buildVersion(id, 1, input, 'initial', at);

  let eventLog = append([], { kind: 'decision_created', at, versionNumber: 1 });
  const outcomeEntry = outcomeEvent(input.outcome);
  if (outcomeEntry) {
    eventLog = append(eventLog, { ...outcomeEntry, at, versionNumber: 1 });
  }

  const decision: Decision = {
    id,
    schemaVersion: DECISION_SCHEMA_VERSION,
    decisionQuestion: input.decisionQuestion,
    successCondition: input.successCondition ?? null,
    createdAt: at,
    updatedAt: at,
    currentVersionId: version.id,
    versions: [version],
    openLoops: [],
    eventLog,
    isSample: input.isSample ?? false,
  };

  // Fail at the time, not at the next read (CAP-12's failure state).
  deserializeDecision(JSON.parse(JSON.stringify(decision)), 'a decision being created');
  return decision;
}

/**
 * §17's exact test for a revision that must become a new version: one
 * "meaningful enough to move the position or the confidence".
 *
 * Both halves are read literally. The position is the verdict's outcome; the
 * confidence is its figure. A version with no verdict has no position to move,
 * so any change to it is meaningful by this test's own terms — which is why
 * the function returns true when either side is missing a verdict rather than
 * guessing.
 */
export function movesPositionOrConfidence(
  previous: DecisionVersion,
  next: VersionContent
): boolean {
  const before = previous.verdict;
  const after = next.verdict ?? null;
  if (!before || !after) return true;
  return before.outcome !== after.outcome || before.confidence !== after.confidence;
}

export interface CommitVersionInput extends VersionContent {
  trigger: Exclude<VersionTrigger, 'initial'>;
  clock?: () => string;
}

/**
 * FR-39: "A re-judgement or a meaningful revision creates a new version rather
 * than editing the current one."
 *
 * The previous version is already frozen and is carried through untouched. The
 * decision that comes back is a new object; the one passed in is unchanged.
 */
export function commitVersion(decision: Decision, input: CommitVersionInput): Decision {
  const at = now(input.clock);
  const versionNumber = decision.versions.length + 1;
  const version = buildVersion(decision.id, versionNumber, input, input.trigger, at);

  const eventLog = append(decision.eventLog, {
    kind: 'version_created',
    at,
    versionNumber,
    trigger: input.trigger,
  });

  const outcomeEntry = outcomeEvent(input.outcome);
  const withOutcome = outcomeEntry
    ? append(eventLog, { ...outcomeEntry, at, versionNumber })
    : eventLog;

  const next: Decision = {
    ...decision,
    decisionQuestion: input.decisionQuestion,
    successCondition: input.successCondition ?? null,
    updatedAt: at,
    currentVersionId: version.id,
    versions: [...decision.versions, version],
    eventLog: withOutcome,
  };

  deserializeDecision(JSON.parse(JSON.stringify(next)), 'a decision being revised');
  return next;
}

export interface OpenLoopInput {
  expectedEvidence: string;
  whyItMatters: string;
  duePoint: string;
  bearsOnClaims: ClaimId[];
  reEvaluateOnArrival: string;
  createdBy: 'contract' | 'collect';
  /** Defaults to the current version. */
  versionId?: string;
  clock?: () => string;
}

/**
 * CAP-19, MVP. FR-25, FR-37.
 *
 * Every one of the five fields is required by the type, so a loop that does
 * not say what it is waiting for, why, by when, against what, and what it
 * would change cannot be constructed. That is the capability: the rest of
 * CAP-19 — the prompt that brings the PM back — is P1 and is not here.
 */
export function recordOpenLoop(decision: Decision, input: OpenLoopInput): Decision {
  const at = now(input.clock);
  const versionId = input.versionId ?? decision.currentVersionId;

  const loop: OpenLoop = freezeDeep({
    id: mintOpenLoopId({
      decisionId: decision.id,
      versionId,
      expectedEvidence: input.expectedEvidence,
      duePoint: input.duePoint,
    }),
    decisionId: decision.id,
    expectedEvidence: input.expectedEvidence,
    whyItMatters: input.whyItMatters,
    duePoint: input.duePoint,
    bearsOnClaims: [...input.bearsOnClaims],
    reEvaluateOnArrival: input.reEvaluateOnArrival,
    createdBy: input.createdBy,
    versionId,
    createdAt: at,
    status: 'OPEN',
  });

  if (decision.openLoops.some((existing) => existing.id === loop.id)) {
    throw new DecisionValidationError(
      ['this decision is already waiting on that check against that version, for that due point'],
      'an open loop being created'
    );
  }

  const next: Decision = {
    ...decision,
    updatedAt: at,
    openLoops: [...decision.openLoops, loop],
    eventLog: append(decision.eventLog, { kind: 'loop_created', at, loopId: loop.id }),
  };

  deserializeDecision(JSON.parse(JSON.stringify(next)), 'a decision gaining an open loop');
  return next;
}

/**
 * CAP-19, MVP: "closing a loop by hand with a reason". The reason is required,
 * and it is decision content: it is recorded on the loop and in the decision's
 * own log, and it never reaches telemetry.
 */
export function closeOpenLoop(
  decision: Decision,
  loopId: string,
  reason: string,
  clock?: () => string
): Decision {
  const at = now(clock);
  const target = decision.openLoops.find((loop) => loop.id === loopId);
  if (!target) {
    throw new DecisionValidationError(['no open loop with that id on this decision'], 'closing a loop');
  }
  if (target.status === 'CLOSED') {
    throw new DecisionValidationError(['that loop is already closed'], 'closing a loop');
  }
  if (!reason.trim()) {
    throw new DecisionValidationError(
      ['a loop is closed with a reason (CAP-19). A loop closed for no stated reason is a loop nobody can account for.'],
      'closing a loop'
    );
  }

  const closed: OpenLoop = freezeDeep({ ...target, status: 'CLOSED', closedAt: at, closedReason: reason });

  const next: Decision = {
    ...decision,
    updatedAt: at,
    openLoops: decision.openLoops.map((loop) => (loop.id === loopId ? closed : loop)),
    eventLog: append(decision.eventLog, { kind: 'loop_closed', at, loopId, reason }),
  };

  deserializeDecision(JSON.parse(JSON.stringify(next)), 'a decision closing an open loop');
  return next;
}

/**
 * CAP-12's primary action, and §56's decision reopen rate. Appending is the
 * only thing that happens: opening a decision changes nothing about it.
 */
export function recordDecisionOpened(decision: Decision, clock?: () => string): Decision {
  const at = now(clock);
  return {
    ...decision,
    eventLog: append(decision.eventLog, { kind: 'decision_opened', at }),
  };
}

/** The version the decision currently stands at. */
export function currentVersion(decision: Decision): DecisionVersion {
  const version = decision.versions.find((entry) => entry.id === decision.currentVersionId);
  if (!version) {
    throw new DecisionValidationError(['currentVersionId does not name a version'], 'a decision');
  }
  return version;
}

/**
 * TR-4. Which stages ran and which did not, for one version.
 *
 * This is Stage 1's `StageProvenance` list, returned as it stands. There is no
 * second stage-outcome model, and nothing here reinterprets a stage: a stage
 * is complete because the run recorded it complete, never because a version
 * object exists.
 */
export function versionStageOutcomes(version: DecisionVersion): readonly VersionStageOutcome[] {
  return version.runMeta.stages;
}

/** CAP-12's "state the PM recognises". Derived from the versions, never stored. */
export function decisionState(decision: Decision): DecisionState {
  const version = currentVersion(decision);
  if (version.outcome.kind === 'FAILED') return 'failed';
  if (decision.openLoops.some((loop) => loop.status === 'OPEN')) return 'waiting_on_a_check';
  if (version.outcome.kind === 'INSUFFICIENT') return 'awaiting_evidence';
  return 'provisional';
}

/** CAP-12: the decisions list is question-first, with state and last activity. */
export interface DecisionListing {
  id: string;
  decisionQuestion: string;
  state: DecisionState;
  lastActivityAt: string;
  openLoops: number;
  isSample: boolean;
}

export function listingFor(decision: Decision): DecisionListing {
  return {
    id: decision.id,
    decisionQuestion: decision.decisionQuestion,
    state: decisionState(decision),
    lastActivityAt: decision.updatedAt,
    openLoops: decision.openLoops.filter((loop) => loop.status === 'OPEN').length,
    isSample: decision.isSample,
  };
}

export { serializeDecision, deserializeDecision, DecisionValidationError };
export type { DecisionEventKind };
