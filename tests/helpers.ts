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
