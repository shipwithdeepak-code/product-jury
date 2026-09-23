import type { ClaimId, SpecialistPosition } from '../../src/types/claims';
import { ProductJuryError } from '../integrity/errors';
import { isClaimId } from './identity';
import { mintPositionId } from './identity';
import { ClaimSpine } from './spine';

/**
 * Stage 2.5 · FR-9. A specialist position must name the claims it rests on.
 *
 * PRD v1.1.1 FR-9, CAP-05, CAP-03, §42, §51.
 *
 * WHAT THIS ENFORCES, AND WHY VALIDATION RATHER THAN A PROMPT
 *
 * The prompt asks the lens to cite claim ids. A prompt is a request, and a
 * request is not a contract: a model that ignores it would produce exactly the
 * ungrounded prose FR-9 exists to eliminate, and nothing downstream could tell
 * the difference. So the contract is enforced here, on the way back, and a
 * response that does not meet it fails the stage.
 *
 * THE FOUR WAYS A CITATION IS REJECTED
 *
 *   1. It is not a claim id. `CLM-` plus 26 base32 characters, or it is an
 *      arbitrary string the model wrote, and a string is not a reference.
 *   2. It does not resolve in this run's spine. The claim does not exist.
 *   3. It resolves to a claim belonging to another run. Ids are scoped to a
 *      run by construction, so this cannot normally happen — it is checked
 *      anyway, because "cannot normally happen" is where the silent failures
 *      live.
 *   4. There are none. A substantive position with no citations is the thing
 *      FR-9 forbids, so an empty list is a violation rather than a position
 *      that happens to cite nothing.
 *
 * WHAT IS NEVER DONE
 *
 * No citation is dropped to make a response valid. Nothing is matched by text,
 * guessed at, substituted, or regenerated. There is no partially valid
 * position: one bad citation fails the stage, because a position half of whose
 * basis is missing is not a weaker position, it is an unattributed one.
 *
 * THE DUPLICATE RULE
 *
 * A position citing the same claim twice is citing it once. That is the
 * spine's existing rule for a repeated *reference* (`recordDependency` records
 * one edge per dependant, `unresolvedReferences` dedupes), and it is distinct
 * from the rule for a repeated *statement*, which is an error. No new rule is
 * introduced here.
 */

const POSITION_FIELDS = new Set(['position', 'reasoning', 'citedClaims']);

function violation(stage: string, detail: string): ProductJuryError {
  return new ProductJuryError('SCHEMA_VIOLATION', {
    stage,
    detail: { violation: detail },
  });
}

function requireText(value: unknown, stage: string, what: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw violation(stage, `${what} is missing`);
  }
  return value.trim();
}

/**
 * Turn what the model returned into positions, or fail.
 *
 * `spine` is the run's spine and the only place a citation may resolve.
 */
export function readSpecialistPositions(
  raw: unknown,
  spine: ClaimSpine,
  stage: string
): SpecialistPosition[] {
  if (!Array.isArray(raw)) {
    throw violation(stage, 'the lens returned no positions');
  }
  if (raw.length === 0) {
    throw violation(
      stage,
      'the lens returned no positions. A lens that has read the statements and holds no ' +
        'position on any of them has not done the work.'
    );
  }

  const positions: SpecialistPosition[] = [];
  const seen = new Set<string>();

  for (const [index, entry] of raw.entries()) {
    const label = `positions[${index}]`;

    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw violation(stage, `${label} is not a position`);
    }

    const candidate = entry as Record<string, unknown>;
    for (const key of Object.keys(candidate)) {
      if (!POSITION_FIELDS.has(key)) {
        /*
         * A closed schema, for one reason above all others: `loadBearing`. The
         * model supplies what it relies on; the system decides what that makes
         * load-bearing. A response that tries to assert the conclusion rather
         * than the evidence is rejected rather than partly obeyed.
         */
        throw violation(stage, `${label}: field "${key}" is not part of a position`);
      }
    }

    const position = requireText(candidate.position, stage, `${label}.position`);
    const reasoning = requireText(candidate.reasoning, stage, `${label}.reasoning`);

    if (!Array.isArray(candidate.citedClaims)) {
      throw violation(stage, `${label} did not name the statements it rests on`);
    }
    if (candidate.citedClaims.length === 0) {
      throw violation(
        stage,
        `${label} cites no statement. A position that rests on nothing in the record is not a ` +
          `position the product can show.`
      );
    }

    const citedClaims: ClaimId[] = [];
    for (const cited of candidate.citedClaims) {
      if (!isClaimId(cited)) {
        throw violation(
          stage,
          `${label} cited "${String(cited)}", which is not a statement id. ` +
            `A citation is an id, never a description.`
        );
      }
      if (!spine.has(cited)) {
        throw violation(
          stage,
          `${label} cited ${cited}, which is not a statement in this decision. ` +
            `Nothing is dropped or substituted to make the position valid.`
        );
      }
      if (spine.resolve(cited).runId !== spine.runId) {
        throw violation(
          stage,
          `${label} cited ${cited}, which belongs to a different decision.`
        );
      }
      // The spine's existing rule for a repeated reference: it is one
      // reference. Recorded once, kept in the order the lens gave it.
      if (!citedClaims.includes(cited)) {
        citedClaims.push(cited);
      }
    }

    const id = mintPositionId({ runId: spine.runId, producedBy: stage, text: position });
    if (seen.has(id)) {
      throw violation(
        stage,
        `${label} repeats a position the lens already took. The same position twice is one ` +
          `position returned twice.`
      );
    }
    seen.add(id);

    positions.push({ id, position, reasoning, citedClaims, producedBy: stage, runId: spine.runId });
  }

  return positions;
}

/**
 * Record each position as a dependant of every claim it cites, then re-derive
 * load-bearing status across the spine.
 *
 * The order matters and is the order the brief sets out: resolve, record,
 * derive. The dependency is the fact recorded; load-bearing is read off the
 * graph afterwards and never asserted directly.
 */
export function recordSpecialistDependencies(
  spine: ClaimSpine,
  positions: readonly SpecialistPosition[],
  stage: string
): void {
  for (const position of positions) {
    // Resolve first: every citation, before anything is written. A partially
    // recorded set of dependencies would leave the spine describing a position
    // that was never accepted.
    spine.resolveAll(position.citedClaims, `positions of ${stage}`);
  }

  for (const position of positions) {
    for (const claimId of position.citedClaims) {
      spine.recordDependency(claimId, {
        dependantId: position.id,
        dependantKind: 'SPECIALIST_POSITION',
        stage,
      });
    }
  }

  spine.deriveLoadBearing();
}

/**
 * The two steps together, which is how every caller wants them.
 */
export function groundSpecialistPositions(
  raw: unknown,
  spine: ClaimSpine,
  stage: string
): SpecialistPosition[] {
  const positions = readSpecialistPositions(raw, spine, stage);
  recordSpecialistDependencies(spine, positions, stage);
  return positions;
}
