import type { Decision } from '../../src/types/decision';
import type { DecisionListing } from './decision';
import { listingFor } from './decision';
import { deserializeDecision, serializeDecision } from './serialization';

/**
 * Stage 3 · The persistence boundary.
 *
 * PRD v1.1.1 CAP-12 (§29), NFR-5, PR-4, PR-5, PR-8, §55.
 *
 * WHAT THIS IS, STATED PLAINLY SO THE REPORT CANNOT OVERSTATE IT.
 *
 * This is an interface and one adapter that keeps decisions in memory. It is
 * not persistence. Nothing here survives a reload, and CAP-12's requirement —
 * "a decision survives reload and restart" — is not met by this stage. What
 * this stage establishes is the shape a real store has to satisfy, and the
 * validation every decision passes through on the way in and out, so that the
 * store which does survive a restart has one thing to implement and no
 * decisions to make about the domain.
 *
 * WHERE THE REAL STORE IS. §55 is explicit: "Decisions are stored client-side
 * first (IndexedDB), which is what makes them private."
 *
 * Stage 6 built it: `src/storage/indexedDbDecisionStore.ts`, in the browser,
 * against this interface and no other. The paragraph above still describes
 * `InMemoryDecisionStore` below, which remains what the server and the tests
 * use — a real store needs a browser, and the deliberation does not run in
 * one.
 *
 * WHY THE DOMAIN DOES NOT KNOW ABOUT ANY OF THIS. Not one type in
 * `src/types/decision.ts` mentions a store, a key, a database or a browser. A
 * domain model that knows it lives in localStorage is a domain model that
 * moves when the storage does.
 *
 * DELETION. PR-4 and PR-8: "a decision and everything in it", and "anything
 * stored about it that could reconstruct its content". A decision holds its
 * versions, and a version holds its claims, its specialist positions, its
 * dependency edges and its run metadata, so there is exactly one record to
 * remove and no second index to forget. A store that keeps a separate listing
 * cache, a search index or a "recently viewed" copy has to remove those too,
 * and `deleteDecision` returning what it removed is how that is checkable.
 *
 * TEL-9, which is not a caveat but a requirement: the content-free counters
 * already emitted are not reversed by any of this. `DELETION_DISCLOSURE` in
 * `server/integrity/telemetry.ts` is the sentence that says so.
 */

export interface DecisionDeletionReceipt {
  decisionId: string;
  /** Everything removed, counted. Counts, not content. */
  removed: {
    decision: boolean;
    versions: number;
    claims: number;
    specialistPositions: number;
    dependencyEdges: number;
    openLoops: number;
    eventLogEntries: number;
  };
  /** TEL-9. Stated on every deletion rather than only in a policy page. */
  notReversed: string;
  at: string;
}

export interface DecisionStore {
  /** Write a decision that does not exist yet. Refuses to overwrite. */
  createDecision(decision: Decision): Promise<Decision>;
  /** Read one. `null` when it is not there — never a fabricated empty decision. */
  getDecision(id: string): Promise<Decision | null>;
  /** Write a decision that does exist. Refuses to create. */
  saveDecision(decision: Decision): Promise<Decision>;
  /** CAP-12's question-first list. Carries no version contents. */
  listDecisions(): Promise<DecisionListing[]>;
  /** PR-4 and PR-8. Returns what was removed, or `null` if there was nothing. */
  deleteDecision(id: string): Promise<DecisionDeletionReceipt | null>;
}

export class DecisionStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DecisionStoreError';
  }
}

/**
 * Stage 6 · What can go wrong with storage, as a closed list.
 *
 * These are deliberately NOT members of `FAILURE_CODES` in
 * `server/integrity/errors.ts`, and a test asserts that they never become one.
 * That taxonomy describes a deliberation that could not run; this one
 * describes a browser that could not keep what the deliberation produced.
 * Collapsing the two would let a full disk read as a failed analysis, and a
 * refusal to store a decision read as a refusal to judge it — which is §51
 * never-9 arriving through the back door.
 */
export const STORAGE_FAILURE_CODES = [
  /** No IndexedDB in this runtime, or the browser refuses to open one. */
  'STORAGE_UNAVAILABLE',
  /** The database would not open, or the upgrade failed. */
  'STORAGE_OPEN_FAILED',
  /** A read transaction failed. */
  'STORAGE_READ_FAILED',
  /** A write transaction failed. Quota is the common cause. */
  'STORAGE_WRITE_FAILED',
  /** Something is stored under that key, and it is not a decision this build can read. */
  'STORAGE_CORRUPT',
] as const;

export type StorageFailureCode = (typeof STORAGE_FAILURE_CODES)[number];

const STORAGE_MESSAGES: Record<StorageFailureCode, string> = {
  STORAGE_UNAVAILABLE:
    'This browser will not let Product Jury keep decisions on this device, so nothing was stored. ' +
    'The decision on screen is unaffected.',
  STORAGE_OPEN_FAILED:
    'The decision store on this device could not be opened, so nothing was read or written. The ' +
    'decision on screen is unaffected.',
  STORAGE_READ_FAILED: 'A stored decision could not be read from this device. Nothing was changed.',
  STORAGE_WRITE_FAILED:
    'This decision could not be kept on this device — the browser refused the write, usually ' +
    'because it is out of space. Nothing was stored, and what is on screen is unaffected.',
  STORAGE_CORRUPT:
    'A stored decision on this device does not match the shape this build reads, so it was not ' +
    'opened. It has been left exactly as it is rather than repaired or replaced.',
};

/**
 * A storage failure, with the PM-facing sentence chosen from the code.
 *
 * `cause` holds whatever the browser threw, for a developer console. SR-4:
 * `userMessage` never carries it, so a DOMException, a quota number or a
 * database path cannot reach a surface.
 */
export class DecisionStorageError extends DecisionStoreError {
  readonly code: StorageFailureCode;
  readonly userMessage: string;

  constructor(code: StorageFailureCode, detail: string, options?: { cause?: unknown }) {
    super(`${code}: ${detail}`);
    this.name = 'DecisionStorageError';
    this.code = code;
    this.userMessage = STORAGE_MESSAGES[code];
    if (options && 'cause' in options) this.cause = options.cause;
  }
}

/**
 * CAP-12's ordering: most recent activity first.
 *
 * The tie-break on id is what makes it deterministic rather than merely
 * sorted. Two decisions can carry the same `updatedAt` — a fixed clock in a
 * test, or two runs inside the same millisecond — and without it their order
 * would depend on insertion, which differs between a store that iterates a Map
 * and one that iterates an IndexedDB cursor. It introduces no second ordering
 * field: both halves are existing Decision values.
 */
export function compareListings(a: DecisionListing, b: DecisionListing): number {
  const byActivity = b.lastActivityAt.localeCompare(a.lastActivityAt);
  return byActivity !== 0 ? byActivity : a.id.localeCompare(b.id);
}

function countDependencyEdges(decision: Decision): number {
  return decision.versions.reduce(
    (total, version) =>
      total + version.claimSpine.claims.reduce((sum, claim) => sum + claim.supports.length, 0),
    0
  );
}

/**
 * PR-4 and PR-8, counted. Shared by every adapter, so two stores cannot
 * disagree about what a deletion removed.
 */
export function deletionReceiptFor(decision: Decision, at: string): DecisionDeletionReceipt {
  return {
    decisionId: decision.id,
    removed: {
      decision: true,
      versions: decision.versions.length,
      claims: decision.versions.reduce((sum, version) => sum + version.claimSpine.claims.length, 0),
      specialistPositions: decision.versions.reduce(
        (sum, version) => sum + version.specialistPositions.length,
        0
      ),
      dependencyEdges: countDependencyEdges(decision),
      openLoops: decision.openLoops.length,
      eventLogEntries: decision.eventLog.length,
    },
    notReversed:
      'The content-free counters already sent are not reversed by this deletion. The server keeps ' +
      'totals rather than per-decision records (§55, TEL-9).',
    at,
  };
}

/**
 * The in-memory adapter.
 *
 * Every write goes through `serializeDecision`, which validates the decision
 * and refuses to store one that could not be read back — so a decision cannot
 * be "saved" into a state that fails on the next open. Every read goes through
 * `deserializeDecision` for the same reason from the other side.
 *
 * It stores the serialised form and hands back a fresh object on every read,
 * so a caller holding a decision cannot reach into the store through it.
 */
export class InMemoryDecisionStore implements DecisionStore {
  private readonly records = new Map<string, unknown>();

  async createDecision(decision: Decision): Promise<Decision> {
    if (this.records.has(decision.id)) {
      throw new DecisionStoreError(
        'a decision with that id already exists; use saveDecision to write to it'
      );
    }
    this.records.set(decision.id, serializeDecision(decision));
    return (await this.getDecision(decision.id)) as Decision;
  }

  async getDecision(id: string): Promise<Decision | null> {
    const stored = this.records.get(id);
    if (stored === undefined) return null;
    // Stage 6: the copy is `deserializeDecision`'s now, so a caller holding a
    // decision still cannot reach into the store through it.
    return deserializeDecision(stored);
  }

  async saveDecision(decision: Decision): Promise<Decision> {
    if (!this.records.has(decision.id)) {
      throw new DecisionStoreError(
        'no decision with that id; use createDecision to write a new one'
      );
    }
    this.records.set(decision.id, serializeDecision(decision));
    return (await this.getDecision(decision.id)) as Decision;
  }

  async listDecisions(): Promise<DecisionListing[]> {
    const listings: DecisionListing[] = [];
    for (const id of this.records.keys()) {
      const decision = await this.getDecision(id);
      if (decision) listings.push(listingFor(decision));
    }
    // CAP-12: the list shows last activity, most recent first.
    return listings.sort(compareListings);
  }

  async deleteDecision(id: string): Promise<DecisionDeletionReceipt | null> {
    const decision = await this.getDecision(id);
    if (!decision) return null;

    const receipt = deletionReceiptFor(decision, new Date().toISOString());

    // One record holds everything, so one removal reaches everything. This
    // adapter keeps no listing cache, no index and no copy.
    this.records.delete(id);
    return receipt;
  }

  /** Test and diagnostic use: how many records are held. Never content. */
  size(): number {
    return this.records.size;
  }
}
