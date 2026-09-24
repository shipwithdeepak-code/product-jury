import {
  SAMPLE_DECISION_AT,
  sampleDecisionQuestion,
  sampleProductContext,
  sampleProductReview,
  sampleRawEvidence,
} from '../../src/data/sampleReview';
import type { Decision } from '../../src/types/decision';
import { ClaimSpine } from '../claims/spine';
import { addPmContextClaims } from '../claims/fromContext';
import { measureOriginCoverage } from '../claims/originCoverage';
import type { RunProvenance, StageProvenance } from '../integrity/provenance';
import { verdict } from '../integrity/outcome';
import { decisionFromRun } from './fromLegacy';

/**
 * Stage 3 · The bundled demonstration decision, in the canonical structure.
 *
 * PRD v1.1.1 TR-8 ("sample and demonstration content is labelled as such
 * everywhere it appears"), CAP-12, §51 never-1.
 *
 * The sample exists to show a PM what a decision looks like before they have
 * one. Stage 2 rebuilt its artifact reading around a real Claim Spine — twenty
 * statements, each with an id, a kind and an origin — and this builds the
 * Decision that spine belongs to, through exactly the same path a real run
 * takes: `ClaimSpine.fromJSON`, then the PM's own context as PM claims, then
 * `decisionFromRun`. There is no sample-only shortcut, which is the point:
 * if the canonical structure could not hold the sample, that would be worth
 * knowing.
 *
 * TWO THINGS THE SAMPLE HONESTLY DOES NOT HAVE, recorded rather than filled.
 *
 * No stage ran. The sample's verdict was written, not produced, so every stage
 * in its run metadata is `not_run` with that as the reason. A reader asking
 * TR-4's question — which stages ran? — gets the true answer.
 *
 * No specialist positions. `ProductReview` carries prose from the pre-Stage-1
 * panel and no citations, and Stage 2.5's positions cite claim ids. Writing
 * positions for the sample would mean inventing citations, so the list is
 * empty and the absence is visible.
 */

const SAMPLE_RUN_ID = 'rev-sample-flowpilot-01';

const NOT_RUN_REASON =
  'This is the bundled demonstration decision. Its verdict is written sample content (TR-8); ' +
  'no model run produced it, so no stage ran.';

function sampleStage(stage: StageProvenance['stage']): StageProvenance {
  return { stage, status: 'not_run', attempts: 0, durationMs: 0, reason: NOT_RUN_REASON };
}

const SAMPLE_PROVENANCE: RunProvenance = {
  runId: SAMPLE_RUN_ID,
  startedAt: SAMPLE_DECISION_AT,
  finishedAt: SAMPLE_DECISION_AT,
  stages: [
    sampleStage('analyst'),
    sampleStage('gate'),
    sampleStage('specialist_ux'),
    sampleStage('specialist_strategy'),
    sampleStage('cross_examination'),
    sampleStage('auditor'),
    sampleStage('chair'),
    sampleStage('red_team'),
  ],
  servedByUnevaluatedTier: false,
  totalEstimatedCostCents: 0,
  totalProviderCalls: 0,
};

/** The sample's Claim Spine, rebuilt and revalidated, with the PM's context in it. */
export function buildSampleSpine(): ClaimSpine {
  const serialised = sampleProductContext.artifactUnderstanding?.claimSpine;
  if (!serialised) {
    throw new Error(
      'The bundled sample carries no claim spine. The sample is not exempt from CAP-03.'
    );
  }
  const spine = ClaimSpine.fromJSON(serialised);
  addPmContextClaims(spine, sampleProductContext, sampleRawEvidence);

  const coverage = measureOriginCoverage(spine);
  if (!coverage.passes) {
    throw new Error(
      `The bundled sample has ${coverage.uncovered.length} statements with no usable origin. ` +
        'CAP-03 applies to sample content too.'
    );
  }
  return spine;
}

export function buildSampleDecision(): Decision {
  const spine = buildSampleSpine();

  return decisionFromRun({
    decisionQuestion: sampleDecisionQuestion,
    outcome: verdict(sampleProductReview, SAMPLE_PROVENANCE),
    spine,
    specialistPositions: [],
    isSample: true,
    clock: () => SAMPLE_DECISION_AT,
  });
}
