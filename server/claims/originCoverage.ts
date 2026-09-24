import { Claim, ClaimId, OriginCoverage } from '../../src/types/claims';
import { ClaimSpine, originReferences } from './spine';
import { validateOrigin } from './validation';

/**
 * Stage 2 · CAP-03's origin-coverage criterion, measured.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE THRESHOLD IS 100%, NOT 85%
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The Stage 2 brief asks for "the ≥85% origin coverage requirement from the
 * PRD", and also says: do not invent a new threshold, use the PRD's existing
 * metric definition if already specified. Those two instructions point in
 * different directions, because PRD v1.1.1 specifies no 85% origin-coverage
 * requirement. What it specifies is:
 *
 *   CAP-03 success criteria (§20):
 *     "100% of visible statements carry an origin"
 *   Appendix A, principle 4:
 *     "Every claim carries its origin | 100% of visible statements show a source"
 *   §10, principle 4:
 *     "Every claim carries its origin. Where it came from and what it holds up
 *      travel with it, permanently."
 *   CAP-03 failure state:
 *     "A statement that cannot be attributed is not shown. There is no
 *      unattributed content anywhere in the product."
 *
 * The ≥85% figure in the PRD belongs to a different metric entirely: CAP-04's
 * question proposal acceptance — "Questions confirmed unedited or lightly
 * edited, over questions confirmed" (§56.1). It has nothing to do with origin.
 *
 * So 100% is the PRD's number and 85% would be the invented one. The threshold
 * below is 100%, and the discrepancy is reported rather than resolved quietly.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE DEFINITION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * DENOMINATOR — surfaced claims.
 *   Every claim in the spine with `surfaced: true`: the statements the product
 *   can show a PM. CAP-03 says "visible statements", so a claim held for
 *   internal bookkeeping and never displayed is out of scope. Stage 2 surfaces
 *   everything the analyst produces, so today the two are the same set; the
 *   distinction exists so that a later stage adding hidden scaffolding cannot
 *   dilute the measure.
 *
 * NUMERATOR — surfaced claims that are ORIGIN-COVERED.
 *   A claim is origin-covered when all four hold:
 *     1. It has an origin whose kind is one of the eight permitted kinds.
 *     2. The origin carries the payload its kind requires, non-empty:
 *        ARTIFACT needs cited evidence; MODEL_INFERENCE needs reasoning and at
 *        least one antecedent; MODEL_ASSUMPTION needs the reason it is
 *        unverified; PM_INPUT needs the field; PM_ANSWER needs the question;
 *        PM_EDIT needs the superseded claim; DERIVED_FROM_CLAIM needs reasoning
 *        and at least one antecedent.
 *     3. Every claim the origin references resolves inside this spine. An
 *        origin pointing at a claim that is not here explains nothing.
 *     4. The origin does not point at itself, directly or through a cycle.
 *        A statement that is its own justification is unattributed with extra
 *        steps.
 *
 * RATIO — covered / surfaced, and 1 when nothing is surfaced, because a spine
 *   with no visible statements has no unattributed ones.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** CAP-03's success criterion. Not a setting, and not tunable. */
export const ORIGIN_COVERAGE_THRESHOLD = 1;

/**
 * The PRD metric the ≥85% figure actually belongs to, recorded here so the two
 * cannot be confused again.
 */
export const UNRELATED_85_PERCENT_METRIC = Object.freeze({
  metric: 'Question proposal acceptance',
  definition: 'Questions confirmed unedited or lightly edited, over questions confirmed',
  bar: 'CAP-04, ≥85%',
  source: 'PRD v1.1.1 §56.1',
});

function cycleReason(spine: ClaimSpine, claim: Claim): string | null {
  const seen = new Set<ClaimId>([claim.id]);
  const queue = [...originReferences(claim.origin)];

  while (queue.length > 0) {
    const next = queue.shift() as ClaimId;
    if (next === claim.id) {
      return 'its origin resolves back to itself, so it is its own justification';
    }
    if (seen.has(next)) continue;
    seen.add(next);
    if (!spine.has(next)) continue;
    queue.push(...originReferences(spine.resolve(next).origin));
  }
  return null;
}

export function measureOriginCoverage(spine: ClaimSpine): OriginCoverage {
  const surfaced = spine.surfaced();
  const uncovered: Array<{ claimId: ClaimId; reason: string }> = [];

  for (const claim of surfaced) {
    const errors: string[] = [];
    validateOrigin(claim.origin, claim.id, errors);
    if (errors.length > 0) {
      uncovered.push({ claimId: claim.id, reason: errors.join('; ') });
      continue;
    }

    const missing = spine.unresolvedReferences(originReferences(claim.origin));
    if (missing.length > 0) {
      uncovered.push({
        claimId: claim.id,
        reason: `its origin names ${missing.join(', ')}, which is not in this run`,
      });
      continue;
    }

    const cycle = cycleReason(spine, claim);
    if (cycle) {
      uncovered.push({ claimId: claim.id, reason: cycle });
    }
  }

  const covered = surfaced.length - uncovered.length;
  const ratio = surfaced.length === 0 ? 1 : covered / surfaced.length;

  return {
    covered,
    surfaced: surfaced.length,
    ratio,
    uncovered,
    threshold: ORIGIN_COVERAGE_THRESHOLD,
    passes: ratio >= ORIGIN_COVERAGE_THRESHOLD,
  };
}

/**
 * CAP-03's failure state as an executable rule: a statement that cannot be
 * attributed is not shown. The whole reading is rejected rather than shown with
 * the unattributed statements quietly filtered out — filtering would make the
 * measure pass by hiding the defect, which is the shape of every bug Stage 1
 * removed.
 */
export function assertOriginCoverage(spine: ClaimSpine): OriginCoverage {
  const coverage = measureOriginCoverage(spine);
  if (!coverage.passes) {
    const detail = coverage.uncovered
      .map((entry) => `${entry.claimId} (${entry.reason})`)
      .join('; ');
    throw new OriginCoverageError(
      `${coverage.uncovered.length} of ${coverage.surfaced} visible statements carry no usable ` +
        `origin, and CAP-03 requires all of them to: ${detail}`,
      coverage
    );
  }
  return coverage;
}

export class OriginCoverageError extends Error {
  readonly coverage: OriginCoverage;

  constructor(message: string, coverage: OriginCoverage) {
    super(message);
    this.name = 'OriginCoverageError';
    this.coverage = coverage;
  }
}
