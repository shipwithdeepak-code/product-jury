/**
 * Stage 1 · Error taxonomy.
 *
 * PRD v1.1.1 §51 never-6 and never-9, TR-13, FR-41, NFR-6.
 *
 * Every failure in this product has to be nameable before it can be reported
 * honestly, and it has to be nameable as something that is NOT a refusal.
 * A `ProductJuryError` is always a FAILED outcome. There is no error code in
 * this file that means "the evidence was insufficient" — that is an epistemic
 * outcome produced by a sufficiency assessment (CAP-18), never by a throw.
 */

/**
 * The failure kinds the product can be in. Each one is a real, specific cause
 * (NFR-6) rather than a generic error, and each carries a user-facing sentence
 * that says what to do next.
 *
 * `retryable` describes the failure, not a policy: it says whether repeating
 * the same call could plausibly succeed. It never authorises substituting
 * content for the failure.
 */
export const FAILURE_CODES = [
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_RATE_LIMITED',
  'PROVIDER_AUTH_FAILED',
  'PROVIDER_TIMEOUT',
  'EMPTY_MODEL_RESPONSE',
  'MALFORMED_MODEL_OUTPUT',
  'SCHEMA_VIOLATION',
  'STAGE_FAILED',
  'BUDGET_EXCEEDED',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'USAGE_LIMIT_REACHED',
  'INVALID_REQUEST',
  'CONFIGURATION_ERROR',
  'INTERNAL_ERROR',
] as const;

export type FailureCode = (typeof FAILURE_CODES)[number];

interface FailureDefinition {
  /** HTTP status the API route answers with. */
  status: number;
  /** Could repeating the identical call plausibly succeed? */
  retryable: boolean;
  /**
   * What the PM is told. SR-4: this never contains a provider payload, a stack,
   * an internal path or a model identifier. §11.1: no decisional voice.
   */
  userMessage: string;
}

const FAILURE_DEFINITIONS: Record<FailureCode, FailureDefinition> = {
  PROVIDER_UNAVAILABLE: {
    status: 502,
    retryable: true,
    userMessage:
      'The AI provider did not respond. Nothing was analysed, so nothing is shown. Try again in a moment.',
  },
  PROVIDER_RATE_LIMITED: {
    status: 503,
    retryable: true,
    userMessage:
      'The AI provider is rate limiting requests right now. Nothing was analysed. Try again shortly.',
  },
  PROVIDER_AUTH_FAILED: {
    status: 503,
    retryable: false,
    userMessage:
      'This deployment cannot reach the AI provider: its credentials were rejected. No analysis can run until that is fixed.',
  },
  PROVIDER_TIMEOUT: {
    status: 504,
    retryable: true,
    userMessage:
      'The AI provider did not answer within the time limit. Nothing was analysed. Try again.',
  },
  EMPTY_MODEL_RESPONSE: {
    status: 502,
    retryable: true,
    userMessage:
      'The model returned an empty response. There is nothing to show and nothing was inferred from the gap. Try again.',
  },
  MALFORMED_MODEL_OUTPUT: {
    status: 502,
    retryable: true,
    userMessage:
      'The model returned output that could not be read as structured data. It was discarded rather than guessed at. Try again.',
  },
  SCHEMA_VIOLATION: {
    status: 502,
    retryable: true,
    userMessage:
      'The model returned structured output that did not match what this stage requires. It was discarded rather than filled in. Try again.',
  },
  STAGE_FAILED: {
    status: 502,
    retryable: true,
    userMessage:
      'A stage of the pipeline failed, so no result was produced. Nothing was substituted for it.',
  },
  BUDGET_EXCEEDED: {
    status: 429,
    retryable: false,
    userMessage:
      'This decision reached its cost ceiling before finishing, so it was stopped. No partial result is shown as a complete one.',
  },
  PAYLOAD_TOO_LARGE: {
    status: 413,
    retryable: false,
    userMessage:
      'That artifact is larger than this product accepts. Nothing was uploaded. Try a smaller image.',
  },
  UNSUPPORTED_MEDIA_TYPE: {
    status: 415,
    retryable: false,
    userMessage:
      'That file type is not one this product can read. Use a PNG, JPEG or WebP screenshot.',
  },
  USAGE_LIMIT_REACHED: {
    status: 429,
    retryable: true,
    userMessage:
      'You have reached this product’s usage limit for now. This is a limit, not a failure of the analysis. Try again later.',
  },
  INVALID_REQUEST: {
    status: 400,
    retryable: false,
    userMessage: 'That request was missing something it needs. Nothing was analysed.',
  },
  CONFIGURATION_ERROR: {
    status: 503,
    retryable: false,
    userMessage:
      'This deployment is not configured to run an analysis. No result can be produced until that is fixed.',
  },
  INTERNAL_ERROR: {
    status: 500,
    retryable: false,
    userMessage:
      'Something failed inside this product. No result was produced and nothing was substituted for one.',
  },
};

export interface ProductJuryErrorOptions {
  /** Which pipeline stage was running. Recorded in provenance (TR-4). */
  stage?: string;
  /**
   * The underlying error, kept server-side only. SR-4 forbids showing it.
   */
  cause?: unknown;
  /** Extra non-content diagnostic fields, server-side only. */
  detail?: Record<string, string | number | boolean>;
}

/**
 * The only failure type this product throws. Carrying the code on the error is
 * what lets the API layer answer honestly without inspecting provider strings
 * at the boundary.
 */
export class ProductJuryError extends Error {
  readonly code: FailureCode;
  readonly stage?: string;
  readonly detail?: Record<string, string | number | boolean>;

  constructor(code: FailureCode, options: ProductJuryErrorOptions = {}) {
    super(`${code}${options.stage ? ` at ${options.stage}` : ''}`);
    this.name = 'ProductJuryError';
    this.code = code;
    this.stage = options.stage;
    this.detail = options.detail;
    if (options.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }

  get status(): number {
    return FAILURE_DEFINITIONS[this.code].status;
  }

  get retryable(): boolean {
    return FAILURE_DEFINITIONS[this.code].retryable;
  }

  /** SR-4-safe. Never includes the cause. */
  get userMessage(): string {
    return FAILURE_DEFINITIONS[this.code].userMessage;
  }
}

export function isProductJuryError(value: unknown): value is ProductJuryError {
  return value instanceof ProductJuryError;
}

export function failureDefinition(code: FailureCode): FailureDefinition {
  return FAILURE_DEFINITIONS[code];
}

/**
 * Classify an error thrown by the provider SDK into the taxonomy.
 *
 * This is the only place in the product where a provider string is read, and
 * it reads it to pick a code — never to build a user-facing message and never
 * to decide whether to substitute content.
 */
export function classifyProviderError(error: unknown, stage?: string): ProductJuryError {
  if (isProductJuryError(error)) {
    return error;
  }

  const err = error as { message?: unknown; status?: unknown; code?: unknown } | null | undefined;
  const message = String(err?.message ?? '').toLowerCase();
  const rawStatus = err?.status ?? err?.code;
  const status = typeof rawStatus === 'number' ? rawStatus : Number.parseInt(String(rawStatus), 10);

  const has = (needle: string) => message.includes(needle);

  if (status === 401 || status === 403 || has('api key') || has('unauthenticated') || has('permission denied')) {
    return new ProductJuryError('PROVIDER_AUTH_FAILED', { stage, cause: error });
  }
  if (status === 429 || has('resource_exhausted') || has('quota') || has('rate limit')) {
    return new ProductJuryError('PROVIDER_RATE_LIMITED', { stage, cause: error });
  }
  if (status === 504 || has('timeout') || has('timed out') || has('deadline')) {
    return new ProductJuryError('PROVIDER_TIMEOUT', { stage, cause: error });
  }
  if (
    status === 503 ||
    status === 502 ||
    status === 500 ||
    has('unavailable') ||
    has('high demand') ||
    has('overloaded') ||
    has('fetch failed') ||
    has('econnreset') ||
    has('socket hang up')
  ) {
    return new ProductJuryError('PROVIDER_UNAVAILABLE', { stage, cause: error });
  }
  if (error instanceof SyntaxError || has('json') || has('unexpected token')) {
    return new ProductJuryError('MALFORMED_MODEL_OUTPUT', { stage, cause: error });
  }

  return new ProductJuryError('STAGE_FAILED', { stage, cause: error });
}
