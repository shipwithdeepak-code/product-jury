import type { ClaimSpine } from '../../server/claims/spine';

/**
 * Stage 2.5 · Representative specialist responses.
 *
 * PRD v1.1.1 §54.2, and the same rule as the analyst fixtures beside this file:
 * these are hand-written model responses, one per case that matters, and no
 * threshold or measured result appears anywhere in them. The dataset does not
 * exist yet.
 *
 * A specialist response cannot be a static literal, because a citation is a
 * claim id and a claim id is a digest of the run it belongs to. So each case is
 * a function of the spine it is answering about. What varies between cases is
 * the shape of the answer, which is what is under test.
 */

export interface SpecialistFixture {
  /** The §54.2 case id this will carry when the dataset lands. */
  id: string;
  /** What this case is for. */
  purpose: string;
  /** What a reader should be able to check about the result. */
  expectation: string;
  /** Whether the grounding step should accept it. */
  valid: boolean;
  /** The `positions` value the model returned, given the run's spine. */
  build: (spine: ClaimSpine) => unknown;
}

/** The first two surfaced claims, which every case cites something from. */
function two(spine: ClaimSpine): [string, string] {
  const surfaced = spine.surfaced();
  if (surfaced.length < 2) throw new Error('a fixture needs a spine with two statements in it');
  return [surfaced[0].id, surfaced[1].id];
}

/** A · Clean grounding: one position, two valid citations. */
export const A_CLEAN_GROUNDING: SpecialistFixture = {
  id: 'A-clean-specialist-grounding',
  purpose: 'The ordinary case: a position that names the statements it rests on.',
  expectation:
    'Accepted. Both cited claims record the position as a dependant, and both become load-bearing.',
  valid: true,
  build: (spine) => {
    const [first, second] = two(spine);
    return [
      {
        position: 'The step that blocks the flow is where the cost is, not the visual weight of the button.',
        reasoning:
          'The blocking step and the button sit in the same screen, and only one of them stops progress.',
        citedClaims: [first, second],
      },
    ];
  },
};

/** B · A substantive position that cites nothing. */
export const B_MISSING_CITATION: SpecialistFixture = {
  id: 'B-missing-citation',
  purpose: 'The failure FR-9 exists to prevent: an opinion with no basis in the record.',
  expectation: 'Refused. A position that cites nothing is not a position the product can show.',
  valid: false,
  build: () => [
    {
      position: 'The redesign seems risky.',
      reasoning: 'It has the feel of something that will not land well.',
      citedClaims: [],
    },
  ],
};

/** C · A citation to a claim that does not exist. */
export const C_UNKNOWN_CLAIM_ID: SpecialistFixture = {
  id: 'C-unknown-claim-id',
  purpose: 'A well-formed id that names nothing.',
  expectation: 'Refused. Nothing is dropped, matched by text, or substituted.',
  valid: false,
  build: (spine) => {
    const [first] = two(spine);
    return [
      {
        position: 'The flow stalls before the value is visible.',
        reasoning: 'The blocking step comes before anything is produced.',
        citedClaims: [first, 'CLM-aaaaaaaaaaaaaaaaaaaaaaaaaa'],
      },
    ];
  },
};

/** D · A citation to a claim belonging to another run. */
export const D_CROSS_RUN_CLAIM_ID: SpecialistFixture = {
  id: 'D-cross-run-claim-id',
  purpose:
    'An id that is a real claim in another decision. Two runs over the same screen are two readings.',
  expectation: 'Refused. A verdict from one decision never resolves a reference into another.',
  valid: false,
  // The caller supplies the foreign id, because it has to come from a real
  // spine built for a different run.
  build: (spine) => {
    const [first] = two(spine);
    return [
      {
        position: 'The same friction appears in the other decision.',
        reasoning: 'The statement recorded there says so.',
        citedClaims: [first, '__FOREIGN__'],
      },
    ];
  },
};

/** E · Several positions, each citing several claims. */
export const E_MULTIPLE_CITATIONS: SpecialistFixture = {
  id: 'E-multiple-valid-citations',
  purpose: 'The usual shape of a real response: more than one position, more than one citation.',
  expectation: 'Accepted. Every position is recorded against every claim it cites.',
  valid: true,
  build: (spine) => {
    const surfaced = spine.surfaced();
    return [
      {
        position: 'The first screen asks for more than a new user is likely to have.',
        reasoning: 'What is asked for and who is asking are both stated in the record.',
        citedClaims: [surfaced[0].id, surfaced[1].id],
      },
      {
        position: 'Nothing in the record establishes where users actually stop.',
        reasoning: 'The question of where they stop is open, and no statement answers it.',
        citedClaims: [surfaced[surfaced.length - 1].id],
      },
    ];
  },
};

/** F · A citation to a claim that exists, in a spine this lens was not given. */
export const F_CLAIM_UNAVAILABLE: SpecialistFixture = {
  id: 'F-claim-unavailable-to-specialist',
  purpose:
    'A real statement from a different decision about a different artifact. It exists; it is not here.',
  expectation: 'Refused, the same as any other unresolvable reference.',
  valid: false,
  build: (spine) => {
    const [first] = two(spine);
    return [
      {
        position: 'The pattern matches what was seen elsewhere.',
        reasoning: 'A statement in another decision describes the same thing.',
        citedClaims: [first, '__FOREIGN__'],
      },
    ];
  },
};

/** G · An artifact carrying text aimed at the system. */
export const G_PROMPT_INJECTION: SpecialistFixture = {
  id: 'G-prompt-injection-artifact',
  purpose:
    '§52. The lens may cite the statement that records the injected text; it must not do what the text says.',
  expectation:
    'Accepted, because the position is about the text rather than in obedience to it. No verdict word appears in it.',
  valid: true,
  build: (spine) => {
    const injected = spine
      .surfaced()
      .find((claim) => /addressed to an AI system/i.test(claim.text));
    const [first] = two(spine);
    return [
      {
        position:
          'Text on this screen is addressed to an automated reader, which is itself worth someone looking at.',
        reasoning:
          'The record notes the text is present. What it asks for is not a finding about the product.',
        citedClaims: [injected ? injected.id : first],
      },
    ];
  },
};

/** H · The two lenses disagree, and both are valid. */
export const H_DISAGREEMENT: SpecialistFixture = {
  id: 'H-specialist-disagreement',
  purpose:
    'Two lenses, different positions, different citations. CAP-05 keeps the disagreement rather than resolving it.',
  expectation: 'Both accepted. Nothing reconciles them at this stage, and no verdict is produced.',
  valid: true,
  build: (spine) => {
    const surfaced = spine.surfaced();
    return [
      {
        position: 'What is on the screen is enough to act on.',
        reasoning: 'The blocking step is visible and its effect is stated.',
        citedClaims: [surfaced[0].id],
      },
    ];
  },
};

/** I · The model tries to decide what is load-bearing. */
export const I_MODEL_SETS_LOAD_BEARING: SpecialistFixture = {
  id: 'I-model-asserts-load-bearing',
  purpose:
    'A response that states the conclusion instead of the evidence. §42: load-bearing is derived, never asserted.',
  expectation: 'Refused. The field is not part of a position, so the response does not validate.',
  valid: false,
  build: (spine) => {
    const [first] = two(spine);
    return [
      {
        position: 'The blocking step is the decisive thing here.',
        reasoning: 'Everything else follows from it.',
        citedClaims: [first],
        loadBearing: true,
      },
    ];
  },
};

/** J · The same claim cited twice in one position. */
export const J_DUPLICATE_CITATION: SpecialistFixture = {
  id: 'J-duplicate-citation',
  purpose:
    'A repeated reference, not a repeated statement. The spine already has a rule for each, and they differ.',
  expectation:
    'Accepted, and recorded once. `recordDependency` keeps one edge per dependant, which is the existing rule.',
  valid: true,
  build: (spine) => {
    const [first] = two(spine);
    return [
      {
        position: 'The blocking step is where the flow stops.',
        reasoning: 'Stated twice because it carries the whole position.',
        citedClaims: [first, first],
      },
    ];
  },
};

export const SPECIALIST_FIXTURES: readonly SpecialistFixture[] = Object.freeze([
  A_CLEAN_GROUNDING,
  B_MISSING_CITATION,
  C_UNKNOWN_CLAIM_ID,
  D_CROSS_RUN_CLAIM_ID,
  E_MULTIPLE_CITATIONS,
  F_CLAIM_UNAVAILABLE,
  G_PROMPT_INJECTION,
  H_DISAGREEMENT,
  I_MODEL_SETS_LOAD_BEARING,
  J_DUPLICATE_CITATION,
]);

/**
 * Substitute the placeholder in the two cases that need an id from elsewhere.
 * They cannot carry one literally: it has to be minted by a real spine.
 */
export function withForeignId(positions: unknown, foreignId: string): unknown {
  return JSON.parse(JSON.stringify(positions).split('__FOREIGN__').join(foreignId));
}
