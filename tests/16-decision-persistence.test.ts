import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  closeOpenLoop,
  createDecision,
  currentVersion,
  recordDecisionOpened,
  recordOpenLoop,
  serializeDecision,
  deserializeDecision,
} from '../server/decision/decision';
import {
  DecisionStorageError,
  DecisionStoreError,
  InMemoryDecisionStore,
  STORAGE_FAILURE_CODES,
  type DecisionStore,
} from '../server/decision/store';
import { IndexedDbDecisionStore } from '../src/storage/indexedDbDecisionStore';
import { persistDecision, setStoreForTests } from '../src/services/decisionPersistence';
import { DECISION_SCHEMA_VERSION } from '../src/types/decision';
import type { Decision } from '../src/types/decision';
import { FAILURE_CODES } from '../server/integrity/errors';
import { sha256, sha256OfFields } from '../src/integrity/sha256';
import { richRecord, ROUND_TRIP_AT } from '../evaluation/fixtures/decision-records';

/**
 * Stage 6 · CAP-12. The Decision becomes durable.
 *
 * PRD v1.1.1 CAP-12 (§29), NFR-5, PR-4, PR-5, PR-8, §55, TR-13, §51 never-9.
 *
 * Two invariants hold this suite up.
 *
 * The first is that nothing disappears. A decision written to IndexedDB and
 * read back by a different store instance is the same decision — the same
 * decision id, the same version ids, the same claim ids, the same citations,
 * the same provenance including the stages that did not run, the same event
 * log, the same open loops, the same `bearsOnClaims`. Storage that quietly
 * loses a field turns a defensible decision into a plausible one.
 *
 * The second is that storage failure is not analytical failure. §51 never-9
 * is about a technical failure dressed as an epistemic one, and a full disk
 * reading as INSUFFICIENT would be exactly that, arriving from a direction
 * nobody was watching.
 */

const QUESTION = 'Should we redesign the onboarding wizard before the Q4 activation push?';

const clockFrom = (start: string) => {
  let tick = 0;
  return () => new Date(Date.parse(start) + tick++ * 1000).toISOString();
};

/** A fresh database per test: a real "new device", not a cleared one. */
let factory: IDBFactory;
let databaseName: string;
let counter = 0;

beforeEach(() => {
  factory = new IDBFactory();
  databaseName = `product-jury-test-${(counter += 1)}`;
});

afterEach(() => {
  setStoreForTests(null);
});

function store(): IndexedDbDecisionStore {
  return new IndexedDbDecisionStore({
    factory,
    databaseName,
    clock: () => '2026-09-23T12:00:00.000Z',
  });
}

/** The same database, opened again, as a reload would. */
function reopened(): IndexedDbDecisionStore {
  return store();
}

function verdictDecision(question = QUESTION, clock = clockFrom(ROUND_TRIP_AT)): Decision {
  const record = richRecord();
  return createDecision({
    decisionQuestion: question,
    claimSpine: record.spine.toJSON(),
    specialistPositions: record.positions,
    runMeta: record.runMeta,
    outcome: record.outcome,
    verdict: record.verdict,
    origin: 'pipeline',
    clock,
  });
}

/**
 * The CAP-18 shape the brief names: a gate refusal, two missing items with a
 * claim reference on one of them, the spine, the skipped stages and the
 * provenance that says which stage stopped the run.
 */
function refusedDecision(): Decision {
  const record = richRecord();
  const [first] = record.spine.surfaced();

  return createDecision({
    decisionQuestion: QUESTION,
    claimSpine: record.spine.toJSON(),
    specialistPositions: [],
    runMeta: {
      ...record.runMeta,
      stages: [
        record.runMeta.stages[0],
        {
          stage: 'gate',
          status: 'completed',
          modelId: 'gemini-3.1-flash-lite',
          tier: 'flash-lite',
          attempts: 1,
          durationMs: 900,
          reason:
            'The evidence cannot support a defensible call on the stated question, so the run stopped here.',
        },
        {
          stage: 'specialist_ux',
          status: 'skipped',
          attempts: 0,
          durationMs: 0,
          reason: 'The sufficiency gate refused, so this stage was not attempted (CAP-18).',
        },
        {
          stage: 'chair',
          status: 'skipped',
          attempts: 0,
          durationMs: 0,
          reason: 'The sufficiency gate refused, so this stage was not attempted (CAP-18).',
        },
      ],
    },
    outcome: {
      kind: 'INSUFFICIENT',
      refusedAt: 'GATE',
      missing: [
        {
          item: 'Where trial accounts stop in the wizard',
          whyItMatters: 'The call turns on whether the credential gate is where they leave.',
          howToGetIt: 'One funnel query over the five steps.',
          bearsOnClaims: [first.id],
        },
        {
          item: 'What the current activation rate is',
          whyItMatters: 'Without a baseline, a redesign cannot be judged against anything.',
          howToGetIt: 'The same dashboard, one number.',
          bearsOnClaims: [],
        },
      ],
    },
    origin: 'pipeline',
    clock: clockFrom(ROUND_TRIP_AT),
  });
}

/* ────────────────────────────────────────────────────────────────────────── */

describe('38 · the shared digest, because every id in storage depends on it', () => {
  it('computes what node computes, byte for byte', () => {
    const node = (text: string) => createHash('sha256').update(text).digest('hex');
    const hex = (bytes: Uint8Array) =>
      Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

    for (const text of [
      '',
      'a',
      'abc',
      'x'.repeat(55),
      'y'.repeat(56),
      'z'.repeat(64),
      'q'.repeat(1000),
      'héllo · ünïcode ↯',
    ]) {
      expect(hex(sha256(text))).toBe(node(text));
    }
  });

  it('separates its fields the way the chained updates did', () => {
    const node = createHash('sha256').update('run\u0000analyst\u0000OBSERVED\u0000text').digest('hex');
    const hex = Array.from(sha256OfFields(['run', 'analyst', 'OBSERVED', 'text']), (byte) =>
      byte.toString(16).padStart(2, '0')
    ).join('');
    expect(hex).toBe(node);
  });

  it('is what both identity modules use, so the browser mints what the server minted', () => {
    for (const file of ['server/claims/identity.ts', 'server/decision/identity.ts']) {
      const source = readFileSync(join(__dirname, '..', file), 'utf8');
      expect(source).toContain("from '../../src/integrity/sha256'");
      // Comments stripped: both files explain in prose why they no longer
      // import `node:crypto`, and the prose is not an import.
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(code).not.toMatch(/node:crypto|from 'crypto'/);
    }
    // And nothing the browser bundle can reach imports it either.
    for (const file of ['server/decision/serialization.ts', 'server/integrity/provenance.ts']) {
      const source = readFileSync(join(__dirname, '..', file), 'utf8');
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(code).not.toMatch(/^import .*(node:crypto|'crypto')/m);
    }
  });
});

describe('39 · A, B, C, D · the adapter is the Stage 3 interface, implemented', () => {
  it('A · satisfies DecisionStore, and is used through it', async () => {
    // Typed as the interface here on purpose: if the adapter ever grew a
    // method the application needed, this line would stop compiling.
    const adapter: DecisionStore = store();
    expect(typeof adapter.createDecision).toBe('function');
    expect(typeof adapter.getDecision).toBe('function');
    expect(typeof adapter.saveDecision).toBe('function');
    expect(typeof adapter.listDecisions).toBe('function');
    expect(typeof adapter.deleteDecision).toBe('function');
    expect(await adapter.listDecisions()).toEqual([]);
  });

  it('B · persists a decision it is given', async () => {
    const decision = verdictDecision();
    const written = await store().createDecision(decision);
    expect(written.id).toBe(decision.id);
  });

  it('B · refuses to create over a decision that exists', async () => {
    const decision = verdictDecision();
    const adapter = store();
    await adapter.createDecision(decision);
    await expect(adapter.createDecision(decision)).rejects.toBeInstanceOf(DecisionStoreError);
  });

  it('C · reads it back through a store instance that never saw it written', async () => {
    const decision = verdictDecision();
    await store().createDecision(decision);

    // The reload: this instance opened the database for itself.
    const read = await reopened().getDecision(decision.id);
    expect(read).not.toBeNull();
    expect(read?.id).toBe(decision.id);
  });

  it('C · returns null for a decision that was never stored, rather than an empty one', async () => {
    expect(await store().getDecision('DEC-aaaaaaaaaaaaaaaaaaaaaaaaaa')).toBeNull();
  });

  it('D · saveDecision writes over the canonical record, and refuses to create', async () => {
    const decision = verdictDecision();
    await store().createDecision(decision);

    const opened = recordDecisionOpened(decision, clockFrom('2026-09-24T09:00:00.000Z'));
    await store().saveDecision(opened);

    const read = await reopened().getDecision(decision.id);
    expect(read?.eventLog.length).toBe(opened.eventLog.length);
    expect(read?.eventLog.length).toBeGreaterThan(decision.eventLog.length);

    await expect(store().saveDecision(verdictDecision('A different question entirely?'))).rejects.toBeInstanceOf(
      DecisionStoreError
    );
  });
});

describe('40 · E, F, G · the list, its order, and deletion', () => {
  it('E · lists what is stored, question first and without version contents', async () => {
    const adapter = store();
    const one = verdictDecision('Should we ship the export flow before the freeze?');
    const two = verdictDecision('Should we redesign the wizard first?');
    await adapter.createDecision(one);
    await adapter.createDecision(two);

    const listing = await reopened().listDecisions();
    expect(listing).toHaveLength(2);
    expect(listing.map((entry) => entry.decisionQuestion).sort()).toEqual(
      [one.decisionQuestion, two.decisionQuestion].sort()
    );
    // CAP-12: the list is the question and its state. No version, no spine.
    for (const entry of listing) {
      expect(Object.keys(entry).sort()).toEqual(
        ['decisionQuestion', 'id', 'isSample', 'lastActivityAt', 'openLoops', 'state'].sort()
      );
    }
  });

  it('F · orders deterministically, including when two decisions share a timestamp', async () => {
    const adapter = store();
    // Both fixtures use the same fixed clock, so `updatedAt` ties — which is
    // exactly the case an ordering by activity alone leaves to insertion order.
    const decisions = [
      verdictDecision('Question A?'),
      verdictDecision('Question B?'),
      verdictDecision('Question C?'),
    ];
    for (const decision of decisions) await adapter.createDecision(decision);

    const first = (await reopened().listDecisions()).map((entry) => entry.id);
    const second = (await reopened().listDecisions()).map((entry) => entry.id);
    expect(first).toEqual(second);

    // And the in-memory adapter agrees, because both sort with one comparator.
    const memory = new InMemoryDecisionStore();
    for (const decision of decisions) await memory.createDecision(decision);
    expect((await memory.listDecisions()).map((entry) => entry.id)).toEqual(first);
  });

  it('F · puts the most recent activity first', async () => {
    const adapter = store();
    const older = verdictDecision('The older question?');
    const newer = verdictDecision('The newer question?', clockFrom('2026-10-01T09:00:00.000Z'));
    // Written oldest last, so insertion order cannot be what produces the
    // answer below.
    await adapter.createDecision(newer);
    await adapter.createDecision(older);

    const listing = await reopened().listDecisions();
    expect(listing.map((entry) => entry.id)).toEqual([newer.id, older.id]);
  });

  it('G · deletes the whole record, and says what it removed', async () => {
    const decision = withLoop(verdictDecision());
    await store().createDecision(decision);

    const receipt = await store().deleteDecision(decision.id);
    expect(receipt).not.toBeNull();
    expect(receipt?.removed.decision).toBe(true);
    expect(receipt?.removed.versions).toBe(decision.versions.length);
    expect(receipt?.removed.claims).toBeGreaterThan(0);
    expect(receipt?.removed.openLoops).toBe(1);
    expect(receipt?.removed.eventLogEntries).toBe(decision.eventLog.length);
    // TEL-9, stated on the receipt rather than only in a policy page.
    expect(receipt?.notReversed).toMatch(/not reversed/i);

    // The reload: gone from the database, not merely from this instance.
    expect(await reopened().getDecision(decision.id)).toBeNull();
    expect(await reopened().listDecisions()).toEqual([]);
  });

  it('G · returns null when there was nothing to delete, rather than a receipt for nothing', async () => {
    expect(await store().deleteDecision('DEC-aaaaaaaaaaaaaaaaaaaaaaaaaa')).toBeNull();
  });
});

function withLoop(decision: Decision): Decision {
  const claim = currentVersion(decision).claimSpine.claims[0];
  return recordOpenLoop(decision, {
    expectedEvidence: 'Step-level drop-off for the wizard, four weeks after the change',
    whyItMatters: 'It is the number the call was made without.',
    duePoint: 'Four weeks after release',
    bearsOnClaims: [claim.id],
    reEvaluateOnArrival: 'If drop-off is not at the credential step, the redesign was aimed wrong.',
    createdBy: 'contract',
    clock: clockFrom('2026-09-23T11:00:00.000Z'),
  });
}

describe('41 · H, I, J–S · nothing disappears across a reload', () => {
  it('H · a VERDICT decision comes back exactly as it went in', async () => {
    const decision = withLoop(verdictDecision());
    await store().createDecision(decision);

    const read = await reopened().getDecision(decision.id);
    expect(read).not.toBeNull();
    // The strongest form of "exactly": the canonical serialisation of what
    // came back is identical to the canonical serialisation of what went in.
    expect(serializeDecision(read as Decision)).toEqual(serializeDecision(decision));
  });

  it('I · an INSUFFICIENT decision comes back exactly as it went in', async () => {
    const decision = refusedDecision();
    await store().createDecision(decision);

    const read = await reopened().getDecision(decision.id);
    expect(read).not.toBeNull();
    expect(serializeDecision(read as Decision)).toEqual(serializeDecision(decision));

    const outcome = currentVersion(read as Decision).outcome;
    if (outcome.kind !== 'INSUFFICIENT') throw new Error('expected an INSUFFICIENT version');
    expect(outcome.refusedAt).toBe('GATE');
    expect(outcome.missing.length).toBeGreaterThanOrEqual(2);
    expect(currentVersion(read as Decision).verdict).toBeNull();
  });

  it('J · bearsOnClaims survives, and still resolves against the stored spine', async () => {
    const decision = refusedDecision();
    await store().createDecision(decision);
    const read = (await reopened().getDecision(decision.id)) as Decision;

    const version = currentVersion(read);
    if (version.outcome.kind !== 'INSUFFICIENT') throw new Error('expected a refusal');
    const cited = version.outcome.missing[0].bearsOnClaims;
    expect(cited).toHaveLength(1);
    expect(version.claimSpine.claims.some((claim) => claim.id === cited[0])).toBe(true);
    expect(version.outcome.missing[1].bearsOnClaims).toEqual([]);
  });

  it('K · every claim id is identical, not merely the same count', async () => {
    const decision = verdictDecision();
    await store().createDecision(decision);
    const read = (await reopened().getDecision(decision.id)) as Decision;

    const before = currentVersion(decision).claimSpine.claims.map((claim) => claim.id);
    const after = currentVersion(read).claimSpine.claims.map((claim) => claim.id);
    expect(after).toEqual(before);
    expect(before.length).toBeGreaterThan(3);

    // And the dependency edges between them, which are claim ids too.
    expect(currentVersion(read).claimSpine.claims.map((claim) => claim.supports)).toEqual(
      currentVersion(decision).claimSpine.claims.map((claim) => claim.supports)
    );
  });

  it('K · every specialist position and every citation is identical', async () => {
    const decision = verdictDecision();
    await store().createDecision(decision);
    const read = (await reopened().getDecision(decision.id)) as Decision;

    expect(currentVersion(read).specialistPositions).toEqual(
      currentVersion(decision).specialistPositions
    );
    expect(currentVersion(read).specialistPositions.length).toBeGreaterThan(0);
  });

  it('L, M, N · the decision id, the version ids and currentVersionId survive', async () => {
    const decision = verdictDecision();
    await store().createDecision(decision);
    const read = (await reopened().getDecision(decision.id)) as Decision;

    expect(read.id).toBe(decision.id);
    expect(read.versions.map((version) => version.id)).toEqual(
      decision.versions.map((version) => version.id)
    );
    expect(read.currentVersionId).toBe(decision.currentVersionId);
    expect(read.versions[0].versionNumber).toBe(1);
  });

  it('O · schemaVersion survives, and is the one this build reads', async () => {
    const decision = verdictDecision();
    await store().createDecision(decision);
    const read = (await reopened().getDecision(decision.id)) as Decision;
    expect(read.schemaVersion).toBe(DECISION_SCHEMA_VERSION);
  });

  it('P · the event log survives entry for entry, in order', async () => {
    const decision = recordDecisionOpened(verdictDecision(), clockFrom('2026-09-24T09:00:00.000Z'));
    await store().createDecision(decision);
    const read = (await reopened().getDecision(decision.id)) as Decision;

    expect(read.eventLog).toEqual(decision.eventLog);
    expect(read.eventLog.map((entry) => entry.seq)).toEqual(
      decision.eventLog.map((entry) => entry.seq)
    );
  });

  it('Q · open loops survive, open and closed, with their reasons', async () => {
    const withOpen = withLoop(verdictDecision());
    const loopId = withOpen.openLoops[0].id;
    const closed = closeOpenLoop(
      withOpen,
      loopId,
      'The funnel query came back and the drop-off is at the credential step.',
      clockFrom('2026-10-20T09:00:00.000Z')
    );

    await store().createDecision(closed);
    const read = (await reopened().getDecision(closed.id)) as Decision;

    expect(read.openLoops).toEqual(closed.openLoops);
    const loop = read.openLoops[0];
    expect(loop.id).toBe(loopId);
    expect(loop.status).toBe('CLOSED');
    expect(loop.closedReason).toMatch(/credential step/);
    expect(loop.bearsOnClaims.length).toBe(1);
    expect(loop.createdBy).toBe('contract');
    expect(loop.versionId).toBe(closed.currentVersionId);
  });

  it('R, S · run provenance survives, including the stages that did not run', async () => {
    const decision = refusedDecision();
    await store().createDecision(decision);
    const read = (await reopened().getDecision(decision.id)) as Decision;

    const runMeta = currentVersion(read).runMeta;
    expect(runMeta).toEqual(currentVersion(decision).runMeta);
    expect(runMeta.runId).toBe(currentVersion(decision).runMeta.runId);

    const byStage = new Map(runMeta.stages.map((stage) => [stage.stage, stage]));
    // TR-4: which stages ran, and which did not, with the real reason.
    expect(byStage.get('specialist_ux')?.status).toBe('skipped');
    expect(byStage.get('chair')?.status).toBe('skipped');
    expect(byStage.get('chair')?.reason).toMatch(/sufficiency gate refused/);
    expect(byStage.get('gate')?.status).toBe('completed');
  });

  it('a stored version is not mutated by reading it', async () => {
    const decision = verdictDecision();
    await store().createDecision(decision);

    const first = (await reopened().getDecision(decision.id)) as Decision;
    // Frozen on the way out, so a caller cannot edit a version and write it
    // back as though it had always said that (§17).
    expect(Object.isFrozen(first.versions[0])).toBe(true);
    expect(() => {
      (first.versions[0] as { decisionQuestion: string }).decisionQuestion = 'something else';
    }).toThrow();

    const second = (await reopened().getDecision(decision.id)) as Decision;
    expect(serializeDecision(second)).toEqual(serializeDecision(decision));
  });
});

describe('42 · T, U · a record this build cannot read is not repaired', () => {
  /** Put a raw object under a key, the way a corrupted or older write would. */
  async function writeRaw(record: unknown): Promise<void> {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = factory.open(databaseName, 1);
      open.onupgradeneeded = () => open.result.createObjectStore('decisions', { keyPath: 'id' });
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('decisions', 'readwrite');
      tx.objectStore('decisions').put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }

  it('T · fails closed on a stored decision that does not validate', async () => {
    const decision = verdictDecision();
    const record = serializeDecision(decision) as unknown as Record<string, unknown>;
    const versions = record.versions as Record<string, unknown>[];
    // One citation pointed at a statement that is not in the spine. A store
    // that dropped it would turn a grounded position into an ungrounded one.
    versions[0] = {
      ...versions[0],
      specialistPositions: (versions[0].specialistPositions as Record<string, unknown>[]).map(
        (position) => ({ ...position, citedClaims: ['CLM-aaaaaaaaaaaaaaaaaaaaaaaaaa'] })
      ),
    };
    await writeRaw(record);

    const failure = await store()
      .getDecision(decision.id)
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(DecisionStorageError);
    expect((failure as DecisionStorageError).code).toBe('STORAGE_CORRUPT');
  });

  it('T · leaves the corrupt record exactly as it is', async () => {
    const decision = verdictDecision();
    const record = serializeDecision(decision) as unknown as Record<string, unknown>;
    await writeRaw({ ...record, versions: [] });

    await expect(store().getDecision(decision.id)).rejects.toBeInstanceOf(DecisionStorageError);

    // Read it back raw: still there, still the same, not deleted and not
    // replaced with a fresh decision that would render.
    const db = await new Promise<IDBDatabase>((resolve) => {
      const open = factory.open(databaseName, 1);
      open.onsuccess = () => resolve(open.result);
    });
    const stored = await new Promise<unknown>((resolve) => {
      const request = db.transaction('decisions', 'readonly').objectStore('decisions').get(decision.id);
      request.onsuccess = () => resolve(request.result);
    });
    db.close();
    expect((stored as Record<string, unknown>).versions).toEqual([]);
  });

  it('T · a corrupt record fails the list rather than leaving a gap in it', async () => {
    await store().createDecision(verdictDecision());
    await writeRaw({ id: 'DEC-bbbbbbbbbbbbbbbbbbbbbbbbbb', schemaVersion: 1 });
    await expect(store().listDecisions()).rejects.toBeInstanceOf(DecisionStorageError);
  });

  it('U · fails closed on a schemaVersion this build does not read, and does not migrate', async () => {
    const decision = verdictDecision();
    const record = serializeDecision(decision) as unknown as Record<string, unknown>;
    await writeRaw({ ...record, schemaVersion: DECISION_SCHEMA_VERSION + 1 });

    const failure = await store()
      .getDecision(decision.id)
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(DecisionStorageError);
    expect((failure as DecisionStorageError).code).toBe('STORAGE_CORRUPT');
    expect(String((failure as Error).cause)).toMatch(/does not migrate/);
  });

  it('T, U · never puts the raw browser error in front of the PM', () => {
    for (const code of STORAGE_FAILURE_CODES) {
      const error = new DecisionStorageError(code, 'internal detail', {
        cause: new Error('QuotaExceededError: the quota has been exceeded at /var/db/idb'),
      });
      expect(error.userMessage).not.toMatch(/Quota|var\/db|Error:/);
      expect(error.userMessage.length).toBeGreaterThan(30);
    }
  });
});

describe('43 · V, W · a storage failure is not an analytical failure', () => {
  it('V · storage codes are not, and cannot become, run failure codes', () => {
    for (const code of STORAGE_FAILURE_CODES) {
      expect(FAILURE_CODES).not.toContain(code as never);
    }
    // And the run taxonomy still names nothing that could read as a refusal.
    expect(FAILURE_CODES.some((code) => /INSUFFICIENT|STORAGE/.test(code))).toBe(false);
  });

  it('V · an unavailable IndexedDB is a storage error, not a run outcome', () => {
    const attempt = () => new IndexedDbDecisionStore({ factory: undefined as unknown as IDBFactory });
    // No factory anywhere in this runtime: jsdom has no indexedDB of its own.
    if ((globalThis as { indexedDB?: IDBFactory }).indexedDB) return;
    const error = (() => {
      try {
        attempt();
        return null;
      } catch (thrown) {
        return thrown;
      }
    })();
    expect(error).toBeInstanceOf(DecisionStorageError);
    expect((error as DecisionStorageError).code).toBe('STORAGE_UNAVAILABLE');
  });

  it('W · a write that fails returns a sentence and leaves the outcome alone', async () => {
    const decision = verdictDecision();
    const before = serializeDecision(decision);
    const broken: DecisionStore = {
      createDecision: async () => {
        throw new DecisionStorageError('STORAGE_WRITE_FAILED', 'the quota is exhausted');
      },
      getDecision: async () => null,
      saveDecision: async () => decision,
      listDecisions: async () => [],
      deleteDecision: async () => null,
    };
    setStoreForTests(broken);

    const result = await persistDecision(decision);
    expect(result.stored).toBe(false);
    expect(result.userMessage).toMatch(/could not be kept/i);
    expect(result.userMessage).not.toMatch(/quota is exhausted/);

    // The decision object is untouched: persistence is not in its path.
    expect(serializeDecision(decision)).toEqual(before);
  });

  it('W · persistDecision never throws into the run', async () => {
    setStoreForTests({
      createDecision: async () => {
        throw new Error('something the browser did that nobody anticipated');
      },
      getDecision: async () => null,
      saveDecision: async () => verdictDecision(),
      listDecisions: async () => [],
      deleteDecision: async () => null,
    });
    await expect(persistDecision(verdictDecision())).resolves.toMatchObject({ stored: false });
  });

  it('W · the app does not turn a storage failure into an outcome', () => {
    const app = readFileSync(join(__dirname, '..', 'src/App.tsx'), 'utf8');
    const persistCall = app.slice(app.indexOf('await persistDecision('));
    const nearby = persistCall.slice(0, 400);
    expect(nearby).not.toMatch(/setRunResult/);
    expect(nearby).not.toMatch(/INSUFFICIENT|FAILED/);
  });
});

describe('44 · X, Y, Z, AA · what is stored, and what is not', () => {
  it('X · the application persists the Decision, never the ProductReview', () => {
    const app = readFileSync(join(__dirname, '..', 'src/App.tsx'), 'utf8');
    // The structural assertion the brief asks for: the argument at the one
    // persistence call site is the decision.
    expect(app).toMatch(/persistDecision\(result\.decision\)/);
    expect(app).not.toMatch(/persistDecision\([^)]*review/);

    const persistence = readFileSync(
      join(__dirname, '..', 'src/services/decisionPersistence.ts'),
      'utf8'
    );
    // And nothing in the persistence module knows what a ProductReview is.
    expect(persistence).not.toMatch(/ProductReview/);
  });

  it('X · the store is reached through the interface, never through IndexedDB directly', () => {
    for (const file of ['src/App.tsx', 'src/services/reviewService.ts']) {
      const source = readFileSync(join(__dirname, '..', file), 'utf8');
      expect(source).not.toMatch(/indexedDB|IDBDatabase|IndexedDbDecisionStore/);
    }
  });

  it('Y · storing a decision twice does not mint a second decision id', async () => {
    const decision = verdictDecision();
    setStoreForTests(store());

    await persistDecision(decision);
    await persistDecision(decision);

    const listing = await reopened().listDecisions();
    expect(listing).toHaveLength(1);
    expect(listing[0].id).toBe(decision.id);
  });

  it('Z · a round trip mints no claim id, because it rebuilds none from text', async () => {
    const decision = verdictDecision();
    await store().createDecision(decision);
    const read = (await reopened().getDecision(decision.id)) as Decision;

    const ids = new Set(currentVersion(read).claimSpine.claims.map((claim) => claim.id));
    expect(ids.size).toBe(currentVersion(decision).claimSpine.claims.length);
    for (const claim of currentVersion(decision).claimSpine.claims) {
      expect(ids.has(claim.id)).toBe(true);
    }
  });

  it('AA · the adapter stores the canonical record and nothing beside it', async () => {
    const decision = verdictDecision();
    await store().createDecision(decision);

    const db = await new Promise<IDBDatabase>((resolve) => {
      const open = factory.open(databaseName, 1);
      open.onsuccess = () => resolve(open.result);
    });
    // One object store, keyed by the decision's own id. No index, no listing
    // cache, no second table for anything (PR-8).
    expect(Array.from(db.objectStoreNames)).toEqual(['decisions']);
    const records = await new Promise<unknown[]>((resolve) => {
      const request = db.transaction('decisions', 'readonly').objectStore('decisions').getAll();
      request.onsuccess = () => resolve(request.result as unknown[]);
    });
    db.close();

    expect(records).toHaveLength(1);
    /*
     * PR-5: no artifact bytes, no key, no prompt, no provider payload. The
     * patterns are the real shapes rather than loose words — a claim may quite
     * properly say "Amplitude cohort data: 62% drop off", and that sentence is
     * the decision's content, not a leak.
     */
    const written = JSON.stringify(records[0]);
    expect(written).not.toMatch(/data:[a-z]+\/[a-z]/i);
    expect(written).not.toMatch(/;base64,/i);
    expect(written).not.toMatch(/screenshotUrl|screenshotName/);
    expect(written).not.toMatch(/GEMINI_API_KEY|apiKey|systemInstruction/i);
    expect(records[0]).toEqual(serializeDecision(decision));
  });

  it('AA · the domain has no field artifact bytes could be stored in', () => {
    /*
     * This is why the equality above can be an equality: there is nothing to
     * strip on the way to storage, because the Decision never had a place to
     * put it. The serializer's closed schemas are the enforcement — a version
     * carrying an extra key fails validation rather than being written.
     */
    const record = serializeDecision(verdictDecision()) as unknown as Record<string, unknown>;
    const version = (record.versions as Record<string, unknown>[])[0];
    expect(Object.keys(record)).not.toContain('artifact');
    expect(Object.keys(version)).not.toContain('artifact');
    expect(Object.keys(version)).not.toContain('screenshotUrl');

    const withBytes = {
      ...record,
      versions: [{ ...version, artifact: 'data:image/png;base64,iVBORw0KGgo=' }],
    };
    expect(() => deserializeDecision(withBytes)).toThrow(/artifact/);
  });
});
