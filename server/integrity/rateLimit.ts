/**
 * Stage 1 · Usage limits.
 *
 * PRD v1.1.1 SR-3 ("usage limits prevent one visitor from consuming shared
 * capacity") and SR-6 ("hitting a usage limit is a distinct, honest state —
 * not disguised as a failure").
 *
 * SR-6 is the reason this is its own code rather than a generic 429: the PM is
 * told they hit a limit, which is a statement about the product's capacity and
 * not about their evidence or about the model. It is still a FAILED outcome in
 * the CAP-07 sense — no analysis ran — but it says so as a limit.
 *
 * Scope: a fixed-window in-memory counter, keyed by client address. It is
 * correct for a single process, which is what this deployment is. A multi-
 * instance deployment needs a shared store, and that belongs with the
 * persistence work rather than here.
 */

import { ProductJuryError } from './errors';

export interface RateLimitRule {
  /** Window length. */
  windowMs: number;
  /** Requests allowed per key per window. */
  max: number;
}

export const RATE_LIMIT_RULES: Record<string, RateLimitRule> = {
  /** The expensive route: a full deliberation. */
  deliberate: {
    windowMs: Number(process.env.PJ_RL_DELIBERATE_WINDOW_MS ?? 60_000),
    max: Number(process.env.PJ_RL_DELIBERATE_MAX ?? 5),
  },
  /** Artifact analysis and context comparison. */
  analyze: {
    windowMs: Number(process.env.PJ_RL_ANALYZE_WINDOW_MS ?? 60_000),
    max: Number(process.env.PJ_RL_ANALYZE_MAX ?? 15),
  },
  /** Telemetry ingest: cheap, but not unbounded. */
  telemetry: {
    windowMs: Number(process.env.PJ_RL_TELEMETRY_WINDOW_MS ?? 60_000),
    max: Number(process.env.PJ_RL_TELEMETRY_MAX ?? 120),
  },
};

interface WindowState {
  count: number;
  resetAt: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window resets. Sent as Retry-After. */
  retryAfterSeconds: number;
}

export class RateLimiter {
  private readonly windows = new Map<string, WindowState>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  check(bucket: string, key: string, rule: RateLimitRule): RateLimitDecision {
    const mapKey = `${bucket}:${key}`;
    const current = this.now();
    let state = this.windows.get(mapKey);

    if (!state || state.resetAt <= current) {
      state = { count: 0, resetAt: current + rule.windowMs };
      this.windows.set(mapKey, state);
    }

    state.count += 1;
    const retryAfterSeconds = Math.max(1, Math.ceil((state.resetAt - current) / 1000));

    return {
      allowed: state.count <= rule.max,
      remaining: Math.max(0, rule.max - state.count),
      retryAfterSeconds,
    };
  }

  /** Drop expired windows. Called opportunistically by the middleware. */
  sweep(): void {
    const current = this.now();
    for (const [key, state] of this.windows) {
      if (state.resetAt <= current) {
        this.windows.delete(key);
      }
    }
  }

  reset(): void {
    this.windows.clear();
  }
}

export const sharedRateLimiter = new RateLimiter();

/**
 * Express middleware. Answers with USAGE_LIMIT_REACHED, which the taxonomy
 * renders as a limit rather than as an analysis failure (SR-6).
 */
export function rateLimit(bucket: keyof typeof RATE_LIMIT_RULES) {
  const rule = RATE_LIMIT_RULES[bucket];
  let sweepCounter = 0;

  return (req: any, res: any, next: any) => {
    if (++sweepCounter % 200 === 0) {
      sharedRateLimiter.sweep();
    }

    const key = clientKey(req);
    const decision = sharedRateLimiter.check(bucket, key, rule);

    res.setHeader('X-RateLimit-Limit', String(rule.max));
    res.setHeader('X-RateLimit-Remaining', String(decision.remaining));

    if (!decision.allowed) {
      res.setHeader('Retry-After', String(decision.retryAfterSeconds));
      const error = new ProductJuryError('USAGE_LIMIT_REACHED', {
        detail: { bucket, retryAfterSeconds: decision.retryAfterSeconds },
      });
      return res.status(error.status).json({
        success: false,
        outcome: 'FAILED',
        code: error.code,
        error: error.userMessage,
        retryable: error.retryable,
        retryAfterSeconds: decision.retryAfterSeconds,
      });
    }

    return next();
  };
}

/**
 * The limiter key. Not stored, not logged, not attached to any event — PR-6
 * and §55 both forbid an identifier that outlives the window.
 */
export function clientKey(req: {
  ip?: string;
  socket?: { remoteAddress?: string };
  headers?: Record<string, unknown>;
}): string {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}
