import { ClaimSpine } from '../../server/claims/spine';
import { groundSpecialistPositions, recordSpecialistDependencies } from '../../server/claims/positions';
import type { SpecialistPosition } from '../../src/types/claims';
import type { RunProvenance } from '../../server/integrity/provenance';
import type { VersionOutcome, VersionVerdict } from '../../src/types/decision';

/**
 * Stage 3 · The record a decision has to survive being written down.
 *
 * PRD v1.1.1 §54.2, and the rule the other two fixture files in this directory
 * state: these are hand-written, no threshold or measured result appears in
 * them, and the evaluation dataset does not exist yet.
 *
 * `richSpine()` is the fixture the lossless round trip is run against. It is
 * deliberately the hardest shape the domain currently supports rather than a
 * convenient one:
 *
 *   · four surfaced statements across four epistemic statuses — FACT,
 *     INFERENCE, ASSUMPTION, UNKNOWN — plus a PM_STATEMENT and a PM_EVIDENCE,
 *     so six statements over six different origins;
 *   · an inference whose origin names the fact it was derived from, so there
 *     is a reference that has to resolve on the way back in;
 *   · an open question against the UNKNOWN, blocking a statement;
 *   · two specialist positions from two different lenses, each citing more
 *     than one statement, which is what produces the dependency edges;
 *   · load-bearing derived from those edges rather than asserted anywhere.
 *
 * If a round trip loses anything, it loses it here.
 */

const RUN_ID = 'run-stage-3-round-trip';
const AT = '2026-09-22T09:00:00.000Z';

export interface RichRecord {
  spine: ClaimSpine;
  positions: SpecialistPosition[];
  runMeta: RunProvenance;
  outcome: VersionOutcome;
  verdict: VersionVerdict;
  /** The claim the open loop bears on. */
  loopClaimId: string;
}

export function richSpine(runId: string = RUN_ID): ClaimSpine {
  const spine = new ClaimSpine(runId);

  const fact = spine.add({
    text: 'The first screen asks for a CRM connection before anything can be tested.',
    epistemicStatus: 'FACT',
    origin: { kind: 'ARTIFACT', evidence: 'The "Connect HubSpot" panel, above the canvas.', runId, stage: 'analyst' },
    producedBy: 'analyst',
    createdAt: AT,
  });

  const secondFact = spine.add({
    text: 'The wizard shows five numbered steps and the third is data schema mapping.',
    epistemicStatus: 'FACT',
    origin: { kind: 'ARTIFACT', evidence: 'The step rail across the top of the wizard.', runId, stage: 'analyst' },
    producedBy: 'analyst',
    createdAt: AT,
  });

  const inference = spine.add({
    text: 'A new account cannot reach the canvas without an integration credential.',
    epistemicStatus: 'INFERENCE',
    origin: {
      kind: 'MODEL_INFERENCE',
      reasoning: 'The connection panel blocks the step that produces the first automation.',
      derivedFrom: [fact.id],
      runId,
      stage: 'analyst',
    },
    producedBy: 'analyst',
    confidence: 72,
    createdAt: AT,
  });

  const assumption = spine.add({
    text: 'Most trial accounts do not have CRM admin rights on the day they sign up.',
    epistemicStatus: 'ASSUMPTION',
    origin: {
      kind: 'MODEL_ASSUMPTION',
      reason: 'Nothing in the screen or the supplied context establishes who holds those rights.',
      runId,
      stage: 'analyst',
    },
    producedBy: 'analyst',
    confidence: 40,
    createdAt: AT,
  });

  const unknown = spine.add({
    text: 'Where in the five steps users actually stop is not known.',
    epistemicStatus: 'UNKNOWN',
    origin: {
      kind: 'MODEL_ASSUMPTION',
      reason: 'The artifact is one frame and carries no behavioural data.',
      runId,
      stage: 'analyst',
    },
    producedBy: 'analyst',
    createdAt: AT,
  });

  spine.addOpenQuestion({
    claimId: unknown.id,
    question: 'At which step do trial accounts abandon the wizard?',
    whyItMatters: 'It decides whether the connection panel or the schema mapping is the thing to change.',
    decisionImpact: 'high',
    howToGetIt: 'A funnel query over the five wizard steps for the last 28 days.',
    blocks: [inference.id],
  });

  spine.add({
    text: 'Activation is 18% against a 45% day-14 target.',
    epistemicStatus: 'PM_STATEMENT',
    origin: { kind: 'PM_INPUT', field: 'currentProblem' },
    producedBy: 'pm',
    createdAt: AT,
  });

  spine.add({
    text: 'Amplitude cohort data: 62% of users drop off at step 3.',
    epistemicStatus: 'EVIDENCE',
    origin: { kind: 'PM_EVIDENCE', channel: 'pasted' },
    producedBy: 'pm',
    createdAt: AT,
  });

  void secondFact;
  void assumption;
  return spine;
}

/** Two lenses, two positions, several citations each. Dependencies recorded. */
export function richPositions(spine: ClaimSpine): SpecialistPosition[] {
  const surfaced = spine.surfaced();
  const [first, second, third] = surfaced;

  const ux = groundSpecialistPositions(
    [
      {
        position: 'The credential gate, not the canvas, is what a new account meets first.',
        reasoning: 'The panel sits before the step that produces anything, and the step rail confirms the order.',
        citedClaims: [first.id, second.id],
      },
    ],
    spine,
    'specialist_ux'
  );

  const strategy = groundSpecialistPositions(
    [
      {
        position: 'Nothing in the record establishes where accounts actually stop.',
        reasoning: 'The drop-off figure the PM supplied is their claim, and the artifact carries no behaviour.',
        citedClaims: [third.id, surfaced[surfaced.length - 1].id],
      },
    ],
    spine,
    'specialist_strategy'
  );

  recordSpecialistDependencies(spine, ux, 'specialist_ux');
  recordSpecialistDependencies(spine, strategy, 'specialist_strategy');

  return [...ux, ...strategy];
}

export function richProvenance(runId: string = RUN_ID): RunProvenance {
  return {
    runId,
    startedAt: AT,
    finishedAt: '2026-09-22T09:00:41.000Z',
    stages: [
      { stage: 'analyst', status: 'completed', modelId: 'gemini-2.5-flash', tier: 'flash', attempts: 1, durationMs: 4200, promptTokens: 1800, responseTokens: 900, estimatedCostCents: 2 },
      { stage: 'gate', status: 'not_run', attempts: 0, durationMs: 0, reason: 'The early sufficiency gate (CAP-18) is not built in this stage.' },
      { stage: 'specialist_ux', status: 'completed', modelId: 'gemini-2.5-flash', tier: 'flash', attempts: 1, durationMs: 9100, estimatedCostCents: 3 },
      { stage: 'specialist_strategy', status: 'completed', modelId: 'gemini-2.5-flash', tier: 'flash', attempts: 2, durationMs: 11400, estimatedCostCents: 4 },
      { stage: 'cross_examination', status: 'not_run', attempts: 0, durationMs: 0, reason: 'The cross-examination round (CAP-05) is not built in this stage.' },
      { stage: 'auditor', status: 'completed', modelId: 'gemini-2.5-pro', tier: 'pro', attempts: 1, durationMs: 7300, estimatedCostCents: 9 },
      { stage: 'chair', status: 'completed', modelId: 'gemini-2.5-pro', tier: 'pro', attempts: 1, durationMs: 8800, estimatedCostCents: 11 },
      { stage: 'red_team', status: 'not_run', attempts: 0, durationMs: 0, reason: 'The Red Team round (CAP-10) is not built in this stage.' },
    ],
    servedByUnevaluatedTier: false,
    totalEstimatedCostCents: 29,
    totalProviderCalls: 6,
  };
}

export function richVerdict(): VersionVerdict {
  return {
    outcome: 'ITERATE',
    confidence: 61,
    confidenceRationale:
      'One frame and one pasted cohort figure. Where accounts stop is still an open question.',
    executiveSummary:
      'The credential gate is the first thing a new account meets, and nothing in the record says whether it is where they stop.',
    opportunities: [
      {
        id: 'opp-1',
        problem: 'A credential is required before anything can be tested.',
        userImpact: 'A new account cannot reach the canvas on the day they sign up.',
        businessImpact: 'Activation stalls before the product does anything.',
        confidence: 61,
        evidenceStatus: 'INFERENCE',
        evidenceContext: 'Rests on the connection panel and the step rail.',
      },
    ],
    recommendedNextStep: 'Run the funnel query over the five wizard steps before changing the screen.',
    confidenceCeiling: null,
    falsificationContract: null,
  };
}

/** Everything the round trip needs, built together so the ids line up. */
export function richRecord(runId: string = RUN_ID): RichRecord {
  const spine = richSpine(runId);
  const positions = richPositions(spine);
  return {
    spine,
    positions,
    runMeta: richProvenance(runId),
    outcome: { kind: 'VERDICT' },
    verdict: richVerdict(),
    loopClaimId: spine.byStatus('UNKNOWN')[0].id,
  };
}

export const ROUND_TRIP_RUN_ID = RUN_ID;
export const ROUND_TRIP_AT = AT;
