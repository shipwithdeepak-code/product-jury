/**
 * Stage 1 · Model and run provenance.
 *
 * PRD v1.1.1 §51 always-5 ("record model and run metadata for every stage"),
 * TR-4 ("the PM can always see which stages ran and which did not"),
 * TR-5 ("a partial result is labelled partial"), suite J.
 *
 * Provenance is the record that makes TR-4 possible and NFR-4 honest: the
 * front end shows stage completion from this, not from a timer.
 *
 * PR-6: no field here may carry artifact or decision content. Provenance holds
 * stage names, model identifiers, tiers, attempt counts, durations, token
 * counts and outcome labels. It holds no prompt, no response text and no
 * PM-supplied string.
 */

import { randomUUID } from 'crypto';
import { FailureCode } from './errors';
import { findTier, PipelineStage, usedUnevaluatedTier } from './modelRegistry';

export type StageStatus = 'completed' | 'failed' | 'skipped' | 'not_run';

export interface StageProvenance {
  stage: PipelineStage;
  status: StageStatus;
  /** The model that actually answered. Absent when no call succeeded. */
  modelId?: string;
  tier?: string;
  /** How many provider calls this stage made, including retries. */
  attempts: number;
  durationMs: number;
  /** Present only when status is 'failed'. */
  failureCode?: FailureCode;
  /**
   * Why a stage did not run. For 'skipped', this is a real reason such as a
   * gate refusal stopping the pipeline — never a euphemism for a failure.
   */
  reason?: string;
  promptTokens?: number;
  responseTokens?: number;
  estimatedCostCents?: number;
}

export interface RunProvenance {
  runId: string;
  startedAt: string;
  finishedAt?: string;
  stages: StageProvenance[];
  /** §54.7: true when any stage here was served by a tier with no evaluation. */
  servedByUnevaluatedTier: boolean;
  totalEstimatedCostCents: number;
  totalProviderCalls: number;
}

export class RunRecorder {
  private readonly runId: string;
  private readonly startedAt: number;
  private readonly stages: StageProvenance[] = [];

  constructor(runId: string = randomUUID()) {
    this.runId = runId;
    this.startedAt = Date.now();
  }

  get id(): string {
    return this.runId;
  }

  record(entry: StageProvenance): void {
    if (entry.modelId && !entry.tier) {
      entry.tier = findTier(entry.modelId)?.tier;
    }
    this.stages.push(entry);
  }

  /** Declare a stage that never ran, with the real reason. TR-4. */
  notRun(stage: PipelineStage, reason: string): void {
    this.stages.push({ stage, status: 'not_run', attempts: 0, durationMs: 0, reason });
  }

  snapshot(): RunProvenance {
    const servedModels = this.stages
      .map((entry) => entry.modelId)
      .filter((id): id is string => Boolean(id));

    return {
      runId: this.runId,
      startedAt: new Date(this.startedAt).toISOString(),
      finishedAt: new Date().toISOString(),
      stages: this.stages.map((entry) => ({ ...entry })),
      servedByUnevaluatedTier:
        servedModels.length === 0 ? false : usedUnevaluatedTier(servedModels),
      totalEstimatedCostCents: this.stages.reduce(
        (sum, entry) => sum + (entry.estimatedCostCents ?? 0),
        0
      ),
      totalProviderCalls: this.stages.reduce((sum, entry) => sum + entry.attempts, 0),
    };
  }
}

/**
 * Fields provenance is allowed to carry. Asserted by the content-freeness test
 * (TEL-10 applies the same discipline to events; PR-6 applies it here).
 */
export const PROVENANCE_STAGE_FIELDS = Object.freeze([
  'stage',
  'status',
  'modelId',
  'tier',
  'attempts',
  'durationMs',
  'failureCode',
  'reason',
  'promptTokens',
  'responseTokens',
  'estimatedCostCents',
]);
