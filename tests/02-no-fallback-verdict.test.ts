import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { __setGenAIClientForTests } from '../server/geminiClient';
import { runProductJuryDeliberation } from '../server/orchestrator';
import { stubProvider } from './helpers';
import type { ProductContext } from '../src/types';

/**
 * Group 5 of the Stage 1 brief: no fallback verdict.
 *
 * The audit's finding was that with a bad API key the product still returned a
 * full verdict in under two seconds. Two assertions here: the generators that
 * produced those verdicts are gone from the source, and a run whose provider
 * never answers produces FAILED rather than a review.
 */

afterEach(() => {
  __setGenAIClientForTests(null);
});

const ROOT = join(__dirname, '..');

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (/\.(ts|tsx)$/.test(entry) && !full.includes(`${ROOT}/tests/`)) acc.push(full);
  }
  return acc;
}

const SOURCES = [
  ...sourceFiles(join(ROOT, 'server')),
  ...sourceFiles(join(ROOT, 'src')),
  join(ROOT, 'server.ts'),
];

describe('5 · no fallback verdict', () => {
  /**
   * These six functions each returned a complete, confident, entirely
   * fabricated result when a model call failed. Named individually so a
   * reintroduction fails by name rather than by a vague pattern.
   */
  const REMOVED_GENERATORS = [
    'generateCalibratedFallbackReview',
    'generateDegradedUXReview',
    'generateDegradedStrategyReview',
    'generateDegradedAudit',
    'generateResilientDraftAnalysis',
    'generateResilientComparisonFallback',
    'createDefaultArtifactUnderstanding',
  ];

  it.each(REMOVED_GENERATORS)('%s no longer exists anywhere in the source', (name) => {
    const offenders = SOURCES.filter((file) => {
      const text = readFileSync(file, 'utf8');
      // A mention inside a comment explaining the removal is not a definition.
      return new RegExp(`(function|const|=>|\\.)\\s*${name}\\s*[(=<]`).test(text);
    });
    expect(offenders).toEqual([]);
  });

  it('produces FAILED, not a verdict, when the provider never answers', async () => {
    const { client } = stubProvider(() => {
      throw new Error('503 The model is overloaded. Please try again later.');
    });
    __setGenAIClientForTests(client);

    const context: ProductContext = {
      name: 'Test Product',
      whatBuilding: 'An onboarding wizard',
      targetUser: 'Ops managers',
      primaryGoal: 'Raise day-14 activation',
      currentProblem: '',
      productUrl: '',
      additionalContext: '',
    };

    const outcome = await runProductJuryDeliberation({ context, decisionQuestion: 'Should we ship the redesigned export flow before the Q4 freeze?', rawEvidence: '' });

    expect(outcome.kind).toBe('FAILED');
    expect(outcome).not.toHaveProperty('data');
    // The audit's symptom: a full verdict in under two seconds. There is now
    // no path from a provider failure to a verdict at all.
    expect(outcome.kind).not.toBe('VERDICT');
  });

  it('records which stages did not run rather than implying they did', async () => {
    const { client } = stubProvider(() => {
      throw new Error('503 overloaded');
    });
    __setGenAIClientForTests(client);

    const outcome = await runProductJuryDeliberation({
      decisionQuestion: 'Should we ship the redesigned export flow before the Q4 freeze?',
      context: {
        name: 'T',
        whatBuilding: 'x',
        targetUser: 'y',
        primaryGoal: 'z',
        currentProblem: '',
        productUrl: '',
        additionalContext: '',
      },
      rawEvidence: '',
    });

    const notRun = outcome.provenance.stages.filter((s) => s.status === 'not_run');
    // The cross-examination and the Red Team are not built, and the run says so
    // instead of omitting them (TR-4).
    //
    // Stage 5 removed `gate` from this list, because the gate is now built. It
    // is recorded here as `failed`, which is what actually happened to it.
    expect(notRun.map((s) => s.stage).sort()).toEqual(['cross_examination', 'red_team'].sort());
    expect(
      outcome.provenance.stages.find((s) => s.stage === 'gate')?.status
    ).toBe('failed');
    for (const stage of notRun) {
      expect(stage.reason && stage.reason.length).toBeGreaterThan(0);
    }
  });

  it('has no sample or placeholder review reachable from a failure path', () => {
    const orchestrator = readFileSync(join(ROOT, 'server/orchestrator.ts'), 'utf8');
    expect(orchestrator).not.toMatch(/sampleProductReview|isSample:\s*true|isMock/);
  });
});
