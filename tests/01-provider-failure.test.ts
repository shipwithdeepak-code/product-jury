import { afterEach, describe, expect, it } from 'vitest';
import {
  __setGenAIClientForTests,
  invokeGeminiJson,
  PROVIDER_TIMEOUT_MS,
} from '../server/geminiClient';
import { isProductJuryError } from '../server/integrity/errors';
import { MINIMAL_SCHEMA, caught, shortRun, stubProvider } from './helpers';

/**
 * Groups 1-4 of the Stage 1 brief: model failure, malformed model response,
 * timeout, empty model response.
 *
 * Each one asserts the same shape of behaviour from a different cause: the
 * call throws a typed failure and returns nothing usable. PRD v1.1.1 §51
 * never-1 ("never present a claim, verdict, confidence figure or agent output
 * that was not produced by a completed model call").
 */

afterEach(() => {
  __setGenAIClientForTests(null);
});

function invoke() {
  const { budget, recorder } = shortRun();
  return {
    recorder,
    promise: invokeGeminiJson<never>({
      systemInstruction: 'You assess evidence.',
      prompt: 'Assess it.',
      schema: MINIMAL_SCHEMA,
      stage: 'specialist_ux',
      budget,
      recorder,
    }),
  };
}

describe('1 · model failure', () => {
  it('throws a typed failure and returns no substitute output', async () => {
    const { client } = stubProvider(() => {
      throw new Error('503 Service Unavailable from upstream');
    });
    __setGenAIClientForTests(client);

    const { promise, recorder } = invoke();
    await expect(promise).rejects.toSatisfy(isProductJuryError);

    const stage = recorder.snapshot().stages.find((s) => s.stage === 'specialist_ux');
    expect(stage?.status).toBe('failed');
    expect(stage?.failureCode).toBeDefined();
  });

  it('classifies an authentication failure as non-retryable and stops the ladder', async () => {
    const { client, calls } = stubProvider(() => {
      throw new Error('API key not valid. Please pass a valid API key. (401)');
    });
    __setGenAIClientForTests(client);

    const { promise } = invoke();
    const error = await promise.catch((e) => caught(e));

    expect(error.code).toBe('PROVIDER_AUTH_FAILED');
    expect(error.retryable).toBe(false);
    // One model, one attempt: a wrong key is not a capacity problem.
    expect(calls.length).toBe(1);
  });

  it('never leaks the provider payload into what the PM is shown', async () => {
    const { client } = stubProvider(() => {
      throw new Error('googleapis.com/v1beta/models: quota_metric "generate_requests" exceeded');
    });
    __setGenAIClientForTests(client);

    const error = await invoke().promise.catch((e) => caught(e));
    expect(error.userMessage).not.toContain('googleapis');
    expect(error.userMessage).not.toContain('quota_metric');
  });
});

describe('2 · malformed model response', () => {
  it('discards unparseable output rather than repairing it', async () => {
    const { client } = stubProvider(() => ({ text: '{"verdict": "SHIP", "confidence":' }));
    __setGenAIClientForTests(client);

    const error = await invoke().promise.catch((e) => caught(e));
    expect(error.code).toBe('MALFORMED_MODEL_OUTPUT');
  });

  it('does not retry malformed output as though it were a capacity problem', async () => {
    const { client, calls } = stubProvider(() => ({ text: 'Here is my analysis: the flow is fine.' }));
    __setGenAIClientForTests(client);

    await invoke().promise.catch(() => undefined);
    // The old client retried this down the whole model ladder. Malformed JSON
    // is a bad response, not a busy one, so it is discarded on the first sight.
    expect(calls.length).toBe(1);
  });

  it('rejects structurally valid JSON that violates the stage contract', async () => {
    const { client } = stubProvider(() => ({ text: '{"confidence": null}' }));
    __setGenAIClientForTests(client);

    const { budget, recorder } = shortRun();
    const error = await invokeGeminiJson<never>({
      systemInstruction: 'x',
      prompt: 'y',
      schema: MINIMAL_SCHEMA,
      stage: 'chair',
      budget,
      recorder,
      validate: (value) =>
        typeof (value as { confidence?: unknown }).confidence === 'number'
          ? null
          : 'confidence is required and was not a number',
    }).catch((e) => caught(e));

    expect(error.code).toBe('SCHEMA_VIOLATION');
  });
});

describe('3 · timeout', () => {
  it('is a real state with its own code, not a hang', async () => {
    const { client } = stubProvider(
      () => new Promise((resolve) => setTimeout(() => resolve({ text: '{}' }), PROVIDER_TIMEOUT_MS * 10))
    );
    __setGenAIClientForTests(client);

    const error = await invoke().promise.catch((e) => caught(e));
    expect(error.code).toBe('PROVIDER_TIMEOUT');
    expect(error.userMessage).toMatch(/nothing was analysed/i);
  });
});

describe('4 · empty model response', () => {
  it('treats an empty response as a failure, not as an absence of findings', async () => {
    const { client } = stubProvider(() => ({ text: '' }));
    __setGenAIClientForTests(client);

    const error = await invoke().promise.catch((e) => caught(e));
    expect(error.code).toBe('EMPTY_MODEL_RESPONSE');
  });

  it('treats a missing text field the same way', async () => {
    const { client } = stubProvider(() => ({}));
    __setGenAIClientForTests(client);

    const error = await invoke().promise.catch((e) => caught(e));
    expect(error.code).toBe('EMPTY_MODEL_RESPONSE');
  });
});
