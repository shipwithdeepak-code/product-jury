/**
 * Stage 1 · Content-free telemetry.
 *
 * PRD v1.1.1 §55, PR-7, PR-8, PR-9, TEL-1 to TEL-10.
 *
 * The constraint comes first (§55): "a field that could carry content does not
 * exist". That is why this module defines the schema as a per-kind whitelist
 * and rejects any field outside it, rather than sanitising a payload after the
 * fact. TEL-10 then requires the same property to be enforced *by test* as
 * well as by schema, and the test in tests/telemetry.test.ts attempts to emit
 * every forbidden field against every event kind.
 *
 * The server keeps counters, not rows (§55, "what deletion does and does not
 * reach"): there is nothing per-decision to find and decrement, which is what
 * TEL-9 discloses.
 */

/** §55's event kinds, verbatim and complete. */
export const EVENT_KINDS = [
  'decision_created',
  'statement_edited',
  'question_proposed',
  'question_confirmed',
  'unknown_shown',
  'unknown_answered',
  'evidence_added',
  'judge_started',
  'gate_refused',
  'ceiling_refused',
  'verdict_issued',
  'challenge_requested',
  'response_recorded',
  'loop_created',
  'loop_closed',
  'version_created',
  'decision_opened',
  'decision_deleted',
] as const;

export type EventKind = (typeof EVENT_KINDS)[number];

/**
 * §55's "events may contain" list, and nothing else.
 *
 * `decisionId` is an identifier minted in the browser and meaningless outside
 * it (§55). `outcome`, `stage`, `refusedAt` and `responseKind` are coarse
 * enumerated labels, never free text.
 */
export const ALLOWED_EVENT_FIELDS = [
  'kind',
  'decisionId',
  'versionNumber',
  'timestamp',
  'outcome',
  'stage',
  'durationMs',
  'sessionSeq',
  'refusedAt',
  'responseKind',
  'triggeredBy',
  'editDistanceBand',
] as const;

export type AllowedEventField = (typeof ALLOWED_EVENT_FIELDS)[number];

/** Every field is one of these shapes, and none of them is free text. */
type FieldSpec =
  | { type: 'string'; maxLength: number; pattern?: RegExp }
  | { type: 'number' }
  | { type: 'enum'; values: readonly string[] };

const FIELD_SPECS: Record<AllowedEventField, FieldSpec> = {
  kind: { type: 'enum', values: EVENT_KINDS },
  // An opaque client-minted id. Constrained so it cannot smuggle prose.
  decisionId: { type: 'string', maxLength: 64, pattern: /^[A-Za-z0-9_-]{1,64}$/ },
  versionNumber: { type: 'number' },
  timestamp: { type: 'string', maxLength: 32, pattern: /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/ },
  outcome: { type: 'enum', values: ['verdict', 'insufficient', 'failed', 'revised', 'abandoned'] },
  stage: {
    type: 'enum',
    values: [
      'analyst',
      'context_alignment',
      'gate',
      'specialist_ux',
      'specialist_strategy',
      'cross_examination',
      'auditor',
      'chair',
      'red_team',
    ],
  },
  durationMs: { type: 'number' },
  sessionSeq: { type: 'number' },
  refusedAt: { type: 'enum', values: ['gate', 'ceiling'] },
  responseKind: { type: 'enum', values: ['defend', 'revise', 'collect'] },
  triggeredBy: { type: 'enum', values: ['evidence', 'revision', 'question_change', 'rejudge'] },
  // CAP-04's ≥85% needs an edit-distance flag (§56) and a band is content-free
  // where the distance itself is not.
  editDistanceBand: { type: 'enum', values: ['unedited', 'light', 'heavy'] },
};

/** Which fields each kind may carry. `kind` and `timestamp` are always required. */
const KIND_FIELDS: Record<EventKind, readonly AllowedEventField[]> = {
  decision_created: ['kind', 'decisionId', 'timestamp', 'sessionSeq'],
  statement_edited: ['kind', 'decisionId', 'timestamp'],
  question_proposed: ['kind', 'decisionId', 'timestamp'],
  question_confirmed: ['kind', 'decisionId', 'timestamp', 'editDistanceBand'],
  unknown_shown: ['kind', 'decisionId', 'timestamp'],
  unknown_answered: ['kind', 'decisionId', 'timestamp'],
  evidence_added: ['kind', 'decisionId', 'timestamp', 'versionNumber'],
  judge_started: ['kind', 'decisionId', 'timestamp'],
  gate_refused: ['kind', 'decisionId', 'timestamp', 'durationMs', 'refusedAt'],
  ceiling_refused: ['kind', 'decisionId', 'timestamp', 'durationMs', 'refusedAt'],
  verdict_issued: ['kind', 'decisionId', 'timestamp', 'versionNumber', 'durationMs', 'outcome'],
  challenge_requested: ['kind', 'decisionId', 'timestamp'],
  response_recorded: ['kind', 'decisionId', 'timestamp', 'responseKind'],
  loop_created: ['kind', 'decisionId', 'timestamp', 'triggeredBy'],
  loop_closed: ['kind', 'decisionId', 'timestamp'],
  version_created: ['kind', 'decisionId', 'timestamp', 'versionNumber', 'triggeredBy'],
  decision_opened: ['kind', 'decisionId', 'timestamp'],
  decision_deleted: ['kind', 'decisionId', 'timestamp'],
};

export interface TelemetryEvent {
  kind: EventKind;
  timestamp: string;
  [field: string]: unknown;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * TEL-2 and TEL-10. Rejects, never strips: a payload carrying a forbidden
 * field is a bug in the emitter, and silently cleaning it would hide the bug.
 */
export function validateEvent(event: unknown): ValidationResult {
  const errors: string[] = [];

  if (typeof event !== 'object' || event === null || Array.isArray(event)) {
    return { valid: false, errors: ['event must be an object'] };
  }

  const candidate = event as Record<string, unknown>;
  const kind = candidate.kind;

  if (typeof kind !== 'string' || !(EVENT_KINDS as readonly string[]).includes(kind)) {
    return { valid: false, errors: [`unknown event kind: ${String(kind)}`] };
  }

  const permitted = new Set<string>(KIND_FIELDS[kind as EventKind]);

  for (const field of Object.keys(candidate)) {
    if (!permitted.has(field)) {
      errors.push(
        `field "${field}" is not permitted on ${kind}. Events are content-free by schema (TEL-2).`
      );
      continue;
    }
    const spec = FIELD_SPECS[field as AllowedEventField];
    const value = candidate[field];
    if (value === undefined || value === null) continue;

    if (spec.type === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        errors.push(`field "${field}" must be a finite number`);
      }
    } else if (spec.type === 'enum') {
      if (typeof value !== 'string' || !spec.values.includes(value)) {
        errors.push(`field "${field}" must be one of: ${spec.values.join(', ')}`);
      }
    } else {
      if (typeof value !== 'string') {
        errors.push(`field "${field}" must be a string`);
      } else if (value.length > spec.maxLength) {
        errors.push(`field "${field}" exceeds ${spec.maxLength} characters`);
      } else if (spec.pattern && !spec.pattern.test(value)) {
        errors.push(`field "${field}" does not match its permitted shape`);
      }
    }
  }

  if (typeof candidate.timestamp !== 'string') {
    errors.push('timestamp is required');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Field names that must never be accepted on any event. Used by the TEL-10
 * test, which tries to emit each of them against every kind.
 */
export const FORBIDDEN_EVENT_FIELDS: readonly string[] = Object.freeze([
  'artifact',
  'artifactBase64',
  'image',
  'screenshot',
  'screenshotUrl',
  'statement',
  'statements',
  'claim',
  'claims',
  'evidence',
  'evidenceText',
  'question',
  'decisionQuestion',
  'successCondition',
  'verdictText',
  'summary',
  'executiveSummary',
  'rationale',
  'productName',
  'fileName',
  'userAgent',
  'ip',
  'email',
  'text',
  'content',
  'prompt',
  'response',
]);

/**
 * The counter store. Counters only, per §55: no per-decision row exists, which
 * is what makes TEL-9's disclosure true rather than a policy promise.
 */
export class CounterStore {
  private readonly counters = new Map<string, number>();
  private readonly durations = new Map<string, number[]>();

  record(event: TelemetryEvent): void {
    const key = event.kind;
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);

    if (typeof event.outcome === 'string') {
      const outcomeKey = `${key}:${event.outcome}`;
      this.counters.set(outcomeKey, (this.counters.get(outcomeKey) ?? 0) + 1);
    }
    if (typeof event.durationMs === 'number') {
      const list = this.durations.get(key) ?? [];
      list.push(event.durationMs);
      this.durations.set(key, list);
    }
  }

  snapshot(): Record<string, number> {
    return Object.fromEntries(this.counters);
  }

  /** p95 with p50 alongside, as §48's Craft gates require for NFR-2 and NFR-3. */
  latency(kind: EventKind): { p50: number; p95: number; n: number } | undefined {
    const list = this.durations.get(kind);
    if (!list || list.length === 0) return undefined;
    const sorted = [...list].sort((a, b) => a - b);
    const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
    return { p50: at(0.5), p95: at(0.95), n: sorted.length };
  }

  reset(): void {
    this.counters.clear();
    this.durations.clear();
  }
}

export const sharedCounters = new CounterStore();

/**
 * TEL-9's disclosure text, held beside the thing it describes so the two
 * cannot drift.
 */
export const DELETION_DISCLOSURE =
  'Deleting a decision removes the decision and everything stored about it that could ' +
  'reconstruct its content. It does not reverse the content-free counters already sent: ' +
  'the server keeps totals rather than per-decision records, and the identifier those ' +
  'totals were counted under means nothing to it, so there is nothing to find and undo. ' +
  'It also does not reach the artifact already sent to the AI provider for a run that has happened: Google\u2019s handling of that copy is governed by its terms, not by this control.';
