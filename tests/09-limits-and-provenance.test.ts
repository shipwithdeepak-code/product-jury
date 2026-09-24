import { afterEach, describe, expect, it } from 'vitest';
import { DecisionBudget, estimateCost } from '../server/integrity/budget';
import { RateLimiter, RATE_LIMIT_RULES } from '../server/integrity/rateLimit';
import { PAYLOAD_LIMITS, boundedText, parseArtifact } from '../server/integrity/payload';
import { RunRecorder, PROVENANCE_STAGE_FIELDS } from '../server/integrity/provenance';
import {
  MODEL_LADDER,
  VERDICT_BEARING_STAGES,
  VERDICT_BEARING_TIER_POLICY,
} from '../server/integrity/modelRegistry';
import { __setGenAIClientForTests, invokeGeminiJson } from '../server/geminiClient';
import { MINIMAL_SCHEMA, caught, stubProvider } from './helpers';

/**
 * Stage 1 items 7, 8, 11, 12 and 13: run provenance, model-tier metadata,
 * payload-size protection, rate limiting and the cost ceiling.
 *
 * The Stage 1 brief lists thirteen named test groups; these five items are in
 * its implementation list rather than its test list, and are covered here so
 * the report can say whether they work rather than only that they exist.
 */

afterEach(() => {
  __setGenAIClientForTests(null);
});

describe('13 · cost protection', () => {
  it('stops the run at the call ceiling rather than continuing uncosted', async () => {
    const budget = new DecisionBudget({
      maxCostCents: 100,
      maxProviderCalls: 1,
      maxDurationMs: 60_000,
    });
    const recorder = new RunRecorder('t');
    const { client, calls } = stubProvider(() => {
      throw new Error('503 overloaded');
    });
    __setGenAIClientForTests(client);

    const error = await invokeGeminiJson<never>({
      systemInstruction: 'x',
      prompt: 'y',
      schema: MINIMAL_SCHEMA,
      stage: 'chair',
      budget,
      recorder,
    }).catch((e) => caught(e));

    expect(error.code).toBe('BUDGET_EXCEEDED');
    expect(calls.length).toBe(1);
  });

  it('is checked before the spend, not after it', () => {
    const budget = new DecisionBudget({ maxCostCents: 1, maxProviderCalls: 5, maxDurationMs: 1_000 });
    budget.charge({ estimatedCostCents: 5, modelId: 'x' } as never);
    expect(() => budget.assertCanSpend('chair')).toThrow();
  });

  it('estimates a non-zero cost for a real call', () => {
    const estimate = estimateCost(MODEL_LADDER[0].id, 2_000, 800);
    expect(estimate.estimatedCostCents).toBeGreaterThan(0);
  });
});

describe('12 · rate limiting', () => {
  it('allows up to the limit and refuses past it, per key', () => {
    let clock = 0;
    const limiter = new RateLimiter(() => clock);
    const rule = RATE_LIMIT_RULES.deliberate;

    for (let i = 0; i < rule.max; i++) {
      expect(limiter.check('deliberate', 'key-a', rule).allowed).toBe(true);
    }
    expect(limiter.check('deliberate', 'key-a', rule).allowed).toBe(false);
    // A different caller is unaffected.
    expect(limiter.check('deliberate', 'key-b', rule).allowed).toBe(true);
  });

  it('reopens the window once it has passed', () => {
    let clock = 0;
    const limiter = new RateLimiter(() => clock);
    const rule = RATE_LIMIT_RULES.deliberate;

    for (let i = 0; i <= rule.max; i++) limiter.check('deliberate', 'k', rule);
    expect(limiter.check('deliberate', 'k', rule).allowed).toBe(false);

    clock += rule.windowMs + 1;
    const decision = limiter.check('deliberate', 'k', rule);
    expect(decision.allowed).toBe(true);
    expect(decision.retryAfterSeconds).toBeGreaterThan(0);
  });
});

describe('11 · payload-size protection', () => {
  it('rejects an artifact past the ceiling instead of truncating it', () => {
    const oversized = 'A'.repeat(Math.ceil((PAYLOAD_LIMITS.maxArtifactBytes * 4) / 3) + 1_000);
    expect(() => parseArtifact(`data:image/png;base64,${oversized}`)).toThrow(
      /larger than|PAYLOAD_TOO_LARGE/
    );
  });

  it('rejects a media type it cannot read', () => {
    expect(() => parseArtifact('data:application/pdf;base64,AAAA')).toThrow();
  });

  it('accepts a well-formed PNG data URL', () => {
    const parsed = parseArtifact('data:image/png;base64,iVBORw0KGgo=');
    expect(parsed.mimeType).toBe('image/png');
    expect(parsed.byteLength).toBeGreaterThan(0);
  });

  it('throws on over-long text rather than silently cutting the evidence', () => {
    expect(() =>
      boundedText(
        'A'.repeat(PAYLOAD_LIMITS.maxEvidenceChars + 1),
        'evidence',
        PAYLOAD_LIMITS.maxEvidenceChars
      )
    ).toThrow();
  });
});

describe('7 and 8 · run provenance and model-tier metadata', () => {
  it('records which model served each stage', async () => {
    const recorder = new RunRecorder('run-1');
    const { client } = stubProvider(() => ({ text: '{"ok":true}' }));
    __setGenAIClientForTests(client);

    await invokeGeminiJson({
      systemInstruction: 'x',
      prompt: 'y',
      schema: MINIMAL_SCHEMA,
      stage: 'chair',
      budget: new DecisionBudget(),
      recorder,
    });

    const snapshot = recorder.snapshot();
    const chair = snapshot.stages.find((s) => s.stage === 'chair');
    expect(chair?.status).toBe('completed');
    expect(chair?.modelId).toBeTruthy();
    expect(chair?.tier).toBeTruthy();
    expect(snapshot.runId).toBe('run-1');
    expect(snapshot.totalProviderCalls).toBeGreaterThan(0);
  });

  it('flags a run served by a tier that has not been evaluated (§54.7)', async () => {
    const recorder = new RunRecorder('run-2');
    const { client } = stubProvider(() => ({ text: '{}' }));
    __setGenAIClientForTests(client);

    await invokeGeminiJson({
      systemInstruction: 'x',
      prompt: 'y',
      schema: MINIMAL_SCHEMA,
      stage: 'specialist_ux',
      budget: new DecisionBudget(),
      recorder,
    });

    // No tier has been evaluated against a fixed case set yet, so every run is
    // flagged. The alternative reading of §54.7 — restrict verdict-bearing
    // stages to evaluated tiers — would halt the product entirely, so the
    // reversible option is recorded here by name.
    expect(VERDICT_BEARING_TIER_POLICY).toBe('record');
    expect(MODEL_LADDER.every((t) => t.evaluationStatus === 'not_evaluated')).toBe(true);
    expect(recorder.snapshot().servedByUnevaluatedTier).toBe(true);
  });

  it('carries no supplied content in the provenance record (PR-6)', async () => {
    const recorder = new RunRecorder('run-3');
    const { client } = stubProvider(() => ({ text: '{}' }));
    __setGenAIClientForTests(client);

    await invokeGeminiJson({
      systemInstruction: 'x',
      prompt: 'The PM says: our checkout loses most users at the mapping step.',
      schema: MINIMAL_SCHEMA,
      stage: 'auditor',
      budget: new DecisionBudget(),
      recorder,
    });

    const snapshot = recorder.snapshot();
    expect(JSON.stringify(snapshot)).not.toContain('checkout');
    for (const stage of snapshot.stages) {
      for (const field of Object.keys(stage)) {
        expect(PROVENANCE_STAGE_FIELDS, `unexpected provenance field: ${field}`).toContain(field);
      }
    }
  });

  it('names the stages whose output reaches a verdict', () => {
    expect(VERDICT_BEARING_STAGES.has('chair')).toBe(true);
    expect(VERDICT_BEARING_STAGES.has('auditor')).toBe(true);
    // Alignment informs the reading, and the Red Team attacks a verdict that
    // already exists; neither carries one (§54.7).
    expect(VERDICT_BEARING_STAGES.has('context_alignment')).toBe(false);
    expect(VERDICT_BEARING_STAGES.has('red_team')).toBe(false);
  });
});
