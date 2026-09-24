import React from 'react';
import { AlertOctagon, RotateCcw } from 'lucide-react';

/**
 * Stage 1 · Application-level error boundary.
 *
 * PRD v1.1.1 NFR-6 ("every failure states a real, specific cause and what to
 * do"), SR-4 ("internal errors, paths and provider payloads are never shown"),
 * TR-13 ("a technical failure is never presented as an epistemic refusal").
 *
 * Before this, an exception during render produced a blank white page: React
 * unmounts the tree and nothing replaced it. A blank page is not an honest
 * failure; it is no failure at all.
 *
 * Two deliberate choices:
 *  - The message names what happened in product terms, not in React's. The
 *    stack and the component trace stay in the console (SR-4).
 *  - It says explicitly that nothing was judged, because a crashed interface
 *    must not be read as the product having declined to answer.
 */

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // SR-4: this goes to the console, not to the screen.
    console.error('[Product Jury] interface error', error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div
        role="alert"
        className="min-h-screen flex items-center justify-center p-6 bg-stone-100 dark:bg-stone-950 text-stone-900 dark:text-stone-100"
      >
        <div className="max-w-md w-full rounded-2xl border border-rose-300 dark:border-rose-900 bg-white dark:bg-stone-900 p-6 shadow-sm">
          <div className="flex items-start gap-3 mb-4">
            <AlertOctagon className="w-6 h-6 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <h1 className="text-base font-semibold mb-1">This interface stopped working</h1>
              <p className="text-sm text-stone-600 dark:text-stone-300 leading-relaxed">
                Something failed inside the page. Nothing was judged and nothing was saved. This is a
                fault in the product, not a statement about your evidence.
              </p>
            </div>
          </div>

          <p className="text-xs text-stone-500 dark:text-stone-400 mb-4 leading-relaxed">
            Reloading starts a new decision. Anything you had entered is gone, because this build
            keeps decisions in the page and has no store behind it yet.
          </p>

          <button
            type="button"
            onClick={this.handleReload}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 hover:bg-stone-800 dark:hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-stone-500"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            Reload and start again
          </button>
        </div>
      </div>
    );
  }
}
