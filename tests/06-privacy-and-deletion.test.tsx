import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrivacyDisclosure } from '../src/components/PrivacyDisclosure';
import { WorkspaceForm } from '../src/components/WorkspaceForm';
import {
  DELETION_DISCLOSURE,
  OPT_OUT_DISCLOSURE,
  PRIVACY_DISCLOSURE,
  acknowledgePrivacy,
  deleteLocalData,
  hasAcknowledgedPrivacy,
  isTelemetryEnabled,
} from '../src/integrity/disclosures';
import * as telemetryClient from '../src/services/telemetryClient';
import type { ProductContext } from '../src/types';

/**
 * Groups 10 and 11 of the Stage 1 brief: deletion, and privacy disclosure.
 *
 * PRD v1.1.1 PR-1 (a launch blocker), PR-2, PR-3, PR-4, PR-5, PR-7, PR-8,
 * PR-9, TEL-9.
 */

// React 19's act() needs this flag or it warns and batches differently.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  window.localStorage.clear();
  telemetryClient.discardQueued();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const emptyContext: ProductContext = {
  name: '',
  whatBuilding: '',
  targetUser: '',
  primaryGoal: '',
  currentProblem: '',
  productUrl: '',
  additionalContext: '',
};

describe('11 · privacy disclosure', () => {
  it('names the third party the artifact is sent to, before any upload (PR-1)', () => {
    const markup = renderToStaticMarkup(
      <PrivacyDisclosure onAcknowledge={() => {}} onCancel={() => {}} />
    );
    expect(markup).toMatch(/Google/i);
    expect(PRIVACY_DISCLOSURE.processing).toMatch(/Google/i);
  });

  it('states retention, customer-data guidance, storage and telemetry', () => {
    const markup = renderToStaticMarkup(
      <PrivacyDisclosure onAcknowledge={() => {}} onCancel={() => {}} />
    );
    for (const sentence of [
      PRIVACY_DISCLOSURE.retention,
      PRIVACY_DISCLOSURE.customerData,
      PRIVACY_DISCLOSURE.storage,
      PRIVACY_DISCLOSURE.telemetry,
      OPT_OUT_DISCLOSURE,
      DELETION_DISCLOSURE,
    ]) {
      // renderToStaticMarkup escapes entities, so compare on the plain words.
      const probe = sentence.split(/[.—]/)[0].slice(0, 40);
      expect(markup.replace(/&#x27;|&quot;|&amp;/g, '')).toContain(
        probe.replace(/&#x27;|&quot;|&amp;/g, '')
      );
    }
  });

  it('carries the telemetry opt-out in the same surface (PR-9)', () => {
    const markup = renderToStaticMarkup(
      <PrivacyDisclosure onAcknowledge={() => {}} onCancel={() => {}} />
    );
    expect(markup).toContain('telemetry-opt-in');
    expect(isTelemetryEnabled()).toBe(true); // on unless declined
  });

  it('is not acknowledged in a fresh browser and is acknowledged only by the control', () => {
    expect(hasAcknowledgedPrivacy()).toBe(false);
    acknowledgePrivacy();
    expect(hasAcknowledgedPrivacy()).toBe(true);
  });

  it('gates the upload: no artifact leaves the browser before consent is requested', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: {} }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    const requestUploadConsent = vi.fn(); // never calls back: consent pending
    act(() => {
      root.render(
        <WorkspaceForm
          context={emptyContext}
          rawEvidence=""
          onChangeContext={() => {}}
          onChangeEvidence={() => {}}
          onSubmit={() => {}}
          isLoading={false}
          onPreloadSample={() => {}}
          requestUploadConsent={requestUploadConsent}
        />
      );
    });

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();

    const file = new File([new Uint8Array([137, 80, 78, 71])], 'unreleased-checkout.png', {
      type: 'image/png',
    });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });

    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      // FileReader resolves on a macrotask.
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(requestUploadConsent).toHaveBeenCalledTimes(1);
    // PR-1's whole point: the screenshot has not been sent anywhere yet.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends the artifact once, and only once, consent has been given', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          productType: { value: 'SaaS onboarding', confidence: 0.7 },
          facts: [],
          inferences: [],
          assumptions: [],
          unknowns: [],
          frictionSignals: [],
        },
        // Stage 2: the client requires a reading to carry its claim spine.
        understanding: { claimSpine: { version: 1, runId: 't', claims: [], openQuestions: [] } },
        observations: [],
      }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    act(() => {
      root.render(
        <WorkspaceForm
          context={emptyContext}
          rawEvidence=""
          onChangeContext={() => {}}
          onChangeEvidence={() => {}}
          onSubmit={() => {}}
          isLoading={false}
          onPreloadSample={() => {}}
          requestUploadConsent={(proceed) => proceed()}
        />
      );
    });

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'screen.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });

    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 40));
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/context/analyze');
  });
});

describe('10 · deletion', () => {
  it('clears everything this browser holds', () => {
    acknowledgePrivacy();
    window.localStorage.setItem('pj.something', 'value');
    window.localStorage.setItem('unrelated.key', 'kept');

    deleteLocalData();

    expect(hasAcknowledgedPrivacy()).toBe(false);
    expect(window.localStorage.getItem('pj.something')).toBeNull();
    // Deletion is scoped to this product's own keys.
    expect(window.localStorage.getItem('unrelated.key')).toBe('kept');
  });

  it('discards queued telemetry rather than flushing it after a delete', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchSpy);

    telemetryClient.emit('judge_started', { decisionId: 'abc123' });
    telemetryClient.discardQueued();
    await telemetryClient.flush();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('states what deletion does not reach rather than implying it reaches everything', () => {
    // TEL-9 and PR-8. The sentence has to be true about this build: the
    // provider has already seen the artifact, and counts are not per-decision.
    expect(DELETION_DISCLOSURE).toMatch(/provider|Google/i);
    expect(DELETION_DISCLOSURE.length).toBeGreaterThan(40);
  });

  it('is offered where the decision lives, not buried in a settings page', () => {
    const drawer = require('node:fs').readFileSync(
      require('node:path').join(__dirname, '..', 'src/components/HistoryDrawer.tsx'),
      'utf8'
    );
    expect(drawer).toContain('onDeleteEverything');
    expect(drawer).toContain('DELETION_DISCLOSURE');
    // The old copy promised a Firestore/Cloud SQL store that does not exist.
    expect(drawer).not.toMatch(/Firestore|Cloud SQL/);
  });
});
