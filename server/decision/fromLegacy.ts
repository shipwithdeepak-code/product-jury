import type { ProductReview } from '../../src/types';
import type { SpecialistPosition } from '../../src/types/claims';
import type { Decision, VersionOrigin, VersionOutcome, VersionVerdict } from '../../src/types/decision';
import type { RunProvenance } from '../../src/types';
import type { RunOutcome } from '../integrity/outcome';
import { ClaimSpine } from '../claims/spine';
import { createDecision } from './decision';

/**
 * Stage 3 · The one bridge between the transient run and the durable Decision.
 *
 * PRD v1.1.1 §17, CAP-12, FR-23, TR-8, §51 never-1.
 *
 * WHAT THE LEGACY OBJECT IS. `ProductReview` is the shape the product has
 * returned since before Stage 1: one run, one result, thrown away on reload.
 * It is not a second domain model to be kept alive in parallel — it is the
 * pipeline's output type, and this module is the only place it becomes a
 * Decision. Nothing else reads it into the domain, and there is deliberately
 * no fallback path that produces a Decision when the conversion cannot be
 * made honestly.
 *
 * WHAT IT CANNOT SUPPLY, AND WHY THAT IS A THROWN ERROR RATHER THAN A DEFAULT.
 *
 * A Decision's identity is its decision question (§17, FR-4b). `ProductReview`
 * has no such field, and neither does `ProductContext`: CAP-04 — the capability
 * that proposes the question and has the PM confirm it — is not built in this
 * build. So the question has to be supplied by the caller, and a conversion
 * without one fails by name.
 *
 * The alternative was to compose a question out of the product name and the
 * primary goal. That is §51 never-1 — asserting something the product did not
 * derive — applied to the single field the whole object is identified by, and
 * every decision in the list would then carry a question no PM ever wrote.
 */

export class LegacyConversionError extends Error {
  constructor(message: string) {
    super(
      `${message}\n` +
        'The conversion fails rather than filling the gap. A decision built from a value ' +
        'nobody supplied is not the decision that was made.'
    );
    this.name = 'LegacyConversionError';
  }
}

/**
 * §17: the verdict is one position inside one version.
 *
 * Every field is copied from the review. Two are `null` and say so: the
 * confidence ceiling (CAP-06's binding half) and the falsification contract
 * (FR-17) are produced by stages this build does not have.
 */
export function verdictFromReview(review: ProductReview): VersionVerdict {
  return {
    outcome: review.verdict,
    confidence: review.confidenceScore,
    confidenceRationale: review.confidenceRationale,
    executiveSummary: review.executiveSummary,
    opportunities: review.opportunities,
    recommendedNextStep: review.recommendedNextStep,
    confidenceCeiling: null,
    falsificationContract: null,
  };
}

export interface LegacyConversionInput {
  /** FR-4b. Required, for the reason at the top of this file. */
  decisionQuestion: string;
  /** What the run came to. Carried in unchanged. */
  outcome: RunOutcome<ProductReview>;
  /** The run's spine, as the orchestrator built it. Not rebuilt from text. */
  spine: ClaimSpine;
  /** Stage 2.5's positions, as the lenses produced them. */
  specialistPositions: SpecialistPosition[];
  /**
   * Where this version came from (§17). Stage 4 wires the pipeline's own
   * success exit through this function, and a decision the pipeline just
   * produced is not a legacy import — so the caller says which it is. The
   * default is kept at `legacy_import` because that is what every caller
   * before Stage 4 was.
   */
  origin?: VersionOrigin;
  /** TR-8. */
  isSample?: boolean;
  clock?: () => string;
  id?: string;
}

function versionOutcome(outcome: RunOutcome<ProductReview>): VersionOutcome {
  switch (outcome.kind) {
    case 'VERDICT':
      return { kind: 'VERDICT' };
    case 'INSUFFICIENT':
      // CAP-07. A complete outcome, and never renamed on its way into storage.
      return { kind: 'INSUFFICIENT', refusedAt: outcome.refusedAt, missing: outcome.missing };
    case 'FAILED':
      // TR-13. A failure is stored as a failure. It does not become an
      // INSUFFICIENT because that would read better in a list.
      return {
        kind: 'FAILED',
        code: outcome.code,
        userMessage: outcome.userMessage,
        retryable: outcome.retryable,
        ...(outcome.stage ? { stage: outcome.stage } : {}),
      };
  }
}

/**
 * Turn a completed run into the first version of a durable Decision.
 *
 * The spine goes in as the spine — `toJSON()`, every claim with its id, its
 * epistemic status, its origin, its dependants and its derived load-bearing
 * status. Nothing is flattened into strings, and no claim is matched by text.
 */
export function decisionFromRun(input: LegacyConversionInput): Decision {
  if (!input.decisionQuestion?.trim()) {
    throw new LegacyConversionError(
      'This run cannot be converted into a Decision: it carries no decision question, and a ' +
        'Decision is identified by its question (§17, FR-4b). CAP-04, which proposes the question ' +
        'and has the PM confirm it, is not built in this stage.'
    );
  }

  const provenance: RunProvenance = input.outcome.provenance;
  if (!provenance) {
    throw new LegacyConversionError(
      'This run cannot be converted into a Decision: it carries no run provenance, so the version ' +
        'could not say which stages ran, which did not, or what served them (TR-4).'
    );
  }

  if (provenance.runId !== input.spine.runId) {
    throw new LegacyConversionError(
      `This run cannot be converted into a Decision: the provenance belongs to run ${provenance.runId} ` +
        `and the statements belong to run ${input.spine.runId}. Two runs are two readings.`
    );
  }

  const verdict =
    input.outcome.kind === 'VERDICT' ? verdictFromReview(input.outcome.data) : null;

  return createDecision({
    decisionQuestion: input.decisionQuestion,
    successCondition: null,
    claimSpine: input.spine.toJSON(),
    specialistPositions: input.specialistPositions,
    runMeta: provenance,
    outcome: versionOutcome(input.outcome),
    verdict,
    origin: input.origin ?? 'legacy_import',
    isSample: input.isSample ?? false,
    clock: input.clock,
    id: input.id,
  });
}
