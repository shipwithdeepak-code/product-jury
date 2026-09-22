/**
 * Stage 1 · Model tier metadata.
 *
 * PRD v1.1.1 §54.7 (M1), TR-4, suite J.
 *
 * "Every tier the ladder may serve is evaluated before release, **or** the
 * ladder is restricted so that only evaluated tiers may serve a stage whose
 * output reaches a verdict."
 *
 * No tier has been evaluated — there is no evaluation set yet (§54.2 is Stage 2
 * work). Both halves of §54.7 are therefore currently unsatisfiable, so this
 * module does the one thing that is available now and is reversible: it makes
 * the tier a first-class, recorded fact, and it puts the choice between the two
 * halves behind a single named policy constant rather than leaving it implicit
 * in the ladder.
 *
 * See VERDICT_BEARING_TIER_POLICY below.
 */

/** A stage whose output reaches a verdict (§54.7's phrase). */
export type PipelineStage =
  | 'analyst'
  | 'context_alignment'
  | 'gate'
  | 'specialist_ux'
  | 'specialist_strategy'
  | 'cross_examination'
  | 'auditor'
  | 'chair'
  | 'red_team';

/**
 * §54.7 names six stages whose output reaches a verdict. `context_alignment`
 * and `red_team` are not among them; alignment informs the understanding and
 * the Red Team attacks a verdict that already exists.
 */
export const VERDICT_BEARING_STAGES: ReadonlySet<PipelineStage> = new Set<PipelineStage>([
  'analyst',
  'gate',
  'specialist_ux',
  'specialist_strategy',
  'cross_examination',
  'auditor',
  'chair',
]);

export type EvaluationStatus = 'evaluated' | 'not_evaluated';

export interface ModelTier {
  /** The provider model identifier. */
  id: string;
  /** A stable tier label, so a repeat run can be pinned to one (suite J). */
  tier: string;
  /** §54.7. Set to 'evaluated' only when the tier has passed the §54.3 suites. */
  evaluationStatus: EvaluationStatus;
  /**
   * Planning figures for the budget ceiling (NFR-9), in US cents per million
   * tokens. These are for bounding a run, not for billing, and the budget
   * module treats them as upper bounds rather than measurements.
   */
  costCentsPerMillionInput: number;
  costCentsPerMillionOutput: number;
}

/**
 * The ladder, declared rather than inlined. Order is the fallback order.
 *
 * Every entry is `not_evaluated` because the evaluation set does not exist.
 * That is a true statement about this build, and §54.7's launch gate reads it.
 */
export const MODEL_LADDER: readonly ModelTier[] = Object.freeze([
  {
    id: 'gemini-3.1-flash-lite',
    tier: 'flash-lite',
    evaluationStatus: 'not_evaluated',
    costCentsPerMillionInput: 10,
    costCentsPerMillionOutput: 40,
  },
  {
    id: 'gemini-3.6-flash',
    tier: 'flash',
    evaluationStatus: 'not_evaluated',
    costCentsPerMillionInput: 30,
    costCentsPerMillionOutput: 250,
  },
  {
    id: 'gemini-3.5-flash',
    tier: 'flash',
    evaluationStatus: 'not_evaluated',
    costCentsPerMillionInput: 30,
    costCentsPerMillionOutput: 250,
  },
  {
    id: 'gemini-3.8-flash',
    tier: 'flash',
    evaluationStatus: 'not_evaluated',
    costCentsPerMillionInput: 30,
    costCentsPerMillionOutput: 250,
  },
]);

/**
 * Which half of §54.7 this build takes.
 *
 * - 'record'   — the ladder may serve an unevaluated tier, and every run
 *                records which tier served each stage, and the run is flagged
 *                as having been served by an unevaluated tier. The flag reaches
 *                the standing limitations surface (§53), so the PM is told.
 * - 'restrict' — only `evaluated` tiers may serve a verdict-bearing stage. With
 *                no tier evaluated, this stops the product entirely.
 *
 * 'record' is chosen for Stage 1 because 'restrict' would make the product
 * unable to run before the evaluation set exists, and choosing that would be
 * resolving a launch-gating question the PRD leaves to the evaluation work.
 * Flipping this constant is the whole change; nothing else needs editing.
 */
export const VERDICT_BEARING_TIER_POLICY: 'record' | 'restrict' = 'record';

export function isVerdictBearing(stage: PipelineStage): boolean {
  return VERDICT_BEARING_STAGES.has(stage);
}

export function findTier(modelId: string): ModelTier | undefined {
  return MODEL_LADDER.find((entry) => entry.id === modelId);
}

/**
 * The ladder a given stage may walk, after the policy is applied.
 *
 * Under 'restrict' a verdict-bearing stage gets only evaluated tiers, which may
 * be an empty list — and an empty list is a CONFIGURATION_ERROR at call time,
 * not a reason to substitute anything.
 */
export function ladderForStage(stage: PipelineStage): readonly ModelTier[] {
  if (VERDICT_BEARING_TIER_POLICY === 'restrict' && isVerdictBearing(stage)) {
    return MODEL_LADDER.filter((entry) => entry.evaluationStatus === 'evaluated');
  }
  return MODEL_LADDER;
}

/** True when this run was served, anywhere, by a tier that has not been evaluated. */
export function usedUnevaluatedTier(modelIds: readonly string[]): boolean {
  return modelIds.some((id) => findTier(id)?.evaluationStatus !== 'evaluated');
}
