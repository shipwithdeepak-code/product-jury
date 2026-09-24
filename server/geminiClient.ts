import { GoogleGenAI, Type } from '@google/genai';
import { ProductJuryError, classifyProviderError } from './integrity/errors';
import { DecisionBudget, approximateTokens, estimateCost } from './integrity/budget';
import { ladderForStage, PipelineStage, VERDICT_BEARING_TIER_POLICY } from './integrity/modelRegistry';
import { RunRecorder } from './integrity/provenance';
import {
  UNTRUSTED_DATA_PREAMBLE,
  assertNoUntrustedInSystemInstruction,
} from './integrity/untrusted';
import { parseArtifact } from './integrity/payload';

/**
 * Stage 1 · The provider client, rewritten around honest failure.
 *
 * What changed and why:
 *
 *  - It throws a typed `ProductJuryError` instead of the provider's last error
 *    (NFR-6, SR-4). Nothing downstream reads a provider string.
 *  - A malformed JSON response is no longer retried as though it were a
 *    capacity problem: it is MALFORMED_MODEL_OUTPUT and it is discarded
 *    (§51 never-1, never-4).
 *  - An empty response is EMPTY_MODEL_RESPONSE, not a reason to fill the gap.
 *  - Every attempt is charged to a per-decision budget before it is made
 *    (NFR-9) and recorded in provenance with the model that served it
 *    (§51 always-5, TR-4).
 *  - Supplied content is placed in structurally separated blocks and asserted
 *    never to appear in the system instruction (SR-2, SR-7).
 *  - A timeout is enforced here rather than left to the SDK, so
 *    PROVIDER_TIMEOUT is a real state (NFR-2, NFR-3).
 *
 * What is NOT here, deliberately: any fallback, default, placeholder or
 * substitute value. When this function cannot return model output, it throws.
 */

let genAIClient: GoogleGenAI | null = null;

export function getGenAI(): GoogleGenAI {
  if (!genAIClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new ProductJuryError('CONFIGURATION_ERROR', {
        detail: { missing: 'GEMINI_API_KEY' },
      });
    }
    genAIClient = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });
  }
  return genAIClient;
}

/** Test seam: lets the suites inject a stub provider without a network call. */
export function __setGenAIClientForTests(client: GoogleGenAI | null): void {
  genAIClient = client;
}

export const PROVIDER_TIMEOUT_MS = Number(process.env.PJ_PROVIDER_TIMEOUT_MS ?? 30_000);
const MAX_ATTEMPTS_PER_MODEL = 2;

export interface InvokeGeminiJsonOptions {
  /** Instruction context. Never contains supplied content (SR-2). */
  systemInstruction: string;
  /**
   * The user-role prompt. Supplied content inside it must already be wrapped
   * in `untrustedBlock()` — `untrustedInputs` below is what asserts it.
   */
  prompt: string;
  schema: unknown;
  temperature?: number;
  imageBase64?: string;
  mimeType?: string;
  /** Which pipeline stage this call serves. Drives the ladder and provenance. */
  stage: PipelineStage;
  /** Charged before every attempt. */
  budget: DecisionBudget;
  /** Records which model served the stage. */
  recorder: RunRecorder;
  /**
   * Every piece of user- or artifact-supplied text that went into `prompt`.
   * Asserted absent from `systemInstruction` (SR-2).
   */
  untrustedInputs?: ReadonlyArray<string | undefined | null>;
  /** Validates the parsed object. A violation is SCHEMA_VIOLATION, not a default. */
  validate?: (value: unknown) => string | null;
}

export async function invokeGeminiJson<T>(options: InvokeGeminiJsonOptions): Promise<T> {
  const {
    systemInstruction,
    prompt,
    schema,
    temperature = 0.25,
    imageBase64,
    mimeType = 'image/png',
    stage,
    budget,
    recorder,
    untrustedInputs = [],
    validate,
  } = options;

  // SR-2. Throws a plain Error because this is a programming defect in the
  // caller, not a runtime condition the PM can act on.
  assertNoUntrustedInSystemInstruction(systemInstruction, untrustedInputs);

  /*
   * The ladder exists for one condition only: the model that should serve this
   * stage is unavailable or rate limiting. It is not a quality fallback. A
   * malformed response, a contract violation, an empty response, an auth
   * failure or a budget ceiling all stop here rather than descending, because
   * descending means asking a smaller model the same question and presenting
   * its answer as the stage's output (§51 never-2, §54.7).
   */
  const ladder = ladderForStage(stage);
  if (ladder.length === 0) {
    // Only reachable under VERDICT_BEARING_TIER_POLICY === 'restrict' with no
    // evaluated tier. It is a configuration state, not a model failure.
    const error = new ProductJuryError('CONFIGURATION_ERROR', {
      stage,
      detail: { reason: 'no_evaluated_tier', policy: VERDICT_BEARING_TIER_POLICY },
    });
    recorder.record({
      stage,
      status: 'failed',
      attempts: 0,
      durationMs: 0,
      failureCode: error.code,
      reason: 'no evaluated model tier is permitted to serve this stage',
    });
    throw error;
  }

  const ai = getGenAI();

  const parts: unknown[] = [];
  if (imageBase64 && imageBase64.trim().length > 0) {
    const artifact = parseArtifact(imageBase64, mimeType, stage);
    parts.push({ inlineData: { mimeType: artifact.mimeType, data: artifact.base64 } });
  }
  // The untrusted-content contract travels with every prompt that carries one.
  const fullSystemInstruction = `${systemInstruction}\n\n${UNTRUSTED_DATA_PREAMBLE}`;
  parts.push({ text: prompt });

  const requestPayload = {
    contents: { parts },
    config: {
      systemInstruction: fullSystemInstruction,
      temperature,
      responseMimeType: 'application/json',
      responseSchema: schema,
    },
  };

  const startedAt = Date.now();
  let attempts = 0;
  let lastError: ProductJuryError | null = null;
  let servedBy: string | undefined;

  for (const tier of ladder) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_MODEL; attempt++) {
      // NFR-9: the ceiling is checked before the spend, and it throws.
      budget.assertCanSpend(stage);
      attempts += 1;

      const promptTokens =
        approximateTokens(fullSystemInstruction) +
        approximateTokens(prompt) +
        (imageBase64 ? 1_200 : 0);

      let responseText: string | undefined;
      try {
        const response = await withTimeout(
          ai.models.generateContent({ model: tier.id, ...(requestPayload as any) }),
          PROVIDER_TIMEOUT_MS,
          stage
        );
        responseText = (response as { text?: string })?.text;
        servedBy = tier.id;
      } catch (error) {
        budget.charge(estimateCost(tier.id, promptTokens, 0));
        lastError = classifyProviderError(error, stage);

        // A configuration failure and an auth failure will not be fixed by
        // another model, so the ladder stops rather than burning the budget.
        if (
          lastError.code === 'PROVIDER_AUTH_FAILED' ||
          lastError.code === 'CONFIGURATION_ERROR' ||
          lastError.code === 'BUDGET_EXCEEDED'
        ) {
          recordFailure(recorder, stage, attempts, startedAt, lastError, servedBy);
          throw lastError;
        }
        // A non-retryable provider error will not be fixed by asking a
        // smaller model the same question, so the ladder stops.
        if (!lastError.retryable) {
          recordFailure(recorder, stage, attempts, startedAt, lastError, servedBy);
          throw lastError;
        }
        // Retry the same model only for genuinely transient conditions; the
        // ladder below is for capacity, which is what these codes mean.
        if (attempt + 1 < MAX_ATTEMPTS_PER_MODEL) {
          await delay(800);
        }
        continue;
      }

      budget.charge(estimateCost(tier.id, promptTokens, approximateTokens(responseText ?? '')));

      if (!responseText || responseText.trim().length === 0) {
        // §51 never-1: an empty response is not an invitation to invent one.
        lastError = new ProductJuryError('EMPTY_MODEL_RESPONSE', { stage });
        // One more attempt at the same model, then stop. Descending the ladder
        // would ask a smaller model the question a larger one just answered
        // with nothing, which is the capacity-fallback reflex this rewrite
        // removed.
        if (attempt + 1 < MAX_ATTEMPTS_PER_MODEL) continue;
        recordFailure(recorder, stage, attempts, startedAt, lastError, servedBy);
        throw lastError;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(responseText);
      } catch (parseError) {
        // Malformed output is discarded, not retried as a capacity problem and
        // not repaired by guessing at the missing fields.
        lastError = new ProductJuryError('MALFORMED_MODEL_OUTPUT', { stage, cause: parseError });
        recordFailure(recorder, stage, attempts, startedAt, lastError, servedBy);
        throw lastError;
      }

      if (validate) {
        const violation = validate(parsed);
        if (violation) {
          lastError = new ProductJuryError('SCHEMA_VIOLATION', {
            stage,
            detail: { violation },
          });
          // As above: output that does not meet the contract is discarded, and
          // the contract is not relaxed for a smaller model.
          recordFailure(recorder, stage, attempts, startedAt, lastError, servedBy);
          throw lastError;
        }
      }

      recorder.record({
        stage,
        status: 'completed',
        modelId: tier.id,
        tier: tier.tier,
        attempts,
        durationMs: Date.now() - startedAt,
        promptTokens,
        responseTokens: approximateTokens(responseText),
        estimatedCostCents: estimateCost(
          tier.id,
          promptTokens,
          approximateTokens(responseText)
        ).estimatedCostCents,
      });

      return parsed as T;
    }
  }

  const failure =
    lastError ?? new ProductJuryError('STAGE_FAILED', { stage, detail: { reason: 'ladder_exhausted' } });
  recordFailure(recorder, stage, attempts, startedAt, failure, servedBy);
  throw failure;
}

function recordFailure(
  recorder: RunRecorder,
  stage: PipelineStage,
  attempts: number,
  startedAt: number,
  error: ProductJuryError,
  servedBy?: string
): void {
  recorder.record({
    stage,
    status: 'failed',
    modelId: servedBy,
    attempts,
    durationMs: Date.now() - startedAt,
    failureCode: error.code,
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(promise: Promise<T>, ms: number, stage: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ProductJuryError('PROVIDER_TIMEOUT', { stage })), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export { Type };
