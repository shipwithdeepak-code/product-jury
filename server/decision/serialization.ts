import { ClaimSpine } from '../claims/spine';
import { isPositionId, mintPositionId } from '../claims/identity';
import { PROVENANCE_STAGE_FIELDS } from '../integrity/provenance';
import {
  DECISION_SCHEMA_VERSION,
  VERSION_ORIGINS,
  VERSION_TRIGGERS,
} from '../../src/types/decision';
import type {
  Decision,
  DecisionEvent,
  DecisionEventKind,
  DecisionVersion,
  OpenLoop,
} from '../../src/types/decision';
import { EVENT_KINDS } from '../integrity/telemetry';
import { isDecisionId, isOpenLoopId, isVersionId, mintVersionId } from './identity';

/**
 * Stage 3 · Serialisation, and the boundary it is.
 *
 * PRD v1.1.1 CAP-12, NFR-5 ("a decision is never lost by navigation, reload or
 * restart"), NFR-6, §51 never-1.
 *
 * A stored decision is untrusted structure. It came back from a browser, a
 * file, or a store this process does not control, and between writing it and
 * reading it anything could have happened to it. So `deserializeDecision`
 * treats it exactly as `ClaimSpine.fromJSON` treats a stored spine: validate
 * everything, resolve every reference, and refuse the whole object if any part
 * of it does not hold.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO, because each of them is a way of turning
 * a corrupted record into a plausible one:
 *
 *   · No silent repair. A missing field is a refusal, not a default.
 *   · No reconstruction from prose. Nothing here reads a claim out of text.
 *   · No inferred claims, and no invented positions. If a position cites a
 *     claim that is not in the version's spine, the decision does not load.
 *     Stage 2.5 refuses that position on the way in; Stage 3 refuses it on the
 *     way back, for the same reason and with the same finality.
 *   · No regenerated ids. Every id is read from the record. Where an id is
 *     derivable — a version id is §17's "Decision + sequence number", a
 *     position id is a digest of its own text — the derived value is compared
 *     against the stored one and a mismatch is a refusal. That is a check, not
 *     a regeneration: nothing is written back.
 *   · No schema migration. A `schemaVersion` this build does not know is
 *     refused by name. Guessing at an older shape is how a decision comes back
 *     subtly different from the one that was committed.
 */

export class DecisionValidationError extends Error {
  readonly errors: string[];

  constructor(errors: string[], label = 'a stored decision') {
    super(
      `${label} does not validate:\n  - ${errors.join('\n  - ')}\n` +
        'Nothing is repaired, defaulted or reconstructed. A record that does not hold is refused whole.'
    );
    this.name = 'DecisionValidationError';
    this.errors = errors;
  }
}

/**
 * The stored shape. Structurally a `Decision`, distinguished by name so a
 * function signature says which side of the boundary it is on.
 */
export type SerializedDecision = Decision;

const DECISION_FIELDS = [
  'id',
  'schemaVersion',
  'decisionQuestion',
  'successCondition',
  'createdAt',
  'updatedAt',
  'currentVersionId',
  'versions',
  'openLoops',
  'eventLog',
  'isSample',
] as const;

const VERSION_FIELDS = [
  'id',
  'decisionId',
  'versionNumber',
  'createdAt',
  'origin',
  'trigger',
  'decisionQuestion',
  'successCondition',
  'claimSpine',
  'specialistPositions',
  'verdict',
  'runMeta',
  'outcome',
] as const;

const LOOP_FIELDS = [
  'id',
  'decisionId',
  'expectedEvidence',
  'whyItMatters',
  'duePoint',
  'bearsOnClaims',
  'reEvaluateOnArrival',
  'createdBy',
  'versionId',
  'createdAt',
  'status',
  'closedAt',
  'closedReason',
] as const;

const EVENT_FIELDS = ['seq', 'kind', 'at', 'versionNumber', 'loopId', 'trigger', 'outcome', 'reason'] as const;

const VERDICT_FIELDS = [
  'outcome',
  'confidence',
  'confidenceRationale',
  'executiveSummary',
  'opportunities',
  'recommendedNextStep',
  'confidenceCeiling',
  'falsificationContract',
] as const;

const RUN_META_FIELDS = [
  'runId',
  'startedAt',
  'finishedAt',
  'stages',
  'servedByUnevaluatedTier',
  'totalEstimatedCostCents',
  'totalProviderCalls',
] as const;

const POSITION_FIELDS = ['id', 'position', 'reasoning', 'citedClaims', 'producedBy', 'runId'] as const;

const VERDICT_OUTCOMES = ['SHIP', 'ITERATE', 'TEST', 'KILL'] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A closed schema: every required field present, and no field outside the set. */
function closedSchema(
  value: unknown,
  fields: readonly string[],
  label: string,
  errors: string[]
): value is Record<string, unknown> {
  if (!isObject(value)) {
    errors.push(`${label} is not an object`);
    return false;
  }
  const permitted = new Set(fields);
  for (const key of Object.keys(value)) {
    if (!permitted.has(key)) {
      errors.push(`${label}: unexpected field "${key}"`);
    }
  }
  return true;
}

function requireString(value: unknown, label: string, errors: string[]): void {
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${label} must be a non-empty string`);
  }
}

function requireIsoTime(value: unknown, label: string, errors: string[]): void {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    errors.push(`${label} must be an ISO timestamp`);
  }
}

function requireNumber(value: unknown, label: string, errors: string[]): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    errors.push(`${label} must be a finite number`);
  }
}

function requireEnum(
  value: unknown,
  values: readonly string[],
  label: string,
  errors: string[]
): void {
  if (typeof value !== 'string' || !values.includes(value)) {
    errors.push(`${label} must be one of: ${values.join(', ')}`);
  }
}

function validateVerdict(raw: unknown, label: string, errors: string[]): void {
  if (raw === null) return;
  if (!closedSchema(raw, VERDICT_FIELDS, label, errors)) return;
  const verdict = raw as Record<string, unknown>;
  requireEnum(verdict.outcome, VERDICT_OUTCOMES, `${label}.outcome`, errors);
  requireNumber(verdict.confidence, `${label}.confidence`, errors);
  requireString(verdict.confidenceRationale, `${label}.confidenceRationale`, errors);
  requireString(verdict.executiveSummary, `${label}.executiveSummary`, errors);
  requireString(verdict.recommendedNextStep, `${label}.recommendedNextStep`, errors);
  if (!Array.isArray(verdict.opportunities)) {
    errors.push(`${label}.opportunities must be an array`);
  }
  if (verdict.confidenceCeiling !== null && typeof verdict.confidenceCeiling !== 'number') {
    errors.push(`${label}.confidenceCeiling must be a number or null`);
  }
  if (verdict.falsificationContract !== null) {
    // FR-17 is not built. A contract appearing here would be a capability
    // claimed by the shape of the data rather than by any code that produces it.
    errors.push(
      `${label}.falsificationContract must be null: no stage in this build produces a falsification contract (FR-17)`
    );
  }
}

function validateRunMeta(raw: unknown, label: string, errors: string[]): void {
  if (!closedSchema(raw, RUN_META_FIELDS, label, errors)) return;
  const meta = raw as Record<string, unknown>;
  requireString(meta.runId, `${label}.runId`, errors);
  requireIsoTime(meta.startedAt, `${label}.startedAt`, errors);
  if (meta.finishedAt !== undefined) requireIsoTime(meta.finishedAt, `${label}.finishedAt`, errors);
  if (typeof meta.servedByUnevaluatedTier !== 'boolean') {
    errors.push(`${label}.servedByUnevaluatedTier must be a boolean`);
  }
  requireNumber(meta.totalEstimatedCostCents, `${label}.totalEstimatedCostCents`, errors);
  requireNumber(meta.totalProviderCalls, `${label}.totalProviderCalls`, errors);

  if (!Array.isArray(meta.stages)) {
    errors.push(`${label}.stages must be an array`);
    return;
  }
  meta.stages.forEach((stage, index) => {
    const stageLabel = `${label}.stages[${index}]`;
    if (!closedSchema(stage, PROVENANCE_STAGE_FIELDS, stageLabel, errors)) return;
    const entry = stage as Record<string, unknown>;
    requireString(entry.stage, `${stageLabel}.stage`, errors);
    requireEnum(
      entry.status,
      ['completed', 'failed', 'skipped', 'not_run'],
      `${stageLabel}.status`,
      errors
    );
    requireNumber(entry.attempts, `${stageLabel}.attempts`, errors);
    requireNumber(entry.durationMs, `${stageLabel}.durationMs`, errors);
    // TR-4 and TR-5: a stage that did not run says why. A blank reason is the
    // "it is fine, it just did not happen" that Stage 1 removed everywhere else.
    if ((entry.status === 'not_run' || entry.status === 'skipped') && typeof entry.reason !== 'string') {
      errors.push(`${stageLabel}: a stage recorded as ${String(entry.status)} must carry the reason`);
    }
  });
}

/**
 * Stage 5.1 · The outcome is validated against the version's own statements,
 * not against its shape alone.
 *
 * `spine` is undefined only when the spine itself failed to validate — that
 * failure is already an error, and resolving citations against a spine that
 * does not exist would bury it under a second one.
 */
function validateOutcome(
  raw: unknown,
  label: string,
  errors: string[],
  spine?: ClaimSpine
): void {
  if (!isObject(raw)) {
    errors.push(`${label} is not an object`);
    return;
  }
  const kind = raw.kind;
  if (kind === 'VERDICT') {
    closedSchema(raw, ['kind'], label, errors);
  } else if (kind === 'INSUFFICIENT') {
    closedSchema(raw, ['kind', 'refusedAt', 'missing'], label, errors);
    requireEnum(raw.refusedAt, ['GATE', 'CEILING'], `${label}.refusedAt`, errors);
    // FR-15: at least two specific missing items, each saying how to get it.
    if (!Array.isArray(raw.missing) || raw.missing.length < 2) {
      errors.push(`${label}.missing must name at least two specific missing items (FR-15)`);
    } else {
      raw.missing.forEach((item, index) => {
        const itemLabel = `${label}.missing[${index}]`;
        if (
          !closedSchema(item, ['item', 'whyItMatters', 'howToGetIt', 'bearsOnClaims'], itemLabel, errors)
        ) {
          return;
        }
        const missing = item as Record<string, unknown>;
        requireString(missing.item, `${itemLabel}.item`, errors);
        requireString(missing.whyItMatters, `${itemLabel}.whyItMatters`, errors);
        requireString(missing.howToGetIt, `${itemLabel}.howToGetIt`, errors);

        /*
         * CAP-18, Stage 5.1. The gate says which statements a gap undermines,
         * and the relationship is stored rather than validated and thrown
         * away. An empty list is a real answer — the gap bears on nothing in
         * particular — so it is required and allowed to be empty.
         *
         * The resolution rule is FR-9's, unchanged: an id resolves against
         * this version's own statements or the decision does not validate.
         * Nothing is repaired, dropped or substituted.
         */
        if (!Array.isArray(missing.bearsOnClaims)) {
          errors.push(
            `${itemLabel}.bearsOnClaims must be a list of statement ids, empty if the gap bears on none`
          );
        } else if (spine) {
          for (const claimId of missing.bearsOnClaims as unknown[]) {
            if (typeof claimId !== 'string' || !spine.has(claimId)) {
              errors.push(
                `${itemLabel} bears on ${String(claimId)}, which is not a statement in this version. ` +
                  'The reference is not dropped and no other statement is substituted.'
              );
            }
          }
        }
      });
    }
  } else if (kind === 'FAILED') {
    closedSchema(raw, ['kind', 'code', 'userMessage', 'retryable', 'stage'], label, errors);
    requireString(raw.code, `${label}.code`, errors);
    requireString(raw.userMessage, `${label}.userMessage`, errors);
    if (typeof raw.retryable !== 'boolean') errors.push(`${label}.retryable must be a boolean`);
  } else {
    errors.push(`${label}.kind must be one of: VERDICT, INSUFFICIENT, FAILED`);
  }
}

/**
 * A version, and the two cross-checks that make its contents a record rather
 * than a resemblance: the spine is rebuilt through Stage 2's own validator,
 * and every position is resolved against it.
 */
function validateVersion(
  raw: unknown,
  index: number,
  decisionId: string,
  errors: string[]
): { version: DecisionVersion; spine: ClaimSpine } | undefined {
  const label = `versions[${index}]`;
  if (!closedSchema(raw, VERSION_FIELDS, label, errors)) return undefined;
  const value = raw as Record<string, unknown>;

  if (!isVersionId(value.id)) errors.push(`${label}.id is not a version id`);
  if (value.decisionId !== decisionId) {
    errors.push(`${label}.decisionId does not belong to this decision`);
  }
  if (!Number.isInteger(value.versionNumber) || (value.versionNumber as number) < 1) {
    errors.push(`${label}.versionNumber must be an integer from 1`);
  }
  // §17: a version's identity is the decision and its sequence number. The
  // stored id must be that pair. Compared, never rewritten.
  if (
    isVersionId(value.id) &&
    Number.isInteger(value.versionNumber) &&
    (value.versionNumber as number) >= 1 &&
    value.id !== mintVersionId(decisionId, value.versionNumber as number)
  ) {
    errors.push(
      `${label}.id is not the identity of version ${String(value.versionNumber)} of this decision`
    );
  }
  requireIsoTime(value.createdAt, `${label}.createdAt`, errors);
  requireEnum(value.origin, VERSION_ORIGINS, `${label}.origin`, errors);
  requireEnum(value.trigger, VERSION_TRIGGERS, `${label}.trigger`, errors);
  requireString(value.decisionQuestion, `${label}.decisionQuestion`, errors);
  if (value.successCondition !== null && typeof value.successCondition !== 'string') {
    errors.push(`${label}.successCondition must be a string or null`);
  }

  validateVerdict(value.verdict, `${label}.verdict`, errors);
  validateRunMeta(value.runMeta, `${label}.runMeta`, errors);

  // The spine goes back through Stage 2's own boundary. Every claim is
  // revalidated, every id checked for uniqueness, every reference resolved.
  let spine: ClaimSpine | undefined;
  try {
    spine = ClaimSpine.fromJSON(value.claimSpine);
  } catch (error) {
    errors.push(
      `${label}.claimSpine does not validate: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Stage 5.1: after the spine, because a refusal's missing items now cite it.
  validateOutcome(value.outcome, `${label}.outcome`, errors, spine);

  if (!Array.isArray(value.specialistPositions)) {
    errors.push(`${label}.specialistPositions must be an array`);
  } else if (spine) {
    const seen = new Set<string>();
    value.specialistPositions.forEach((raw, positionIndex) => {
      const positionLabel = `${label}.specialistPositions[${positionIndex}]`;
      if (!closedSchema(raw, POSITION_FIELDS, positionLabel, errors)) return;
      const position = raw as Record<string, unknown>;

      if (!isPositionId(position.id)) errors.push(`${positionLabel}.id is not a position id`);
      requireString(position.position, `${positionLabel}.position`, errors);
      requireString(position.reasoning, `${positionLabel}.reasoning`, errors);
      requireString(position.producedBy, `${positionLabel}.producedBy`, errors);

      // Stage 2.5's rule, unchanged: a position belongs to the run whose
      // statements it cites. A position from another run cannot be stored here.
      if (position.runId !== spine!.runId) {
        errors.push(
          `${positionLabel}.runId is ${String(position.runId)}, but this version's statements belong to run ${spine!.runId}`
        );
      }

      if (
        typeof position.position === 'string' &&
        typeof position.producedBy === 'string' &&
        typeof position.runId === 'string' &&
        isPositionId(position.id) &&
        position.id !==
          mintPositionId({
            runId: position.runId,
            producedBy: position.producedBy,
            text: position.position,
          })
      ) {
        errors.push(`${positionLabel}.id is not the identity of the position it is attached to`);
      }
      if (typeof position.id === 'string') {
        if (seen.has(position.id)) errors.push(`${positionLabel}: duplicate position id`);
        seen.add(position.id);
      }

      // FR-9. The whole of Stage 2.5 in one check: a substantive position
      // names the statements it rests on, and each one resolves here.
      if (!Array.isArray(position.citedClaims) || position.citedClaims.length === 0) {
        errors.push(`${positionLabel}.citedClaims must name at least one statement (FR-9)`);
      } else {
        for (const cited of position.citedClaims as unknown[]) {
          if (typeof cited !== 'string' || !spine!.has(cited)) {
            errors.push(
              `${positionLabel} cites ${String(cited)}, which is not a statement in this version. ` +
                'The citation is not dropped and no other statement is substituted.'
            );
          }
        }
      }
    });
  }

  if (errors.length > 0 || !spine) return undefined;
  return { version: value as unknown as DecisionVersion, spine };
}

function validateOpenLoop(
  raw: unknown,
  index: number,
  decisionId: string,
  spinesByVersionId: Map<string, ClaimSpine>,
  errors: string[]
): void {
  const label = `openLoops[${index}]`;
  if (!closedSchema(raw, LOOP_FIELDS, label, errors)) return;
  const loop = raw as Record<string, unknown>;

  if (!isOpenLoopId(loop.id)) errors.push(`${label}.id is not an open-loop id`);
  if (loop.decisionId !== decisionId) errors.push(`${label}.decisionId does not belong to this decision`);

  // CAP-19's five fields. All five, always.
  requireString(loop.expectedEvidence, `${label}.expectedEvidence`, errors);
  requireString(loop.whyItMatters, `${label}.whyItMatters`, errors);
  requireString(loop.duePoint, `${label}.duePoint`, errors);
  requireString(loop.reEvaluateOnArrival, `${label}.reEvaluateOnArrival`, errors);
  requireEnum(loop.createdBy, ['contract', 'collect'], `${label}.createdBy`, errors);
  requireIsoTime(loop.createdAt, `${label}.createdAt`, errors);
  requireEnum(loop.status, ['OPEN', 'CLOSED'], `${label}.status`, errors);

  const spine = typeof loop.versionId === 'string' ? spinesByVersionId.get(loop.versionId) : undefined;
  if (!spine) {
    errors.push(`${label}.versionId does not name a version of this decision`);
  }

  if (!Array.isArray(loop.bearsOnClaims) || loop.bearsOnClaims.length === 0) {
    errors.push(`${label}.bearsOnClaims must name at least one statement (CAP-19)`);
  } else if (spine) {
    for (const claimId of loop.bearsOnClaims as unknown[]) {
      if (typeof claimId !== 'string' || !spine.has(claimId)) {
        errors.push(
          `${label} bears on ${String(claimId)}, which is not a statement in the version it was created against`
        );
      }
    }
  }

  if (loop.status === 'CLOSED') {
    // CAP-19 MVP: "closing a loop by hand with a reason".
    requireIsoTime(loop.closedAt, `${label}.closedAt`, errors);
    requireString(loop.closedReason, `${label}.closedReason`, errors);
  } else {
    if (loop.closedAt !== undefined) errors.push(`${label} is open but carries a closing time`);
    if (loop.closedReason !== undefined) errors.push(`${label} is open but carries a closing reason`);
  }
}

function validateEventLog(
  raw: unknown,
  versionNumbers: Set<number>,
  loopIds: Set<string>,
  errors: string[]
): void {
  if (!Array.isArray(raw)) {
    errors.push('eventLog must be an array');
    return;
  }
  if (raw.length === 0) {
    errors.push('eventLog is empty: a decision that exists was created, and the log records it');
    return;
  }

  let previousAt = Number.NEGATIVE_INFINITY;
  raw.forEach((entry, index) => {
    const label = `eventLog[${index}]`;
    if (!closedSchema(entry, EVENT_FIELDS, label, errors)) return;
    const event = entry as Record<string, unknown>;

    // CAP-12: "a log that is never rewritten, only added to". A dense,
    // ascending sequence is what makes that checkable after the fact.
    if (event.seq !== index) {
      errors.push(`${label}.seq is ${String(event.seq)}, but the log is append-only and dense from 0`);
    }
    requireEnum(event.kind, EVENT_KINDS, `${label}.kind`, errors);
    requireIsoTime(event.at, `${label}.at`, errors);

    const at = typeof event.at === 'string' ? Date.parse(event.at) : Number.NaN;
    if (!Number.isNaN(at)) {
      if (at < previousAt) errors.push(`${label}.at goes backwards in an append-only log`);
      previousAt = at;
    }

    if (event.versionNumber !== undefined && !versionNumbers.has(event.versionNumber as number)) {
      errors.push(`${label} names version ${String(event.versionNumber)}, which does not exist`);
    }
    if (event.loopId !== undefined && !loopIds.has(event.loopId as string)) {
      errors.push(`${label} names an open loop that does not exist`);
    }
    if (event.trigger !== undefined) {
      requireEnum(event.trigger, VERSION_TRIGGERS, `${label}.trigger`, errors);
    }
    if (event.outcome !== undefined) {
      requireEnum(event.outcome, ['verdict', 'insufficient', 'failed'], `${label}.outcome`, errors);
    }
    if (event.reason !== undefined && typeof event.reason !== 'string') {
      errors.push(`${label}.reason must be a string`);
    }
  });

  if (errors.length === 0 && (raw[0] as DecisionEvent).kind !== 'decision_created') {
    errors.push('eventLog does not begin with decision_created');
  }
}

/**
 * Validate a stored decision and hand back the domain object.
 *
 * Throws `DecisionValidationError` listing everything that is wrong, rather
 * than the first thing: a record with three problems is a record someone needs
 * to see three problems in.
 */
export function deserializeDecision(raw: unknown, label = 'a stored decision'): Decision {
  const errors: string[] = [];

  if (!closedSchema(raw, DECISION_FIELDS, 'decision', errors)) {
    throw new DecisionValidationError(errors, label);
  }
  const value = raw as Record<string, unknown>;

  if (value.schemaVersion !== DECISION_SCHEMA_VERSION) {
    // Refused by name. There is no migration path in this build, and guessing
    // at an older shape would produce a decision nobody committed.
    throw new DecisionValidationError(
      [
        `schemaVersion is ${String(value.schemaVersion)}; this build reads ${DECISION_SCHEMA_VERSION} and does not migrate`,
      ],
      label
    );
  }

  if (!isDecisionId(value.id)) errors.push('decision.id is not a decision id');
  requireString(value.decisionQuestion, 'decision.decisionQuestion', errors);
  if (value.successCondition !== null && typeof value.successCondition !== 'string') {
    errors.push('decision.successCondition must be a string or null');
  }
  requireIsoTime(value.createdAt, 'decision.createdAt', errors);
  requireIsoTime(value.updatedAt, 'decision.updatedAt', errors);
  if (typeof value.isSample !== 'boolean') errors.push('decision.isSample must be a boolean');

  if (!Array.isArray(value.versions) || value.versions.length === 0) {
    errors.push('decision.versions must hold at least the first committed version');
    throw new DecisionValidationError(errors, label);
  }

  const spinesByVersionId = new Map<string, ClaimSpine>();
  const versionNumbers = new Set<number>();

  value.versions.forEach((rawVersion, index) => {
    const result = validateVersion(rawVersion, index, value.id as string, errors);
    if (!result) return;
    spinesByVersionId.set(result.version.id, result.spine);
    versionNumbers.add(result.version.versionNumber);
    // §17: versions are held in order, and the order is the sequence number.
    if (result.version.versionNumber !== index + 1) {
      errors.push(
        `versions[${index}] is version ${result.version.versionNumber}, but versions are held in order from 1`
      );
    }
  });

  const versions = value.versions as DecisionVersion[];
  const current = versions[versions.length - 1];
  if (current && value.currentVersionId !== current.id) {
    errors.push('decision.currentVersionId does not name the last version');
  }
  if (current && value.decisionQuestion !== current.decisionQuestion) {
    errors.push(
      'decision.decisionQuestion differs from the question the current version was judged under'
    );
  }

  if (!Array.isArray(value.openLoops)) {
    errors.push('decision.openLoops must be an array');
  } else {
    value.openLoops.forEach((loop, index) =>
      validateOpenLoop(loop, index, value.id as string, spinesByVersionId, errors)
    );
  }

  const loopIds = new Set<string>(
    Array.isArray(value.openLoops)
      ? (value.openLoops as OpenLoop[]).map((loop) => loop?.id).filter((id): id is string => typeof id === 'string')
      : []
  );
  validateEventLog(value.eventLog, versionNumbers, loopIds, errors);

  if (errors.length > 0) throw new DecisionValidationError(errors, label);

  return value as unknown as Decision;
}

/**
 * Domain → stored.
 *
 * Validated on the way out as well as on the way in, because a decision that
 * cannot be read back is not persisted, whatever the write returned. CAP-12's
 * failure state: "If a decision cannot be kept, the product says so at the
 * time." This is where it says so.
 */
export function serializeDecision(decision: Decision): SerializedDecision {
  const plain = JSON.parse(JSON.stringify(decision)) as unknown;
  deserializeDecision(plain, 'a decision being written');
  return plain as SerializedDecision;
}

/** The event kinds a decision log may hold, for tests and callers. */
export const DECISION_EVENT_KINDS: readonly DecisionEventKind[] =
  EVENT_KINDS as readonly DecisionEventKind[];
