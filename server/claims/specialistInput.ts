import { ArtifactUnderstanding, AnalystReading } from '../../src/types';
import { Claim, EpistemicStatus } from '../../src/types/claims';
import { ClaimSpine } from './spine';
import { measureOriginCoverage } from './originCoverage';
import { ANALYST_ATTRIBUTE_STAGE, ANALYST_FRICTION_STAGE } from './fromAnalyst';

/**
 * Stage 2 · The adapter between the Claim Spine and everything downstream.
 *
 * The brief is specific about what this is for: the pipeline must become
 *
 *     Analyst → Claim Spine → specialist inputs
 *
 * rather than
 *
 *     Analyst → free-form text → specialist
 *
 * and the specialists are not rebuilt in this stage. So there is one claim
 * model, and this file holds the two projections of it that existing code
 * needs. Nothing here is a second model: both functions read a spine and
 * produce a view, and neither can be written to.
 *
 * `renderClaimBlock` is what the specialists now receive. Instead of
 *
 *     Observed: the CTA is grey | the step count is five
 *
 * they receive
 *
 *     [CLM-...] OBSERVED · "The CTA is grey."
 *         grounded in: the button at the lower right of the modal
 *
 * which is the precondition for FR-9 — "two specialist lenses take positions
 * citing specific statements". Stage 2 gives them addressable statements;
 * requiring them to cite one is Stage 4's work, and they do not yet.
 */

/** How each kind is labelled for a reader. §11 prefers the plain word. */
const STATUS_LABEL: Record<EpistemicStatus, string> = {
  FACT: 'OBSERVED',
  INFERENCE: 'INFERRED',
  ASSUMPTION: 'ASSUMED',
  UNKNOWN: 'NOT KNOWN',
  PM_STATEMENT: 'STATED BY THE PRODUCT MANAGER',
  EVIDENCE: 'SUPPLIED AS EVIDENCE',
};

/** The order statements are listed in: what is known, then what is not. */
const STATUS_ORDER: EpistemicStatus[] = [
  'FACT',
  'INFERENCE',
  'ASSUMPTION',
  'PM_STATEMENT',
  'EVIDENCE',
  'UNKNOWN',
];

function originLine(spine: ClaimSpine, claim: Claim): string | null {
  const origin = claim.origin;
  switch (origin.kind) {
    case 'ARTIFACT':
      return `grounded in: ${origin.evidence}`;
    case 'MODEL_INFERENCE':
    case 'DERIVED_FROM_CLAIM':
      return (
        `derived from ${origin.derivedFrom.join(', ')} — ${origin.reasoning}`
      );
    case 'MODEL_ASSUMPTION':
      return `unverified because: ${origin.reason}`;
    case 'PM_INPUT':
      return `stated by the product manager in: ${origin.field}`;
    case 'PM_EVIDENCE':
      return 'supplied by the product manager as evidence';
    case 'PM_ANSWER':
      return `answers ${origin.answers}`;
    case 'PM_EDIT':
      return `the product manager's correction of ${origin.supersedes}`;
    default:
      return null;
  }
}

/**
 * Render the spine as addressable statements for a prompt.
 *
 * The text is still supplied content — it came off a screen someone else
 * controls — so callers wrap the result in `untrustedBlock()`. This function
 * does not wrap it itself, because doing so here would put the decision about
 * instruction context in two places.
 */
export function renderClaimBlock(spine: ClaimSpine): string {
  const surfaced = spine.surfaced();
  if (surfaced.length === 0) {
    return 'No statements were produced from the artifact.';
  }

  const lines: string[] = [];

  for (const status of STATUS_ORDER) {
    const claims = surfaced.filter((claim) => claim.epistemicStatus === status);
    if (claims.length === 0) continue;

    for (const claim of claims) {
      const confidence =
        claim.confidence === undefined ? '' : ` (confidence reported: ${claim.confidence})`;
      lines.push(`[${claim.id}] ${STATUS_LABEL[status]}${confidence} · ${claim.text}`);
      const origin = originLine(spine, claim);
      if (origin) lines.push(`    ${origin}`);
    }
    lines.push('');
  }

  const questions = spine.openQuestions().filter((question) => question.status === 'OPEN');
  if (questions.length > 0) {
    lines.push('OPEN QUESTIONS, ranked by how much answering them would move the decision:');
    for (const question of questions) {
      lines.push(
        `[${question.claimId}] ${question.decisionImpact.toUpperCase()} · ${question.question}`
      );
      lines.push(`    why it matters: ${question.whyItMatters}`);
      if (question.howToGetIt) lines.push(`    cheapest way to get it: ${question.howToGetIt}`);
      if (question.blocks.length > 0) {
        lines.push(`    undermines: ${question.blocks.join(', ')}`);
      }
    }
  }

  return lines.join('\n').trim();
}

/**
 * The display projection.
 *
 * `ArtifactUnderstanding` is what the existing interface renders, and Stage 2
 * does not redesign the interface. So it is derived from the spine rather than
 * produced alongside it: the arrays of bare strings are a view, and the spine
 * they came from travels with them so nothing downstream has to work from the
 * view.
 */
export function projectUnderstanding(
  spine: ClaimSpine,
  reading: AnalystReading,
  options: { isConfirmed?: boolean } = {}
): ArtifactUnderstanding {
  const textOf = (status: EpistemicStatus) =>
    spine
      .byStatus(status)
      .filter((claim) => claim.surfaced)
      .map((claim) => claim.text);

  /*
   * Stage 2.5 · Structural, not textual.
   *
   * The three headline attributes and the friction signals are inferences with
   * their own place in the interface, so they are not repeated in the general
   * inference list. Which is which is read off `producedBy` — the field that
   * records what made the statement — rather than by comparing claim text with
   * the reading's own strings, which is what this did before and which would
   * have broken silently the first time a phrasing changed.
   */
  const inferences = spine
    .byStatus('INFERENCE')
    .filter((claim) => claim.surfaced);

  return {
    productType: reading.productType?.value ?? '',
    likelyUser: reading.likelyUser?.value ?? '',
    detectedJourney: reading.primaryJourney?.value ?? '',
    frictionSignals: inferences
      .filter((claim) => claim.producedBy === ANALYST_FRICTION_STAGE)
      .map((claim) => claim.text),
    facts: textOf('FACT'),
    // The three headline attributes are inferences too, and they are already
    // shown in their own fields, so they are not repeated in this list.
    inferences: inferences
      .filter(
        (claim) =>
          claim.producedBy !== ANALYST_FRICTION_STAGE &&
          claim.producedBy !== ANALYST_ATTRIBUTE_STAGE
      )
      .map((claim) => claim.text),
    assumptions: textOf('ASSUMPTION'),
    unknowns: textOf('UNKNOWN'),
    isConfirmed: options.isConfirmed ?? false,
    isAnalyzedByGemini: true,
    contextAlignment: undefined,
    detailedAnalysis: reading,
    claimSpine: spine.toJSON(),
    originCoverage: measureOriginCoverage(spine),
  };
}

/**
 * Rebuild a spine from what an understanding is carrying, if it has one.
 *
 * A reading that reached the browser and came back is untrusted structure, so
 * `ClaimSpine.fromJSON` revalidates every claim and every reference. An
 * understanding with no spine returns null rather than an empty spine: a run
 * with no statements and a run whose statements were lost are different things,
 * and the second must not read as the first.
 */
export function spineFromUnderstanding(
  understanding: ArtifactUnderstanding | undefined
): ClaimSpine | null {
  if (!understanding?.claimSpine) return null;
  return ClaimSpine.fromJSON(understanding.claimSpine);
}
