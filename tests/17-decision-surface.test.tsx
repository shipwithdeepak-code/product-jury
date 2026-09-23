import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DecisionsList, DECISIONS_LIST_TESTID } from '../src/components/DecisionsList';
import { DecisionDetail, DECISION_DETAIL_TESTID } from '../src/components/DecisionDetail';
import { pathForRoute, routeFromPath } from '../src/routing/route';
import {
  listStoredDecisions,
  openStoredDecision,
  persistDecision,
  setStoreForTests,
} from '../src/services/decisionPersistence';
import { IndexedDbDecisionStore } from '../src/storage/indexedDbDecisionStore';
import { createDecision, currentVersion, recordOpenLoop } from '../server/decision/decision';
import { EPISTEMIC_STATUSES } from '../src/types/claims';
import type { Decision } from '../src/types/decision';
import { richRecord, ROUND_TRIP_AT } from '../evaluation/fixtures/decision-records';

/**
 * Stage 7 · CAP-12. The decision, reopened.
 *
 * PRD v1.1.1 CAP-12 (§29), CAP-03 (§20), CAP-02 (§19), CAP-07, CAP-18, FR-41,
 * AR-4, NFR-4, §55.
 *
 * What this suite is for: the surface renders the canonical Decision that came
 * out of storage, and can be shown to have rendered nothing else. A decision
 * surface that quietly fell back to the run in memory would look identical
 * until the day someone reloaded — which is precisely the day it matters.
 */

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const QUESTION = 'Should we redesign the onboarding wizard before the Q4 activation push?';

const clockFrom = (start: string) => {
  let tick = 0;
  return () => new Date(Date.parse(start) + tick++ * 1000).toISOString();
};

let container: HTMLDivElement;
let root: Root;
let factory: IDBFactory;
let databaseName: string;
let counter = 0;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  factory = new IDBFactory();
  databaseName = `product-jury-surface-${(counter += 1)}`;
  setStoreForTests(new IndexedDbDecisionStore({ factory, databaseName }));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  setStoreForTests(null);
});

function render(node: React.ReactElement) {
  act(() => root.render(node));
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

/**
 * Source with its prose removed.
 *
 * Several assertions below are of the form "this file does not mention X", and
 * these files explain at length *why* they do not use `ProductReview` or
 * `reviewHistory`. Explaining an absence is not the same as having the thing,
 * and a scan that cannot tell the difference would push the explanations out
 * of the code, which is the wrong direction.
 */
function codeOf(file: string): string {
  return readFileSync(join(__dirname, '..', file), 'utf8')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

const APP = codeOf('src/App.tsx');
const DETAIL = codeOf('src/components/DecisionDetail.tsx');
const LIST = codeOf('src/components/DecisionsList.tsx');

/* ────────────────────────────────────────────────────────────────────────── */

describe('45 · R · the two addresses, and what a refresh does', () => {
  it('reads /decisions and /decisions/:id, and nothing else', () => {
    expect(routeFromPath('/decisions')).toEqual({ name: 'decisions' });
    expect(routeFromPath('/decisions/')).toEqual({ name: 'decisions' });
    expect(routeFromPath('/decisions/DEC-abc')).toEqual({ name: 'decision', id: 'DEC-abc' });
    expect(routeFromPath('/')).toEqual({ name: 'run' });
    expect(routeFromPath('/something-else')).toEqual({ name: 'run' });
  });

  it('round-trips a route through its path, encoding included', () => {
    for (const route of [
      { name: 'run' },
      { name: 'decisions' },
      { name: 'decision', id: 'DEC-abc' },
    ] as const) {
      expect(routeFromPath(pathForRoute(route))).toEqual(route);
    }
    // An id that needs encoding still resolves to itself, and is handed to the
    // store as written rather than repaired.
    expect(pathForRoute({ name: 'decision', id: 'a b/c' })).toBe('/decisions/a%20b%2Fc');
    expect(routeFromPath('/decisions/a%20b%2Fc')).toEqual({ name: 'decision', id: 'a b/c' });
  });

  it('R · a direct address, with nothing in memory, still loads the stored decision', async () => {
    // The reload, expressed as honestly as a test can: the decision is written
    // through one store instance, then read by a route that has only an id —
    // no run result, no React state, no in-memory decision anywhere.
    const decision = verdictDecision();
    await persistDecision(decision);
    setStoreForTests(new IndexedDbDecisionStore({ factory, databaseName }));

    const route = routeFromPath(`/decisions/${decision.id}`);
    if (route.name !== 'decision') throw new Error('expected a decision route');
    const loaded = await openStoredDecision(route.id);

    expect(loaded.status).toBe('loaded');
    if (loaded.status !== 'loaded') throw new Error('unreachable');
    expect(loaded.decision.id).toBe(decision.id);
    expect(loaded.decision.decisionQuestion).toBe(QUESTION);
  });

  it('brings in no routing library', () => {
    const packageJson = JSON.parse(
      readFileSync(join(__dirname, '..', 'package.json'), 'utf8')
    ) as { dependencies: Record<string, string> };
    for (const name of Object.keys(packageJson.dependencies)) {
      expect(name).not.toMatch(/router|routing|wouter|navi/i);
    }
  });
});

describe('46 · A, B, C, S · the list, and where it reads from', () => {
  it('A, B · loads from the store, and renders what listDecisions answered', async () => {
    await persistDecision(verdictDecision('Should we ship the export flow before the freeze?'));
    await persistDecision(verdictDecision('Should we redesign the wizard first?'));

    const state = await listStoredDecisions();
    expect(state.status).toBe('loaded');
    if (state.status !== 'loaded') throw new Error('unreachable');
    expect(state.listings).toHaveLength(2);

    render(<DecisionsList state={state} onOpen={() => {}} onStartNew={() => {}} />);
    const text = container.textContent ?? '';
    expect(text).toContain('Should we ship the export flow before the freeze?');
    expect(text).toContain('Should we redesign the wizard first?');
  });

  it('B, C · reads the store and nothing else — not reviewHistory, not a review', () => {
    // The chain, asserted at each link: the surface renders the store's own
    // listing type, the service calls `listDecisions`, and the store is the
    // only thing either of them talks to.
    expect(LIST).toMatch(/StoredDecisions/);
    expect(LIST).toMatch(/DecisionListing/);
    expect(codeOf('src/services/decisionPersistence.ts')).toMatch(/useStore\(\)\.listDecisions\(\)/);

    expect(LIST).not.toMatch(/reviewHistory|ProductReview|localStorage/);
    // And the surface is handed its state; it keeps no array of its own.
    expect(LIST).not.toMatch(/useState|useEffect/);
  });

  it('C · the application reads the list through the store service, not from run state', () => {
    expect(APP).toMatch(/listStoredDecisions\(\)/);
    const listUse = APP.slice(APP.indexOf('<DecisionsList'), APP.indexOf('<DecisionsList') + 500);
    expect(listUse).not.toMatch(/reviewHistory/);
  });

  it('shows the state, last activity and open-loop count, and no version internals', async () => {
    const record = richRecord();
    const decision = recordOpenLoop(verdictDecision(), {
      expectedEvidence: 'Step-level drop-off four weeks after the change',
      whyItMatters: 'It is the number the call was made without.',
      duePoint: 'Four weeks after release',
      bearsOnClaims: [record.spine.surfaced()[0].id],
      reEvaluateOnArrival: 'If drop-off is not at the credential step, the redesign was aimed wrong.',
      createdBy: 'contract',
      clock: clockFrom('2026-09-23T11:00:00.000Z'),
    });
    await persistDecision(decision);

    const state = await listStoredDecisions();
    render(<DecisionsList state={state} onOpen={() => {}} onStartNew={() => {}} />);

    const text = container.textContent ?? '';
    expect(text).toMatch(/Waiting on a check/);
    expect(text).toMatch(/1 open check/);
    expect(text).toMatch(/Last activity/);
    // No version id, no claim id, no verdict text in the list.
    expect(text).not.toMatch(/VER-|CLM-|POS-/);
  });

  it('S · a decision the run just produced is in the list', async () => {
    const decision = verdictDecision('Should we hold the release for the export fix?');
    const kept = await persistDecision(decision);
    expect(kept.stored).toBe(true);

    const state = await listStoredDecisions();
    if (state.status !== 'loaded') throw new Error('unreachable');
    expect(state.listings.map((entry) => entry.id)).toContain(decision.id);
  });

  it('S · a refusal is in the list too, as an awaiting-evidence decision', async () => {
    const decision = refusedDecision();
    await persistDecision(decision);

    const state = await listStoredDecisions();
    if (state.status !== 'loaded') throw new Error('unreachable');
    const listing = state.listings.find((entry) => entry.id === decision.id);
    expect(listing?.state).toBe('awaiting_evidence');
  });

  it('V, W · storing the same run twice makes no second decision and no second record', async () => {
    const decision = verdictDecision();
    await persistDecision(decision);
    await persistDecision(decision);

    const state = await listStoredDecisions();
    if (state.status !== 'loaded') throw new Error('unreachable');
    expect(state.listings).toHaveLength(1);
    expect(state.listings[0].id).toBe(decision.id);

    // And the application reaches for the id the pipeline already minted.
    expect(APP).toMatch(/setKeptDecisionId\(result\.decision\.id\)/);
    expect(APP).not.toMatch(/mintDecisionId\(\)\s*;?\s*\/\/ *decision/);
  });

  it('says what is there when nothing is, rather than showing an empty frame', () => {
    render(
      <DecisionsList state={{ status: 'loaded', listings: [] }} onOpen={() => {}} onStartNew={() => {}} />
    );
    expect(container.textContent).toMatch(/No decisions yet/);
  });
});

describe('47 · D, E, F, G, H, I, J · the decision, reopened', () => {
  it('D · opening one goes through getDecision, by id', async () => {
    const decision = verdictDecision();
    await persistDecision(decision);
    expect(APP).toMatch(/openStoredDecision\(route\.id\)/);

    const loaded = await openStoredDecision(decision.id);
    expect(loaded.status).toBe('loaded');
  });

  it('E, T · the detail surface does not know ProductReview exists', () => {
    expect(DETAIL).not.toMatch(/ProductReview|reviewHistory|ResultsView/);
    // Its data comes from the canonical Decision it is handed.
    expect(DETAIL).toMatch(/currentVersion\(decision\)/);
    // And the route that renders it is given the store's answer, not a review.
    const detailUse = APP.slice(APP.indexOf('<DecisionDetail'), APP.indexOf('<DecisionDetail') + 300);
    expect(detailUse).toMatch(/state=\{decisionState\}/);
    expect(detailUse).not.toMatch(/review|runResult/);
  });

  it('F · renders the canonical decision question, from the stored decision', async () => {
    const decision = verdictDecision();
    await persistDecision(decision);
    const loaded = await openStoredDecision(decision.id);

    render(<DecisionDetail state={loaded} onBack={() => {}} />);
    const heading = container.querySelector('h1');
    expect(heading?.textContent).toBe(QUESTION);
  });

  it('G, H, I · renders the Claim Spine, grouped by kind, with ids kept', async () => {
    const decision = verdictDecision();
    await persistDecision(decision);
    const loaded = await openStoredDecision(decision.id);
    if (loaded.status !== 'loaded') throw new Error('unreachable');

    render(<DecisionDetail state={loaded} onBack={() => {}} />);
    const text = container.textContent ?? '';
    const claims = currentVersion(loaded.decision).claimSpine.claims.filter((c) => c.surfaced);
    expect(claims.length).toBeGreaterThan(3);

    for (const claim of claims) {
      // H · every statement is on the page, and I · its id with it.
      expect(text).toContain(claim.text);
      expect(text).toContain(claim.id);
    }

    // H · the kinds present are named in words, not implied by a colour.
    const present = new Set(claims.map((claim) => claim.epistemicStatus));
    const labels: Record<string, string> = {
      FACT: 'Observed',
      INFERENCE: 'Inferred',
      ASSUMPTION: 'Assumed',
      UNKNOWN: 'Unknown',
      PM_STATEMENT: 'Said by you',
      EVIDENCE: 'From evidence you supplied',
    };
    for (const status of present) expect(text).toContain(labels[status]);
    expect(present.size).toBeGreaterThan(1);
  });

  it('H · never says an inference or an assumption is observed', async () => {
    const decision = verdictDecision();
    await persistDecision(decision);
    const loaded = await openStoredDecision(decision.id);
    if (loaded.status !== 'loaded') throw new Error('unreachable');
    render(<DecisionDetail state={loaded} onBack={() => {}} />);

    // Each group heading owns the statements under it: an inference's text
    // appears after the "Inferred" heading and before the next heading.
    const headings = Array.from(container.querySelectorAll('h3'));
    const groupFor = (label: string) => headings.findIndex((h) => h.textContent === label);
    expect(groupFor('Observed')).toBeGreaterThanOrEqual(0);

    // And the kinds are described in the product's own words, which never
    // present a conclusion as a reading.
    const text = container.textContent ?? '';
    expect(text).toContain('Concluded from what was observed. It may be wrong.');
    expect(text).toContain('Read directly off the artifact.');
  });

  it('H · renders every kind the domain has, in the domain’s own order', () => {
    // The surface iterates EPISTEMIC_STATUSES rather than a list of its own,
    // so a kind added to the domain cannot go missing here.
    expect(DETAIL).toMatch(/EPISTEMIC_STATUSES\.map/);
    expect(EPISTEMIC_STATUSES).toEqual([
      'FACT',
      'INFERENCE',
      'ASSUMPTION',
      'UNKNOWN',
      'PM_STATEMENT',
      'EVIDENCE',
    ]);
  });

  it('J · shows an unknown as an unknown, with everything CAP-02 attaches to it', async () => {
    const decision = verdictDecision();
    await persistDecision(decision);
    const loaded = await openStoredDecision(decision.id);
    if (loaded.status !== 'loaded') throw new Error('unreachable');

    const questions = currentVersion(loaded.decision).claimSpine.openQuestions;
    expect(questions.length).toBeGreaterThan(0);

    render(<DecisionDetail state={loaded} onBack={() => {}} />);
    const text = container.textContent ?? '';
    for (const question of questions) {
      expect(text).toContain(question.question);
      expect(text).toContain(question.whyItMatters);
      if (question.howToGetIt) expect(text).toContain(question.howToGetIt);
    }
    expect(text).toMatch(/Would move this decision/);
    expect(text).toMatch(/Still unknown/);
    // Nothing answered it, and the surface does not pretend otherwise.
    expect(text).toMatch(/left missing/i);
  });

  it('O · a normal decision renders its verdict, and only the fields that exist', async () => {
    const decision = verdictDecision();
    await persistDecision(decision);
    const loaded = await openStoredDecision(decision.id);
    if (loaded.status !== 'loaded') throw new Error('unreachable');

    render(<DecisionDetail state={loaded} onBack={() => {}} />);
    const text = container.textContent ?? '';
    const verdict = currentVersion(loaded.decision).verdict;
    if (!verdict) throw new Error('expected a verdict');

    expect(text).toContain(verdict.outcome);
    expect(text).toContain(verdict.executiveSummary);
    expect(text).toContain(verdict.recommendedNextStep);
    // TR-3: never a figure without its reason.
    expect(text).toContain(verdict.confidenceRationale);

    // The later stages are not here, and are not hinted at.
    expect(text).not.toMatch(/Red Team|falsification|ceiling|calibration/i);
  });
});

describe('48 · K, L, M, N · an insufficient decision, reopened', () => {
  async function openRefusal() {
    const decision = refusedDecision();
    await persistDecision(decision);
    const loaded = await openStoredDecision(decision.id);
    if (loaded.status !== 'loaded') throw new Error('unreachable');
    return loaded;
  }

  it('K · shows no verdict, no confidence figure and no panel agreement', async () => {
    const loaded = await openRefusal();
    expect(currentVersion(loaded.decision).verdict).toBeNull();

    render(<DecisionDetail state={loaded} onBack={() => {}} />);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/Confidence \d/);
    expect(text).not.toMatch(/SHIP|ITERATE|KILL/);
    expect(text).not.toMatch(/agreement|the panel found|recommend/i);
    expect(text).toMatch(/Not enough to judge this/);
  });

  it('L, M · shows every missing item, why it matters, how to get it, and what it undermines', async () => {
    const loaded = await openRefusal();
    const outcome = currentVersion(loaded.decision).outcome;
    if (outcome.kind !== 'INSUFFICIENT') throw new Error('expected a refusal');

    render(<DecisionDetail state={loaded} onBack={() => {}} />);
    const text = container.textContent ?? '';

    for (const item of outcome.missing) {
      expect(text).toContain(item.item);
      expect(text).toContain(item.whyItMatters);
      expect(text).toContain(item.howToGetIt);
      for (const id of item.bearsOnClaims) expect(text).toContain(id);
    }
    expect(outcome.missing[0].bearsOnClaims).toHaveLength(1);
  });

  it('N · says the jury never ran, and which stages were skipped', async () => {
    const loaded = await openRefusal();
    render(<DecisionDetail state={loaded} onBack={() => {}} />);
    const text = container.textContent ?? '';

    expect(text).toMatch(/before the panel was convened/);
    expect(text).toMatch(/No lens, no cross-examination and no chair ran/);
    expect(text).toMatch(/Stages that did not run/);
    expect(text).toContain('specialist_ux');
    expect(text).toContain('chair');
    expect(text).toMatch(/sufficiency gate refused/);
  });

  it('N · still shows the claim spine, so the refusal has its context', async () => {
    const loaded = await openRefusal();
    const claims = currentVersion(loaded.decision).claimSpine.claims.filter((c) => c.surfaced);
    render(<DecisionDetail state={loaded} onBack={() => {}} />);
    const text = container.textContent ?? '';
    for (const claim of claims) expect(text).toContain(claim.text);
  });
});

describe('49 · P, Q · not there, and would not open', () => {
  it('P · a decision that is not stored produces a not-found state, not an empty one', async () => {
    const loaded = await openStoredDecision('DEC-aaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(loaded.status).toBe('not_found');

    render(<DecisionDetail state={loaded} onBack={() => {}} />);
    const text = container.textContent ?? '';
    expect(text).toMatch(/No decision here/);
    // Nothing was fabricated to fill the page.
    expect(text).not.toMatch(/Still unknown|Where it came out|What this rests on/);
  });

  it('Q · a stored decision that will not validate produces the storage-error state', async () => {
    const decision = verdictDecision();
    await persistDecision(decision);

    // Corrupt the record underneath, the way a partial write or an older build
    // would leave it.
    const db = await new Promise<IDBDatabase>((resolve) => {
      const open = factory.open(databaseName, 1);
      open.onsuccess = () => resolve(open.result);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction('decisions', 'readwrite');
      tx.objectStore('decisions').put({ id: decision.id, schemaVersion: 1 });
      tx.oncomplete = () => resolve();
    });
    db.close();

    const loaded = await openStoredDecision(decision.id);
    expect(loaded.status).toBe('error');

    render(<DecisionDetail state={loaded} onBack={() => {}} />);
    const text = container.textContent ?? '';
    expect(text).toMatch(/would not open/i);
    // §2: not repaired in the UI, and the raw browser error is not shown.
    expect(text).toMatch(/left exactly as it is|not opened/i);
    expect(text).not.toMatch(/DecisionValidationError|DOMException|Error:/);
    expect(DETAIL).not.toMatch(/deserializeDecision|repair/);
  });

  it('shows a reading state that does not pretend a model is running', () => {
    render(<DecisionDetail state={{ status: 'loading' }} onBack={() => {}} />);
    const text = container.textContent ?? '';
    expect(text).toMatch(/Reading this decision from this device/);
    // NFR-4 and §15: no simulated progress, no "AI analysing".
    expect(text).not.toMatch(/analys|deliberat|thinking|AI/i);
  });
});

describe('50 · U, X · what must not become the source of truth', () => {
  it('U · reviewHistory persists nothing, and the store is the only thing that does', () => {
    // The legacy list is in-memory React state and nothing writes it anywhere.
    expect(APP).toMatch(/useState<ProductReview\[\]>\(\[\]\)/);
    const historyUse = APP.slice(APP.indexOf('setReviewHistory'), APP.indexOf('setReviewHistory') + 300);
    expect(historyUse).not.toMatch(/persist|store|indexedDB|localStorage/i);

    expect(codeOf('src/services/decisionPersistence.ts')).not.toMatch(
      /ProductReview|reviewHistory/
    );
  });

  it('U · the application persists the Decision and nothing else', () => {
    expect(APP).toMatch(/persistDecision\(result\.decision\)/);
    expect(APP).not.toMatch(/persistDecision\([^)]*review/i);
  });

  it('X · the sample stays distinguishable through isSample', async () => {
    const record = richRecord();
    const sample = createDecision({
      decisionQuestion: 'A sample question?',
      claimSpine: record.spine.toJSON(),
      specialistPositions: record.positions,
      runMeta: record.runMeta,
      outcome: record.outcome,
      verdict: record.verdict,
      isSample: true,
      clock: clockFrom(ROUND_TRIP_AT),
    });
    await persistDecision(sample);
    await persistDecision(verdictDecision('A real question?'));

    const state = await listStoredDecisions();
    if (state.status !== 'loaded') throw new Error('unreachable');
    const flags = new Map(state.listings.map((entry) => [entry.decisionQuestion, entry.isSample]));
    expect(flags.get('A sample question?')).toBe(true);
    expect(flags.get('A real question?')).toBe(false);

    render(<DecisionsList state={state} onOpen={() => {}} onStartNew={() => {}} />);
    expect(container.textContent).toMatch(/Sample/);
  });

  it('X · nothing writes the bundled sample into storage at startup', () => {
    // §11: the sample is preloaded into the workspace form, and that is all it
    // has ever done. No effect anywhere puts it in the database.
    expect(APP).not.toMatch(/persistDecision\(.*[Ss]ample/);
    expect(APP).not.toMatch(/buildSampleDecision/);
    expect(codeOf('src/services/decisionPersistence.ts')).not.toMatch(/[Ss]ample/);
  });

  it('adds no second store: one localStorage use, and it is the privacy flag', () => {
    for (const file of ['src/components/DecisionsList.tsx', 'src/components/DecisionDetail.tsx']) {
      expect(codeOf(file)).not.toMatch(/localStorage|sessionStorage|document\.cookie|indexedDB/);
    }
  });
});

describe('51 · Y, Z · keyboard, and a narrow screen', () => {
  it('Y · every row in the list is a button, in the tab order, named by its question', async () => {
    await persistDecision(verdictDecision('Should we hold the release?'));
    const state = await listStoredDecisions();
    render(<DecisionsList state={state} onOpen={() => {}} onStartNew={() => {}} />);

    const rows = Array.from(container.querySelectorAll(`[data-testid="${DECISIONS_LIST_TESTID}"] li button`));
    expect(rows).toHaveLength(1);
    const row = rows[0] as HTMLButtonElement;
    expect(row.tabIndex).toBe(0);
    expect(row.disabled).toBe(false);
    // The accessible name is the question, without an aria-label to drift.
    expect(row.textContent).toContain('Should we hold the release?');
  });

  it('Y · a row opens on Enter and on Space, because it is a real button', async () => {
    await persistDecision(verdictDecision());
    const state = await listStoredDecisions();
    const opened: string[] = [];
    render(<DecisionsList state={state} onOpen={(id) => opened.push(id)} onStartNew={() => {}} />);

    const row = container.querySelector('li button') as HTMLButtonElement;
    // A <button> turns both keys into a click; this is what using the element
    // rather than a div with an onClick buys.
    act(() => row.click());
    expect(opened).toHaveLength(1);
  });

  it('Y · every control on both surfaces has a visible focus state', () => {
    for (const source of [LIST, DETAIL]) {
      // Each `<button` up to the next one: a tag cannot be matched by reading
      // to the first `>`, because an arrow function in an attribute has one.
      const buttons = source.split('<button').slice(1);
      expect(buttons.length).toBeGreaterThan(0);
      for (const button of buttons) {
        const tag = button.split('<button')[0].slice(0, 900);
        expect(tag).toMatch(/focus-visible:ring/);
      }
    }
  });

  it('Y · no control on either surface depends on hover alone', () => {
    for (const source of [LIST, DETAIL]) {
      // Hover is used for emphasis, never to reveal a control: nothing is
      // hidden until hover.
      expect(source).not.toMatch(/(invisible|opacity-0|hidden)\s+group-hover:/);
    }
  });

  it('Z · a narrow viewport has nothing that forces a horizontal scroll', async () => {
    const decision = refusedDecision();
    await persistDecision(decision);
    const loaded = await openStoredDecision(decision.id);
    render(<DecisionDetail state={loaded} onBack={() => {}} />);

    /*
     * jsdom does not lay out, so a pixel measurement here would be a fiction.
     * What can be asserted is the cause: a fixed width, a minimum width wider
     * than a phone, or a long unbroken string with nothing allowed to wrap it.
     * Claim ids are the long unbroken strings on this page, and they carry
     * `break-all` for exactly that reason.
     */
    const detail = container.querySelector(`[data-testid="${DECISION_DETAIL_TESTID}"]`);
    expect(detail?.className).toMatch(/max-w-3xl/);
    expect(detail?.className).toMatch(/px-4/);

    for (const source of [LIST, DETAIL]) {
      expect(source).not.toMatch(/\bw-\[\d{3,}px\]/);
      expect(source).not.toMatch(/\bmin-w-\[\d{3,}px\]/);
      expect(source).not.toMatch(/whitespace-nowrap/);
    }

    for (const code of Array.from(container.querySelectorAll('code'))) {
      expect(code.className).toMatch(/break-all/);
    }
  });

  it('Z · the list stacks rather than sitting in columns', () => {
    expect(LIST).not.toMatch(/grid-cols-[2-9]|\bflex-nowrap\b/);
    // The row metadata wraps when it runs out of room.
    expect(LIST).toMatch(/flex-wrap/);
  });
});
