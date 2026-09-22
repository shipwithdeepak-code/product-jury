import { isTelemetryEnabled } from '../integrity/disclosures';

/**
 * Stage 1 · The client-side content-free event emitter.
 *
 * PRD v1.1.1 §55, TEL-2, TEL-3, TEL-6, TEL-7, TEL-9, PR-7, PR-9.
 *
 * Two properties this module has to hold:
 *
 *  - TEL-2: no field that could carry decision content exists. `emit()` takes
 *    a kind and a small set of typed, enumerated fields. There is no
 *    `metadata`, no `properties` bag and no free-text parameter anywhere in
 *    its signature, so there is no way for a caller to attach content even by
 *    mistake. The server re-validates and rejects.
 *
 *  - TEL-7: the product functions fully if telemetry fails, is blocked or is
 *    declined. Every send is fire-and-forget and every failure is swallowed
 *    here. Nothing in the product awaits this module.
 *
 * The decision identifier is minted in the browser and is meaningless outside
 * it (§55). It is not a user identifier and is never reused across decisions.
 */

export type EventKind =
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
 * The only fields a caller may attach. Every one is a number or a value from a
 * closed set; none is free text.
 */
export interface EventFields {
  decisionId?: string;
  versionNumber?: number;
  outcome?: 'verdict' | 'insufficient' | 'failed' | 'revised' | 'abandoned';
  stage?:
    | 'analyst'
    | 'context_alignment'
    | 'gate'
    | 'specialist_ux'
    | 'specialist_strategy'
    | 'cross_examination'
    | 'auditor'
    | 'chair'
    | 'red_team';
  durationMs?: number;
  sessionSeq?: number;
  refusedAt?: 'gate' | 'ceiling';
  responseKind?: 'defend' | 'revise' | 'collect';
  triggeredBy?: 'evidence' | 'revision' | 'question_change' | 'rejudge';
  editDistanceBand?: 'unedited' | 'light' | 'heavy';
}

const FLUSH_INTERVAL_MS = 4_000;
const MAX_BATCH = 25;

let queue: Record<string, unknown>[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

/** A browser-minted identifier, meaningless to the server (§55). */
export function mintDecisionId(): string {
  const cryptoObj = typeof crypto !== 'undefined' ? crypto : undefined;
  if (cryptoObj?.randomUUID) {
    return cryptoObj.randomUUID().replace(/-/g, '').slice(0, 32);
  }
  return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function emit(kind: EventKind, fields: EventFields = {}): void {
  // PR-9: declining takes effect for this browser and stops the stream here.
  if (!isTelemetryEnabled()) return;

  const event: Record<string, unknown> = { kind, timestamp: new Date().toISOString() };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) {
      event[key] = value;
    }
  }

  queue.push(event);
  if (queue.length >= MAX_BATCH) {
    void flush();
  } else if (!timer) {
    timer = setTimeout(() => void flush(), FLUSH_INTERVAL_MS);
  }
}

export async function flush(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (queue.length === 0) return;

  const batch = queue;
  queue = [];

  try {
    await fetch('/api/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: batch }),
      keepalive: true,
    });
  } catch {
    // TEL-7. A dropped batch costs a counter and nothing else. It is not
    // retried, because a retry queue that outlives the tab is a store, and a
    // store of events is a different privacy posture (§55).
  }
}

/** Drop anything queued without sending it. Used by the delete path. */
export function discardQueued(): void {
  queue = [];
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => void flush());
}
