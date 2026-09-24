import type { Decision } from '../types/decision';
import type { DecisionListing } from '../../server/decision/decision';
import { listingFor } from '../../server/decision/decision';
import { deserializeDecision, serializeDecision } from '../../server/decision/serialization';
import {
  DecisionStorageError,
  DecisionStoreError,
  compareListings,
  deletionReceiptFor,
  type DecisionDeletionReceipt,
  type DecisionStore,
} from '../../server/decision/store';

/**
 * Stage 6 · CAP-12. The store that survives a reload.
 *
 * PRD v1.1.1 CAP-12 (§29), NFR-5, PR-4, PR-5, PR-8, §55.
 *
 * §55, verbatim: "Decisions are stored client-side first (IndexedDB), which is
 * what makes them private." This is that store, and it is the only thing in
 * this stage that is new. The interface it satisfies, the validator it writes
 * through and the deletion receipt it returns were all built in Stage 3 and
 * are used here unchanged — an adapter, not a second architecture.
 *
 * WHERE IT LIVES, AND WHY THAT IS NOT A DETAIL.
 *
 * In the browser. IndexedDB does not exist on the server and this file is
 * never imported by one: `server.ts` builds the Decision, validates it and
 * sends it, and the browser is what keeps it. That is not a limitation of this
 * stage, it is §55's privacy claim — a decision the server never stores is a
 * decision the server cannot lose, subpoena or leak.
 *
 * WHAT IT STORES.
 *
 * One record per decision, under its own id, holding the output of
 * `serializeDecision` and nothing else. No listing cache, no search index, no
 * "recently viewed" copy, no artifact bytes, no telemetry, no prompt. PR-8
 * asks that deleting a decision removes anything that could reconstruct it,
 * and the cheapest way to satisfy that is to have exactly one place where any
 * of it lives.
 *
 * THE VALIDATION IS THE POINT.
 *
 * Every write goes out through `serializeDecision`, which validates; every
 * read comes back through `deserializeDecision`, which validates again. A
 * record that does not satisfy the schema is not repaired, not partially read
 * and not replaced with a fresh decision — it raises `STORAGE_CORRUPT` and is
 * left on disk exactly as it is. A decision this build cannot read is
 * somebody's real decision; overwriting it to make the list render would be
 * the worst thing this file could do.
 *
 * NO MIGRATION. `deserializeDecision` refuses a `schemaVersion` it does not
 * know, and Stage 6 does not add a migration path. When one is needed it is a
 * stage of its own, with the PM told what is being rewritten.
 */

const DATABASE_NAME = 'product-jury';
const DATABASE_VERSION = 1;
const STORE_NAME = 'decisions';

export interface IndexedDbDecisionStoreOptions {
  /**
   * The factory to open against. Defaults to the browser's own. Injected in
   * tests, and it is how "destroy the store and open a new one" is expressed
   * without a global.
   */
  factory?: IDBFactory;
  databaseName?: string;
  /** Deletion receipts are time-stamped; injected so a test can fix the clock. */
  clock?: () => string;
}

/** Turn an IDBRequest into a promise, with the raw error kept off the message. */
function request<T>(req: IDBRequest<T>, code: 'STORAGE_READ_FAILED' | 'STORAGE_WRITE_FAILED', what: string): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new DecisionStorageError(code, what, { cause: req.error }));
  });
}

export class IndexedDbDecisionStore implements DecisionStore {
  private readonly factory: IDBFactory;
  private readonly databaseName: string;
  private readonly clock: () => string;
  private open: Promise<IDBDatabase> | null = null;

  constructor(options: IndexedDbDecisionStoreOptions = {}) {
    const factory = options.factory ?? (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    if (!factory) {
      // Thrown at construction rather than on first use, so a runtime without
      // IndexedDB is a fact the caller learns before it has a decision to lose.
      throw new DecisionStorageError(
        'STORAGE_UNAVAILABLE',
        'this runtime exposes no indexedDB factory'
      );
    }
    this.factory = factory;
    this.databaseName = options.databaseName ?? DATABASE_NAME;
    this.clock = options.clock ?? (() => new Date().toISOString());
  }

  private database(): Promise<IDBDatabase> {
    if (this.open) return this.open;
    this.open = new Promise<IDBDatabase>((resolve, reject) => {
      let req: IDBOpenDBRequest;
      try {
        req = this.factory.open(this.databaseName, DATABASE_VERSION);
      } catch (error) {
        reject(new DecisionStorageError('STORAGE_OPEN_FAILED', 'the database would not open', { cause: error }));
        return;
      }
      req.onupgradeneeded = () => {
        // One object store, keyed by the decision's own id. No second index:
        // an index is a copy, and a copy is something deletion can miss.
        if (!req.result.objectStoreNames.contains(STORE_NAME)) {
          req.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onerror = () =>
        reject(new DecisionStorageError('STORAGE_OPEN_FAILED', 'the database would not open', { cause: req.error }));
      req.onblocked = () =>
        reject(new DecisionStorageError('STORAGE_OPEN_FAILED', 'the database is blocked by another connection'));
      req.onsuccess = () => resolve(req.result);
    });
    // A failed open is not cached: the next call tries again rather than
    // repeating a stale rejection for the life of the tab.
    this.open.catch(() => {
      this.open = null;
    });
    return this.open;
  }

  private async transaction<T>(
    mode: IDBTransactionMode,
    code: 'STORAGE_READ_FAILED' | 'STORAGE_WRITE_FAILED',
    work: (store: IDBObjectStore) => Promise<T>
  ): Promise<T> {
    const db = await this.database();
    let tx: IDBTransaction;
    try {
      tx = db.transaction(STORE_NAME, mode);
    } catch (error) {
      throw new DecisionStorageError(code, 'the transaction could not be started', { cause: error });
    }

    // The work and the transaction's own outcome are raced, so a write that
    // the browser aborts (quota, most often) rejects rather than resolving on
    // a request that succeeded inside a transaction that then failed.
    const settled = new Promise<never>((_, reject) => {
      tx.onabort = () =>
        reject(new DecisionStorageError(code, 'the transaction was aborted', { cause: tx.error }));
      tx.onerror = () =>
        reject(new DecisionStorageError(code, 'the transaction failed', { cause: tx.error }));
    });

    return await Promise.race([work(tx.objectStore(STORE_NAME)), settled]);
  }

  /**
   * Read one record and validate it. `null` means nothing is stored under that
   * id; a stored record that will not validate is an error, never a `null`
   * that would read as "you never made that decision".
   */
  private async read(id: string): Promise<Decision | null> {
    const stored = await this.transaction('readonly', 'STORAGE_READ_FAILED', (store) =>
      request(store.get(id), 'STORAGE_READ_FAILED', 'the record could not be read')
    );
    if (stored === undefined || stored === null) return null;

    try {
      return deserializeDecision(stored, `the stored decision ${id}`);
    } catch (error) {
      throw new DecisionStorageError('STORAGE_CORRUPT', `the record under ${id} does not validate`, {
        cause: error,
      });
    }
  }

  private async write(
    decision: Decision,
    expectExisting: boolean
  ): Promise<Decision> {
    // Validated before the transaction opens, so a decision that could not be
    // read back is never written at all.
    const record = serializeDecision(decision);

    await this.transaction('readwrite', 'STORAGE_WRITE_FAILED', async (store) => {
      const existing = await request(
        store.count(decision.id),
        'STORAGE_WRITE_FAILED',
        'the record could not be counted'
      );
      if (expectExisting && existing === 0) {
        throw new DecisionStoreError(
          'no decision with that id; use createDecision to write a new one'
        );
      }
      if (!expectExisting && existing > 0) {
        throw new DecisionStoreError(
          'a decision with that id already exists; use saveDecision to write to it'
        );
      }
      return await request(store.put(record), 'STORAGE_WRITE_FAILED', 'the record could not be written');
    });

    return (await this.read(decision.id)) as Decision;
  }

  createDecision(decision: Decision): Promise<Decision> {
    return this.write(decision, false);
  }

  saveDecision(decision: Decision): Promise<Decision> {
    return this.write(decision, true);
  }

  getDecision(id: string): Promise<Decision | null> {
    return this.read(id);
  }

  async listDecisions(): Promise<DecisionListing[]> {
    const records = await this.transaction('readonly', 'STORAGE_READ_FAILED', (store) =>
      request(store.getAll(), 'STORAGE_READ_FAILED', 'the records could not be read')
    );

    const listings: DecisionListing[] = [];
    for (const stored of records as unknown[]) {
      let decision: Decision;
      try {
        decision = deserializeDecision(stored, 'a stored decision');
      } catch (error) {
        // One unreadable record does not become an empty list, and does not
        // become a list with a gap in it either.
        throw new DecisionStorageError('STORAGE_CORRUPT', 'a stored record does not validate', {
          cause: error,
        });
      }
      listings.push(listingFor(decision));
    }

    return listings.sort(compareListings);
  }

  async deleteDecision(id: string): Promise<DecisionDeletionReceipt | null> {
    const decision = await this.read(id);
    if (!decision) return null;

    const receipt = deletionReceiptFor(decision, this.clock());

    // One record holds the decision, its versions, their claims, positions,
    // dependency edges, open loops and event log, so one removal reaches all
    // of it (PR-4, PR-8). Nothing is copied elsewhere to be missed here.
    await this.transaction('readwrite', 'STORAGE_WRITE_FAILED', (store) =>
      request(store.delete(id), 'STORAGE_WRITE_FAILED', 'the record could not be removed')
    );

    return receipt;
  }

  /** Release this instance's connection. A new instance opens its own. */
  async close(): Promise<void> {
    if (!this.open) return;
    const db = await this.open.catch(() => null);
    db?.close();
    this.open = null;
  }
}
