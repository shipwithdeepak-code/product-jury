import { ProductContext, ArtifactUnderstanding } from '../../src/types';
import {
  EmbeddedInstructionObservation,
  detectEmbeddedInstructions,
  untrustedBlock,
} from '../integrity/untrusted';
import { ClaimSpine } from '../claims/spine';
import { renderClaimBlock, spineFromUnderstanding } from '../claims/specialistInput';

/**
 * Stage 1 · One place where supplied content enters a prompt.
 *
 * PRD v1.1.1 SR-1, SR-2, SR-7, SR-8, §52.
 *
 * Before this change, every agent interpolated the PM's typed context and
 * pasted evidence straight into its prompt string, alongside its own
 * instructions. Nothing distinguished the two, so a sentence in a screenshot or
 * in the evidence box read to the model exactly like a rule from the product.
 *
 * Now: every supplied string goes through `untrustedBlock()` and nothing else
 * builds prompt text from user input. The instruction side of the prompt is
 * assembled from constants only.
 *
 * Stage 2 changes what is inside the block, not how it is delimited. The
 * artifact reading used to arrive as four lines of bare text —
 *
 *     Observed: the CTA is grey | the step count is five
 *
 * — which is the shape that made FR-9 unimplementable: a specialist cannot cite
 * a statement that has no name. It now arrives as the Claim Spine, one
 * addressable statement per line with its kind and its origin. The untrusted
 * handling is unchanged: it is still content read off someone else's screen,
 * and it is still confined to a delimited block in the user prompt.
 */

export interface SuppliedContent {
  /** The prompt fragment, with every supplied value in a delimited block. */
  block: string;
  /** The spine the block was rendered from, where one was available. */
  spine?: ClaimSpine | null;
  /** Raw supplied strings, for the SR-2 assertion in the provider client. */
  untrustedInputs: string[];
  /** SR-8: instructions found in supplied content, recorded as observations. */
  observations: EmbeddedInstructionObservation[];
}

export interface SuppliedContentOptions {
  /**
   * The Claim Spine for this run. Supplied by the orchestrator, which rebuilds
   * it once and passes it to every stage so that all four agents address the
   * same statements by the same ids.
   */
  spine?: ClaimSpine | null;
}

export function buildSuppliedContent(
  context: ProductContext,
  rawEvidence?: string,
  artifactUnderstanding?: ArtifactUnderstanding,
  options: SuppliedContentOptions = {}
): SuppliedContent {
  const untrustedInputs: string[] = [];
  const observations: EmbeddedInstructionObservation[] = [];

  const collect = (value: string | undefined | null, source: Parameters<typeof untrustedBlock>[0]) => {
    if (typeof value === 'string' && value.trim().length > 0) {
      untrustedInputs.push(value);
      observations.push(...detectEmbeddedInstructions(source, value));
    }
  };

  collect(context.name, 'PM_CONTEXT');
  collect(context.whatBuilding, 'PM_CONTEXT');
  collect(context.targetUser, 'PM_CONTEXT');
  collect(context.primaryGoal, 'PM_CONTEXT');
  collect(context.currentProblem, 'PM_CONTEXT');
  collect(context.additionalContext, 'PM_CONTEXT');
  collect(rawEvidence, 'PM_EVIDENCE');
  collect(context.screenshotName, 'ARTIFACT_FILENAME');

  /*
   * Artifact-derived statements are untrusted too: the analyst read them off a
   * screen, so anything an attacker put on that screen is now in them. The
   * spine is preferred when the reading carries one; the flattened arrays are
   * the fallback for a reading produced before Stage 2, and for the sample.
   */
  const spine = options.spine ?? spineFromUnderstanding(artifactUnderstanding);

  const statements = spine
    ? spine.surfaced().map((claim) => claim.text)
    : artifactUnderstanding
    ? [
        ...(artifactUnderstanding.facts ?? []),
        ...(artifactUnderstanding.inferences ?? []),
        ...(artifactUnderstanding.assumptions ?? []),
        ...(artifactUnderstanding.unknowns ?? []),
      ]
    : [];
  for (const statement of statements) {
    collect(statement, 'ARTIFACT_TEXT');
  }

  const pmClaims = [
    context.name ? `Product name (PM claim): ${context.name}` : null,
    context.whatBuilding ? `What is being built (PM claim): ${context.whatBuilding}` : null,
    context.targetUser ? `Target user (PM claim): ${context.targetUser}` : null,
    context.primaryGoal ? `Primary goal (PM claim): ${context.primaryGoal}` : null,
    context.currentProblem ? `Stated problem (PM claim): ${context.currentProblem}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const parts: string[] = [];

  parts.push(
    pmClaims
      ? untrustedBlock('PM_CONTEXT', pmClaims)
      : 'No product context was supplied by the product manager.'
  );

  if (spine) {
    // Stage 2: addressable statements, each with its kind and its origin.
    parts.push(untrustedBlock('ARTIFACT_TEXT', renderClaimBlock(spine)));
  } else if (artifactUnderstanding) {
    const understanding = [
      `Product type read from the artifact: ${artifactUnderstanding.productType ?? 'not stated'}`,
      `Observed: ${(artifactUnderstanding.facts ?? []).join(' | ') || 'none'}`,
      `Inferred: ${(artifactUnderstanding.inferences ?? []).join(' | ') || 'none'}`,
      `Assumed: ${(artifactUnderstanding.assumptions ?? []).join(' | ') || 'none'}`,
      `Cannot be known from the artifact: ${(artifactUnderstanding.unknowns ?? []).join(' | ') || 'none'}`,
    ].join('\n');
    parts.push(untrustedBlock('ARTIFACT_TEXT', understanding));
  } else {
    parts.push('No artifact reading is available for this run.');
  }

  parts.push(
    rawEvidence && rawEvidence.trim().length > 0
      ? untrustedBlock('PM_EVIDENCE', rawEvidence)
      : 'No evidence was supplied by the product manager.'
  );

  if (observations.length > 0) {
    // SR-8: the finding is passed on as an observation about the input, so the
    // panel can treat it as a fact about the artifact rather than as guidance.
    const recorded = observations.map((entry) => `- ${entry.observation}`).join('\n');
    parts.push(
      `OBSERVATIONS ABOUT THE SUPPLIED CONTENT (recorded by the product, not by a model):\n${recorded}`
    );
  }

  return { block: parts.join('\n\n'), untrustedInputs, observations, spine };
}
