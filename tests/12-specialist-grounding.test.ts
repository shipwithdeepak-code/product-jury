import { afterEach, describe, expect, it } from 'vitest';
import { runUXResearcherAgent } from '../server/agents/uxResearcherAgent';
import { runProductStrategistAgent } from '../server/agents/productStrategistAgent';
import { buildSuppliedContent } from '../server/agents/promptContext';
import { __setGenAIClientForTests } from '../server/geminiClient';
import { ClaimSpine } from '../server/claims/spine';
import { buildSpineFromAnalystReading } from '../server/claims/fromAnalyst';
import {
  groundSpecialistPositions,
  readSpecialistPositions,
  recordSpecialistDependencies,
} from '../server/claims/positions';
import { isPositionId, mintPositionId } from '../server/claims/identity';
import { measureOriginCoverage } from '../server/claims/originCoverage';
import { renderClaimBlock } from '../server/claims/specialistInput';
import { UNTRUSTED_MARKERS } from '../server/integrity/untrusted';
import { caught, shortRun, stubProvider, violationFrom } from './helpers';
import type { AnalystReading, ProductContext } from '../src/types';
import {
  E_MIXED_ARTIFACT,
  H_ARTIFACT_WITH_INSTRUCTIONS,
} from '../evaluation/fixtures/analyst-readings';
import {
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
  SPECIALIST_FIXTURES,
  withForeignId,
} from '../evaluation/fixtures/specialist-positions';

/**
 * Stage 2.5 · FR-9. A specialist position names the statements it rests on.
 *
 * PRD v1.1.1 FR-9, CAP-05, CAP-03, §42, §51, §52.
 *
 * The invariant this suite exists to hold: a position that cannot be traced to
 * the Claim Spine never reaches a later stage. Not as a weaker position, not
 * with its bad citation removed, not at all.
 */

afterEach(() => {
  __setGenAIClientForTests(null);
});

const RUN = 'fr9-run';
const STAGE = 'specialist_ux';

const reading = (fixture: { reading: unknown }) => fixture.reading as AnalystReading;

function spineForRun(runId = RUN) {
  return buildSpineFromAnalystReading(reading(E_MIXED_ARTIFACT), runId).spine;
}

const context: ProductContext = {
  name: 'Atlas',
  whatBuilding: 'An onboarding wizard',
  targetUser: 'Ops managers',
  primaryGoal: 'Raise day-14 activation',
};

/** What each lens must return for the run to proceed. */
function uxResponse(positions: unknown) {
  return {
    agentRole: 'UX_RESEARCHER',
    summary: 'The flow blocks before it pays off.',
    strengths: ['The step header is legible.'],
    frictions: [{ friction: 'Step 3 blocks', severity: 'high', visualEvidence: 'the header' }],
    userRisks: [{ risk: 'Abandonment', severity: 'high', whyItMatters: 'Setup never completes.' }],
    researchQuestions: ['Where do users actually stop?'],
    recommendations: ['Let the step be skipped.'],
    confidence: 60,
    positions,
  };
}

function strategyResponse(positions: unknown) {
  return {
    agentRole: 'PRODUCT_MANAGER',
    summary: 'The goal and the flow are not aligned.',
    goalAlignment: { isAligned: false, score: 40, rationale: 'The flow delays the payoff.' },
    strategicRisks: [{ risk: 'Activation stalls', severity: 'high', impact: 'Adoption' }],
    valueHypotheses: [
      { hypothesis: 'Faster setup raises activation', expectedPayoff: 'More activations', validationStatus: 'UNVALIDATED' },
    ],
    validationNeeds: ['Step-level drop-off'],
    recommendations: ['Instrument the step.'],
    confidence: 55,
    positions,
  };
}

function runUx(positions: unknown, spine: ClaimSpine) {
  const { client, calls } = stubProvider(() => ({ text: JSON.stringify(uxResponse(positions)) }));
  __setGenAIClientForTests(client);
  const { budget, recorder } = shortRun();
  return {
    calls,
    run: () => runUXResearcherAgent({ context, decisionQuestion: 'Should we ship the redesigned export flow before the Q4 freeze?', rawEvidence: '', spine, budget, recorder }),
  };
}

function runStrategy(positions: unknown, spine: ClaimSpine) {
  const { client } = stubProvider(() => ({ text: JSON.stringify(strategyResponse(positions)) }));
  __setGenAIClientForTests(client);
  const { budget, recorder } = shortRun();
  return runProductStrategistAgent({ context, decisionQuestion: 'Should we ship the redesigned export flow before the Q4 freeze?', rawEvidence: '', spine, budget, recorder });
}

describe('1 · the specialist position schema', () => {
  it('carries what it holds, why, and the statements it rests on', () => {
    const spine = spineForRun();
    const [position] = readSpecialistPositions(A_CLEAN_GROUNDING.build(spine), spine, STAGE);

    expect(position.position.length).toBeGreaterThan(0);
    expect(position.reasoning.length).toBeGreaterThan(0);
    expect(position.citedClaims.length).toBe(2);
    expect(position.producedBy).toBe(STAGE);
    expect(position.runId).toBe(RUN);
    expect(isPositionId(position.id)).toBe(true);
  });

  it('gives a position an id that is not a claim id and is the same every time', () => {
    const spine = spineForRun();
    const first = readSpecialistPositions(A_CLEAN_GROUNDING.build(spine), spine, STAGE);
    const second = readSpecialistPositions(A_CLEAN_GROUNDING.build(spine), spine, STAGE);

    expect(first[0].id).toBe(second[0].id);
    expect(first[0].id.startsWith('POS-')).toBe(true);
    // A position is not a statement, so its id can never pass as one.
    expect(first[0].id.startsWith('CLM-')).toBe(false);
    expect(
      mintPositionId({ runId: RUN, producedBy: STAGE, text: first[0].position })
    ).toBe(first[0].id);
  });

  it('refuses a response that is not a list of positions', () => {
    const spine = spineForRun();
    for (const bad of [undefined, null, {}, 'positions', 42]) {
      expect(() => readSpecialistPositions(bad, spine, STAGE)).toThrow();
    }
  });

  it('refuses a lens that took no position at all', () => {
    const spine = spineForRun();
    expect(() => readSpecialistPositions([], spine, STAGE)).toThrow();
  });
});

describe('2 · citations are required, not requested', () => {
  it('refuses a substantive position that cites nothing', () => {
    const spine = spineForRun();
    expect(
      violationFrom(() => readSpecialistPositions(B_MISSING_CITATION.build(spine), spine, STAGE))
    ).toMatch(/cites no statement/);
  });

  it('does not rely on the prompt to enforce it', () => {
    /*
     * The prompt does ask. The point of this test is that asking is not the
     * mechanism: the same response fails whether or not the instruction was
     * there, because the contract is checked on the way back.
     */
    const spine = spineForRun();
    const uncited = [
      { position: 'It seems risky.', reasoning: 'A feeling.', citedClaims: [] },
    ];
    expect(() => groundSpecialistPositions(uncited, spine, STAGE)).toThrow();
    expect(spine.loadBearingClaims()).toEqual([]);
  });
});

describe('3 · a valid citation resolves against the run spine', () => {
  it('resolves every cited id to a claim in this run', () => {
    const spine = spineForRun();
    const positions = readSpecialistPositions(E_MULTIPLE_CITATIONS.build(spine), spine, STAGE);

    for (const position of positions) {
      for (const id of position.citedClaims) {
        const claim = spine.resolve(id);
        expect(claim.runId).toBe(RUN);
      }
    }
  });

  it('accepts every fixture the dataset marks valid, and refuses every one it does not', () => {
    for (const fixture of SPECIALIST_FIXTURES) {
      const spine =
        fixture === G_PROMPT_INJECTION
          ? buildSpineFromAnalystReading(reading(H_ARTIFACT_WITH_INSTRUCTIONS), RUN).spine
          : spineForRun();
      const foreign = spineForRun('a-different-decision').surfaced()[0].id;
      const raw = withForeignId(fixture.build(spine), foreign);

      if (fixture.valid) {
        expect(() => groundSpecialistPositions(raw, spine, STAGE), fixture.id).not.toThrow();
      } else {
        expect(() => groundSpecialistPositions(raw, spine, STAGE), fixture.id).toThrow();
      }
    }
  });
});

describe('4 · an invalid claim id is refused', () => {
  it('refuses an id that does not name a statement in this decision', () => {
    const spine = spineForRun();
    expect(
      violationFrom(() => readSpecialistPositions(C_UNKNOWN_CLAIM_ID.build(spine), spine, STAGE))
    ).toMatch(/not a statement in this decision/);
  });

  it('refuses a string that is not an id at all', () => {
    const spine = spineForRun();
    const [first] = spine.surfaced();
    for (const bad of ['the first fact', 'CLM-123', first.text, '', 7, null]) {
      const raw = [
        { position: 'A position.', reasoning: 'Because.', citedClaims: [first.id, bad] },
      ];
      expect(() => readSpecialistPositions(raw, spine, STAGE), String(bad)).toThrow();
    }
  });

  it('never drops the bad citation to keep the rest of the position', () => {
    const spine = spineForRun();
    let kept: unknown = 'not assigned';
    try {
      kept = groundSpecialistPositions(C_UNKNOWN_CLAIM_ID.build(spine), spine, STAGE);
    } catch {
      /* expected */
    }
    expect(kept).toBe('not assigned');
    // And nothing was half-recorded on the way out.
    expect(spine.loadBearingClaims()).toEqual([]);
  });
});

describe('5 · a claim id from another run is refused', () => {
  it('refuses an id minted by a different decision', () => {
    const spine = spineForRun();
    const other = spineForRun('a-different-decision');
    const foreign = other.surfaced()[0].id;

    // Same statement, same text, different run: a different id and not ours.
    expect(spine.has(foreign)).toBe(false);
    const raw = withForeignId(D_CROSS_RUN_CLAIM_ID.build(spine), foreign);
    expect(() => readSpecialistPositions(raw, spine, STAGE)).toThrow();
  });

  it('would refuse a claim carrying a foreign run id even if it were in the spine', () => {
    const spine = spineForRun();
    const [claim] = spine.surfaced();
    // Reach past the spine's own construction to make the case the id scheme
    // normally prevents. The check exists because "cannot happen" is where
    // silent failures live.
    (claim as { runId: string }).runId = 'a-different-decision';

    const raw = [
      { position: 'A position.', reasoning: 'Because.', citedClaims: [claim.id] },
    ];
    expect(violationFrom(() => readSpecialistPositions(raw, spine, STAGE))).toMatch(
      /different decision/
    );
  });
});

describe('6 · a reference from the wrong context is refused', () => {
  it('refuses a real statement that belongs to another decision', () => {
    const spine = spineForRun();
    const elsewhere = buildSpineFromAnalystReading(
      reading(H_ARTIFACT_WITH_INSTRUCTIONS),
      'another-artifact-entirely'
    ).spine;
    const raw = withForeignId(F_CLAIM_UNAVAILABLE.build(spine), elsewhere.surfaced()[0].id);

    expect(() => readSpecialistPositions(raw, spine, STAGE)).toThrow();
  });

  it('refuses a statement this lens was not shown', () => {
    // A claim that exists in the run but was never surfaced is still not
    // citable by something that could not have read it.
    const spine = spineForRun();
    const unsurfaced = spine.add({
      text: 'Internal bookkeeping that is never shown.',
      epistemicStatus: 'FACT',
      origin: { kind: 'ARTIFACT', evidence: 'nothing visible', runId: RUN, stage: 'analyst' },
      producedBy: 'analyst',
      surfaced: false,
    });

    const block = renderClaimBlock(spine);
    expect(block).not.toContain(unsurfaced.id);
  });
});

describe('7 · the dependency is recorded', () => {
  it('records the position as a dependant of every claim it cites', () => {
    const spine = spineForRun();
    const [position] = groundSpecialistPositions(A_CLEAN_GROUNDING.build(spine), spine, STAGE);

    for (const id of position.citedClaims) {
      const claim = spine.resolve(id);
      const entry = claim.supports.find((support) => support.dependantId === position.id);
      expect(entry).toBeDefined();
      expect(entry!.dependantKind).toBe('SPECIALIST_POSITION');
      expect(entry!.stage).toBe(STAGE);
    }
  });

  it('records a claim cited twice by one position as one dependency', () => {
    // The spine's existing rule for a repeated reference. The rule for a
    // repeated statement is different and is not being applied here.
    const spine = spineForRun();
    const [position] = groundSpecialistPositions(J_DUPLICATE_CITATION.build(spine), spine, STAGE);

    expect(position.citedClaims.length).toBe(1);
    const claim = spine.resolve(position.citedClaims[0]);
    expect(claim.supports.filter((s) => s.dependantId === position.id).length).toBe(1);
  });

  it('records nothing when any citation in the batch is bad', () => {
    const spine = spineForRun();
    const good = spine.surfaced()[0].id;
    const raw = [
      { position: 'A grounded position.', reasoning: 'Because.', citedClaims: [good] },
      { position: 'An ungrounded one.', reasoning: 'Because.', citedClaims: ['CLM-aaaaaaaaaaaaaaaaaaaaaaaaaa'] },
    ];

    expect(() => groundSpecialistPositions(raw, spine, STAGE)).toThrow();
    // The first position was never recorded, because the response was never
    // accepted. A partially recorded panel is a panel nobody can read.
    expect(spine.resolve(good).supports).toEqual([]);
  });
});

describe('8 · load-bearing is derived from the dependencies', () => {
  it('leaves every claim undetermined until something rests on it', () => {
    const spine = spineForRun();
    for (const claim of spine.all()) {
      expect(claim.loadBearing).toBe('NOT_YET_DETERMINED');
    }
  });

  it('makes a cited claim load-bearing and leaves the rest alone', () => {
    const spine = spineForRun();
    const [position] = groundSpecialistPositions(A_CLEAN_GROUNDING.build(spine), spine, STAGE);

    const cited = new Set(position.citedClaims);
    for (const claim of spine.all()) {
      expect(claim.loadBearing).toBe(cited.has(claim.id) ? 'LOAD_BEARING' : 'NOT_YET_DETERMINED');
    }
    expect(spine.loadBearingClaims().length).toBe(cited.size);
  });

  it('derives the same answer however many times it is asked', () => {
    const spine = spineForRun();
    groundSpecialistPositions(A_CLEAN_GROUNDING.build(spine), spine, STAGE);
    const first = spine.loadBearingClaims().map((claim) => claim.id).sort();
    spine.deriveLoadBearing();
    spine.deriveLoadBearing();
    expect(spine.loadBearingClaims().map((claim) => claim.id).sort()).toEqual(first);
  });
});

describe('9 · several positions, several dependencies', () => {
  it('records every position against every claim it cites', () => {
    const spine = spineForRun();
    const positions = groundSpecialistPositions(E_MULTIPLE_CITATIONS.build(spine), spine, STAGE);

    expect(positions.length).toBe(2);
    const edges = spine
      .all()
      .flatMap((claim) => claim.supports.map((support) => `${claim.id}:${support.dependantId}`));
    const expected = positions.flatMap((position) =>
      position.citedClaims.map((id) => `${id}:${position.id}`)
    );
    expect(edges.sort()).toEqual(expected.sort());
  });

  it('lets both lenses rest on the same claim without either overwriting the other', () => {
    const spine = spineForRun();
    const shared = spine.surfaced()[0].id;
    groundSpecialistPositions(
      [{ position: 'The UX reading.', reasoning: 'Because.', citedClaims: [shared] }],
      spine,
      'specialist_ux'
    );
    groundSpecialistPositions(
      [{ position: 'The strategy reading.', reasoning: 'Because.', citedClaims: [shared] }],
      spine,
      'specialist_strategy'
    );

    const claim = spine.resolve(shared);
    expect(claim.supports.length).toBe(2);
    expect(claim.supports.map((s) => s.stage).sort()).toEqual([
      'specialist_strategy',
      'specialist_ux',
    ]);
  });
});

describe('10 · the model cannot assert load-bearing', () => {
  it('refuses a position that carries the conclusion instead of the evidence', () => {
    const spine = spineForRun();
    expect(
      violationFrom(() =>
        readSpecialistPositions(I_MODEL_SETS_LOAD_BEARING.build(spine), spine, STAGE)
      )
    ).toMatch(/not part of a position/);
  });

  it('has no field on a position through which a model could set it', () => {
    const spine = spineForRun();
    const [position] = readSpecialistPositions(A_CLEAN_GROUNDING.build(spine), spine, STAGE);
    expect(Object.keys(position).sort()).toEqual([
      'citedClaims',
      'id',
      'position',
      'producedBy',
      'reasoning',
      'runId',
    ]);
  });

  it('takes load-bearing away again if the dependency goes', () => {
    // Derivation, not a flag: the status follows the graph in both directions.
    const spine = spineForRun();
    const [position] = groundSpecialistPositions(A_CLEAN_GROUNDING.build(spine), spine, STAGE);
    const claim = spine.resolve(position.citedClaims[0]);
    expect(claim.loadBearing).toBe('LOAD_BEARING');

    claim.supports.length = 0;
    spine.deriveLoadBearing();
    expect(claim.loadBearing).toBe('NOT_YET_DETERMINED');
  });
});

describe('11 · a malformed specialist response fails honestly', () => {
  it('fails the lens with a schema violation naming what was wrong', async () => {
    const spine = spineForRun();
    const { run } = runUx(C_UNKNOWN_CLAIM_ID.build(spine), spine);

    const error = await run().then(
      () => null,
      (thrown) => caught(thrown)
    );

    expect(error).not.toBeNull();
    expect(error!.code).toBe('SCHEMA_VIOLATION');
    expect(error!.stage).toBe('specialist_ux');
  });

  it('fails the lens when the response carries no positions at all', async () => {
    const spine = spineForRun();
    const { client } = stubProvider(() => {
      const response = uxResponse([]) as Record<string, unknown>;
      delete response.positions;
      return { text: JSON.stringify(response) };
    });
    __setGenAIClientForTests(client);
    const { budget, recorder } = shortRun();

    await expect(
      runUXResearcherAgent({ context, decisionQuestion: 'Should we ship the redesigned export flow before the Q4 freeze?', rawEvidence: '', spine, budget, recorder })
    ).rejects.toThrow();
  });
});

describe('12 · there is no fallback', () => {
  it('returns nothing rather than a review with the citations stripped', async () => {
    const spine = spineForRun();
    const { run } = runUx(B_MISSING_CITATION.build(spine), spine);
    const result = await run().catch(() => 'threw' as const);

    expect(result).toBe('threw');
  });

  it('does not ask a smaller model the same question after a bad citation', async () => {
    const spine = spineForRun();
    const { calls, run } = runUx(C_UNKNOWN_CLAIM_ID.build(spine), spine);
    await run().catch(() => undefined);

    // A response the product refuses is not a capacity problem.
    expect(calls.length).toBe(1);
  });

  it('has no path that builds a position out of claim text', () => {
    const spine = spineForRun();
    const [claim] = spine.surfaced();
    const raw = [
      { position: 'A position.', reasoning: 'Because.', citedClaims: [claim.text] },
    ];
    // The text of the very claim that was meant. Still refused: a citation is
    // an id, and nothing is matched by resemblance.
    expect(violationFrom(() => readSpecialistPositions(raw, spine, STAGE))).toMatch(
      /not a statement id/
    );
  });
});

describe('13 · the UX lens is grounded', () => {
  it('returns positions citing claims, and records them', async () => {
    const spine = spineForRun();
    const { run } = runUx(A_CLEAN_GROUNDING.build(spine), spine);
    const result = await run();

    expect(result.positions.length).toBe(1);
    for (const id of result.positions[0].citedClaims) {
      expect(spine.resolve(id).loadBearing).toBe('LOAD_BEARING');
    }
    expect(result.positions[0].producedBy).toBe('specialist_ux');
  });

  it('is given the statements with their ids in the prompt', () => {
    const spine = spineForRun();
    const supplied = buildSuppliedContent(context, '', { spine, decisionQuestion: 'Should we ship the redesigned export flow before the Q4 freeze?' });

    for (const claim of spine.surfaced()) {
      expect(supplied.block).toContain(claim.id);
    }
  });
});

describe('14 · the strategy lens is grounded', () => {
  it('returns positions citing claims, and records them under its own stage', async () => {
    const spine = spineForRun();
    const result = await runStrategy(E_MULTIPLE_CITATIONS.build(spine), spine);

    expect(result.positions.length).toBe(2);
    for (const position of result.positions) {
      expect(position.producedBy).toBe('specialist_strategy');
      for (const id of position.citedClaims) {
        const claim = spine.resolve(id);
        expect(claim.supports.some((s) => s.stage === 'specialist_strategy')).toBe(true);
      }
    }
  });
});

describe('15 · disagreement survives', () => {
  it('keeps two lenses citing different claims without reconciling them', async () => {
    const spine = spineForRun();
    const surfaced = spine.surfaced();

    const ux = await runUx(H_DISAGREEMENT.build(spine), spine).run();
    const strategy = await runStrategy(
      [
        {
          position: 'What is on the screen is not enough to act on.',
          reasoning: 'The question that would settle it is open.',
          citedClaims: [surfaced[surfaced.length - 1].id],
        },
      ],
      spine
    );

    expect(ux.positions[0].position).not.toBe(strategy.positions[0].position);
    expect(ux.positions[0].citedClaims).not.toEqual(strategy.positions[0].citedClaims);
    // Both stand. Nothing here scores them, merges them or picks one.
    expect(spine.loadBearingClaims().length).toBe(2);
  });

  it('produces no verdict, no agreement score and no chair at this stage', () => {
    const spine = spineForRun();
    const [position] = readSpecialistPositions(A_CLEAN_GROUNDING.build(spine), spine, STAGE);
    const serialized = JSON.stringify(position);

    for (const absent of ['verdict', 'agreement', 'consensus', 'finalPosition']) {
      expect(serialized).not.toContain(absent);
    }
  });
});

describe('16 · the untrusted boundary is unchanged', () => {
  it('lets a lens describe an instruction on the screen without obeying it', async () => {
    const spine = buildSpineFromAnalystReading(reading(H_ARTIFACT_WITH_INSTRUCTIONS), RUN).spine;
    const { run } = runUx(G_PROMPT_INJECTION.build(spine), spine);
    const result = await run();

    expect(result.positions.length).toBe(1);
    // The position is about the text. It is not the verdict the text asked for.
    expect(result.positions[0].position).not.toMatch(/\b(SHIP|KILL|ITERATE)\b/);
    const cited = spine.resolve(result.positions[0].citedClaims[0]);
    expect(cited.epistemicStatus).toBe('FACT');
  });

  it('still keeps every statement inside the delimited block', () => {
    const spine = buildSpineFromAnalystReading(reading(H_ARTIFACT_WITH_INSTRUCTIONS), RUN).spine;
    const supplied = buildSuppliedContent(context, '', { spine, decisionQuestion: 'Should we ship the redesigned export flow before the Q4 freeze?' });
    const opened = supplied.block.indexOf(UNTRUSTED_MARKERS.OPEN);
    const closed = supplied.block.lastIndexOf(UNTRUSTED_MARKERS.CLOSE);

    for (const claim of spine.surfaced()) {
      const at = supplied.block.indexOf(claim.text);
      expect(at).toBeGreaterThan(opened);
      expect(at).toBeLessThan(closed);
    }
  });

  it('keeps the citation instruction in the system prompt, where no supplied text goes', async () => {
    const { readFile } = await import('node:fs/promises');
    for (const path of [
      'server/agents/uxResearcherAgent.ts',
      'server/agents/productStrategistAgent.ts',
    ]) {
      const source = await readFile(path, 'utf8');
      const blocks = source.match(/systemInstruction\s*=\s*`[\s\S]*?`;/g) ?? [];
      expect(blocks.length).toBe(1);
      expect(blocks[0]).toContain('CITING THE STATEMENTS YOU WERE GIVEN');
      // SR-2: nothing supplied is interpolated into instruction context.
      expect(blocks[0]).not.toMatch(/\$\{/);
    }
  });
});

describe('17 · Stage 1 holds', () => {
  it('still throws rather than substituting a review when the provider fails', async () => {
    const spine = spineForRun();
    const { client } = stubProvider(() => {
      throw new Error('503 The model is overloaded. Please try again later.');
    });
    __setGenAIClientForTests(client);
    const { budget, recorder } = shortRun();

    await expect(
      runUXResearcherAgent({ context, decisionQuestion: 'Should we ship the redesigned export flow before the Q4 freeze?', rawEvidence: '', spine, budget, recorder })
    ).rejects.toThrow();
  });

  it('still refuses a response with no confidence figure', async () => {
    const spine = spineForRun();
    const { client } = stubProvider(() => {
      const response = uxResponse(A_CLEAN_GROUNDING.build(spine)) as Record<string, unknown>;
      delete response.confidence;
      return { text: JSON.stringify(response) };
    });
    __setGenAIClientForTests(client);
    const { budget, recorder } = shortRun();

    await expect(
      runUXResearcherAgent({ context, decisionQuestion: 'Should we ship the redesigned export flow before the Q4 freeze?', rawEvidence: '', spine, budget, recorder })
    ).rejects.toThrow();
  });
});

describe('18 · Stage 2 holds', () => {
  it('leaves the statements, their kinds and their origins exactly as they were', () => {
    const spine = spineForRun();
    const before = spine.all().map((claim) => `${claim.id}|${claim.epistemicStatus}|${claim.text}`);
    groundSpecialistPositions(E_MULTIPLE_CITATIONS.build(spine), spine, STAGE);
    const after = spine.all().map((claim) => `${claim.id}|${claim.epistemicStatus}|${claim.text}`);

    expect(after).toEqual(before);
  });

  it('still refuses a duplicate statement while accepting a repeated citation', () => {
    const spine = spineForRun();
    const [claim] = spine.surfaced();

    // The two rules, side by side, unchanged from Stage 2.
    expect(() =>
      spine.add({
        text: claim.text,
        epistemicStatus: claim.epistemicStatus,
        origin: claim.origin,
        producedBy: claim.producedBy,
      })
    ).toThrow(/duplicate claim/);
    expect(() =>
      groundSpecialistPositions(J_DUPLICATE_CITATION.build(spine), spine, STAGE)
    ).not.toThrow();
  });
});

describe('19 · origin coverage is still 100%', () => {
  it('stays complete after the dependencies are recorded', () => {
    const spine = spineForRun();
    groundSpecialistPositions(E_MULTIPLE_CITATIONS.build(spine), spine, STAGE);

    const coverage = measureOriginCoverage(spine);
    expect(coverage.threshold).toBe(1);
    expect(coverage.ratio).toBe(1);
    expect(coverage.passes).toBe(true);
    expect(coverage.uncovered).toEqual([]);
  });

  it('is not relaxed by anything this stage added', () => {
    const spine = spineForRun();
    groundSpecialistPositions(A_CLEAN_GROUNDING.build(spine), spine, STAGE);
    // One statement with a broken origin still fails the whole reading.
    const [claim] = spine.surfaced();
    (claim as { origin: unknown }).origin = { kind: 'ARTIFACT', evidence: '', runId: RUN, stage: 'analyst' };

    expect(measureOriginCoverage(spine).passes).toBe(false);
  });
});

describe('20 · the spine still serialises and revalidates', () => {
  it('round-trips with the dependencies and the derived status intact', () => {
    const spine = spineForRun();
    const positions = groundSpecialistPositions(E_MULTIPLE_CITATIONS.build(spine), spine, STAGE);

    const rebuilt = ClaimSpine.fromJSON(JSON.parse(JSON.stringify(spine.toJSON())));

    expect(rebuilt.all().map((claim) => claim.id)).toEqual(spine.all().map((claim) => claim.id));
    expect(rebuilt.loadBearingClaims().map((claim) => claim.id).sort()).toEqual(
      spine.loadBearingClaims().map((claim) => claim.id).sort()
    );
    for (const position of positions) {
      for (const id of position.citedClaims) {
        expect(
          rebuilt.resolve(id).supports.some((s) => s.dependantId === position.id)
        ).toBe(true);
      }
    }
    expect(measureOriginCoverage(rebuilt).passes).toBe(true);
  });

  it('refuses a serialised spine whose dependency names nothing', () => {
    const spine = spineForRun();
    groundSpecialistPositions(A_CLEAN_GROUNDING.build(spine), spine, STAGE);
    const tampered = spine.toJSON();
    const carrying = tampered.claims.find((claim) => claim.supports.length > 0)!;
    carrying.supports[0] = { ...carrying.supports[0], dependantId: '' };

    expect(() => ClaimSpine.fromJSON(tampered)).toThrow();
  });

  it('records the dependency and derives the status in that order, never the reverse', () => {
    const spine = spineForRun();
    const [claim] = spine.surfaced();
    const positions = readSpecialistPositions(
      [{ position: 'A position.', reasoning: 'Because.', citedClaims: [claim.id] }],
      spine,
      STAGE
    );

    // Read, and nothing has changed on the spine yet.
    expect(claim.supports).toEqual([]);
    expect(claim.loadBearing).toBe('NOT_YET_DETERMINED');

    recordSpecialistDependencies(spine, positions, STAGE);
    expect(claim.supports.length).toBe(1);
    expect(claim.loadBearing).toBe('LOAD_BEARING');
  });
});
