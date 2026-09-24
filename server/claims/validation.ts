import {
  Claim,
  ClaimDependant,
  ClaimId,
  ClaimOrigin,
  EPISTEMIC_STATUSES,
  LOAD_BEARING_STATUSES,
  ORIGIN_KINDS,
  OpenQuestion,
} from '../../src/types/claims';
import { isClaimId } from './identity';

/**
 * Stage 2 · Strict claim validation.
 *
 * The rule is Stage 1's rule applied to a new object: reject, never repair.
 * A claim that arrives without an id, without a kind, or without the thing its
 * origin kind requires is not a claim that needs filling in — it is a claim the
 * product has no basis for, and CAP-03's failure state says what happens to it:
 * "A statement that cannot be attributed is not shown."
 *
 * Every schema here is CLOSED. An unexpected field is an error rather than
 * something to ignore, because the alternative is a model returning
 * `{"statement": "...", "confidence": 90, "verdict": "SHIP"}` and the product
 * quietly keeping the first two.
 */

export class ClaimValidationError extends Error {
  readonly errors: string[];

  constructor(errors: string[]) {
    super(`Claim validation failed: ${errors.join('; ')}`);
    this.name = 'ClaimValidationError';
    this.errors = errors;
  }
}

/** Thrown when a reference names a claim that is not in the spine. */
export class ClaimReferenceError extends Error {
  readonly missing: ClaimId[];

  constructor(missing: ClaimId[], context: string) {
    super(
      `Unresolvable claim reference${missing.length === 1 ? '' : 's'} in ${context}: ` +
        `${missing.join(', ')}. A reference is never dropped to make a structure valid.`
    );
    this.name = 'ClaimReferenceError';
    this.missing = missing;
  }
}

const CLAIM_FIELDS = new Set([
  'id',
  'text',
  'epistemicStatus',
  'origin',
  'supports',
  'loadBearing',
  'confidence',
  'producedBy',
  'runId',
  'createdAt',
  'surfaced',
]);

const ORIGIN_FIELDS: Record<string, readonly string[]> = {
  ARTIFACT: ['kind', 'evidence', 'runId', 'stage'],
  MODEL_INFERENCE: ['kind', 'reasoning', 'derivedFrom', 'runId', 'stage'],
  MODEL_ASSUMPTION: ['kind', 'reason', 'runId', 'stage'],
  PM_INPUT: ['kind', 'field'],
  PM_EVIDENCE: ['kind', 'channel'],
  PM_ANSWER: ['kind', 'answers'],
  PM_EDIT: ['kind', 'supersedes'],
  DERIVED_FROM_CLAIM: ['kind', 'derivedFrom', 'reasoning', 'runId', 'stage'],
};

const DEPENDANT_KINDS = new Set([
  'CLAIM',
  'OPPORTUNITY',
  'VERDICT',
  'SPECIALIST_POSITION',
  'AUDIT_FINDING',
]);

const QUESTION_FIELDS = new Set([
  'claimId',
  'question',
  'whyItMatters',
  'decisionImpact',
  'howToGetIt',
  'blocks',
  'status',
  'answerClaimId',
]);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function closedSchema(
  value: Record<string, unknown>,
  allowed: Iterable<string>,
  label: string,
  errors: string[]
): void {
  const permitted = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!permitted.has(key)) {
      errors.push(`${label}: field "${key}" is not part of the schema`);
    }
  }
}

/**
 * Validate one origin. Returns the claim ids it references, so the caller can
 * resolve them against the spine.
 */
export function validateOrigin(
  origin: unknown,
  label: string,
  errors: string[]
): ClaimId[] {
  if (typeof origin !== 'object' || origin === null || Array.isArray(origin)) {
    errors.push(`${label}: origin is missing. A statement with no origin is not shown (CAP-03).`);
    return [];
  }

  const candidate = origin as Record<string, unknown>;
  const kind = candidate.kind;

  if (typeof kind !== 'string' || !(ORIGIN_KINDS as readonly string[]).includes(kind)) {
    errors.push(`${label}: origin.kind "${String(kind)}" is not one of ${ORIGIN_KINDS.join(', ')}`);
    return [];
  }

  closedSchema(candidate, ORIGIN_FIELDS[kind], `${label}.origin`, errors);

  const references: ClaimId[] = [];

  const requireRunAndStage = () => {
    if (!isNonEmptyString(candidate.runId)) errors.push(`${label}: origin.runId is required`);
    if (!isNonEmptyString(candidate.stage)) errors.push(`${label}: origin.stage is required`);
  };

  const requireRefList = (field: string, atLeastOne: boolean) => {
    const list = candidate[field];
    if (!Array.isArray(list)) {
      errors.push(`${label}: origin.${field} must be an array of claim ids`);
      return;
    }
    if (atLeastOne && list.length === 0) {
      errors.push(
        `${label}: origin.${field} is empty. A ${kind} origin that names nothing it was derived ` +
          `from is not an origin.`
      );
    }
    for (const entry of list) {
      if (!isClaimId(entry)) {
        errors.push(`${label}: origin.${field} contains a malformed claim reference`);
      } else {
        references.push(entry);
      }
    }
  };

  switch (kind) {
    case 'ARTIFACT':
      if (!isNonEmptyString(candidate.evidence)) {
        errors.push(
          `${label}: an ARTIFACT origin must cite the visible thing the statement rests on`
        );
      }
      requireRunAndStage();
      break;
    case 'MODEL_INFERENCE':
      if (!isNonEmptyString(candidate.reasoning)) {
        errors.push(`${label}: a MODEL_INFERENCE origin must state its reasoning`);
      }
      requireRefList('derivedFrom', true);
      requireRunAndStage();
      break;
    case 'MODEL_ASSUMPTION':
      if (!isNonEmptyString(candidate.reason)) {
        errors.push(
          `${label}: a MODEL_ASSUMPTION origin must state why it remains unverified`
        );
      }
      requireRunAndStage();
      break;
    case 'PM_INPUT':
      if (!isNonEmptyString(candidate.field)) {
        errors.push(`${label}: a PM_INPUT origin must name the field it was typed into`);
      }
      break;
    case 'PM_EVIDENCE':
      if (candidate.channel !== 'pasted') {
        errors.push(`${label}: origin.channel must be "pasted"`);
      }
      break;
    case 'PM_ANSWER':
      if (!isClaimId(candidate.answers)) {
        errors.push(`${label}: a PM_ANSWER origin must name the question it answers`);
      } else {
        references.push(candidate.answers as ClaimId);
      }
      break;
    case 'PM_EDIT':
      if (!isClaimId(candidate.supersedes)) {
        errors.push(`${label}: a PM_EDIT origin must name the claim it supersedes`);
      } else {
        references.push(candidate.supersedes as ClaimId);
      }
      break;
    case 'DERIVED_FROM_CLAIM':
      if (!isNonEmptyString(candidate.reasoning)) {
        errors.push(`${label}: a DERIVED_FROM_CLAIM origin must state its reasoning`);
      }
      requireRefList('derivedFrom', true);
      requireRunAndStage();
      break;
  }

  return references;
}

export interface ClaimValidationResult {
  errors: string[];
  /** Every claim id this claim refers to, for resolution against the spine. */
  references: ClaimId[];
}

export function validateClaim(claim: unknown, label = 'claim'): ClaimValidationResult {
  const errors: string[] = [];
  const references: ClaimId[] = [];

  if (typeof claim !== 'object' || claim === null || Array.isArray(claim)) {
    return { errors: [`${label}: not an object`], references };
  }

  const candidate = claim as Record<string, unknown>;
  closedSchema(candidate, CLAIM_FIELDS, label, errors);

  if (!isClaimId(candidate.id)) {
    errors.push(
      `${label}: id "${String(candidate.id)}" is missing or malformed. ` +
        `An id is CLM- followed by 26 base32 characters.`
    );
  }

  if (!isNonEmptyString(candidate.text)) {
    errors.push(`${label}: text is required`);
  }

  if (
    typeof candidate.epistemicStatus !== 'string' ||
    !(EPISTEMIC_STATUSES as readonly string[]).includes(candidate.epistemicStatus)
  ) {
    errors.push(
      `${label}: epistemicStatus "${String(candidate.epistemicStatus)}" is not one of ` +
        `${EPISTEMIC_STATUSES.join(', ')}`
    );
  }

  references.push(...validateOrigin(candidate.origin, label, errors));

  if (
    typeof candidate.loadBearing !== 'string' ||
    !(LOAD_BEARING_STATUSES as readonly string[]).includes(candidate.loadBearing)
  ) {
    errors.push(
      `${label}: loadBearing "${String(candidate.loadBearing)}" is not one of ` +
        `${LOAD_BEARING_STATUSES.join(', ')}`
    );
  }

  if (!Array.isArray(candidate.supports)) {
    errors.push(`${label}: supports must be an array`);
  } else {
    for (const entry of candidate.supports as ClaimDependant[]) {
      if (typeof entry !== 'object' || entry === null) {
        errors.push(`${label}: supports contains a non-object`);
        continue;
      }
      closedSchema(
        entry as unknown as Record<string, unknown>,
        ['dependantId', 'dependantKind', 'stage'],
        `${label}.supports[]`,
        errors
      );
      if (!isNonEmptyString(entry.dependantId)) {
        errors.push(`${label}: a dependant must name what rests on the claim`);
      }
      if (!DEPENDANT_KINDS.has(entry.dependantKind)) {
        errors.push(`${label}: dependantKind "${String(entry.dependantKind)}" is not permitted`);
      }
      if (!isNonEmptyString(entry.stage)) {
        errors.push(`${label}: a dependant must name the stage that recorded it`);
      }
    }

    /*
     * §51 always-3 and §42's definition: a load-bearing statement is one the
     * call rests on. So the status is derived from the edges above, and a claim
     * cannot simply declare itself load-bearing. This is the check that stops
     * a model — or a later agent — asserting it from prose.
     */
    if (candidate.loadBearing === 'LOAD_BEARING' && (candidate.supports as unknown[]).length === 0) {
      errors.push(
        `${label}: loadBearing is LOAD_BEARING but nothing is recorded as resting on it. ` +
          `Load-bearing is derived from what depends on a claim, never asserted about it.`
      );
    }
    if (
      candidate.loadBearing === 'NOT_LOAD_BEARING' &&
      (candidate.supports as unknown[]).length > 0
    ) {
      errors.push(
        `${label}: loadBearing is NOT_LOAD_BEARING while something rests on it`
      );
    }
  }

  if (candidate.confidence !== undefined) {
    const confidence = candidate.confidence;
    if (typeof confidence !== 'number' || !Number.isFinite(confidence)) {
      errors.push(`${label}: confidence must be a finite number when present`);
    } else if (confidence < 0 || confidence > 100) {
      errors.push(`${label}: confidence must be between 0 and 100`);
    }
    /*
     * A FACT is observable or it is not a fact. A confidence figure on one is a
     * category error, and the PRD's own calibration language treats observation
     * and interpretation as different things (CAP-01).
     */
    if (candidate.epistemicStatus === 'FACT') {
      errors.push(
        `${label}: a FACT does not carry a confidence figure. It is observable in the ` +
          `artifact or it is not a fact.`
      );
    }
  }

  if (!isNonEmptyString(candidate.producedBy)) {
    errors.push(`${label}: producedBy is required`);
  }
  if (!isNonEmptyString(candidate.runId)) {
    errors.push(`${label}: runId is required`);
  }
  if (!isNonEmptyString(candidate.createdAt)) {
    errors.push(`${label}: createdAt is required`);
  }
  if (typeof candidate.surfaced !== 'boolean') {
    errors.push(`${label}: surfaced must be a boolean`);
  }

  return { errors, references };
}

export function validateOpenQuestion(
  question: unknown,
  label = 'openQuestion'
): ClaimValidationResult {
  const errors: string[] = [];
  const references: ClaimId[] = [];

  if (typeof question !== 'object' || question === null || Array.isArray(question)) {
    return { errors: [`${label}: not an object`], references };
  }

  const candidate = question as Record<string, unknown>;
  closedSchema(candidate, QUESTION_FIELDS, label, errors);

  if (!isClaimId(candidate.claimId)) {
    errors.push(`${label}: claimId is missing or malformed`);
  } else {
    references.push(candidate.claimId as ClaimId);
  }

  if (!isNonEmptyString(candidate.question)) {
    errors.push(`${label}: question text is required`);
  }
  if (!isNonEmptyString(candidate.whyItMatters)) {
    errors.push(
      `${label}: whyItMatters is required. CAP-02: every question shows why it is being asked.`
    );
  }
  if (!['low', 'medium', 'high'].includes(String(candidate.decisionImpact))) {
    errors.push(`${label}: decisionImpact must be low, medium or high`);
  }
  if (candidate.howToGetIt !== undefined && !isNonEmptyString(candidate.howToGetIt)) {
    errors.push(`${label}: howToGetIt must be a non-empty string when present`);
  }
  if (!Array.isArray(candidate.blocks)) {
    errors.push(`${label}: blocks must be an array of claim ids`);
  } else {
    for (const entry of candidate.blocks) {
      if (!isClaimId(entry)) {
        errors.push(`${label}: blocks contains a malformed claim reference`);
      } else {
        references.push(entry as ClaimId);
      }
    }
  }
  if (!['OPEN', 'ANSWERED', 'SKIPPED'].includes(String(candidate.status))) {
    errors.push(`${label}: status must be OPEN, ANSWERED or SKIPPED`);
  }
  if (candidate.answerClaimId !== undefined) {
    if (!isClaimId(candidate.answerClaimId)) {
      errors.push(`${label}: answerClaimId is malformed`);
    } else {
      references.push(candidate.answerClaimId as ClaimId);
      if (candidate.status !== 'ANSWERED') {
        errors.push(`${label}: an answered question must have status ANSWERED`);
      }
    }
  } else if (candidate.status === 'ANSWERED') {
    errors.push(`${label}: status is ANSWERED but no answer claim is recorded`);
  }

  return { errors, references };
}

/** Convenience: validate and throw. Used everywhere a repair would otherwise creep in. */
export function assertValidClaim(claim: Claim, label?: string): void {
  const { errors } = validateClaim(claim, label);
  if (errors.length > 0) throw new ClaimValidationError(errors);
}

export function assertValidOpenQuestion(question: OpenQuestion, label?: string): void {
  const { errors } = validateOpenQuestion(question, label);
  if (errors.length > 0) throw new ClaimValidationError(errors);
}

export type { ClaimOrigin };
