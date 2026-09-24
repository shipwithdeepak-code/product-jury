import React, { useEffect, useRef, useState } from 'react';
import { Info, X } from 'lucide-react';
import { BUILD_LIMITATIONS, STANDING_LIMITATIONS } from '../integrity/standingLimitations';
import { DELETION_DISCLOSURE, OPT_OUT_DISCLOSURE } from '../integrity/disclosures';

/**
 * Stage 1 · The permanent standing-limitations surface.
 *
 * PRD v1.1.1 §53, TR-6, TR-10, TR-11, principle 10, §48's Trust gate.
 *
 * §53 is specific about where it lives: "Permanently in the interface,
 * reachable from every surface without leaving it. Not a first-run modal, not
 * a footer link, not a generic AI disclaimer of the kind everyone has learned
 * to skip."
 *
 * So: a persistent control in the app chrome, present on every surface,
 * carrying a one-line summary of the hardest limit even when closed. Opening it
 * is a panel over the page rather than a navigation, so the PM never leaves
 * what they were doing to read it.
 *
 * The test that §53 sets is behavioural — "a PM who has used the product three
 * times can still say what it cannot know" — which no unit test can assert. The
 * testable part is coverage of the five contents, and that is asserted against
 * the data in standingLimitations.ts rather than against this markup.
 */

export function StandingLimitations() {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // AR-3: an overlay announces itself, traps focus deliberately, closes on Escape.
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
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
  }, [isOpen]);

  return (
    <>
      {/*
        The permanent bar. Present on every surface, carrying the limit a PM is
        likeliest to misread even when the panel is closed.
      */}
      <div className="border-t border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <Info className="w-3.5 h-3.5 text-stone-400 shrink-0" aria-hidden="true" />
          <p className="text-[11px] text-stone-600 dark:text-stone-400 leading-relaxed flex-1 min-w-[200px]">
            This has seen one frame of your product and none of your users. A confidence figure here
            is an upper bound set by the evidence, not a probability of being right.
          </p>
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setIsOpen(true)}
            aria-expanded={isOpen}
            className="text-[11px] font-medium underline underline-offset-2 text-stone-700 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-stone-500 rounded"
          >
            What this cannot know
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-stone-950/60">
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="standing-limitations-title"
            className="w-full sm:max-w-2xl max-h-[85vh] overflow-y-auto bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-t-2xl sm:rounded-2xl shadow-2xl"
          >
            <div className="sticky top-0 flex items-start justify-between gap-4 px-5 sm:px-6 py-4 border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900">
              <h2
                id="standing-limitations-title"
                className="text-base font-semibold text-stone-900 dark:text-stone-100"
              >
                What this product can and cannot know
              </h2>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  triggerRef.current?.focus();
                }}
                aria-label="Close"
                className="p-1 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-500"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <div className="px-5 sm:px-6 py-5 space-y-5">
              {STANDING_LIMITATIONS.map((paragraph) => (
                <section key={paragraph.heading}>
                  <h3 className="text-xs font-mono uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1.5">
                    {paragraph.heading}
                  </h3>
                  <p className="text-sm text-stone-700 dark:text-stone-300 leading-relaxed">
                    {paragraph.body}
                  </p>
                </section>
              ))}

              <section className="pt-1 border-t border-stone-200 dark:border-stone-800">
                <h3 className="text-xs font-mono uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-2 mt-4">
                  What this build in particular does not do yet
                </h3>
                <ul className="space-y-2">
                  {BUILD_LIMITATIONS.map((limitation) => (
                    <li
                      key={limitation}
                      className="text-sm text-stone-700 dark:text-stone-300 leading-relaxed pl-3.5 border-l-2 border-stone-200 dark:border-stone-700"
                    >
                      {limitation}
                    </li>
                  ))}
                </ul>
              </section>

              <section className="pt-1 border-t border-stone-200 dark:border-stone-800">
                <h3 className="text-xs font-mono uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-2 mt-4">
                  What is counted, and what deleting reaches
                </h3>
                <p className="text-sm text-stone-700 dark:text-stone-300 leading-relaxed mb-2">
                  {OPT_OUT_DISCLOSURE}
                </p>
                <p className="text-sm text-stone-700 dark:text-stone-300 leading-relaxed">
                  {DELETION_DISCLOSURE}
                </p>
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
