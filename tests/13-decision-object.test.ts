import { describe, it, expect } from 'vitest';

import {
  closeOpenLoop,
  commitVersion,
  createDecision,
  currentVersion,
  decisionState,
  deserializeDecision,
  listingFor,
  movesPositionOrConfidence,
  recordDecisionOpened,
  recordOpenLoop,
  serializeDecision,
  versionStageOutcomes,
} from '../server/decision/decision';
import { DecisionValidationError } from '../server/decision/serialization';
import { InMemoryDecisionStore, DecisionStoreError } from '../server/decision/store';
import { mintVersionId, isDecisionId, isVersionId, isOpenLoopId } from '../server/decision/identity';
import { projectDecisionEvents, projectEvent } from '../server/decision/telemetryProjection';
import { decisionFromRun, LegacyConversionError } from '../server/decision/fromLegacy';
import { buildSampleDecision, buildSampleSpine } from '../server/decision/sampleDecision';
import { DECISION_SCHEMA_VERSION } from '../src/types/decision';
import type { Decision } from '../src/types/decision';
import { ClaimSpine } from '../server/claims/spine';
import { groundSpecialistPositions } from '../server/claims/positions';
import { FORBIDDEN_EVENT_FIELDS, validateEvent } from '../server/integrity/telemetry';
import { failed, verdict } from '../server/integrity/outcome';
import { ProductJuryError } from '../server/integrity/errors';
import {
  richRecord,
  richProvenance,
  richVerdict,
  ROUND_TRIP_AT,
  ROUND_TRIP_RUN_ID,
} from '../evaluation/fixtures/decision-records';

/**
 * Stage 3 · The Decision object.
 *
 * PRD v1.1.1 §17, CAP-12, CAP-13, CAP-19, FR-23, FR-24, FR-25, FR-37, FR-38,
 * FR-39, PR-4, PR-8, TEL-2, TEL-3, TEL-9, NFR-5, NFR-6.
 *
 * What these tests are about: a decision that has been through Stages 1, 2 and
 * 2.5 has to survive being written down and read back without losing a claim
 * id, a citation, a dependency edge, a run id or the truth about which stages
 * ran. Every group below is one way of losing one of those.
 */

const QUESTION = 'Should we redesign the onboarding wizard before the Q4 activation push?';

const clockFrom = (start: string) => {
  let tick = 0;
  return () => new Date(Date.parse(start) + tick++ * 1000).toISOString();
};

function baseDecision(overrides: Partial<Parameters<typeof createDecision>[0]> = {}): Decision {
  const record = richRecord();
  return createDecision({
    decisionQuestion: QUESTION,
    claimSpine: record.spine.toJSON(),
    specialistPositions: record.positions,
    runMeta: record.runMeta,
    outcome: record.outcome,
    verdict: record.verdict,
    clock: clockFrom(ROUND_TRIP_AT),
    ...overrides,
  });
}

function withSecondVersion(decision: Decision): Decision {
  const second = richRecord('run-stage-3-second');
  return commitVersion(decision, {
    trigger: 'evidence',
    decisionQuestion: QUESTION,
    claimSpine: second.spine.toJSON(),
    specialistPositions: second.positions,
    runMeta: richProvenance('run-stage-3-second'),
    outcome: { kind: 'VERDICT' },
    verdict: { ...richVerdict(), confidence: 44 },
    clock: clockFrom('2026-09-30T10:00:00.000Z'),
  });
}

// A · Decision creation
describe('A · a decision is created from a run, without a save action', () => {
  it('creates a decision holding one version', () => {
    const decision = baseDecision();
    expect(decision.versions).toHaveLength(1);
    expect(decision.versions[0].versionNumber).toBe(1);
    expect(decision.schemaVersion).toBe(DECISION_SCHEMA_VERSION);
  });

  it('carries the decision question as the decision, not as a version detail', () => {
    expect(baseDecision().decisionQuestion).toBe(QUESTION);
  });

  it('starts with no open loops and a log that records the creation', () => {
    const decision = baseDecision();
    expect(decision.openLoops).toEqual([]);
    expect(decision.eventLog[0].kind).toBe('decision_created');
  });
});

// B · Decision identity
describe('B · a decision has one identity for as long as it exists', () => {
  it('mints an opaque id that is not derived from the question', () => {
    const first = baseDecision();
    const second = baseDecision();
    expect(isDecisionId(first.id)).toBe(true);
    // Two decisions asking the same question are two decisions (§17).
    expect(first.id).not.toBe(second.id);
  });

  it('keeps the same id across a new version', () => {
    const decision = baseDecision();
    expect(withSecondVersion(decision).id).toBe(decision.id);
  });

  it('refuses a stored decision whose id is not a decision id', () => {
    const broken = { ...serializeDecision(baseDecision()), id: 'decision-1' };
    expect(() => deserializeDecision(broken)).toThrow(DecisionValidationError);
  });
});

// C · Version 1 creation
describe('C · the first committed state is version 1', () => {
  it('numbers it 1 and records its trigger as initial', () => {
    const version = currentVersion(baseDecision());
    expect(version.versionNumber).toBe(1);
    expect(version.trigger).toBe('initial');
  });

  it('gives it the identity §17 defines: decision plus sequence number', () => {
    const decision = baseDecision();
    expect(decision.versions[0].id).toBe(mintVersionId(decision.id, 1));
    expect(isVersionId(decision.versions[0].id)).toBe(true);
  });

  it('logs decision_created rather than version_created for the first version', () => {
    const kinds = baseDecision().eventLog.map((entry) => entry.kind);
    expect(kinds).toContain('decision_created');
    expect(kinds).not.toContain('version_created');
  });
});

// D · Version immutability
describe('D · a committed version is not edited in place', () => {
  it('freezes the version', () => {
    const version = currentVersion(baseDecision());
    expect(Object.isFrozen(version)).toBe(true);
  });

  it('throws when a field of a committed version is assigned', () => {
    const version = currentVersion(baseDecision());
    expect(() => {
      (version as unknown as Record<string, unknown>).decisionQuestion = 'something else';
    }).toThrow(TypeError);
  });

  it('throws when a claim inside a committed version is edited', () => {
    const version = currentVersion(baseDecision());
    expect(() => {
      (version.claimSpine.claims[0] as unknown as Record<string, unknown>).text = 'rewritten';
    }).toThrow(TypeError);
  });

  it('throws when a specialist position inside a committed version is edited', () => {
    const version = currentVersion(baseDecision());
    expect(() => {
      (version.specialistPositions[0] as unknown as Record<string, unknown>).position = 'rewritten';
    }).toThrow(TypeError);
  });

  it('does not hold a live reference to the spine the run is still using', () => {
    const record = richRecord();
    const decision = createDecision({
      decisionQuestion: QUESTION,
      claimSpine: record.spine.toJSON(),
      specialistPositions: record.positions,
      runMeta: record.runMeta,
      outcome: record.outcome,
      verdict: record.verdict,
      clock: clockFrom(ROUND_TRIP_AT),
    });
    // The caller's own objects are untouched: committing a version is a
    // recording, not a seizure.
    expect(Object.isFrozen(record.positions)).toBe(false);
    expect(decision.versions[0].specialistPositions[0].id).toBe(record.positions[0].id);
  });
});

// E · Version 2 creation
describe('E · a re-judgement creates a new version', () => {
  it('appends version 2 and moves the current version', () => {
    const first = baseDecision();
    const second = withSecondVersion(first);
    expect(second.versions).toHaveLength(2);
    expect(second.currentVersionId).toBe(second.versions[1].id);
    expect(second.versions[1].versionNumber).toBe(2);
  });

  it('records what triggered it, in §55 vocabulary', () => {
    const second = withSecondVersion(baseDecision());
    expect(second.versions[1].trigger).toBe('evidence');
    const created = second.eventLog.find((entry) => entry.kind === 'version_created');
    expect(created?.trigger).toBe('evidence');
    expect(created?.versionNumber).toBe(2);
  });

  it('leaves the decision it was given unchanged', () => {
    const first = baseDecision();
    withSecondVersion(first);
    expect(first.versions).toHaveLength(1);
  });

  it('applies §17’s own test for a revision that must become a version', () => {
    const decision = baseDecision();
    const version = currentVersion(decision);
    const unchanged = {
      decisionQuestion: QUESTION,
      claimSpine: version.claimSpine,
      specialistPositions: [...version.specialistPositions],
      runMeta: version.runMeta,
      outcome: version.outcome,
      verdict: richVerdict(),
    };
    expect(movesPositionOrConfidence(version, unchanged)).toBe(false);
    expect(
      movesPositionOrConfidence(version, { ...unchanged, verdict: { ...richVerdict(), confidence: 44 } })
    ).toBe(true);
    expect(
      movesPositionOrConfidence(version, { ...unchanged, verdict: { ...richVerdict(), outcome: 'KILL' } })
    ).toBe(true);
  });
});

// F · Historical preservation
describe('F · earlier versions are retained whole', () => {
  it('keeps version 1 readable after version 2 exists', () => {
    const first = baseDecision();
    const second = withSecondVersion(first);
    expect(second.versions[0]).toEqual(first.versions[0]);
  });

  it('refuses to let version 1 be edited once version 2 exists', () => {
    const second = withSecondVersion(baseDecision());
    expect(() => {
      (second.versions[0] as unknown as Record<string, unknown>).trigger = 'rejudge';
    }).toThrow(TypeError);
  });

  it('keeps each version’s own verdict rather than the latest one', () => {
    const second = withSecondVersion(baseDecision());
    expect(second.versions[0].verdict?.confidence).toBe(61);
    expect(second.versions[1].verdict?.confidence).toBe(44);
  });
});

// G · Claim preservation
describe('G · claims survive as claims', () => {
  it('stores the spine, not a list of strings', () => {
    const version = currentVersion(baseDecision());
    expect(version.claimSpine.version).toBe(1);
    expect(version.claimSpine.claims.length).toBeGreaterThanOrEqual(4);
    for (const claim of version.claimSpine.claims) {
      expect(typeof claim.text).toBe('string');
      expect(claim.origin.kind).toBeTruthy();
      expect(claim.epistemicStatus).toBeTruthy();
    }
  });

  it('keeps every epistemic status and every origin kind the run produced', () => {
    const version = currentVersion(baseDecision());
    const statuses = new Set(version.claimSpine.claims.map((claim) => claim.epistemicStatus));
    const origins = new Set(version.claimSpine.claims.map((claim) => claim.origin.kind));
    expect(statuses).toContain('FACT');
    expect(statuses).toContain('INFERENCE');
    expect(statuses).toContain('ASSUMPTION');
    expect(statuses).toContain('UNKNOWN');
    expect(statuses).toContain('PM_STATEMENT');
    expect(origins.size).toBeGreaterThanOrEqual(4);
  });

  it('keeps the open questions attached to their UNKNOWN', () => {
    const version = currentVersion(baseDecision());
    expect(version.claimSpine.openQuestions).toHaveLength(1);
    const question = version.claimSpine.openQuestions[0];
    const unknown = version.claimSpine.claims.find((claim) => claim.id === question.claimId);
    expect(unknown?.epistemicStatus).toBe('UNKNOWN');
  });
});

// H · Claim ID preservation
describe('H · claim ids are the record, and they do not move', () => {
  it('keeps the exact ids the run minted', () => {
    const record = richRecord();
    const before = record.spine.all().map((claim) => claim.id);
    const decision = createDecision({
      decisionQuestion: QUESTION,
      claimSpine: record.spine.toJSON(),
      specialistPositions: record.positions,
      runMeta: record.runMeta,
      outcome: record.outcome,
      clock: clockFrom(ROUND_TRIP_AT),
    });
    expect(currentVersion(decision).claimSpine.claims.map((claim) => claim.id)).toEqual(before);
  });

  it('does not regenerate ids on the way back in', () => {
    const decision = baseDecision();
    const before = currentVersion(decision).claimSpine.claims.map((claim) => claim.id);
    const after = deserializeDecision(serializeDecision(decision));
    expect(currentVersion(after).claimSpine.claims.map((claim) => claim.id)).toEqual(before);
  });
});

// I · SpecialistPosition preservation
describe('I · specialist positions are part of the record', () => {
  it('stores both lenses’ positions on the version', () => {
    const version = currentVersion(baseDecision());
    expect(version.specialistPositions).toHaveLength(2);
    const lenses = version.specialistPositions.map((position) => position.producedBy);
    expect(lenses).toContain('specialist_ux');
    expect(lenses).toContain('specialist_strategy');
  });

  it('keeps the model-owned fields as the model wrote them', () => {
    const record = richRecord();
    const decision = createDecision({
      decisionQuestion: QUESTION,
      claimSpine: record.spine.toJSON(),
      specialistPositions: record.positions,
      runMeta: record.runMeta,
      outcome: record.outcome,
      clock: clockFrom(ROUND_TRIP_AT),
    });
    expect(currentVersion(decision).specialistPositions).toEqual(record.positions);
  });

  it('refuses a position carrying a field outside Stage 2.5’s schema', () => {
    const stored = serializeDecision(baseDecision()) as unknown as Record<string, unknown>;
    const versions = stored.versions as Record<string, unknown>[];
    const positions = versions[0].specialistPositions as Record<string, unknown>[];
    versions[0] = {
      ...versions[0],
      specialistPositions: [{ ...positions[0], loadBearing: true }, positions[1]],
    };
    expect(() => deserializeDecision(stored)).toThrow(/unexpected field "loadBearing"/);
  });
});

// J · Position ID preservation
describe('J · position ids survive, and are the identity of the position', () => {
  it('keeps the POS- ids across a round trip', () => {
    const decision = baseDecision();
    const before = currentVersion(decision).specialistPositions.map((position) => position.id);
    const after = deserializeDecision(serializeDecision(decision));
    expect(currentVersion(after).specialistPositions.map((position) => position.id)).toEqual(before);
  });

  it('refuses a position whose id does not belong to its text', () => {
    const stored = serializeDecision(baseDecision()) as unknown as Record<string, unknown>;
    const versions = stored.versions as Record<string, unknown>[];
    const positions = versions[0].specialistPositions as Record<string, unknown>[];
    versions[0] = {
      ...versions[0],
      specialistPositions: [{ ...positions[0], position: 'a different position entirely' }, positions[1]],
    };
    expect(() => deserializeDecision(stored)).toThrow(/is not the identity of the position/);
  });
});

// K · citedClaims preservation
describe('K · a position keeps the statements it cited', () => {
  it('keeps every citation, in order', () => {
    const decision = baseDecision();
    const before = currentVersion(decision).specialistPositions.map((p) => [...p.citedClaims]);
    const after = deserializeDecision(serializeDecision(decision));
    expect(currentVersion(after).specialistPositions.map((p) => [...p.citedClaims])).toEqual(before);
  });

  it('cites more than one statement, which is what the fixture is for', () => {
    const version = currentVersion(baseDecision());
    expect(version.specialistPositions[0].citedClaims.length).toBeGreaterThanOrEqual(2);
  });

  it('every citation resolves inside the version it is stored in', () => {
    const version = currentVersion(baseDecision());
    const ids = new Set(version.claimSpine.claims.map((claim) => claim.id));
    for (const position of version.specialistPositions) {
      for (const cited of position.citedClaims) expect(ids.has(cited)).toBe(true);
    }
  });
});

// L · Dependency preservation
describe('L · dependency edges are part of what is stored', () => {
  it('keeps the edges the specialists recorded', () => {
    const version = currentVersion(baseDecision());
    const edges = version.claimSpine.claims.flatMap((claim) => claim.supports);
    expect(edges.length).toBeGreaterThanOrEqual(4);
    for (const edge of edges) {
      expect(edge.dependantKind).toBe('SPECIALIST_POSITION');
      expect(typeof edge.stage).toBe('string');
    }
  });

  it('keeps each edge pointing at the position it came from', () => {
    const version = currentVersion(baseDecision());
    const positionIds = new Set(version.specialistPositions.map((position) => position.id));
    for (const claim of version.claimSpine.claims) {
      for (const edge of claim.supports) expect(positionIds.has(edge.dependantId)).toBe(true);
    }
  });

  it('keeps them across a round trip', () => {
    const decision = baseDecision();
    const before = currentVersion(decision).claimSpine.claims.map((claim) => claim.supports);
    const after = deserializeDecision(serializeDecision(decision));
    expect(currentVersion(after).claimSpine.claims.map((claim) => claim.supports)).toEqual(before);
  });
});

// M · loadBearing preservation and derivation
describe('M · load-bearing is derived from the edges, and stays that way', () => {
  it('marks the cited statements load-bearing and the rest not yet determined', () => {
    const version = currentVersion(baseDecision());
    const cited = new Set(version.specialistPositions.flatMap((position) => position.citedClaims));
    for (const claim of version.claimSpine.claims) {
      expect(claim.loadBearing).toBe(cited.has(claim.id) ? 'LOAD_BEARING' : 'NOT_YET_DETERMINED');
    }
    expect([...cited].length).toBeGreaterThanOrEqual(1);
  });

  it('keeps the derived status across a round trip', () => {
    const decision = baseDecision();
    const before = currentVersion(decision).claimSpine.claims.map((c) => [c.id, c.loadBearing]);
    const after = deserializeDecision(serializeDecision(decision));
    expect(currentVersion(after).claimSpine.claims.map((c) => [c.id, c.loadBearing])).toEqual(before);
  });

  it('still refuses a model that tries to assert it', () => {
    const spine = richRecord().spine;
    expect(() =>
      groundSpecialistPositions(
        [
          {
            position: 'The credential gate is the decisive thing here.',
            reasoning: 'Everything else follows from it.',
            citedClaims: [spine.surfaced()[0].id],
            loadBearing: true,
          },
        ],
        spine,
        'specialist_ux'
      )
    ).toThrow(ProductJuryError);
  });
});

// N · runId preservation
describe('N · a version knows which run produced it', () => {
  it('keeps the run id on the spine, on every claim and on every position', () => {
    const version = currentVersion(baseDecision());
    expect(version.claimSpine.runId).toBe(ROUND_TRIP_RUN_ID);
    for (const claim of version.claimSpine.claims) expect(claim.runId).toBe(ROUND_TRIP_RUN_ID);
    for (const position of version.specialistPositions) expect(position.runId).toBe(ROUND_TRIP_RUN_ID);
    expect(version.runMeta.runId).toBe(ROUND_TRIP_RUN_ID);
  });

  it('keeps two versions’ runs apart', () => {
    const second = withSecondVersion(baseDecision());
    expect(second.versions[0].claimSpine.runId).toBe(ROUND_TRIP_RUN_ID);
    expect(second.versions[1].claimSpine.runId).toBe('run-stage-3-second');
  });

  it('refuses a position stored against a version from another run', () => {
    const stored = serializeDecision(baseDecision()) as unknown as Record<string, unknown>;
    const versions = stored.versions as Record<string, unknown>[];
    const positions = versions[0].specialistPositions as Record<string, unknown>[];
    versions[0] = {
      ...versions[0],
      specialistPositions: [{ ...positions[0], runId: 'some-other-run' }, positions[1]],
    };
    expect(() => deserializeDecision(stored)).toThrow(/belong to run/);
  });
});

// O · Stage outcome preservation
describe('O · a stage is never complete because an object exists', () => {
  it('keeps every stage record, including the ones that did not run', () => {
    const stages = versionStageOutcomes(currentVersion(baseDecision()));
    expect(stages).toHaveLength(8);
    const notRun = stages.filter((stage) => stage.status === 'not_run');
    expect(notRun.length).toBe(3);
    for (const stage of notRun) expect(stage.reason).toBeTruthy();
  });

  it('refuses a stored version whose not-run stage carries no reason', () => {
    const stored = serializeDecision(baseDecision()) as unknown as Record<string, unknown>;
    const versions = stored.versions as Record<string, unknown>[];
    const runMeta = versions[0].runMeta as Record<string, unknown>;
    const stages = (runMeta.stages as Record<string, unknown>[]).map((stage) =>
      stage.status === 'not_run' ? { ...stage, reason: undefined } : stage
    );
    versions[0] = { ...versions[0], runMeta: { ...runMeta, stages } };
    expect(() => deserializeDecision(stored)).toThrow(/must carry the reason/);
  });

  it('stores a refusal as a refusal and a failure as a failure', () => {
    const record = richRecord();
    const refused = createDecision({
      decisionQuestion: QUESTION,
      claimSpine: record.spine.toJSON(),
      specialistPositions: record.positions,
      runMeta: record.runMeta,
      outcome: {
        kind: 'INSUFFICIENT',
        refusedAt: 'GATE',
        missing: [
          { item: 'Where accounts stop in the wizard', whyItMatters: 'It decides what to change', howToGetIt: 'A funnel query', bearsOnClaims: [] },
          { item: 'Who holds CRM admin rights', whyItMatters: 'It decides whether the gate is real', howToGetIt: 'Ask five trial accounts', bearsOnClaims: [] },
        ],
      },
      clock: clockFrom(ROUND_TRIP_AT),
    });
    expect(refused.versions[0].outcome.kind).toBe('INSUFFICIENT');
    expect(decisionState(refused)).toBe('awaiting_evidence');

    const broken = createDecision({
      decisionQuestion: QUESTION,
      claimSpine: record.spine.toJSON(),
      specialistPositions: record.positions,
      runMeta: record.runMeta,
      outcome: { kind: 'FAILED', code: 'PROVIDER_UNAVAILABLE', userMessage: 'The provider did not answer.', retryable: true, stage: 'chair' },
      clock: clockFrom(ROUND_TRIP_AT),
    });
    expect(broken.versions[0].outcome.kind).toBe('FAILED');
    expect(decisionState(broken)).toBe('failed');
  });

  it('refuses a refusal that names fewer than two missing items', () => {
    const stored = serializeDecision(baseDecision()) as unknown as Record<string, unknown>;
    const versions = stored.versions as Record<string, unknown>[];
    versions[0] = {
      ...versions[0],
      outcome: { kind: 'INSUFFICIENT', refusedAt: 'GATE', missing: [{ item: 'a', whyItMatters: 'b', howToGetIt: 'c', bearsOnClaims: [] }] },
    };
    expect(() => deserializeDecision(stored)).toThrow(/at least two specific missing items/);
  });
});

// P · Provenance preservation
describe('P · run metadata answers what served this decision', () => {
  it('keeps the model, the tier, the attempts and the cost', () => {
    const meta = currentVersion(baseDecision()).runMeta;
    const analyst = meta.stages.find((stage) => stage.stage === 'analyst');
    expect(analyst?.modelId).toBe('gemini-2.5-flash');
    expect(analyst?.tier).toBe('flash');
    expect(meta.totalProviderCalls).toBe(6);
    expect(meta.totalEstimatedCostCents).toBe(29);
    expect(meta.servedByUnevaluatedTier).toBe(false);
  });

  it('keeps it identically across a round trip', () => {
    const decision = baseDecision();
    const after = deserializeDecision(serializeDecision(decision));
    expect(currentVersion(after).runMeta).toEqual(currentVersion(decision).runMeta);
  });

  it('carries no prompt, response or artifact text', () => {
    const meta = currentVersion(baseDecision()).runMeta;
    const serialised = JSON.stringify(meta);
    for (const field of ['prompt', 'response', 'artifact', 'screenshot', 'evidenceText']) {
      expect(serialised).not.toContain(`"${field}"`);
    }
  });
});

// Q · schemaVersion validation
describe('Q · the stored shape is versioned, and an unknown one is refused', () => {
  it('stamps the schema version this build writes', () => {
    expect(serializeDecision(baseDecision()).schemaVersion).toBe(DECISION_SCHEMA_VERSION);
  });

  it('refuses a schema version it does not read, by name, rather than migrating', () => {
    const stored = { ...serializeDecision(baseDecision()), schemaVersion: 99 };
    expect(() => deserializeDecision(stored)).toThrow(/does not migrate/);
  });

  it('refuses a record with no schema version at all', () => {
    const stored = serializeDecision(baseDecision()) as unknown as Record<string, unknown>;
    delete stored.schemaVersion;
    expect(() => deserializeDecision(stored)).toThrow(DecisionValidationError);
  });

  it('does not confuse the schema version with the decision version', () => {
    const second = withSecondVersion(baseDecision());
    expect(second.schemaVersion).toBe(DECISION_SCHEMA_VERSION);
    expect(second.versions[1].versionNumber).toBe(2);
  });
});

// R · Malformed persisted object refusal
describe('R · a malformed record is refused whole, never repaired', () => {
  it('refuses something that is not an object', () => {
    expect(() => deserializeDecision('a decision')).toThrow(DecisionValidationError);
    expect(() => deserializeDecision(null)).toThrow(DecisionValidationError);
    expect(() => deserializeDecision([])).toThrow(DecisionValidationError);
  });

  it('refuses a record carrying a field the schema does not have', () => {
    const stored = { ...serializeDecision(baseDecision()), verdictSummary: 'ship it' };
    expect(() => deserializeDecision(stored)).toThrow(/unexpected field "verdictSummary"/);
  });

  it('refuses a record with no versions rather than inventing one', () => {
    const stored = { ...serializeDecision(baseDecision()), versions: [] };
    expect(() => deserializeDecision(stored)).toThrow(/at least the first committed version/);
  });

  it('refuses a version whose id is not its own sequence number', () => {
    const stored = serializeDecision(baseDecision()) as unknown as Record<string, unknown>;
    const versions = stored.versions as Record<string, unknown>[];
    const foreign = mintVersionId('DEC-aaaaaaaaaaaaaaaaaaaaaaaaaa', 1);
    versions[0] = { ...versions[0], id: foreign };
    stored.currentVersionId = foreign;
    expect(() => deserializeDecision(stored)).toThrow(/not the identity of version 1/);
  });

  it('refuses a currentVersionId that does not name the last version', () => {
    const stored = withSecondVersion(baseDecision());
    const broken = { ...serializeDecision(stored), currentVersionId: stored.versions[0].id };
    expect(() => deserializeDecision(broken)).toThrow(/does not name the last version/);
  });

  it('reports every problem, not the first one', () => {
    const stored = serializeDecision(baseDecision()) as unknown as Record<string, unknown>;
    delete stored.createdAt;
    delete stored.updatedAt;
    try {
      deserializeDecision(stored);
      throw new Error('expected a refusal');
    } catch (error) {
      expect(error).toBeInstanceOf(DecisionValidationError);
      expect((error as DecisionValidationError).errors.length).toBeGreaterThanOrEqual(2);
    }
  });
});

// S · Invalid claim reference refusal
describe('S · a claim reference that does not resolve is fatal', () => {
  it('refuses a version whose inference names a statement that is not there', () => {
    const stored = serializeDecision(baseDecision()) as unknown as Record<string, unknown>;
    const versions = stored.versions as Record<string, unknown>[];
    const spine = versions[0].claimSpine as Record<string, unknown>;
    const claims = (spine.claims as Record<string, unknown>[]).filter(
      (claim) => claim.epistemicStatus !== 'FACT'
    );
    versions[0] = { ...versions[0], claimSpine: { ...spine, claims } };
    expect(() => deserializeDecision(stored)).toThrow(DecisionValidationError);
  });

  it('refuses an open question blocking a statement that is not there', () => {
    const stored = serializeDecision(baseDecision()) as unknown as Record<string, unknown>;
    const versions = stored.versions as Record<string, unknown>[];
    const spine = versions[0].claimSpine as Record<string, unknown>;
    const questions = (spine.openQuestions as Record<string, unknown>[]).map((question) => ({
      ...question,
      blocks: ['CLM-aaaaaaaaaaaaaaaaaaaaaaaaaa'],
    }));
    versions[0] = { ...versions[0], claimSpine: { ...spine, openQuestions: questions } };
    expect(() => deserializeDecision(stored)).toThrow(DecisionValidationError);
  });
});

// T · Invalid position reference refusal
describe('T · a position citing a statement that is not there is fatal', () => {
  it('refuses a citation to a well-formed id that names nothing', () => {
    const stored = serializeDecision(baseDecision()) as unknown as Record<string, unknown>;
    const versions = stored.versions as Record<string, unknown>[];
    const positions = versions[0].specialistPositions as Record<string, unknown>[];
    versions[0] = {
      ...versions[0],
      specialistPositions: [
        { ...positions[0], citedClaims: [...(positions[0].citedClaims as string[]), 'CLM-aaaaaaaaaaaaaaaaaaaaaaaaaa'] },
        positions[1],
      ],
    };
    expect(() => deserializeDecision(stored)).toThrow(/not a statement in this version/);
  });

  it('does not drop the citation to make the record valid', () => {
    const stored = serializeDecision(baseDecision()) as unknown as Record<string, unknown>;
    const versions = stored.versions as Record<string, unknown>[];
    const positions = versions[0].specialistPositions as Record<string, unknown>[];
    versions[0] = {
      ...versions[0],
      specialistPositions: [{ ...positions[0], citedClaims: ['CLM-aaaaaaaaaaaaaaaaaaaaaaaaaa'] }, positions[1]],
    };
    expect(() => deserializeDecision(stored)).toThrow(/not dropped and no other statement is substituted/);
  });

  it('refuses a substantive position that cites nothing', () => {
    const stored = serializeDecision(baseDecision()) as unknown as Record<string, unknown>;
    const versions = stored.versions as Record<string, unknown>[];
    const positions = versions[0].specialistPositions as Record<string, unknown>[];
    versions[0] = {
      ...versions[0],
      specialistPositions: [{ ...positions[0], citedClaims: [] }, positions[1]],
    };
    expect(() => deserializeDecision(stored)).toThrow(/at least one statement/);
  });
});

// U · Round-trip serialization — the Stage 3 acceptance test
describe('U · the lossless round trip', () => {
  it('writes a full decision and reads back something semantically identical', () => {
    const record = richRecord();
    let decision = createDecision({
      decisionQuestion: QUESTION,
      claimSpine: record.spine.toJSON(),
      specialistPositions: record.positions,
      runMeta: record.runMeta,
      outcome: record.outcome,
      verdict: record.verdict,
      clock: clockFrom(ROUND_TRIP_AT),
    });
    decision = recordOpenLoop(decision, {
      expectedEvidence: 'The funnel query over the five wizard steps.',
      whyItMatters: 'It decides whether the credential gate or the schema mapping is the thing to change.',
      duePoint: 'The first Monday after the Q4 planning session.',
      bearsOnClaims: [record.loopClaimId],
      reEvaluateOnArrival: 'Whether the wizard should be redesigned before the activation push.',
      createdBy: 'contract',
      clock: clockFrom('2026-09-23T09:00:00.000Z'),
    });
    decision = withSecondVersion(decision);
    decision = recordDecisionOpened(decision, () => '2026-10-01T08:00:00.000Z');

    // The fixture is the hardest shape the domain supports, and this asserts it.
    const version = decision.versions[0];
    expect(version.claimSpine.claims.length).toBeGreaterThanOrEqual(4);
    expect(new Set(version.claimSpine.claims.map((c) => c.epistemicStatus)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(version.claimSpine.claims.map((c) => c.origin.kind)).size).toBeGreaterThanOrEqual(4);
    expect(version.claimSpine.claims.some((c) => c.loadBearing === 'LOAD_BEARING')).toBe(true);
    expect(version.specialistPositions.length).toBeGreaterThanOrEqual(2);
    expect(version.claimSpine.claims.flatMap((c) => c.supports).length).toBeGreaterThanOrEqual(2);
    expect(decision.openLoops).toHaveLength(1);
    expect(decision.eventLog.length).toBeGreaterThanOrEqual(5);

    const written = serializeDecision(decision);
    const read = deserializeDecision(JSON.parse(JSON.stringify(written)));

    expect(read).toEqual(decision);
    expect(JSON.stringify(read)).toBe(JSON.stringify(decision));
  });

  it('survives being written and read twice', () => {
    const decision = withSecondVersion(baseDecision());
    const once = deserializeDecision(serializeDecision(decision));
    const twice = deserializeDecision(serializeDecision(once));
    expect(twice).toEqual(decision);
  });

  it('refuses on the way out as well as on the way in', () => {
    const decision = baseDecision();
    const broken = { ...decision, decisionQuestion: '' } as Decision;
    expect(() => serializeDecision(broken)).toThrow(DecisionValidationError);
  });
});

// V · Open-loop persistence
describe('V · an open loop carries all five things CAP-19 names', () => {
  const withLoop = () => {
    const record = richRecord();
    const decision = createDecision({
      decisionQuestion: QUESTION,
      claimSpine: record.spine.toJSON(),
      specialistPositions: record.positions,
      runMeta: record.runMeta,
      outcome: record.outcome,
      verdict: record.verdict,
      clock: clockFrom(ROUND_TRIP_AT),
    });
    return recordOpenLoop(decision, {
      expectedEvidence: 'The funnel query over the five wizard steps.',
      whyItMatters: 'It decides which screen is the thing to change.',
      duePoint: 'The first Monday after Q4 planning.',
      bearsOnClaims: [record.loopClaimId],
      reEvaluateOnArrival: 'Whether to redesign the wizard before the activation push.',
      createdBy: 'contract',
      clock: clockFrom('2026-09-23T09:00:00.000Z'),
    });
  };

  it('stores the five fields and nothing pretending to be a sixth', () => {
    const loop = withLoop().openLoops[0];
    expect(loop.expectedEvidence).toBeTruthy();
    expect(loop.whyItMatters).toBeTruthy();
    expect(loop.duePoint).toBeTruthy();
    expect(loop.bearsOnClaims.length).toBeGreaterThanOrEqual(1);
    expect(loop.reEvaluateOnArrival).toBeTruthy();
    expect(isOpenLoopId(loop.id)).toBe(true);
    expect(loop.status).toBe('OPEN');
  });

  it('makes the decision visibly waiting on a check, from the list', () => {
    const decision = withLoop();
    expect(decisionState(decision)).toBe('waiting_on_a_check');
    expect(listingFor(decision).openLoops).toBe(1);
  });

  it('records loop_created in the log', () => {
    const decision = withLoop();
    const entry = decision.eventLog.find((event) => event.kind === 'loop_created');
    expect(entry?.loopId).toBe(decision.openLoops[0].id);
  });

  it('closes a loop only with a reason, and keeps the reason', () => {
    const decision = withLoop();
    expect(() => closeOpenLoop(decision, decision.openLoops[0].id, '   ')).toThrow(/with a reason/);
    const closed = closeOpenLoop(
      decision,
      decision.openLoops[0].id,
      'The query came back at 38%.',
      () => '2026-10-05T09:00:00.000Z'
    );
    expect(closed.openLoops[0].status).toBe('CLOSED');
    expect(closed.openLoops[0].closedReason).toBe('The query came back at 38%.');
    expect(closed.eventLog.at(-1)?.kind).toBe('loop_closed');
    expect(decisionState(closed)).toBe('provisional');
  });

  it('refuses a loop bearing on a statement that is not in its version', () => {
    const decision = withLoop();
    const stored = serializeDecision(decision) as unknown as Record<string, unknown>;
    const loops = stored.openLoops as Record<string, unknown>[];
    loops[0] = { ...loops[0], bearsOnClaims: ['CLM-aaaaaaaaaaaaaaaaaaaaaaaaaa'] };
    expect(() => deserializeDecision(stored)).toThrow(/is not a statement in the version/);
  });

  it('refuses a closed loop with no reason on it', () => {
    const open = withLoop();
    const closed = closeOpenLoop(open, open.openLoops[0].id, 'done', () => '2026-10-05T09:00:00.000Z');
    const stored = serializeDecision(closed) as unknown as Record<string, unknown>;
    const loops = stored.openLoops as Record<string, unknown>[];
    loops[0] = { ...loops[0], closedReason: undefined };
    expect(() => deserializeDecision(stored)).toThrow(DecisionValidationError);
  });

  it('survives the round trip with its claims and its reason intact', () => {
    const open = withLoop();
    const closed = closeOpenLoop(
      open,
      open.openLoops[0].id,
      'The query came back at 38%.',
      () => '2026-10-05T09:00:00.000Z'
    );
    expect(deserializeDecision(serializeDecision(closed)).openLoops).toEqual(closed.openLoops);
  });
});

// W · Append-only event log
describe('W · the log is added to and never rewritten', () => {
  it('numbers entries densely from zero', () => {
    const decision = withSecondVersion(baseDecision());
    expect(decision.eventLog.map((entry) => entry.seq)).toEqual(
      decision.eventLog.map((_, index) => index)
    );
  });

  it('keeps every earlier entry when a new one is appended', () => {
    const first = baseDecision();
    const second = withSecondVersion(first);
    expect(second.eventLog.slice(0, first.eventLog.length)).toEqual(first.eventLog);
  });

  it('refuses a stored log whose sequence has a hole in it', () => {
    const stored = serializeDecision(withSecondVersion(baseDecision())) as unknown as Record<string, unknown>;
    const log = stored.eventLog as Record<string, unknown>[];
    stored.eventLog = log.filter((_, index) => index !== 1);
    expect(() => deserializeDecision(stored)).toThrow(/append-only and dense from 0/);
  });

  it('refuses a stored log that goes backwards in time', () => {
    const stored = serializeDecision(withSecondVersion(baseDecision())) as unknown as Record<string, unknown>;
    const log = stored.eventLog as Record<string, unknown>[];
    log[log.length - 1] = { ...log[log.length - 1], at: '2020-01-01T00:00:00.000Z' };
    expect(() => deserializeDecision(stored)).toThrow(/goes backwards/);
  });

  it('refuses a log naming a version that does not exist', () => {
    const stored = serializeDecision(baseDecision()) as unknown as Record<string, unknown>;
    const log = stored.eventLog as Record<string, unknown>[];
    log[0] = { ...log[0], versionNumber: 7 };
    expect(() => deserializeDecision(stored)).toThrow(/does not exist/);
  });

  it('records opening a decision without changing anything else about it', () => {
    const decision = baseDecision();
    const opened = recordDecisionOpened(decision, () => '2026-10-01T08:00:00.000Z');
    expect(opened.eventLog.at(-1)?.kind).toBe('decision_opened');
    expect(opened.versions).toEqual(decision.versions);
  });
});

// X · Deletion semantics
describe('X · deletion reaches everything that could reconstruct the decision', () => {
  it('removes the record and reports what went with it', async () => {
    const store = new InMemoryDecisionStore();
    const decision = withSecondVersion(baseDecision());
    await store.createDecision(decision);

    const receipt = await store.deleteDecision(decision.id);
    expect(receipt?.removed.decision).toBe(true);
    expect(receipt?.removed.versions).toBe(2);
    expect(receipt?.removed.claims).toBeGreaterThanOrEqual(8);
    expect(receipt?.removed.specialistPositions).toBe(4);
    expect(receipt?.removed.dependencyEdges).toBeGreaterThanOrEqual(4);
    expect(receipt?.removed.eventLogEntries).toBe(decision.eventLog.length);

    expect(await store.getDecision(decision.id)).toBeNull();
    expect(await store.listDecisions()).toEqual([]);
    expect(store.size()).toBe(0);
  });

  it('says plainly that the counters already sent are not reversed', async () => {
    const store = new InMemoryDecisionStore();
    const decision = baseDecision();
    await store.createDecision(decision);
    const receipt = await store.deleteDecision(decision.id);
    expect(receipt?.notReversed).toMatch(/not reversed/i);
  });

  it('returns null rather than pretending to delete something that is not there', async () => {
    const store = new InMemoryDecisionStore();
    expect(await store.deleteDecision('DEC-aaaaaaaaaaaaaaaaaaaaaaaaaa')).toBeNull();
  });

  it('refuses to overwrite or to create through the wrong door', async () => {
    const store = new InMemoryDecisionStore();
    const decision = baseDecision();
    await store.createDecision(decision);
    await expect(store.createDecision(decision)).rejects.toBeInstanceOf(DecisionStoreError);
    await expect(store.saveDecision(baseDecision())).rejects.toBeInstanceOf(DecisionStoreError);
  });

  it('reads back exactly what was written', async () => {
    const store = new InMemoryDecisionStore();
    const decision = withSecondVersion(baseDecision());
    await store.createDecision(decision);
    expect(await store.getDecision(decision.id)).toEqual(decision);
  });

  it('lists decisions question-first, with state and last activity', async () => {
    const store = new InMemoryDecisionStore();
    const decision = baseDecision();
    await store.createDecision(decision);
    const [listing] = await store.listDecisions();
    expect(listing.decisionQuestion).toBe(QUESTION);
    expect(listing.state).toBe('provisional');
    expect(listing.lastActivityAt).toBe(decision.updatedAt);
    expect(Object.keys(listing)).not.toContain('versions');
  });
});

// Y · Privacy and the content-free boundary
describe('Y · the decision log stays, the telemetry leaves, and they are not the same thing', () => {
  const marker = 'FLOWPILOT-SECRET-CANVAS';

  const decisionWithMarker = () => {
    const record = richRecord();
    const decision = createDecision({
      decisionQuestion: `Should we ship ${marker} before Q4?`,
      claimSpine: record.spine.toJSON(),
      specialistPositions: record.positions,
      runMeta: record.runMeta,
      outcome: record.outcome,
      verdict: record.verdict,
      clock: clockFrom(ROUND_TRIP_AT),
    });
    const withLoop = recordOpenLoop(decision, {
      expectedEvidence: `The ${marker} funnel query.`,
      whyItMatters: 'It decides what to change.',
      duePoint: 'Q4 planning.',
      bearsOnClaims: [record.loopClaimId],
      reEvaluateOnArrival: 'Whether to redesign.',
      createdBy: 'collect',
      clock: clockFrom('2026-09-23T09:00:00.000Z'),
    });
    return closeOpenLoop(
      withLoop,
      withLoop.openLoops[0].id,
      `${marker} came back at 38%.`,
      () => '2026-10-05T09:00:00.000Z'
    );
  };

  it('keeps the PM’s reason on the decision’s own log', () => {
    const decision = decisionWithMarker();
    const closed = decision.eventLog.find((entry) => entry.kind === 'loop_closed');
    expect(closed?.reason).toContain(marker);
  });

  it('never lets decision content into a projected event', () => {
    const decision = decisionWithMarker();
    const events = projectDecisionEvents(decision);
    expect(events.length).toBeGreaterThan(0);
    expect(JSON.stringify(events)).not.toContain(marker);
    for (const event of events) expect(validateEvent(event).valid).toBe(true);
  });

  it('carries only §55’s permitted fields, and no reason among them', () => {
    for (const event of projectDecisionEvents(decisionWithMarker())) {
      expect(Object.keys(event)).not.toContain('reason');
      for (const forbidden of FORBIDDEN_EVENT_FIELDS) {
        expect(Object.keys(event)).not.toContain(forbidden);
      }
    }
  });

  it('projects the north-star fields §56 reads from version_created', () => {
    const decision = withSecondVersion(baseDecision());
    const created = projectDecisionEvents(decision).find((event) => event.kind === 'version_created');
    expect(created?.versionNumber).toBe(2);
    expect(created?.triggeredBy).toBe('evidence');
  });

  it('projects a refusal as the refusal kind that refused', () => {
    const gate = projectEvent('DEC-aaaaaaaaaaaaaaaaaaaaaaaaaa', {
      seq: 1,
      kind: 'gate_refused',
      at: ROUND_TRIP_AT,
    });
    expect(gate?.refusedAt).toBe('gate');
    const ceiling = projectEvent('DEC-aaaaaaaaaaaaaaaaaaaaaaaaaa', {
      seq: 2,
      kind: 'ceiling_refused',
      at: ROUND_TRIP_AT,
    });
    expect(ceiling?.refusedAt).toBe('ceiling');
  });

  it('emits nothing for a technical failure, because §55 has no kind for one', () => {
    const record = richRecord();
    const broken = createDecision({
      decisionQuestion: QUESTION,
      claimSpine: record.spine.toJSON(),
      specialistPositions: record.positions,
      runMeta: record.runMeta,
      outcome: { kind: 'FAILED', code: 'PROVIDER_UNAVAILABLE', userMessage: 'No answer.', retryable: true },
      clock: clockFrom(ROUND_TRIP_AT),
    });
    const kinds = projectDecisionEvents(broken).map((event) => event.kind);
    expect(kinds).toEqual(['decision_created']);
    expect(kinds).not.toContain('verdict_issued');
  });

  it('stores no artifact bytes and no screenshot data on the decision', () => {
    const serialised = JSON.stringify(serializeDecision(baseDecision()));
    expect(serialised).not.toContain('data:image');
    expect(serialised).not.toContain('"screenshotUrl"');
  });
});

// Z · Legacy conversion and the bundled sample
describe('Z · the transient result becomes a Decision, or says why it cannot', () => {
  it('converts a completed run into the first version of a decision', () => {
    const record = richRecord();
    const review = {
      id: 'rev-1',
      timestamp: ROUND_TRIP_AT,
      context: { name: 'FlowPilot', whatBuilding: 'x', targetUser: 'y', primaryGoal: 'z' },
      verdict: 'ITERATE' as const,
      confidenceScore: 61,
      confidenceRationale: 'One frame and one pasted figure.',
      executiveSummary: 'The credential gate is what a new account meets first.',
      opportunities: [],
      agentReviews: [],
      agreementDisagreement: { agreements: [], disagreements: [], unknowns: [] },
      recommendedNextStep: 'Run the funnel query.',
      isSample: false,
    };
    const decision = decisionFromRun({
      decisionQuestion: QUESTION,
      outcome: verdict(review, record.runMeta),
      spine: record.spine,
      specialistPositions: record.positions,
      clock: clockFrom(ROUND_TRIP_AT),
    });
    expect(decision.versions[0].origin).toBe('legacy_import');
    expect(decision.versions[0].verdict?.outcome).toBe('ITERATE');
    expect(decision.versions[0].verdict?.confidenceCeiling).toBeNull();
    expect(decision.versions[0].verdict?.falsificationContract).toBeNull();
  });

  it('refuses to invent a decision question', () => {
    const record = richRecord();
    expect(() =>
      decisionFromRun({
        decisionQuestion: '   ',
        outcome: failed(new ProductJuryError('INTERNAL_ERROR'), record.runMeta),
        spine: record.spine,
        specialistPositions: [],
      })
    ).toThrow(LegacyConversionError);
  });

  it('refuses a run whose provenance and statements belong to different runs', () => {
    const record = richRecord();
    expect(() =>
      decisionFromRun({
        decisionQuestion: QUESTION,
        outcome: failed(new ProductJuryError('INTERNAL_ERROR'), richProvenance('a-different-run')),
        spine: record.spine,
        specialistPositions: [],
      })
    ).toThrow(/Two runs are two readings/);
  });

  it('converts a failed run into a decision that is still failed', () => {
    const record = richRecord();
    const decision = decisionFromRun({
      decisionQuestion: QUESTION,
      outcome: failed(new ProductJuryError('PROVIDER_UNAVAILABLE', { stage: 'chair' }), record.runMeta),
      spine: record.spine,
      specialistPositions: record.positions,
      clock: clockFrom(ROUND_TRIP_AT),
    });
    expect(decision.versions[0].outcome.kind).toBe('FAILED');
    expect(decision.versions[0].verdict).toBeNull();
    expect(decisionState(decision)).toBe('failed');
  });

  it('builds the bundled sample as a canonical Decision', () => {
    const decision = buildSampleDecision();
    expect(decision.isSample).toBe(true);
    expect(decision.versions).toHaveLength(1);
    expect(decision.versions[0].claimSpine.claims.length).toBeGreaterThanOrEqual(15);
    expect(deserializeDecision(serializeDecision(decision))).toEqual(decision);
  });

  it('keeps the sample honest about the fact that no stage ran', () => {
    const stages = versionStageOutcomes(currentVersion(buildSampleDecision()));
    expect(stages.length).toBeGreaterThan(0);
    for (const stage of stages) {
      expect(stage.status).toBe('not_run');
      expect(stage.reason).toMatch(/demonstration/i);
    }
  });

  it('keeps the sample’s statements as claims rather than strings', () => {
    const spine = buildSampleSpine();
    expect(spine).toBeInstanceOf(ClaimSpine);
    for (const claim of spine.all()) {
      expect(claim.id.startsWith('CLM-')).toBe(true);
      expect(claim.origin.kind).toBeTruthy();
    }
  });

  it('invents no specialist positions for the sample', () => {
    expect(currentVersion(buildSampleDecision()).specialistPositions).toEqual([]);
  });
});

// Regressions the brief names explicitly.
/**
 * Stage 5.1 · CAP-18 contract closure.
 *
 * A missing item now says which statements the gap undermines. The point of
 * storing it is that the relationship survives being written down: a PM
 * reading the decision back in six weeks can see which of their own statements
 * the refusal was about. Everything below is one way of losing that.
 */
describe('AA · a missing item carries the statements it bears on', () => {
  function refusedDecision(
    missing: { item: string; whyItMatters: string; howToGetIt: string; bearsOnClaims: string[] }[]
  ): Decision {
    const record = richRecord();
    return createDecision({
      decisionQuestion: QUESTION,
      claimSpine: record.spine.toJSON(),
      specialistPositions: record.positions,
      runMeta: record.runMeta,
      outcome: { kind: 'INSUFFICIENT', refusedAt: 'GATE', missing } as never,
      clock: clockFrom(ROUND_TRIP_AT),
    });
  }

  const twoGaps = (first: string[], second: string[] = []) => [
    {
      item: 'Where trial accounts stop in the wizard',
      whyItMatters: 'The call turns on whether the credential gate is where they leave.',
      howToGetIt: 'One funnel query over the five steps.',
      bearsOnClaims: first,
    },
    {
      item: 'What the current activation rate is',
      whyItMatters: 'Without a baseline, a redesign cannot be judged against anything.',
      howToGetIt: 'The same dashboard, one number.',
      bearsOnClaims: second,
    },
  ];

  it('round-trips valid claim references through the serializer', () => {
    const record = richRecord();
    const [first, second] = record.spine.surfaced();
    const decision = refusedDecision(twoGaps([first.id], [second.id, first.id]));

    const stored = serializeDecision(decision);
    const read = deserializeDecision(stored);
    const outcome = read.versions[0].outcome;
    if (outcome.kind !== 'INSUFFICIENT') throw new Error('expected an INSUFFICIENT version');

    expect(outcome.missing[0].bearsOnClaims).toEqual([first.id]);
    expect(outcome.missing[1].bearsOnClaims).toEqual([second.id, first.id]);
  });

  it('resolves every reference against this version\'s own statements', () => {
    const record = richRecord();
    const decision = refusedDecision(twoGaps([record.spine.surfaced()[0].id]));
    const outcome = decision.versions[0].outcome;
    if (outcome.kind !== 'INSUFFICIENT') throw new Error('expected an INSUFFICIENT version');

    for (const cited of outcome.missing.flatMap((gap) => gap.bearsOnClaims)) {
      expect(record.spine.has(cited)).toBe(true);
    }
  });

  it('fails closed on a reference to a statement this version does not have', () => {
    // A well-formed id from another run. Not repaired, not dropped, not
    // swapped for the nearest statement: the decision does not validate.
    const foreign = richRecord('run-somewhere-else').spine.surfaced()[0].id;
    expect(() => refusedDecision(twoGaps([foreign]))).toThrow(DecisionValidationError);
    expect(() => refusedDecision(twoGaps([foreign]))).toThrow(/is not a statement in this version/);
  });

  it('fails closed on a reference that is not a statement id at all', () => {
    expect(() => refusedDecision(twoGaps(['the drop-off claim']))).toThrow(
      DecisionValidationError
    );
  });

  it('fails closed when the field is absent rather than empty', () => {
    const record = richRecord();
    const stored = serializeDecision(
      refusedDecision(twoGaps([record.spine.surfaced()[0].id]))
    ) as unknown as Record<string, unknown>;
    const versions = stored.versions as Record<string, unknown>[];
    const outcome = versions[0].outcome as Record<string, unknown>;
    const missing = (outcome.missing as Record<string, unknown>[]).map(
      ({ item, whyItMatters, howToGetIt }) => ({ item, whyItMatters, howToGetIt })
    );
    versions[0] = { ...versions[0], outcome: { ...outcome, missing } };

    // The Stage 5 shape — three fields — is now an incomplete record, not a
    // tolerated one. This is the assertion that would have caught the silent
    // discard if it had been left in.
    expect(() => deserializeDecision(stored)).toThrow(/bearsOnClaims/);
  });

  it('keeps an empty list valid: a gap may bear on no statement in particular', () => {
    const decision = refusedDecision(twoGaps([], []));
    const outcome = deserializeDecision(serializeDecision(decision)).versions[0].outcome;
    if (outcome.kind !== 'INSUFFICIENT') throw new Error('expected an INSUFFICIENT version');
    expect(outcome.missing.every((gap) => gap.bearsOnClaims.length === 0)).toBe(true);
  });

  it('still requires at least two missing items (FR-15)', () => {
    const record = richRecord();
    expect(() => refusedDecision(twoGaps([record.spine.surfaced()[0].id]).slice(0, 1))).toThrow(
      /at least two specific missing items/
    );
  });

  it('leaves FAILED untouched: it has no missing items to carry references', () => {
    const record = richRecord();
    const broken = createDecision({
      decisionQuestion: QUESTION,
      claimSpine: record.spine.toJSON(),
      specialistPositions: record.positions,
      runMeta: record.runMeta,
      outcome: {
        kind: 'FAILED',
        code: 'PROVIDER_UNAVAILABLE',
        userMessage: 'The provider did not answer.',
        retryable: true,
        stage: 'gate',
      },
      clock: clockFrom(ROUND_TRIP_AT),
    });
    const read = deserializeDecision(serializeDecision(broken));
    expect(read.versions[0].outcome.kind).toBe('FAILED');
    expect(decisionState(read)).toBe('failed');
    expect(read.versions[0].outcome).not.toHaveProperty('missing');
  });
});

describe('Stage 3 does not reopen anything Stages 1, 2 and 2.5 closed', () => {
  it('still refuses a specialist citation that does not resolve', () => {
    const spine = richRecord().spine;
    expect(() =>
      groundSpecialistPositions(
        [
          {
            position: 'The gate is the problem.',
            reasoning: 'Stated in the record.',
            citedClaims: ['CLM-aaaaaaaaaaaaaaaaaaaaaaaaaa'],
          },
        ],
        spine,
        'specialist_ux'
      )
    ).toThrow(ProductJuryError);
  });

  it('still refuses a citation to a claim from another run', () => {
    const here = richRecord('run-here').spine;
    const elsewhere = richRecord('run-elsewhere').spine;
    expect(() =>
      groundSpecialistPositions(
        [
          {
            position: 'The same friction appears in the other decision.',
            reasoning: 'The statement recorded there says so.',
            citedClaims: [elsewhere.surfaced()[0].id],
          },
        ],
        here,
        'specialist_ux'
      )
    ).toThrow(ProductJuryError);
  });

  it('creates no verdict where a run produced none', () => {
    const record = richRecord();
    const decision = createDecision({
      decisionQuestion: QUESTION,
      claimSpine: record.spine.toJSON(),
      specialistPositions: record.positions,
      runMeta: record.runMeta,
      outcome: {
        kind: 'INSUFFICIENT',
        refusedAt: 'CEILING',
        missing: [
          { item: 'Where accounts stop', whyItMatters: 'It decides what to change', howToGetIt: 'A funnel query', bearsOnClaims: [] },
          { item: 'Who holds admin rights', whyItMatters: 'It decides whether the gate is real', howToGetIt: 'Ask five accounts', bearsOnClaims: [] },
        ],
      },
      clock: clockFrom(ROUND_TRIP_AT),
    });
    expect(decision.versions[0].verdict).toBeNull();
  });

  it('refuses a stored version carrying a falsification contract no stage produces', () => {
    const stored = serializeDecision(baseDecision()) as unknown as Record<string, unknown>;
    const versions = stored.versions as Record<string, unknown>[];
    const version = versions[0] as Record<string, unknown>;
    versions[0] = {
      ...version,
      verdict: { ...(version.verdict as Record<string, unknown>), falsificationContract: { observation: 'x', threshold: 'y' } },
    };
    expect(() => deserializeDecision(stored)).toThrow(/must be null/);
  });

  it('keeps no flattened claim path in the decision module', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    for (const file of ['decision.ts', 'serialization.ts', 'fromLegacy.ts', 'sampleDecision.ts']) {
      const source = readFileSync(join(process.cwd(), 'server/decision', file), 'utf8');
      // Nothing here reads a claim out of text or matches one by its wording.
      expect(source).not.toMatch(/claims\.map\(\s*\(?\w+\)?\s*=>\s*\w+\.text\s*\)/);
      expect(source).not.toMatch(/\.find\(\s*\(?\w+\)?\s*=>\s*\w+\.text\s*===/);
    }
  });
});
