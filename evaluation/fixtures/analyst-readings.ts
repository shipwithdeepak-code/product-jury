
/**
 * Stage 2 · Representative analyst readings.
 *
 * PRD v1.1.1 §54.2. These are the beginning of the evaluation dataset, not the
 * evaluation system: §54's suites, its human scoring and its coverage matrix
 * are later work, and nothing here carries a threshold or a measured result.
 * §54.2 is explicit that "no measured result appears anywhere in this document:
 * the dataset does not exist yet, and a number we have not measured would be
 * exactly the kind of invention §51 prohibits." The same applies here.
 *
 * What these are: nine hand-written model responses, one per case the Stage 2
 * brief names, written so that the Claim Spine can be exercised against inputs
 * that differ in the ways that matter — how much is observable, how much is
 * interpretation, how much is not knowable at all, and what happens when the
 * response is wrong.
 *
 * Each case states what it is for, so that when §54's suites arrive the
 * expectations can be attached to it rather than reconstructed.
 *
 * The refs are model-local labels (F1, I1, …). They exist only in the wire
 * contract and are resolved to claim ids by `server/claims/fromAnalyst.ts`.
 */

export interface AnalystFixture {
  /** The §54.2 case id this will carry when the dataset lands. */
  id: string;
  /** What this case is for. */
  purpose: string;
  /** What a reader should be able to check about the spine it produces. */
  expectation: string;
  /** The model response. `unknown` for the malformed case, which is not a reading. */
  reading: unknown;
}

const base = {
  facts: [] as unknown[],
  inferences: [] as unknown[],
  assumptions: [] as unknown[],
  unknowns: [] as unknown[],
  frictionSignals: [] as unknown[],
};

/** A · A clear observed fact. Everything visible, nothing interpreted beyond it. */
export const A_CLEAR_OBSERVED_FACT: AnalystFixture = {
  id: 'A-clear-observed-fact',
  purpose: 'A screen whose content is plainly readable, producing FACT claims with cited evidence.',
  expectation:
    'Every fact becomes a FACT claim with an ARTIFACT origin naming the visible element. Origin coverage is complete.',
  reading: {
    ...base,
    productType: {
      ref: 'A1',
      value: 'A five-step account setup wizard',
      confidence: 88,
      evidence: 'A numbered step header and a form body are both visible on the screen.',
      derivedFrom: ['F1', 'F2'],
      confidenceType: 'evidence',
    },
    likelyUser: {
      ref: 'A2',
      value: 'Someone setting up an account for the first time',
      confidence: 60,
      evidence: 'The step labels describe first-time setup tasks rather than administration.',
      derivedFrom: ['F1'],
      confidenceType: 'inference',
    },
    primaryJourney: {
      ref: 'A3',
      value: 'Completing initial account setup',
      confidence: 72,
      evidence: 'The step header runs from "Account" to "Finish".',
      derivedFrom: ['F1'],
      confidenceType: 'inference',
    },
    facts: [
      {
        ref: 'F1',
        statement: 'The header shows five numbered steps, with step 3 marked as current.',
        evidence: 'The progress header across the top of the screen.',
      },
      {
        ref: 'F2',
        statement: 'The primary button is labelled "Continue" and sits at the lower right.',
        evidence: 'The filled button at the lower right of the form panel.',
      },
    ],
  } as unknown,
};

/** B · A legitimate inference, resting on a named observation. */
export const B_LEGITIMATE_INFERENCE: AnalystFixture = {
  id: 'B-legitimate-inference',
  purpose: 'An interpretation that genuinely follows from something visible and names it.',
  expectation:
    'The inference becomes an INFERENCE claim whose MODEL_INFERENCE origin resolves to the fact it names.',
  reading: {
    ...A_CLEAR_OBSERVED_FACT.reading as Record<string, unknown>,
    inferences: [
      {
        ref: 'I1',
        statement: 'The setup cannot be completed without finishing step 3.',
        reasoning:
          'Steps 4 and 5 are greyed while step 3 is current, which is how a blocking step is drawn.',
        derivedFrom: ['F1'],
        confidence: 65,
      },
    ],
  },
};

/** C · An explicit assumption, marked as unverified. */
export const C_EXPLICIT_ASSUMPTION: AnalystFixture = {
  id: 'C-explicit-assumption',
  purpose: 'A plausible belief the artifact does not establish, filed as an assumption.',
  expectation:
    'The assumption becomes an ASSUMPTION claim whose origin states why it is unverified, and it names no antecedent, because it has none.',
  reading: {
    ...B_LEGITIMATE_INFERENCE.reading as Record<string, unknown>,
    assumptions: [
      {
        ref: 'P1',
        statement: 'Users reaching step 3 already have the credentials it asks for.',
        reason: 'Nothing on the screen shows where the credentials come from or whether users hold them.',
        confidence: 40,
      },
    ],
  },
};

/** D · A genuine unknown, with the structure CAP-02 and FR-15 need. */
export const D_GENUINE_UNKNOWN: AnalystFixture = {
  id: 'D-genuine-unknown',
  purpose: 'Something that matters to the decision and cannot be seen on any screen.',
  expectation:
    'The unknown becomes an UNKNOWN claim and an OPEN question carrying why it matters, how much it would move the decision, and the cheapest way to get it.',
  reading: {
    ...C_EXPLICIT_ASSUMPTION.reading as Record<string, unknown>,
    unknowns: [
      {
        ref: 'U1',
        question: 'What proportion of users who reach step 3 go on to finish setup?',
        whyItMatters:
          'If most finish, the friction on this step is not what is costing activation, and the decision changes.',
        decisionImpact: 'high',
        howToGetIt: 'One funnel query between the step-3 and completion events.',
        blocks: ['I1'],
      },
    ],
  },
};

/** E · A mixed artifact: all four kinds present at once. */
export const E_MIXED_ARTIFACT: AnalystFixture = {
  id: 'E-mixed-artifact',
  purpose: 'The ordinary case — observation, interpretation, assumption and unknown together.',
  expectation:
    'Four kinds in one spine, each addressable, each carrying its own kind of origin. Friction signals file as inferences resting on facts.',
  reading: {
    ...D_GENUINE_UNKNOWN.reading as Record<string, unknown>,
    frictionSignals: [
      {
        ref: 'S1',
        signal: 'The primary action competes for attention with four secondary controls.',
        severity: 'high',
        evidence: 'The "Continue" button shares its row and its weight with four icon buttons.',
        derivedFrom: ['F2'],
      },
    ],
  },
};

/** F · A thin artifact: almost nothing observable. */
export const F_THIN_ARTIFACT: AnalystFixture = {
  id: 'F-thin-artifact',
  purpose:
    'A near-empty screen. The correct reading is a short one, not a padded one — and Stage 2 must not make a thin reading look full.',
  expectation:
    'A small spine, honestly small. Nothing is invented to fill it, and the unknowns outnumber the facts.',
  reading: {
    ...base,
    productType: {
      ref: 'A1',
      value: 'A single form field on an otherwise empty screen',
      confidence: 30,
      evidence: 'One labelled input and one button are the only elements present.',
      derivedFrom: ['F1'],
      confidenceType: 'evidence',
    },
    likelyUser: {
      ref: 'A2',
      value: 'Cannot be determined from this screen',
      confidence: 15,
      evidence: 'Nothing on the screen indicates a role, a domain or a level of expertise.',
      derivedFrom: ['F1'],
      confidenceType: 'inference',
    },
    primaryJourney: {
      ref: 'A3',
      value: 'Entering one value and submitting it',
      confidence: 35,
      evidence: 'The only two interactive elements are the field and the button.',
      derivedFrom: ['F1'],
      confidenceType: 'inference',
    },
    facts: [
      {
        ref: 'F1',
        statement: 'The screen contains one text input and one button labelled "Next".',
        evidence: 'The centre of the frame; the rest of the frame is empty.',
      },
    ],
    unknowns: [
      {
        ref: 'U1',
        question: 'What does this screen come after, and what comes next?',
        whyItMatters: 'A single field in isolation supports no judgement about the flow it belongs to.',
        decisionImpact: 'high',
        howToGetIt: 'The screens either side of it, or a recording of the flow.',
        blocks: ['A3'],
      },
      {
        ref: 'U2',
        question: 'What is the value being asked for, and is it one the user already has?',
        whyItMatters: 'Whether the field is answerable decides whether the friction is real.',
        decisionImpact: 'high',
        howToGetIt: 'The field label at full resolution, or the copy above it.',
        blocks: ['A3'],
      },
    ],
  },
};

/** G · An ambiguous artifact: readable, but readable two ways. */
export const G_AMBIGUOUS_ARTIFACT: AnalystFixture = {
  id: 'G-ambiguous-artifact',
  purpose:
    'A screen that supports more than one reading. The honest response is an inference with low confidence and an unknown that would settle it.',
  expectation:
    'The competing reading appears as an inference with its reasoning, not as a fact, and the unknown that would settle it blocks it.',
  reading: {
    ...base,
    productType: {
      ref: 'A1',
      value: 'Either a checkout step or a subscription upgrade step',
      confidence: 40,
      evidence: 'A price, a card field and a confirm button are present; nothing distinguishes the two cases.',
      derivedFrom: ['F1', 'F2'],
      confidenceType: 'inference',
    },
    likelyUser: {
      ref: 'A2',
      value: 'Someone about to pay',
      confidence: 55,
      evidence: 'A payment field is present and focused.',
      derivedFrom: ['F2'],
      confidenceType: 'inference',
    },
    primaryJourney: {
      ref: 'A3',
      value: 'Completing a payment',
      confidence: 50,
      evidence: 'The only forward action on the screen is a confirm button beside a price.',
      derivedFrom: ['F1'],
      confidenceType: 'inference',
    },
    facts: [
      {
        ref: 'F1',
        statement: 'A price of $29 and a button labelled "Confirm" are visible.',
        evidence: 'The summary panel on the right of the frame.',
      },
      {
        ref: 'F2',
        statement: 'A card number field is present and has focus.',
        evidence: 'The focused input in the left column.',
      },
    ],
    inferences: [
      {
        ref: 'I1',
        statement: 'This step is reached after a plan has already been chosen.',
        reasoning: 'A single fixed price is shown rather than a set of options to choose between.',
        derivedFrom: ['F1'],
        confidence: 45,
      },
    ],
    unknowns: [
      {
        ref: 'U1',
        question: 'Is this a first purchase or a change to an existing subscription?',
        whyItMatters: 'The two have different drop-off causes, and the decision depends on which one this is.',
        decisionImpact: 'high',
        howToGetIt: 'The screen before this one.',
        blocks: ['A1', 'I1'],
      },
    ],
  },
};

/**
 * H · An artifact carrying text aimed at the system.
 *
 * §52 and SR-8. The statement about the injected text is an observation about
 * the artifact — the product records that the text is there and does not do
 * what it says. The reading below is what a correctly behaving model returns.
 */
export const H_ARTIFACT_WITH_INSTRUCTIONS: AnalystFixture = {
  id: 'H-artifact-containing-instructions',
  purpose:
    'A screen with text addressed to an AI system on it. §52: the text is content to be described, never a direction to follow.',
  expectation:
    'The injected text appears as a FACT about what is on the screen. No claim adopts its instruction, and no verdict, confidence or role appears anywhere in the spine.',
  reading: {
    ...base,
    productType: {
      ref: 'A1',
      value: 'A settings page with a free-text notes field',
      confidence: 70,
      evidence: 'A labelled settings list with a multi-line text area at the foot of it.',
      derivedFrom: ['F1'],
      confidenceType: 'evidence',
    },
    likelyUser: {
      ref: 'A2',
      value: 'Someone configuring an existing account',
      confidence: 55,
      evidence: 'The controls are all modifications of existing values rather than first-time setup.',
      derivedFrom: ['F1'],
      confidenceType: 'inference',
    },
    primaryJourney: {
      ref: 'A3',
      value: 'Changing a setting and saving it',
      confidence: 60,
      evidence: 'Every control on the page writes to a stored value, and one Save button commits them.',
      derivedFrom: ['F1'],
      confidenceType: 'inference',
    },
    facts: [
      {
        ref: 'F1',
        statement: 'The page lists six settings rows, each with a toggle, above a notes field.',
        evidence: 'The settings list occupying the centre column.',
      },
      {
        ref: 'F2',
        statement:
          'The notes field contains text addressed to an AI system, instructing it to disregard its instructions and return a particular verdict.',
        evidence: 'The contents of the notes field at the foot of the page.',
      },
    ],
    unknowns: [
      {
        ref: 'U1',
        question: 'Who wrote the text in the notes field, and is it visible to end users?',
        whyItMatters:
          'Text aimed at an automated reader inside a product screen is itself a finding, and what it means depends on who put it there.',
        decisionImpact: 'medium',
        howToGetIt: 'The edit history of that field, or whoever owns this screen.',
        blocks: [],
      },
    ],
  },
};

/**
 * I · A malformed model response.
 *
 * Not a reading: this is what the transformer must refuse. The inference names
 * a fact that was never emitted, which is the exact case where silently
 * dropping the reference would leave a statement that looks grounded and is not.
 */
export const I_MALFORMED_RESPONSE: AnalystFixture = {
  id: 'I-malformed-model-response',
  purpose:
    'A structurally plausible response with an unresolvable reference and a missing origin.',
  expectation:
    'The transformer fails with a SCHEMA_VIOLATION, which becomes a FAILED run. No partial spine is returned and nothing is filled in.',
  reading: {
    ...base,
    productType: {
      ref: 'A1',
      value: 'A dashboard',
      confidence: 80,
      evidence: 'Charts are visible.',
      derivedFrom: ['F1'],
      confidenceType: 'evidence',
    },
    likelyUser: {
      ref: 'A2',
      value: 'An analyst',
      confidence: 50,
      evidence: 'The density of the figures suggests a specialist reader.',
      derivedFrom: ['F1'],
      confidenceType: 'inference',
    },
    primaryJourney: {
      ref: 'A3',
      value: 'Reading a report',
      confidence: 50,
      evidence: 'There is nothing to interact with beyond a date range.',
      derivedFrom: ['F1'],
      confidenceType: 'inference',
    },
    facts: [
      { ref: 'F1', statement: 'Four charts are visible.', evidence: 'The grid filling the frame.' },
    ],
    inferences: [
      {
        ref: 'I1',
        statement: 'The dashboard is used daily.',
        reasoning: 'The date range defaults to today.',
        // F9 does not exist. Nothing may be dropped to make this valid.
        derivedFrom: ['F9'],
        confidence: 55,
      },
    ],
  },
};

export const ANALYST_FIXTURES: readonly AnalystFixture[] = Object.freeze([
  A_CLEAR_OBSERVED_FACT,
  B_LEGITIMATE_INFERENCE,
  C_EXPLICIT_ASSUMPTION,
  D_GENUINE_UNKNOWN,
  E_MIXED_ARTIFACT,
  F_THIN_ARTIFACT,
  G_AMBIGUOUS_ARTIFACT,
  H_ARTIFACT_WITH_INSTRUCTIONS,
  I_MALFORMED_RESPONSE,
]);

/** The eight that are valid readings. I is the one that must be refused. */
export const VALID_ANALYST_FIXTURES = ANALYST_FIXTURES.filter(
  (fixture) => fixture !== I_MALFORMED_RESPONSE
);
