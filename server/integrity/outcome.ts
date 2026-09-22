/**
 * Stage 1 · The three run outcomes, and the wall between two of them.
 *
 * PRD v1.1.1 CAP-07, CAP-18, FR-41, TR-13, §51 never-9.
 *
 *   VERDICT      — the pipeline ran and reached a position.
 *   INSUFFICIENT — the pipeline ran and judged that the evidence cannot carry
 *                  a call on the stated question. An epistemic outcome. It
 *                  requires a *successful* sufficiency assessment.
 *   FAILED       — the pipeline could not execute. A technical outcome.
 *
 * The invariant this module exists to enforce: a refusal may only be
 * constructed from a completed sufficiency assessment. There is no code path
 * that turns a caught error into an INSUFFICIENT, and `refusal()` throws if
 * asked to build one without an assessment behind it.
 *
 * Note on Stage 1 scope: the sufficiency gate itself (CAP-18) is Stage 2. This
 * module builds the state machine and the wall, so that when the gate arrives
 * it cannot be wired to a catch block. Nothing in Stage 1 emits INSUFFICIENT
 * in production — that is correct, not an omission.
 */

import { ProductJuryError, FailureCode, isProductJuryError } from './errors';
import type { RunProvenance } from './provenance';

export type RunOutcomeKind = 'VERDICT' | 'INSUFFICIENT' | 'FAILED';

/** One thing the product would need in order to judge (FR-15). */
export interface MissingItem {
  /** What is missing, named specifically. */
  item: string;
  /** Why it matters to *this* decision question. */
  whyItMatters: string;
  /** The cheapest way to get it. */
  howToGetIt: string;
}

/**
 * Evidence that a sufficiency assessment actually ran. Without one of these,
 * a refusal cannot be constructed.
 */
export interface SufficiencyAssessment {
  /** Which point judged: the early gate (CAP-18) or the binding ceiling (CAP-06). */
  assessedAt: 'GATE' | 'CEILING';
  /** True when the assessment completed. A failed assessment is a FAILED run. */
  completed: true;
  /** Whether the evidence can carry a call. */
  sufficient: boolean;
  /** The model run that performed the assessment. */
  runId: string;
}

export interface VerdictOutcome<T> {
  kind: 'VERDICT';
  data: T;
  provenance: RunProvenance;
}

export interface InsufficientOutcome {
  kind: 'INSUFFICIENT';
  /** Which refusal point produced it. Maps to gate_refused / ceiling_refused. */
  refusedAt: 'GATE' | 'CEILING';
  /** FR-15: at least two. */
  missing: MissingItem[];
  /** The assessment that produced the refusal. */
  assessment: SufficiencyAssessment;
  provenance: RunProvenance;
}

export interface FailedOutcome {
  kind: 'FAILED';
  code: FailureCode;
  /** SR-4-safe sentence for the user. */
  userMessage: string;
  retryable: boolean;
  /** Which stage failed, where known. */
  stage?: string;
  provenance: RunProvenance;
}

export type RunOutcome<T> = VerdictOutcome<T> | InsufficientOutcome | FailedOutcome;

export class RefusalIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RefusalIntegrityError';
  }
}

export function verdict<T>(data: T, provenance: RunProvenance): VerdictOutcome<T> {
  return { kind: 'VERDICT', data, provenance };
}

/**
 * Build an INSUFFICIENT outcome.
 *
 * Refuses to build one unless a completed sufficiency assessment says the
 * evidence is insufficient, and unless at least two specific missing items are
 * named (FR-15, CAP-07, CAP-18).
 *
 * This is the wall. An error cannot reach here: `ProductJuryError` is not a
 * `SufficiencyAssessment`, and the runtime check below rejects anything that
 * is not one.
 */
export function refusal(
  assessment: SufficiencyAssessment,
  missing: MissingItem[],
  provenance: RunProvenance
): InsufficientOutcome {
  if (isProductJuryError(assessment as unknown)) {
    throw new RefusalIntegrityError(
      'A technical failure was passed where a sufficiency assessment is required. ' +
        'A failure is never a refusal (TR-13, §51 never-9).'
    );
  }
  if (!assessment || assessment.completed !== true) {
    throw new RefusalIntegrityError(
      'INSUFFICIENT requires a completed sufficiency assessment. ' +
        'An assessment that did not complete is a FAILED run (CAP-18 failure state).'
    );
  }
  if (assessment.sufficient !== false) {
    throw new RefusalIntegrityError(
      'INSUFFICIENT was requested from an assessment that found the evidence sufficient.'
    );
  }
  if (assessment.assessedAt !== 'GATE' && assessment.assessedAt !== 'CEILING') {
    throw new RefusalIntegrityError('A refusal must name the point that refused (§55).');
  }
  if (!Array.isArray(missing) || missing.length < 2) {
    throw new RefusalIntegrityError(
      'A refusal must name at least two specific missing items (FR-15, CAP-07).'
    );
  }
  for (const entry of missing) {
    if (!entry?.item?.trim() || !entry?.whyItMatters?.trim() || !entry?.howToGetIt?.trim()) {
      throw new RefusalIntegrityError(
        'Each missing item must say what is missing, why it matters and how to get it (CAP-18).'
      );
    }
  }

  return {
    kind: 'INSUFFICIENT',
    refusedAt: assessment.assessedAt,
    missing,
    assessment,
    provenance,
  };
}

/**
 * Build a FAILED outcome from a thrown error.
 *
 * Every error path in the product terminates here. There is deliberately no
 * parameter, flag or option on this function that could route an error to
 * INSUFFICIENT.
 */
export function failed(error: unknown, provenance: RunProvenance): FailedOutcome {
  const pjError = isProductJuryError(error)
    ? error
    : new ProductJuryError('INTERNAL_ERROR', { cause: error });

  return {
    kind: 'FAILED',
    code: pjError.code,
    userMessage: pjError.userMessage,
    retryable: pjError.retryable,
    stage: pjError.stage,
    provenance,
  };
}

export function isVerdict<T>(outcome: RunOutcome<T>): outcome is VerdictOutcome<T> {
  return outcome.kind === 'VERDICT';
}

export function isInsufficient<T>(outcome: RunOutcome<T>): outcome is InsufficientOutcome {
  return outcome.kind === 'INSUFFICIENT';
}

export function isFailed<T>(outcome: RunOutcome<T>): outcome is FailedOutcome {
  return outcome.kind === 'FAILED';
}
