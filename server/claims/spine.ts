import {
  Claim,
  ClaimDependant,
  ClaimId,
  ClaimOrigin,
  EpistemicStatus,
  OpenQuestion,
  SerializedClaimSpine,
} from '../../src/types/claims';
import { mintClaimId } from './identity';
import {
  ClaimReferenceError,
  ClaimValidationError,
  assertValidClaim,
  validateClaim,
  validateOpenQuestion,
} from './validation';

/**
 * Stage 2 · The Claim Spine.
 *
 * PRD v1.1.1 CAP-03. One object holds every statement in a run, each with its
 * kind, its origin and what rests on it, and every reference between them
 * resolves or throws.
 *
 * What this replaces: four parallel arrays of bare strings, reachable only by
 * position, with the origin of each statement dropped at the boundary between
 * the analyst and everything downstream. A verdict built on those could not
 * point at what it rested on, because by the time it was written there was
 * nothing left to point at.
 *
 * The invariants, all enforced here rather than by convention:
 *
 *   1. Every claim validates before it enters. No repair, ever.
 *   2. Ids are unique. A collision is a duplicate statement and is rejected.
 *   3. Every reference resolves. A reference to a claim that is not here is an
 *      error, never a dropped edge.
 *   4. loadBearing is derived from recorded dependants and cannot be asserted.
 *   5. A PM edit adds a claim and keeps the original.
 */

export class ClaimSpine {
  readonly runId: string;

  private readonly claims = new Map<ClaimId, Claim>();
  private readonly questions = new Map<ClaimId, OpenQuestion>();

  constructor(runId: string) {
    if (!runId || !runId.trim()) {
      throw new ClaimValidationError(['a spine must be scoped to a run']);
    }
    this.runId = runId;
  }

  get size(): number {
    return this.claims.size;
  }

  has(id: ClaimId): boolean {
    return this.claims.has(id);
  }

  /**
   * Resolve a reference, or throw. There is deliberately no variant that
   * returns undefined: every call site in the product would then have to decide
   * what to do with a missing claim, and the answer is always the same.
   */
  resolve(id: ClaimId): Claim {
    const claim = this.claims.get(id);
    if (!claim) {
      throw new ClaimReferenceError([id], 'resolve()');
    }
    return claim;
  }

  resolveAll(ids: readonly ClaimId[], context = 'resolveAll()'): Claim[] {
    const missing = ids.filter((id) => !this.claims.has(id));
    if (missing.length > 0) {
      throw new ClaimReferenceError(missing, context);
    }
    return ids.map((id) => this.claims.get(id) as Claim);
  }

  /**
   * Check a set of references without throwing, for callers that want to report
   * every bad reference at once rather than the first. Nothing is dropped
   * either way.
   */
  unresolvedReferences(ids: readonly ClaimId[]): ClaimId[] {
    return [...new Set(ids.filter((id) => !this.claims.has(id)))];
  }

  all(): Claim[] {
    return [...this.claims.values()];
  }

  surfaced(): Claim[] {
    return this.all().filter((claim) => claim.surfaced);
  }

  byStatus(status: EpistemicStatus): Claim[] {
    return this.all().filter((claim) => claim.epistemicStatus === status);
  }

  openQuestions(): OpenQuestion[] {
    return [...this.questions.values()];
  }

  /**
   * Mint and add a claim. The id is derived, never supplied, so a caller cannot
   * choose an identity that does not match the statement.
   */
  add(input: {
    text: string;
    epistemicStatus: EpistemicStatus;
    origin: ClaimOrigin;
    producedBy: string;
    confidence?: number;
    surfaced?: boolean;
    createdAt?: string;
  }): Claim {
    const id = mintClaimId({
      runId: this.runId,
      producedBy: input.producedBy,
      epistemicStatus: input.epistemicStatus,
      text: input.text,
    });

    if (this.claims.has(id)) {
      /*
       * Two identical statements of the same kind from the same stage are one
       * statement returned twice. Keeping both would double-count it in every
       * measurement that follows; silently discarding the second would hide a
       * model defect. So it is an error, and the caller decides.
       */
      throw new ClaimValidationError([
        `duplicate claim: ${id} is already in the spine. The same statement was produced ` +
          `twice by ${input.producedBy}.`,
      ]);
    }

    const claim: Claim = {
      id,
      text: input.text,
      epistemicStatus: input.epistemicStatus,
      origin: input.origin,
      supports: [],
      loadBearing: 'NOT_YET_DETERMINED',
      ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
      producedBy: input.producedBy,
      runId: this.runId,
      createdAt: input.createdAt ?? new Date().toISOString(),
      surfaced: input.surfaced ?? true,
    };

    assertValidClaim(claim, `claim(${input.epistemicStatus})`);

    // Invariant 3, at the moment of entry: an origin that names claims must
    // name claims that are already here.
    const referenced = originReferences(claim.origin);
    const missing = this.unresolvedReferences(referenced);
    if (missing.length > 0) {
      throw new ClaimReferenceError(missing, `origin of a new ${claim.epistemicStatus}`);
    }

    this.claims.set(id, claim);
    return claim;
  }

  /**
   * Record that something rests on a claim. This is the only way a claim
   * becomes load-bearing (§51 always-3, §42).
   *
   * Recording the edge and deriving the status are two steps, not one: the
   * dependency is the fact, and load-bearing is read off it. Calling this twice
   * with the same dependant records one edge, which is the spine's existing
   * rule for a repeated reference — `unresolvedReferences` dedupes the same
   * way. A statement produced twice is an error; a statement *referred to*
   * twice is one reference.
   */
  recordDependency(claimId: ClaimId, dependant: ClaimDependant): Claim {
    const claim = this.resolve(claimId);
    const already = claim.supports.some(
      (entry) => entry.dependantId === dependant.dependantId && entry.dependantKind === dependant.dependantKind
    );
    if (!already) {
      claim.supports.push(dependant);
    }
    this.deriveLoadBearingFor(claim);
    assertValidClaim(claim, `claim(${claimId})`);
    return claim;
  }

  /**
   * Stage 2.5 · Recompute load-bearing status from the dependency graph.
   *
   * The rule, in one line: a claim is load-bearing when something is recorded
   * as resting on it. Nothing else sets the field — not a model, not a prompt,
   * not a caller passing a flag — which is the distinction FR-9 and §42 turn
   * on. A claim already settled as NOT_LOAD_BEARING by a stage that enumerated
   * its dependants keeps that answer until something does depend on it.
   *
   * Idempotent, so a stage can call it after recording a batch of dependencies
   * without having to know which claims it touched.
   */
  deriveLoadBearing(): Claim[] {
    for (const claim of this.claims.values()) {
      this.deriveLoadBearingFor(claim);
    }
    return this.loadBearingClaims();
  }

  private deriveLoadBearingFor(claim: Claim): void {
    if (claim.supports.length > 0) {
      claim.loadBearing = 'LOAD_BEARING';
    } else if (claim.loadBearing === 'LOAD_BEARING') {
      // The edges it rested on are gone, so the derived answer changes back.
      claim.loadBearing = 'NOT_YET_DETERMINED';
    }
  }

  /**
   * Settle a claim as not load-bearing. Only a stage that has actually
   * enumerated what the call rests on may call this — it is the difference
   * between "nothing depends on this" and "nobody has looked yet".
   */
  markNotLoadBearing(claimId: ClaimId): Claim {
    const claim = this.resolve(claimId);
    if (claim.supports.length > 0) {
      throw new ClaimValidationError([
        `${claimId}: cannot be marked NOT_LOAD_BEARING while ${claim.supports.length} thing(s) ` +
          `rest on it`,
      ]);
    }
    claim.loadBearing = 'NOT_LOAD_BEARING';
    return claim;
  }

  loadBearingClaims(): Claim[] {
    return this.all().filter((claim) => claim.loadBearing === 'LOAD_BEARING');
  }

  /**
   * CAP-03 and FR-3. The original is kept; the correction is a new claim
   * attributed to the PM. A corrected statement is never presented as an
   * observation, which is why the new claim's kind is PM_STATEMENT regardless
   * of what the original was.
   */
  recordPmEdit(originalId: ClaimId, correctedText: string): Claim {
    const original = this.resolve(originalId);
    const corrected = this.add({
      text: correctedText,
      epistemicStatus: 'PM_STATEMENT',
      origin: { kind: 'PM_EDIT', supersedes: original.id },
      producedBy: 'pm',
    });
    return corrected;
  }

  addOpenQuestion(
    question: Omit<OpenQuestion, 'status' | 'answerClaimId'> & { status?: OpenQuestion['status'] }
  ): OpenQuestion {
    const claim = this.resolve(question.claimId);
    if (claim.epistemicStatus !== 'UNKNOWN') {
      throw new ClaimValidationError([
        `${question.claimId}: an open question must be an UNKNOWN claim, not a ` +
          `${claim.epistemicStatus}`,
      ]);
    }

    const missing = this.unresolvedReferences(question.blocks);
    if (missing.length > 0) {
      throw new ClaimReferenceError(missing, `blocks of open question ${question.claimId}`);
    }

    const record: OpenQuestion = { ...question, status: question.status ?? 'OPEN' };
    const { errors } = validateOpenQuestion(record);
    if (errors.length > 0) throw new ClaimValidationError(errors);

    if (this.questions.has(record.claimId)) {
      throw new ClaimValidationError([`duplicate open question for ${record.claimId}`]);
    }
    this.questions.set(record.claimId, record);
    return record;
  }

  /**
   * CAP-02: "Answers become claims attributed to the PM, never promoted to
   * fact." The answer enters as a PM_STATEMENT and the question closes. There
   * is no parameter here that could file it as a FACT.
   */
  recordAnswer(questionClaimId: ClaimId, answerText: string): { question: OpenQuestion; answer: Claim } {
    const question = this.questions.get(questionClaimId);
    if (!question) {
      throw new ClaimReferenceError([questionClaimId], 'recordAnswer()');
    }
    if (question.status !== 'OPEN') {
      throw new ClaimValidationError([
        `${questionClaimId}: question is already ${question.status}`,
      ]);
    }

    const answer = this.add({
      text: answerText,
      epistemicStatus: 'PM_STATEMENT',
      origin: { kind: 'PM_ANSWER', answers: questionClaimId },
      producedBy: 'pm',
    });

    const updated: OpenQuestion = { ...question, status: 'ANSWERED', answerClaimId: answer.id };
    this.questions.set(questionClaimId, updated);
    return { question: updated, answer };
  }

  skipQuestion(questionClaimId: ClaimId): OpenQuestion {
    const question = this.questions.get(questionClaimId);
    if (!question) {
      throw new ClaimReferenceError([questionClaimId], 'skipQuestion()');
    }
    const updated: OpenQuestion = { ...question, status: 'SKIPPED' };
    this.questions.set(questionClaimId, updated);
    return updated;
  }

  /** Ready for Stage 3's Decision object. No persistence is introduced here. */
  toJSON(): SerializedClaimSpine {
    return {
      version: 1,
      runId: this.runId,
      claims: this.all().map((claim) => ({ ...claim, supports: [...claim.supports] })),
      openQuestions: this.openQuestions().map((question) => ({ ...question })),
    };
  }

  /**
   * Rebuild from a serialised spine, revalidating everything.
   *
   * This is the boundary a spine crosses when it comes back from the browser,
   * so it is treated as untrusted structure: every claim is validated, every
   * id is checked for uniqueness, and every reference must resolve.
   */
  static fromJSON(value: unknown): ClaimSpine {
    const errors: string[] = [];

    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new ClaimValidationError(['serialised spine is not an object']);
    }
    const candidate = value as Record<string, unknown>;

    if (candidate.version !== 1) {
      errors.push(`unsupported spine version: ${String(candidate.version)}`);
    }
    if (typeof candidate.runId !== 'string' || !candidate.runId.trim()) {
      errors.push('serialised spine has no runId');
    }
    if (!Array.isArray(candidate.claims)) {
      errors.push('serialised spine has no claims array');
    }
    if (!Array.isArray(candidate.openQuestions)) {
      errors.push('serialised spine has no openQuestions array');
    }
    if (errors.length > 0) throw new ClaimValidationError(errors);

    const spine = new ClaimSpine(candidate.runId as string);
    const references: ClaimId[] = [];

    for (const [index, raw] of (candidate.claims as unknown[]).entries()) {
      const result = validateClaim(raw, `claims[${index}]`);
      errors.push(...result.errors);
      references.push(...result.references);

      const claim = raw as Claim;
      if (result.errors.length === 0) {
        if (spine.claims.has(claim.id)) {
          errors.push(`claims[${index}]: duplicate id ${claim.id}`);
        } else if (claim.runId !== spine.runId) {
          errors.push(
            `claims[${index}]: claim belongs to run ${claim.runId}, not ${spine.runId}`
          );
        } else {
          spine.claims.set(claim.id, { ...claim, supports: [...claim.supports] });
        }
      }
    }

    for (const [index, raw] of (candidate.openQuestions as unknown[]).entries()) {
      const result = validateOpenQuestion(raw, `openQuestions[${index}]`);
      errors.push(...result.errors);
      references.push(...result.references);
      const question = raw as OpenQuestion;
      if (result.errors.length === 0) {
        if (spine.questions.has(question.claimId)) {
          errors.push(`openQuestions[${index}]: duplicate question for ${question.claimId}`);
        } else {
          spine.questions.set(question.claimId, { ...question });
        }
      }
    }

    if (errors.length > 0) throw new ClaimValidationError(errors);

    const missing = spine.unresolvedReferences(references);
    if (missing.length > 0) {
      throw new ClaimReferenceError(missing, 'a serialised spine');
    }

    return spine;
  }
}

/** Every claim id an origin refers to. */
export function originReferences(origin: ClaimOrigin): ClaimId[] {
  switch (origin.kind) {
    case 'MODEL_INFERENCE':
    case 'DERIVED_FROM_CLAIM':
      return [...origin.derivedFrom];
    case 'PM_ANSWER':
      return [origin.answers];
    case 'PM_EDIT':
      return [origin.supersedes];
    default:
      return [];
  }
}
