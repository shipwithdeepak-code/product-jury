/**
 * Stage 1 · The standing limitations text.
 *
 * PRD v1.1.1 §53 (canonical for what must be said), §36.1 (the wording that
 * satisfies it), TR-6, TR-10, TR-11, principle 10.
 *
 * §53 mandates five contents and §48's gate reads coverage of all five rather
 * than the presence of a paragraph. The five are enumerated here as data, so
 * a test can assert each one is carried and the gate is testable rather than
 * a reviewer's impression.
 *
 * Where it lives: §53 says permanently in the interface, reachable from every
 * surface without leaving it — not a first-run modal, not a footer link. The
 * component that renders this is mounted in the app shell, not in a route.
 */

export type LimitationContent =
  | 'what_it_can_know'
  | 'what_it_cannot_know'
  | 'why_evidence_quality_matters'
  | 'why_not_to_trust_blindly'
  | 'what_the_confidence_ceiling_means';

/** §53's five required contents, in the order §53 lists them. */
export const REQUIRED_LIMITATION_CONTENTS: readonly LimitationContent[] = Object.freeze([
  'what_it_can_know',
  'what_it_cannot_know',
  'why_evidence_quality_matters',
  'why_not_to_trust_blindly',
  'what_the_confidence_ceiling_means',
]);

export interface LimitationParagraph {
  /** Which of the five §53 contents this paragraph carries. */
  covers: LimitationContent[];
  heading: string;
  body: string;
}

/**
 * §36.1's verbatim block, split into paragraphs and tagged with the §53
 * contents each one carries. The wording is §36.1's; the tagging is what makes
 * the launch gate checkable.
 */
export const STANDING_LIMITATIONS: readonly LimitationParagraph[] = Object.freeze([
  {
    covers: ['what_it_can_know', 'what_it_cannot_know'],
    heading: 'What this can and cannot know',
    body:
      'Product Jury has seen one frame of your product and none of your users. What it can know is ' +
      'what is visible in the screen you gave it, what you have told it, and what follows from those ' +
      'by stated inference — nothing about your market, your roadmap, your organisation, or what ' +
      'your competitors shipped last week, unless you tell it, in which case it is your claim and not ' +
      'a verified one.',
  },
  {
    covers: ['why_evidence_quality_matters'],
    heading: 'Why the evidence you give it decides the answer',
    body:
      'Its verdict is a function of what it was given. Thin evidence produces a capped call or a ' +
      'refusal, and that is the system working rather than failing.',
  },
  {
    covers: ['what_the_confidence_ceiling_means'],
    heading: 'What a confidence figure means here',
    body:
      'A confidence figure here is an upper bound set by the evidence, not a probability of being ' +
      'right. Its ceiling and the reason for that ceiling are shown beside it, always.',
  },
  {
    covers: ['why_not_to_trust_blindly'],
    heading: 'Why not to trust it blindly',
    body:
      'The panel is two model-driven lenses following a stated method, not a source of truth. Its ' +
      'confidence figures are not yet calibrated against outcomes, and the same inputs will not ' +
      'always produce the same verdict. You decide; what makes your decision defensible is the ' +
      'record, not the verdict. Use this to find the holes in your reasoning, not to make the call ' +
      'for you.',
  },
]);

/**
 * Statements true of this build in particular, held beside the permanent text
 * because §51 always-8 and TR-5 both require the product to say what it does
 * not have rather than let the interface imply otherwise.
 *
 * These are removed as the capabilities land. They are not a disclaimer; each
 * one names something the interface would otherwise be read as offering.
 */
export const BUILD_LIMITATIONS: readonly string[] = Object.freeze([
  'This build does not yet assess whether your evidence is sufficient before judging, so it does not yet refuse. When a stage fails you are told it failed; you are never told the evidence was insufficient on that basis.',
  'The two lenses do not yet see each other’s positions, so what is reported as agreement or disagreement is drawn from two independent readings rather than from a cross-examination.',
  'The evidence audit does not yet set a binding ceiling on confidence. The figure shown is the panel’s own, with its stated reason.',
  'Nothing is stored. Closing or reloading this tab loses the decision, and there is no export yet.',
  'The model tiers serving this product have not been evaluated against a fixed case set, so the same inputs will not always produce the same result.',
]);

/** §48's gate: the text must cover all five §53 contents. */
export function limitationsCoverageGate(paragraphs: readonly LimitationParagraph[] = STANDING_LIMITATIONS): {
  passes: boolean;
  missing: LimitationContent[];
} {
  const covered = new Set<LimitationContent>();
  for (const paragraph of paragraphs) {
    for (const content of paragraph.covers) {
      covered.add(content);
    }
  }
  const missing = REQUIRED_LIMITATION_CONTENTS.filter((content) => !covered.has(content));
  return { passes: missing.length === 0, missing };
}
