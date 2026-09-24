/**
 * Stage 1 · Privacy disclosure, telemetry disclosure and the opt-out.
 *
 * PRD v1.1.1 PR-1 (launch blocker), PR-2, PR-3, PR-5, PR-7, PR-9, TEL-6, TEL-7,
 * TEL-9.
 *
 * PR-1 is a launch blocker and the product had nothing: a screenshot was read
 * and sent to Google the moment it was dropped, with no notice at any point.
 *
 * The consent record and the telemetry preference live in this browser only.
 * They are per-viewer conveniences, so localStorage is the right home; every
 * read and write is guarded because it throws in a private window.
 */

const CONSENT_KEY = 'pj.privacy.acknowledged.v1';
const TELEMETRY_KEY = 'pj.telemetry.enabled.v1';

/** PR-1 and PR-7's disclosure, shown before the first upload. */
export const PRIVACY_DISCLOSURE = Object.freeze({
  heading: 'Before you upload a screen',
  processing:
    'Your screenshot is sent to Google’s Gemini API to be read. Google processes it under its own terms. ' +
    'This product is not run by Google and cannot make commitments on its behalf.',
  retention:
    'The screenshot is not stored on this product’s servers. It is passed through to the provider for the ' +
    'length of the request and is not written to disk or to any log here.',
  customerData:
    'Do not upload screens containing real customer data. This is unreleased interface work going to a ' +
    'third party, and once it has gone there is no way to withdraw it.',
  storage:
    'Decisions are kept in this browser only. There is no account and no server-side copy, which means ' +
    'clearing your browsing data, using a different device, or a private window ending will lose them. ' +
    'There is no export yet.',
  telemetry:
    'This product counts what happens — a decision was created, a verdict was issued, a challenge was ' +
    'run — and sends those counts to its own server. Nothing about the content leaves your browser: no ' +
    'screenshot, no statement, no evidence, no question. The event schema has no field that could carry ' +
    'any of it.',
});

/** TEL-9. Held beside the thing it describes so the two cannot drift. */
export const DELETION_DISCLOSURE =
  'Deleting a decision removes the decision and everything stored about it that could reconstruct its ' +
  'content. It does not reverse the counts already sent: the server keeps totals rather than ' +
  'per-decision records, and the identifier those totals were counted under means nothing to it, so ' +
  'there is nothing to find and undo. ' +
  'It also does not reach the artifact already sent to the AI provider for a run that has happened: Google\u2019s handling of that copy is governed by its terms, not by this control.';

/** PR-9. What declining does and does not change. */
export const OPT_OUT_DISCLOSURE =
  'You can decline the counts. Declining stops this browser sending them and changes nothing else — ' +
  'every part of the product works the same way with them off.';

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* A private window or blocked site data. The product works without it. */
  }
}

function safeRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* As above. */
  }
}

/** PR-1: has this browser been shown the disclosure and acknowledged it? */
export function hasAcknowledgedPrivacy(): boolean {
  return safeGet(CONSENT_KEY) === 'true';
}

export function acknowledgePrivacy(): void {
  safeSet(CONSENT_KEY, 'true');
}

/**
 * PR-9. Telemetry is on unless declined; the disclosure that offers the choice
 * is shown before the first upload, so the choice precedes the first event.
 */
export function isTelemetryEnabled(): boolean {
  return safeGet(TELEMETRY_KEY) !== 'false';
}

export function setTelemetryEnabled(enabled: boolean): void {
  safeSet(TELEMETRY_KEY, enabled ? 'true' : 'false');
}

/**
 * PR-4 and PR-8, as far as Stage 1 can honour them.
 *
 * Nothing is persisted yet, so this clears what this browser does hold. When
 * persistence lands the store is cleared here too. The disclosure above already
 * says what deletion does not reach, so this function has nothing to soften.
 */
export function deleteLocalData(): void {
  safeRemove(CONSENT_KEY);
  safeRemove(TELEMETRY_KEY);
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith('pj.')) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    /* As above. */
  }
}
