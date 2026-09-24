import type { Decision, DecisionEvent } from '../../src/types/decision';
import { validateEvent, type TelemetryEvent } from '../integrity/telemetry';

/**
 * Stage 3 · Where the decision's own log stops and telemetry begins.
 *
 * PRD v1.1.1 §55, TEL-2, TEL-3, TEL-6, TEL-9, TEL-10, PR-6, PR-7, PR-8.
 *
 * TWO LOGS, AND ONLY ONE OF THEM LEAVES.
 *
 * The decision event log (`Decision.eventLog`) is the decision's own record.
 * It stays wherever the decision is stored, and it carries decision content —
 * the reason a PM gave for closing a loop is on it, because CAP-19 requires
 * the reason and the log is where a reason is kept.
 *
 * Product telemetry is content-free by schema (§55: "a field that could carry
 * content does not exist"), and TEL-3 requires it to be *derived* from that
 * log rather than emitted separately, so the log stays the single record of
 * what happened.
 *
 * This module is that derivation, and it is written as a per-kind literal
 * rather than a copy-with-exclusions. The difference matters: an exclusion
 * list leaks the next field somebody adds, and a whitelist does not. Nothing
 * here spreads an event, and `reason` is never read.
 *
 * WHAT IS KNOWINGLY NOT PROJECTED, and is in the Stage 3 report as an open
 * item rather than invented here:
 *
 *   · A FAILED run. §55's kind list has no event for a run that could not
 *     execute, so a technical failure emits nothing.
 *   · Whether a `loop_created` came from a falsification contract or from
 *     Collect. §56's contract take-up metric needs that distinction, and
 *     §55's permitted field list has no value that carries it.
 *   · `durationMs` on a verdict or a refusal. The decision log records what
 *     happened, not how long a stage took; the durations are in the version's
 *     run metadata, which does not leave the browser.
 *
 * Each of those is a metric the PRD defines and this projection cannot supply.
 * Supplying them would mean adding a field or a kind the PRD does not have.
 */

export class TelemetryProjectionError extends Error {
  readonly errors: string[];

  constructor(errors: string[]) {
    super(
      `a telemetry event derived from a decision log did not validate:\n  - ${errors.join('\n  - ')}`
    );
    this.name = 'TelemetryProjectionError';
    this.errors = errors;
  }
}

/**
 * One log entry → at most one content-free event.
 *
 * Returns `undefined` where §55 has no kind for what happened. Never returns a
 * partially filled event: an event that cannot be built correctly is not sent.
 */
export function projectEvent(decisionId: string, entry: DecisionEvent): TelemetryEvent | undefined {
  const timestamp = entry.at;
  let event: TelemetryEvent | undefined;

  switch (entry.kind) {
    case 'decision_created':
    case 'decision_opened':
    case 'decision_deleted':
    case 'loop_closed':
    case 'loop_created':
    case 'judge_started':
    case 'challenge_requested':
    case 'statement_edited':
    case 'question_proposed':
    case 'unknown_shown':
    case 'unknown_answered':
      event = { kind: entry.kind, decisionId, timestamp };
      break;

    case 'question_confirmed':
      event = { kind: 'question_confirmed', decisionId, timestamp };
      break;

    case 'evidence_added':
      event = { kind: 'evidence_added', decisionId, timestamp, versionNumber: entry.versionNumber };
      break;

    case 'version_created':
      // §56's revisit rate reads exactly these two fields.
      event = {
        kind: 'version_created',
        decisionId,
        timestamp,
        versionNumber: entry.versionNumber,
        triggeredBy: entry.trigger,
      };
      break;

    case 'verdict_issued':
      event = {
        kind: 'verdict_issued',
        decisionId,
        timestamp,
        versionNumber: entry.versionNumber,
        outcome: 'verdict',
      };
      break;

    case 'gate_refused':
      event = { kind: 'gate_refused', decisionId, timestamp, refusedAt: 'gate' };
      break;

    case 'ceiling_refused':
      event = { kind: 'ceiling_refused', decisionId, timestamp, refusedAt: 'ceiling' };
      break;

    case 'response_recorded':
      event = { kind: 'response_recorded', decisionId, timestamp };
      break;

    default:
      event = undefined;
  }

  if (!event) return undefined;

  // Drop fields the log did not carry, rather than sending undefined.
  for (const key of Object.keys(event)) {
    if (event[key] === undefined) delete event[key];
  }

  // TEL-10: the schema is asserted here too, not only in a test. A projection
  // bug is a confidentiality incident, so it fails rather than sends.
  const result = validateEvent(event);
  if (!result.valid) throw new TelemetryProjectionError(result.errors);

  return event;
}

/** The whole log, projected. TEL-3: events are derived from the decision's log. */
export function projectDecisionEvents(decision: Decision): TelemetryEvent[] {
  const events: TelemetryEvent[] = [];
  for (const entry of decision.eventLog) {
    const event = projectEvent(decision.id, entry);
    if (event) events.push(event);
  }
  return events;
}

/**
 * The one event a deletion emits. PR-8 removes the decision; TEL-9 records
 * that this event, once counted, is not reversed by that removal.
 */
export function projectDeletion(decisionId: string, at: string): TelemetryEvent {
  return projectEvent(decisionId, { seq: -1, kind: 'decision_deleted', at }) as TelemetryEvent;
}
