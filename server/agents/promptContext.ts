import { ProductContext, ArtifactUnderstanding } from '../../src/types';
import {
  EmbeddedInstructionObservation,
  detectEmbeddedInstructions,
  untrustedBlock,
} from '../integrity/untrusted';

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
 */

export interface SuppliedContent {
  /** The prompt fragment, with every supplied value in a delimited block. */
  block: string;
  /** Raw supplied strings, for the SR-2 assertion in the provider client. */
  untrustedInputs: string[];
  /** SR-8: instructions found in supplied content, recorded as observations. */
  observations: EmbeddedInstructionObservation[];
}

export function buildSuppliedContent(
  context: ProductContext,
  rawEvidence?: string,
  artifactUnderstanding?: ArtifactUnderstanding
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

  // Artifact-derived statements are untrusted too: the analyst read them off a
  // screen, so anything an attacker put on that screen is now in them.
  const statements = artifactUnderstanding
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

  if (artifactUnderstanding) {
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

  return { block: parts.join('\n\n'), untrustedInputs, observations };
}
