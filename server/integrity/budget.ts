/**
 * Stage 1 · Cost protection and the per-decision budget ceiling.
 *
 * PRD v1.1.1 NFR-9 ("cost per decision is bounded and enforced — hard
 * ceiling"), TEL-8 ("cost and latency per decision are recorded from the first
 * week"), §49 ("hard per-decision ceiling from day one").
 *
 * The ceiling is enforced, not advisory: when a run would exceed it, the run
 * stops with BUDGET_EXCEEDED. A run stopped by the ceiling produces no verdict
 * and no refusal — it is a FAILED outcome, because the product could not
 * finish, not because the evidence could not carry a call.
 */

import { ProductJuryError } from './errors';
import { findTier } from './modelRegistry';

export interface BudgetLimits {
  /** Hard ceiling on estimated spend for one decision, in US cents. */
  maxCostCents: number;
  /** Hard ceiling on provider calls for one decision, retries included. */
  maxProviderCalls: number;
  /** Hard ceiling on wall-clock time for one decision. */
  maxDurationMs: number;
}

/**
 * Defaults. The old ladder could make eight provider calls per stage across
 * four stages — thirty-two calls for one review, with nothing watching. These
 * numbers bound that. They are configuration, not thresholds from the PRD:
 * the PRD requires a ceiling and does not name its value.
 */
export const DEFAULT_BUDGET: BudgetLimits = Object.freeze({
  maxCostCents: Number(process.env.PJ_MAX_DECISION_COST_CENTS ?? 25),
  maxProviderCalls: Number(process.env.PJ_MAX_PROVIDER_CALLS ?? 12),
  maxDurationMs: Number(process.env.PJ_MAX_DECISION_MS ?? 90_000),
});

export interface CostEstimate {
  promptTokens: number;
  responseTokens: number;
  estimatedCostCents: number;
}

/**
 * Estimate the cost of one call from the tier's declared rates.
 *
 * Deliberately an upper-bound estimate rather than a measurement: the point is
 * to stop a runaway run, and an estimate that is a little high stops one
 * sooner. Where the provider reports usage, that is used; where it does not,
 * the character-count fallback below is used and the estimate is marked as
 * such by the caller passing `measured: false`.
 */
export function estimateCost(
  modelId: string,
  promptTokens: number,
  responseTokens: number
): CostEstimate {
  const tier = findTier(modelId);
  const inputRate = tier?.costCentsPerMillionInput ?? 30;
  const outputRate = tier?.costCentsPerMillionOutput ?? 250;

  const estimatedCostCents =
    (promptTokens / 1_000_000) * inputRate + (responseTokens / 1_000_000) * outputRate;

  return { promptTokens, responseTokens, estimatedCostCents };
}

/** Rough token count for when the provider reports no usage. ~4 chars/token. */
export function approximateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * The budget for one decision. One instance per run; every provider call is
 * charged to it before it is made.
 */
export class DecisionBudget {
  private costCents = 0;
  private calls = 0;
  private readonly startedAt = Date.now();

  constructor(private readonly limits: BudgetLimits = DEFAULT_BUDGET) {}

  get spentCents(): number {
    return this.costCents;
  }

  get callCount(): number {
    return this.calls;
  }

  get elapsedMs(): number {
    return Date.now() - this.startedAt;
  }

  get limitsInUse(): BudgetLimits {
    return this.limits;
  }

  /**
   * Called before each provider call. Throws BUDGET_EXCEEDED rather than
   * returning a boolean, so that a caller cannot ignore the answer and
   * proceed.
   */
  assertCanSpend(stage: string): void {
    if (this.calls >= this.limits.maxProviderCalls) {
      throw new ProductJuryError('BUDGET_EXCEEDED', {
        stage,
        detail: { reason: 'call_ceiling', calls: this.calls, limit: this.limits.maxProviderCalls },
      });
    }
    if (this.costCents >= this.limits.maxCostCents) {
      throw new ProductJuryError('BUDGET_EXCEEDED', {
        stage,
        detail: { reason: 'cost_ceiling', spentCents: this.costCents },
      });
    }
    if (this.elapsedMs >= this.limits.maxDurationMs) {
      throw new ProductJuryError('BUDGET_EXCEEDED', {
        stage,
        detail: { reason: 'duration_ceiling', elapsedMs: this.elapsedMs },
      });
    }
  }

  /** Charge a completed (or attempted) call to the budget. */
  charge(estimate: CostEstimate): void {
    this.calls += 1;
    this.costCents += estimate.estimatedCostCents;
  }
}
