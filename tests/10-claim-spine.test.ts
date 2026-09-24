import { describe, expect, it } from 'vitest';
import { ClaimSpine } from '../server/claims/spine';
import { mintClaimId, isClaimId, normaliseClaimText } from '../server/claims/identity';
import {
  ClaimReferenceError,
  ClaimValidationError,
  validateClaim,
  validateOpenQuestion,
} from '../server/claims/validation';
import {
  ORIGIN_COVERAGE_THRESHOLD,
  OriginCoverageError,
  UNRELATED_85_PERCENT_METRIC,
  assertOriginCoverage,
  measureOriginCoverage,
} from '../server/claims/originCoverage';
import { EPISTEMIC_STATUSES, LOAD_BEARING_STATUSES } from '../src/types/claims';

/**
 * Stage 2 groups 1-9 and 12-15: the claim model itself.
 *
 * PRD v1.1.1 CAP-03, §51 always-1 and always-3, FR-2, FR-3, FR-15.
 */

const RUN = 'run-under-test';

function spineWithOneFact() {
  const spine = new ClaimSpine(RUN);
  const fact = spine.add({
    text: 'The header shows five numbered steps.',
    epistemicStatus: 'FACT',
    origin: { kind: 'ARTIFACT', evidence: 'the progress header', runId: RUN, stage: 'analyst' },
    producedBy: 'analyst',
  });
  return { spine, fact };
}

describe('1 · valid claim creation', () => {
  it('mints a claim carrying its kind, its origin and what rests on it', () => {
    const { fact } = spineWithOneFact();

    expect(isClaimId(fact.id)).toBe(true);
    expect(fact.epistemicStatus).toBe('FACT');
    expect(fact.origin.kind).toBe('ARTIFACT');
    expect(fact.supports).toEqual([]);
    expect(fact.loadBearing).toBe('NOT_YET_DETERMINED');
    expect(fact.runId).toBe(RUN);
    expect(fact.surfaced).toBe(true);
    expect(validateClaim(fact).errors).toEqual([]);
  });

  it('carries the four kinds the PRD names, and the two suite B adds', () => {
    // CAP-03's four, plus PM_STATEMENT and EVIDENCE from §54.3 suite B. No
    // category is invented here: this list is the PRD's own.
    expect([...EPISTEMIC_STATUSES]).toEqual([
      'FACT',
      'INFERENCE',
      'ASSUMPTION',
      'UNKNOWN',
      'PM_STATEMENT',
      'EVIDENCE',
    ]);
  });

  it('refuses a confidence figure on an observation', () => {
    const spine = new ClaimSpine(RUN);
    expect(() =>
      spine.add({
        text: 'The button is blue.',
        epistemicStatus: 'FACT',
        origin: { kind: 'ARTIFACT', evidence: 'the button', runId: RUN, stage: 'analyst' },
        producedBy: 'analyst',
        confidence: 90,
      })
    ).toThrow(ClaimValidationError);
  });

  it('keeps the original when the PM corrects a statement (CAP-03, FR-3)', () => {
    const { spine, fact } = spineWithOneFact();
    const corrected = spine.recordPmEdit(fact.id, 'The header shows four numbered steps.');

    expect(spine.has(fact.id)).toBe(true);
    expect(corrected.id).not.toBe(fact.id);
    // "A corrected statement is never presented as an observation."
    expect(corrected.epistemicStatus).toBe('PM_STATEMENT');
    expect(corrected.origin).toMatchObject({ kind: 'PM_EDIT', supersedes: fact.id });
  });
});

describe('2 · stable ids', () => {
  const identity = {
    runId: RUN,
    producedBy: 'analyst',
    epistemicStatus: 'FACT' as const,
    text: 'The header shows five numbered steps.',
  };

  it('is deterministic for the same statement in the same run and stage', () => {
    expect(mintClaimId(identity)).toBe(mintClaimId(identity));
  });

  it('is insensitive to whitespace but not to wording', () => {
    expect(mintClaimId({ ...identity, text: '  The header shows five   numbered steps.  ' })).toBe(
      mintClaimId(identity)
    );
    expect(mintClaimId({ ...identity, text: 'The header shows four numbered steps.' })).not.toBe(
      mintClaimId(identity)
    );
    expect(normaliseClaimText(' a  b ')).toBe('a b');
  });

  it('is scoped to the run, the stage and the kind', () => {
    expect(mintClaimId({ ...identity, runId: 'another-run' })).not.toBe(mintClaimId(identity));
    expect(mintClaimId({ ...identity, producedBy: 'chair' })).not.toBe(mintClaimId(identity));
    expect(mintClaimId({ ...identity, epistemicStatus: 'INFERENCE' })).not.toBe(
      mintClaimId(identity)
    );
  });

  it('does not move when another statement is inserted before it', () => {
    const first = new ClaimSpine(RUN);
    const a = first.add({
      text: 'Statement A',
      epistemicStatus: 'FACT',
      origin: { kind: 'ARTIFACT', evidence: 'x', runId: RUN, stage: 'analyst' },
      producedBy: 'analyst',
    });

    const second = new ClaimSpine(RUN);
    second.add({
      text: 'Statement inserted first',
      epistemicStatus: 'FACT',
      origin: { kind: 'ARTIFACT', evidence: 'y', runId: RUN, stage: 'analyst' },
      producedBy: 'analyst',
    });
    const aAgain = second.add({
      text: 'Statement A',
      epistemicStatus: 'FACT',
      origin: { kind: 'ARTIFACT', evidence: 'x', runId: RUN, stage: 'analyst' },
      producedBy: 'analyst',
    });

    // An array index would have changed here. That is the whole reason the id
    // is a digest of the statement rather than its position.
    expect(aAgain.id).toBe(a.id);
  });

  it('is opaque: the statement cannot be read back out of it', () => {
    const { fact } = spineWithOneFact();
    expect(fact.id).not.toContain('header');
    expect(fact.id).toMatch(/^CLM-[a-z2-7]{26}$/);
  });
});

describe('3 · invalid ids', () => {
  it.each([
    ['', 'empty'],
    ['CLM-', 'prefix only'],
    ['CLAIM-123', 'wrong prefix'],
    ['CLM-TOOSHORT', 'wrong length'],
    ['CLM-ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'wrong alphabet'],
    ['CLM-0123456789012345678901234x', 'digits outside base32'],
  ])('rejects %s (%s)', (id) => {
    expect(isClaimId(id)).toBe(false);
    const { errors } = validateClaim({ id, text: 'x' });
    expect(errors.join(' ')).toMatch(/id/);
  });

  it('rejects a claim whose id is missing entirely', () => {
    const { errors } = validateClaim({ text: 'x', epistemicStatus: 'FACT' });
    expect(errors.some((e) => /id .* is missing or malformed/.test(e))).toBe(true);
  });
});

describe('4 · duplicate ids', () => {
  it('rejects the same statement of the same kind twice from the same stage', () => {
    const { spine } = spineWithOneFact();
    expect(() =>
      spine.add({
        text: 'The header shows five numbered steps.',
        epistemicStatus: 'FACT',
        origin: { kind: 'ARTIFACT', evidence: 'the progress header', runId: RUN, stage: 'analyst' },
        producedBy: 'analyst',
      })
    ).toThrow(/duplicate claim/);
  });

  it('rejects a serialised spine carrying two claims with one id', () => {
    const { spine, fact } = spineWithOneFact();
    const serialised = spine.toJSON();
    serialised.claims.push({ ...fact });

    expect(() => ClaimSpine.fromJSON(serialised)).toThrow(/duplicate id/);
  });
});

describe('5 · epistemic status validation', () => {
  it('rejects a status outside the PRD list', () => {
    const { errors } = validateClaim({
      id: mintClaimId({ runId: RUN, producedBy: 'analyst', epistemicStatus: 'FACT', text: 'x' }),
      text: 'x',
      epistemicStatus: 'PROBABLY_TRUE',
      origin: { kind: 'ARTIFACT', evidence: 'y', runId: RUN, stage: 'analyst' },
      supports: [],
      loadBearing: 'NOT_YET_DETERMINED',
      producedBy: 'analyst',
      runId: RUN,
      createdAt: new Date().toISOString(),
      surfaced: true,
    });
    expect(errors.join(' ')).toMatch(/epistemicStatus/);
  });

  it('rejects a missing status', () => {
    const { errors } = validateClaim({ id: 'CLM-aaaaaaaaaaaaaaaaaaaaaaaaaa', text: 'x' });
    expect(errors.join(' ')).toMatch(/epistemicStatus/);
  });
});

describe('6 · source validation', () => {
  it('rejects a claim with no origin at all', () => {
    const errors = validateClaim({
      id: 'CLM-aaaaaaaaaaaaaaaaaaaaaaaaaa',
      text: 'x',
      epistemicStatus: 'FACT',
      supports: [],
      loadBearing: 'NOT_YET_DETERMINED',
      producedBy: 'analyst',
      runId: RUN,
      createdAt: 'now',
      surfaced: true,
    }).errors;
    expect(errors.join(' ')).toMatch(/origin is missing/);
  });

  it('rejects an origin kind that is not one of the eight', () => {
    const spine = new ClaimSpine(RUN);
    expect(() =>
      spine.add({
        text: 'x',
        epistemicStatus: 'FACT',
        origin: { kind: 'VIBES' } as never,
        producedBy: 'analyst',
      })
    ).toThrow(/origin.kind/);
  });

  it('rejects an ARTIFACT origin that cites nothing', () => {
    const spine = new ClaimSpine(RUN);
    expect(() =>
      spine.add({
        text: 'x',
        epistemicStatus: 'FACT',
        origin: { kind: 'ARTIFACT', evidence: '   ', runId: RUN, stage: 'analyst' },
        producedBy: 'analyst',
      })
    ).toThrow(/must cite the visible thing/);
  });

  it('rejects a MODEL_ASSUMPTION that does not say why it is unverified', () => {
    const spine = new ClaimSpine(RUN);
    expect(() =>
      spine.add({
        text: 'x',
        epistemicStatus: 'ASSUMPTION',
        origin: { kind: 'MODEL_ASSUMPTION', reason: '', runId: RUN, stage: 'analyst' },
        producedBy: 'analyst',
      })
    ).toThrow(/why it remains unverified/);
  });

  it('closes the schema: an extra field on an origin is an error, not noise', () => {
    const spine = new ClaimSpine(RUN);
    expect(() =>
      spine.add({
        text: 'x',
        epistemicStatus: 'FACT',
        origin: {
          kind: 'ARTIFACT',
          evidence: 'y',
          runId: RUN,
          stage: 'analyst',
          verdict: 'SHIP',
        } as never,
        producedBy: 'analyst',
      })
    ).toThrow(/"verdict" is not part of the schema/);
  });

  it('closes the schema on the claim itself', () => {
    const { fact } = spineWithOneFact();
    const { errors } = validateClaim({ ...fact, recommendation: 'ship it' });
    expect(errors.join(' ')).toMatch(/"recommendation" is not part of the schema/);
  });
});

describe('7 · lineage validation', () => {
  it('requires an inference to name what it was derived from', () => {
    const { spine } = spineWithOneFact();
    expect(() =>
      spine.add({
        text: 'Users stall here.',
        epistemicStatus: 'INFERENCE',
        origin: {
          kind: 'MODEL_INFERENCE',
          reasoning: 'because',
          derivedFrom: [],
          runId: RUN,
          stage: 'analyst',
        },
        producedBy: 'analyst',
        confidence: 60,
      })
    ).toThrow(/names nothing it was derived from|is empty/);
  });

  it('requires an inference to state its reasoning', () => {
    const { spine, fact } = spineWithOneFact();
    expect(() =>
      spine.add({
        text: 'Users stall here.',
        epistemicStatus: 'INFERENCE',
        origin: {
          kind: 'MODEL_INFERENCE',
          reasoning: '',
          derivedFrom: [fact.id],
          runId: RUN,
          stage: 'analyst',
        },
        producedBy: 'analyst',
        confidence: 60,
      })
    ).toThrow(/must state its reasoning/);
  });

  it('accepts an inference that names a claim already in the spine', () => {
    const { spine, fact } = spineWithOneFact();
    const inference = spine.add({
      text: 'Step three blocks the ones after it.',
      epistemicStatus: 'INFERENCE',
      origin: {
        kind: 'MODEL_INFERENCE',
        reasoning: 'the later steps are drawn as unavailable',
        derivedFrom: [fact.id],
        runId: RUN,
        stage: 'analyst',
      },
      producedBy: 'analyst',
      confidence: 60,
    });
    expect((inference.origin as { derivedFrom: string[] }).derivedFrom).toEqual([fact.id]);
  });

  it('rejects a malformed reference inside a lineage', () => {
    const { spine } = spineWithOneFact();
    expect(() =>
      spine.add({
        text: 'x',
        epistemicStatus: 'INFERENCE',
        origin: {
          kind: 'MODEL_INFERENCE',
          reasoning: 'y',
          derivedFrom: ['not-a-claim-id'],
          runId: RUN,
          stage: 'analyst',
        },
        producedBy: 'analyst',
        confidence: 10,
      })
    ).toThrow(/malformed claim reference/);
  });
});

describe('8 · load-bearing status', () => {
  it('starts as NOT_YET_DETERMINED rather than false', () => {
    const { fact } = spineWithOneFact();
    // Stage 2 produces no conclusions, so nothing has been established about
    // what the call rests on. "false" would be an assertion it cannot make.
    expect(fact.loadBearing).toBe('NOT_YET_DETERMINED');
    expect([...LOAD_BEARING_STATUSES]).toContain('NOT_YET_DETERMINED');
  });

  it('becomes LOAD_BEARING only when something is recorded as resting on it', () => {
    const { spine, fact } = spineWithOneFact();
    spine.recordDependency(fact.id, {
      dependantId: 'opportunity-1',
      dependantKind: 'OPPORTUNITY',
      stage: 'chair',
    });

    expect(spine.resolve(fact.id).loadBearing).toBe('LOAD_BEARING');
    expect(spine.loadBearingClaims().map((c) => c.id)).toEqual([fact.id]);
  });

  it('cannot be asserted from prose: LOAD_BEARING with no dependant is rejected', () => {
    const { fact } = spineWithOneFact();
    const { errors } = validateClaim({ ...fact, loadBearing: 'LOAD_BEARING' });
    expect(errors.join(' ')).toMatch(/derived from what depends on a claim, never asserted/);
  });

  it('cannot be marked NOT_LOAD_BEARING while something rests on it', () => {
    const { spine, fact } = spineWithOneFact();
    spine.recordDependency(fact.id, {
      dependantId: 'verdict-1',
      dependantKind: 'VERDICT',
      stage: 'chair',
    });
    expect(() => spine.markNotLoadBearing(fact.id)).toThrow(/while 1 thing/);
  });

  it('records the same dependant once', () => {
    const { spine, fact } = spineWithOneFact();
    const dependant = {
      dependantId: 'verdict-1',
      dependantKind: 'VERDICT' as const,
      stage: 'chair',
    };
    spine.recordDependency(fact.id, dependant);
    spine.recordDependency(fact.id, dependant);
    expect(spine.resolve(fact.id).supports).toHaveLength(1);
  });
});

describe('9 · unknown and open-question structure', () => {
  function spineWithUnknown() {
    const { spine, fact } = spineWithOneFact();
    const unknown = spine.add({
      text: 'What proportion of users finish setup?',
      epistemicStatus: 'UNKNOWN',
      origin: {
        kind: 'MODEL_ASSUMPTION',
        reason: 'no completion data is visible on any screen',
        runId: RUN,
        stage: 'analyst',
      },
      producedBy: 'analyst',
    });
    const question = spine.addOpenQuestion({
      claimId: unknown.id,
      question: 'What proportion of users finish setup?',
      whyItMatters: 'It decides whether this step is where activation is lost.',
      decisionImpact: 'high',
      howToGetIt: 'One funnel query.',
      blocks: [fact.id],
    });
    return { spine, unknown, question, fact };
  }

  it('carries what CAP-02 and FR-15 need to ask, rank and act on it', () => {
    const { question } = spineWithUnknown();
    expect(question.status).toBe('OPEN');
    expect(question.whyItMatters).toBeTruthy();
    expect(question.decisionImpact).toBe('high');
    expect(question.howToGetIt).toBeTruthy();
    expect(validateOpenQuestion(question).errors).toEqual([]);
  });

  it('refuses a question with no reason for asking it', () => {
    const { errors } = validateOpenQuestion({
      claimId: 'CLM-aaaaaaaaaaaaaaaaaaaaaaaaaa',
      question: 'Why?',
      whyItMatters: '',
      decisionImpact: 'high',
      blocks: [],
      status: 'OPEN',
    });
    expect(errors.join(' ')).toMatch(/every question shows why it is being asked/);
  });

  it('refuses to attach a question to a claim that is not an UNKNOWN', () => {
    const { spine, fact } = spineWithOneFact();
    expect(() =>
      spine.addOpenQuestion({
        claimId: fact.id,
        question: 'q',
        whyItMatters: 'w',
        decisionImpact: 'low',
        blocks: [],
      })
    ).toThrow(/must be an UNKNOWN claim/);
  });

  it('records a PM answer as the PM’s statement, never as a fact (CAP-02)', () => {
    const { spine, unknown } = spineWithUnknown();
    const { question, answer } = spine.recordAnswer(unknown.id, 'About 40% finish.');

    expect(answer.epistemicStatus).toBe('PM_STATEMENT');
    expect(answer.origin).toMatchObject({ kind: 'PM_ANSWER', answers: unknown.id });
    expect(question.status).toBe('ANSWERED');
    expect(question.answerClaimId).toBe(answer.id);
    // There is no parameter on recordAnswer that could file it as a FACT.
    expect(spine.byStatus('FACT').map((c) => c.text)).not.toContain('About 40% finish.');
  });

  it('can be skipped, which CAP-02 requires', () => {
    const { spine, unknown } = spineWithUnknown();
    expect(spine.skipQuestion(unknown.id).status).toBe('SKIPPED');
  });
});

describe('12 · claim-reference resolution', () => {
  it('resolves a reference to the claim it names', () => {
    const { spine, fact } = spineWithOneFact();
    expect(spine.resolve(fact.id).text).toBe('The header shows five numbered steps.');
    expect(spine.resolveAll([fact.id])).toHaveLength(1);
  });

  it('survives a serialisation round trip with every reference intact', () => {
    const { spine, fact } = spineWithOneFact();
    const inference = spine.add({
      text: 'Step three blocks the rest.',
      epistemicStatus: 'INFERENCE',
      origin: {
        kind: 'MODEL_INFERENCE',
        reasoning: 'later steps are drawn as unavailable',
        derivedFrom: [fact.id],
        runId: RUN,
        stage: 'analyst',
      },
      producedBy: 'analyst',
      confidence: 60,
    });
    spine.recordDependency(fact.id, {
      dependantId: inference.id,
      dependantKind: 'CLAIM',
      stage: 'analyst',
    });

    const rebuilt = ClaimSpine.fromJSON(JSON.parse(JSON.stringify(spine.toJSON())));

    expect(rebuilt.size).toBe(spine.size);
    expect(rebuilt.resolve(inference.id).origin).toMatchObject({ derivedFrom: [fact.id] });
    expect(rebuilt.resolve(fact.id).loadBearing).toBe('LOAD_BEARING');
  });
});

describe('13 · invalid claim-reference rejection', () => {
  it('throws rather than returning undefined for an unknown id', () => {
    const { spine } = spineWithOneFact();
    expect(() => spine.resolve('CLM-aaaaaaaaaaaaaaaaaaaaaaaaaa')).toThrow(ClaimReferenceError);
  });

  it('refuses a new claim whose lineage names something not in the spine', () => {
    const { spine } = spineWithOneFact();
    expect(() =>
      spine.add({
        text: 'x',
        epistemicStatus: 'INFERENCE',
        origin: {
          kind: 'MODEL_INFERENCE',
          reasoning: 'y',
          derivedFrom: ['CLM-aaaaaaaaaaaaaaaaaaaaaaaaaa'],
          runId: RUN,
          stage: 'analyst',
        },
        producedBy: 'analyst',
        confidence: 10,
      })
    ).toThrow(ClaimReferenceError);
  });

  it('never silently drops a reference: the error names it', () => {
    const { spine } = spineWithOneFact();
    const missing = 'CLM-bbbbbbbbbbbbbbbbbbbbbbbbbb';
    const error = (() => {
      try {
        spine.resolveAll([missing]);
        return null;
      } catch (e) {
        return e as ClaimReferenceError;
      }
    })();

    expect(error?.missing).toEqual([missing]);
    expect(error?.message).toContain(missing);
    expect(error?.message).toMatch(/never dropped/);
  });

  it('rejects a serialised spine whose references do not resolve', () => {
    const { spine, fact } = spineWithOneFact();
    const serialised = spine.toJSON();
    serialised.claims[0] = {
      ...fact,
      origin: {
        kind: 'MODEL_INFERENCE',
        reasoning: 'y',
        derivedFrom: ['CLM-cccccccccccccccccccccccccc'],
        runId: RUN,
        stage: 'analyst',
      },
      epistemicStatus: 'INFERENCE',
    };
    expect(() => ClaimSpine.fromJSON(serialised)).toThrow(ClaimReferenceError);
  });

  it('rejects a serialised spine carrying claims from another run', () => {
    const { spine, fact } = spineWithOneFact();
    const serialised = spine.toJSON();
    serialised.claims[0] = { ...fact, runId: 'a-different-run' };
    expect(() => ClaimSpine.fromJSON(serialised)).toThrow(/belongs to run/);
  });
});

describe('14 · origin coverage calculation', () => {
  it('counts surfaced claims as the denominator and attributed ones as the numerator', () => {
    const { spine, fact } = spineWithOneFact();
    spine.add({
      text: 'An internal note nobody sees.',
      epistemicStatus: 'FACT',
      origin: { kind: 'ARTIFACT', evidence: 'z', runId: RUN, stage: 'analyst' },
      producedBy: 'analyst',
      surfaced: false,
    });

    const coverage = measureOriginCoverage(spine);
    expect(coverage.surfaced).toBe(1);
    expect(coverage.covered).toBe(1);
    expect(coverage.ratio).toBe(1);
    expect(coverage.uncovered).toEqual([]);
    expect(spine.resolve(fact.id).surfaced).toBe(true);
  });

  it('is 1 for an empty spine, because it has no unattributed statements', () => {
    expect(measureOriginCoverage(new ClaimSpine(RUN)).ratio).toBe(1);
  });

  it('counts a claim as uncovered when its origin names something outside the run', () => {
    const { spine, fact } = spineWithOneFact();
    // Reach past the constructor to build the state a tampered payload would.
    const tampered = spine.resolve(fact.id);
    (tampered as { origin: unknown }).origin = {
      kind: 'MODEL_INFERENCE',
      reasoning: 'y',
      derivedFrom: ['CLM-dddddddddddddddddddddddddd'],
      runId: RUN,
      stage: 'analyst',
    };

    const coverage = measureOriginCoverage(spine);
    expect(coverage.covered).toBe(0);
    expect(coverage.uncovered[0].reason).toMatch(/not in this run/);
  });

  it('counts a claim as uncovered when its origin resolves back to itself', () => {
    const { spine, fact } = spineWithOneFact();
    const self = spine.resolve(fact.id);
    (self as { origin: unknown }).origin = {
      kind: 'MODEL_INFERENCE',
      reasoning: 'y',
      derivedFrom: [fact.id],
      runId: RUN,
      stage: 'analyst',
    };

    const coverage = measureOriginCoverage(spine);
    expect(coverage.uncovered[0].reason).toMatch(/its own justification/);
  });
});

describe('15 · the origin-coverage gate', () => {
  it('is set at 100%, which is the threshold the PRD states', () => {
    /*
     * CAP-03 success criteria: "100% of visible statements carry an origin."
     * Appendix A, principle 4: "100% of visible statements show a source."
     *
     * The ≥85% figure in PRD v1.1.1 is CAP-04's question proposal acceptance
     * and has nothing to do with origin. Implementing 85% here would be
     * inventing a threshold; 100% is the one the document specifies.
     */
    expect(ORIGIN_COVERAGE_THRESHOLD).toBe(1);
    expect(UNRELATED_85_PERCENT_METRIC.metric).toBe('Question proposal acceptance');
    expect(UNRELATED_85_PERCENT_METRIC.bar).toContain('85%');
  });

  it('passes a spine in which every visible statement is attributed', () => {
    const { spine } = spineWithOneFact();
    expect(assertOriginCoverage(spine).passes).toBe(true);
  });

  it('fails the whole reading rather than hiding the unattributed statement', () => {
    const { spine, fact } = spineWithOneFact();
    (spine.resolve(fact.id) as { origin: unknown }).origin = { kind: 'ARTIFACT', evidence: '' };

    const error = (() => {
      try {
        assertOriginCoverage(spine);
        return null;
      } catch (e) {
        return e as OriginCoverageError;
      }
    })();

    expect(error).toBeInstanceOf(OriginCoverageError);
    // CAP-03's failure state: the statement is not shown, and the reading does
    // not quietly pass with it filtered out.
    expect(error?.coverage.passes).toBe(false);
    expect(spine.size).toBe(1);
  });

  it('would still fail a reading that is 86% attributed', () => {
    const spine = new ClaimSpine(RUN);
    for (let i = 0; i < 7; i++) {
      spine.add({
        text: `Statement ${i}`,
        epistemicStatus: 'FACT',
        origin: { kind: 'ARTIFACT', evidence: 'x', runId: RUN, stage: 'analyst' },
        producedBy: 'analyst',
      });
    }
    const last = spine.all()[6];
    (last as { origin: unknown }).origin = { kind: 'ARTIFACT', evidence: '' };

    const coverage = measureOriginCoverage(spine);
    expect(coverage.ratio).toBeCloseTo(6 / 7, 5); // ≈ 0.857
    expect(coverage.passes).toBe(false);
  });
});
