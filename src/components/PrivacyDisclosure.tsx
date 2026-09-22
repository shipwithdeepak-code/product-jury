import React, { useEffect, useRef, useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import {
  DELETION_DISCLOSURE,
  OPT_OUT_DISCLOSURE,
  PRIVACY_DISCLOSURE,
  acknowledgePrivacy,
  isTelemetryEnabled,
  setTelemetryEnabled,
} from '../integrity/disclosures';

/**
 * Stage 1 · The disclosure shown before the first upload.
 *
 * PRD v1.1.1 PR-1 (launch blocker), PR-2, PR-3, PR-5, PR-7, PR-9, TEL-6, TEL-9.
 *
 * PR-1's reasoning, verbatim: "The product's input is, by definition,
 * unreleased interface work — frequently under NDA. A tool that sends it to a
 * third party without saying so will not survive its first security review, and
 * the fix is one sentence."
 *
 * PR-9 puts the telemetry opt-out here rather than in a settings page, because
 * §55 requires the disclosure and the opt-out to travel together, and because
 * the choice has to precede the first event rather than follow it.
 *
 * This is the one modal in the product that gates an action, and it gates the
 * upload specifically. It is not the standing limitations surface — §53 is
 * explicit that those may not be a first-run modal, and they are not.
 */

export const PRIVACY_TESTID = 'privacy-disclosure';

export function PrivacyDisclosure({
  onAcknowledge,
  onCancel,
}: {
  onAcknowledge: () => void;
  onCancel: () => void;
}) {
  const [telemetryOn, setTelemetryOn] = useState(() => isTelemetryEnabled());
  const panelRef = useRef<HTMLDivElement>(null);

  // AR-3.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button, input, [href], [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    panelRef.current?.querySelector<HTMLElement>('button')?.focus();
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  const handleContinue = () => {
    setTelemetryEnabled(telemetryOn);
    acknowledgePrivacy();
    onAcknowledge();
  };

  return (
    <div
      data-testid={PRIVACY_TESTID}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-stone-950/70"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-title"
        className="w-full sm:max-w-xl max-h-[88vh] overflow-y-auto bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-t-2xl sm:rounded-2xl shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 px-5 sm:px-6 py-4 border-b border-stone-200 dark:border-stone-800">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-stone-500 shrink-0 mt-0.5" aria-hidden="true" />
            <h2 id="privacy-title" className="text-base font-semibold text-stone-900 dark:text-stone-100">
              {PRIVACY_DISCLOSURE.heading}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel"
            className="p-1 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-500"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="px-5 sm:px-6 py-5 space-y-4 text-sm text-stone-700 dark:text-stone-300 leading-relaxed">
          {/* PR-1. The named third party, before the first upload. */}
          <p>{PRIVACY_DISCLOSURE.processing}</p>
          {/* PR-3. */}
          <p>{PRIVACY_DISCLOSURE.retention}</p>
          {/* PR-2. */}
          <p className="font-medium text-stone-900 dark:text-stone-100">
            {PRIVACY_DISCLOSURE.customerData}
          </p>
          {/* PR-5. */}
          <p>{PRIVACY_DISCLOSURE.storage}</p>

          <div className="pt-4 border-t border-stone-200 dark:border-stone-800">
            {/* PR-7 and TEL-6. */}
            <p className="mb-3">{PRIVACY_DISCLOSURE.telemetry}</p>
            <p className="mb-3">{OPT_OUT_DISCLOSURE}</p>
            {/* TEL-9. */}
            <p className="mb-4 text-xs text-stone-600 dark:text-stone-400">{DELETION_DISCLOSURE}</p>

            {/* PR-9. */}
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                id="telemetry-opt-in"
                type="checkbox"
                checked={telemetryOn}
                onChange={(event) => setTelemetryOn(event.target.checked)}
                className="mt-0.5 w-4 h-4 accent-stone-900 dark:accent-stone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-stone-500"
              />
              <span className="text-sm text-stone-800 dark:text-stone-200">
                Send the content-free counts.
                <span className="block text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                  Uncheck to decline. Everything works the same either way.
                </span>
              </span>
            </label>
          </div>
        </div>

        <div className="px-5 sm:px-6 py-4 border-t border-stone-200 dark:border-stone-800 flex flex-wrap gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-stone-500"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={handleContinue}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 hover:bg-stone-800 dark:hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-stone-500"
          >
            I understand — choose a screen
          </button>
        </div>
      </div>
    </div>
  );
}
