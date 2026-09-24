import { RunRecorder } from '../server/integrity/provenance';
import { DecisionBudget } from '../server/integrity/budget';

/**
 * A provider stub. Nothing in these suites reaches the network: every test
 * installs one of these through `__setGenAIClientForTests`.
 */
export function stubProvider(
  respond: (call: { model: string; index: number }) => Promise<unknown> | unknown
) {
  let index = 0;
  const calls: string[] = [];
  const client = {
    models: {
      generateContent: async (request: { model: string }) => {
        calls.push(request.model);
        const current = index;
        index += 1;
        return await respond({ model: request.model, index: current });
      },
    },
  };
  return { client: client as never, calls };
}

/** A budget small enough that a failing ladder does not run for seconds. */
export function shortRun() {
  return {
    budget: new DecisionBudget({ maxCostCents: 25, maxProviderCalls: 12, maxDurationMs: 90_000 }),
    recorder: new RunRecorder('test-run'),
  };
}

export const MINIMAL_SCHEMA = { type: 'OBJECT', properties: {} };

/** Narrow a caught value to the typed failure the product throws. */
export function caught(error: unknown): {
  code: string;
  retryable: boolean;
  userMessage: string;
  stage?: string;
} {
  return error as { code: string; retryable: boolean; userMessage: string; stage?: string };
}

/**
 * The refusal's own words. A `ProductJuryError`'s message is the code and the
 * stage; what was actually wrong is in its detail, and a test that asserts on
 * the code alone would pass for the wrong reason.
 */
export function violationFrom(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    const detail = (error as { detail?: { violation?: unknown } }).detail;
    return String(detail?.violation ?? (error as Error).message);
  }
  throw new Error('expected the response to be refused, and it was not');
}
