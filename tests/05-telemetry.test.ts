import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ALLOWED_EVENT_FIELDS,
  CounterStore,
  EVENT_KINDS,
  FORBIDDEN_EVENT_FIELDS,
  validateEvent,
} from '../server/integrity/telemetry';
import * as telemetryClient from '../src/services/telemetryClient';
import { setTelemetryEnabled } from '../src/integrity/disclosures';

/**
 * Groups 8 and 9 of the Stage 1 brief: telemetry schema, and telemetry
 * containing no content.
 *
 * PRD v1.1.1 TEL-1, TEL-2, TEL-10 and §55. TEL-10 is explicit that the
 * content-free property is enforced by a test rather than by a review:
 * "a test asserts that no event carries free text."
 */

const now = () => new Date().toISOString();

describe('8 · telemetry schema', () => {
  it('accepts a well-formed event of every kind', () => {
    const sample: Record<string, Record<string, unknown>> = {
      decision_created: { sessionSeq: 1 },
      question_confirmed: { editDistanceBand: 'light' },
      evidence_added: { versionNumber: 2 },
      gate_refused: { durationMs: 900, refusedAt: 'gate' },
      ceiling_refused: { durationMs: 900, refusedAt: 'ceiling' },
      verdict_issued: { versionNumber: 1, durationMs: 4200, outcome: 'verdict' },
      response_recorded: { responseKind: 'revise' },
      loop_created: { triggeredBy: 'evidence' },
      version_created: { versionNumber: 3, triggeredBy: 'rejudge' },
    };

    for (const kind of EVENT_KINDS) {
      const result = validateEvent({
        kind,
        timestamp: now(),
        decisionId: 'abc123',
        ...(sample[kind] ?? {}),
      });
      expect(result.errors, `${kind}: ${result.errors.join('; ')}`).toEqual([]);
      expect(result.valid).toBe(true);
    }
  });

  it('rejects an unknown event kind', () => {
    expect(validateEvent({ kind: 'user_typed_something', timestamp: now() }).valid).toBe(false);
  });

  it('rejects an enum value outside its closed set', () => {
    const result = validateEvent({
      kind: 'verdict_issued',
      timestamp: now(),
      decisionId: 'abc',
      outcome: 'probably fine',
    });
    expect(result.valid).toBe(false);
  });

  it('rejects a field on a kind that does not carry it', () => {
    const result = validateEvent({
      kind: 'judge_started',
      timestamp: now(),
      decisionId: 'abc',
      responseKind: 'defend',
    });
    expect(result.valid).toBe(false);
  });

  it('rejects rather than strips, so a bad emitter is visible', () => {
    const result = validateEvent({
      kind: 'judge_started',
      timestamp: now(),
      decisionId: 'abc',
      evidence: 'the user said the onboarding was confusing',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/not permitted/);
  });

  it('requires a timestamp', () => {
    expect(validateEvent({ kind: 'judge_started', decisionId: 'abc' }).valid).toBe(false);
  });
});

describe('9 · telemetry carries no content', () => {
  it('rejects every forbidden field name on every event kind (TEL-10)', () => {
    for (const kind of EVENT_KINDS) {
      for (const field of FORBIDDEN_EVENT_FIELDS) {
        const result = validateEvent({
          kind,
          timestamp: now(),
          decisionId: 'abc',
          [field]: 'The checkout flow loses 62% of users at the schema mapping step.',
        });
        expect(result.valid, `${kind}.${field} was accepted`).toBe(false);
      }
    }
  });

  it('permits no free-text field at all: every allowed field is bounded', () => {
    // decisionId and timestamp are the only strings, and both are pattern-bound.
    const stringFields = ['decisionId', 'timestamp'];
    for (const field of ALLOWED_EVENT_FIELDS) {
      if (field === 'kind' || stringFields.includes(field)) continue;
      const result = validateEvent({
        kind: 'verdict_issued',
        timestamp: now(),
        decisionId: 'abc',
        [field]: 'free text',
      });
      expect(result.valid, `${field} accepted a free string`).toBe(false);
    }
  });

  it('will not accept prose smuggled through decisionId', () => {
    const result = validateEvent({
      kind: 'judge_started',
      timestamp: now(),
      decisionId: 'the PM asked whether to ship the new onboarding',
    });
    expect(result.valid).toBe(false);
  });

  it('keeps counters only, with no per-decision row', () => {
    const store = new CounterStore();
    store.record({ kind: 'verdict_issued', timestamp: now(), decisionId: 'abc', durationMs: 100 });
    store.record({ kind: 'verdict_issued', timestamp: now(), decisionId: 'def', durationMs: 300 });

    const serialised = JSON.stringify(store.snapshot ? store.snapshot() : store);
    expect(serialised).not.toContain('abc');
    expect(serialised).not.toContain('def');
  });

  it('is typed on the client so free text cannot be attached in the first place', () => {
    const source = readFileSync(
      join(__dirname, '..', 'src/services/telemetryClient.ts'),
      'utf8'
    );
    const fieldsBlock = source.slice(
      source.indexOf('export interface EventFields'),
      source.indexOf('const FLUSH_INTERVAL_MS')
    );
    // Only decisionId is a string, and it is the browser-minted opaque id.
    const stringFields = [...fieldsBlock.matchAll(/^\s*(\w+)\??:\s*string;/gm)].map((m) => m[1]);
    expect(stringFields).toEqual(['decisionId']);
  });

  it('never emits a content-bearing value from any call site in the app', () => {
    const root = join(__dirname, '..', 'src');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry)) files.push(full);
      }
    };
    walk(root);

    const callSites = files.flatMap((file) => [
      ...readFileSync(file, 'utf8').matchAll(/telemetry\.emit\(([^;]*?)\);/gs),
    ]);
    expect(callSites.length).toBeGreaterThan(0);

    for (const [call] of callSites) {
      // Any string literal in a call site must be an event kind or a closed
      // enum value, never a value read from the decision.
      const literals = [...call.matchAll(/'([^']*)'/g)].map((m) => m[1]);
      for (const literal of literals) {
        const permitted =
          (EVENT_KINDS as readonly string[]).includes(literal) ||
          ['verdict', 'insufficient', 'failed', 'revised', 'abandoned', 'gate', 'ceiling'].includes(
            literal
          ) ||
          // Run-outcome discriminants read from the result to choose the kind.
          // They are states of the run, not anything the PM supplied.
          ['VERDICT', 'INSUFFICIENT', 'FAILED', 'GATE', 'CEILING'].includes(literal);
        expect(permitted, `unexpected literal "${literal}" in ${call}`).toBe(true);
      }
      expect(call).not.toMatch(/context\.|review\.|understanding\.|rawEvidence/);
    }
  });
});

describe('17 · the approved opt-out behaviour', () => {
  beforeEach(() => {
    window.localStorage.clear();
    telemetryClient.discardQueued();
  });

  it('sends nothing at all once the PM has declined (PR-9)', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchSpy);

    setTelemetryEnabled(false);
    telemetryClient.emit('judge_started', { decisionId: 'abc123' });
    telemetryClient.emit('verdict_issued', { decisionId: 'abc123', outcome: 'verdict' });
    await telemetryClient.flush();

    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('sends the counts when the PM has not declined', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchSpy);

    setTelemetryEnabled(true);
    telemetryClient.emit('judge_started', { decisionId: 'abc123' });
    await telemetryClient.flush();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as { body: string }).body);
    for (const event of body.events) {
      expect(validateEvent(event).valid).toBe(true);
    }
    vi.unstubAllGlobals();
  });
});
