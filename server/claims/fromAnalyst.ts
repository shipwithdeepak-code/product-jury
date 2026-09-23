import {
  AnalystReading,
  AnalystAttribute,
  AnalystFact,
  AnalystInference,
  AnalystAssumption,
  AnalystFrictionSignal,
  AnalystUnknown,
} from '../../src/types';
import { ClaimId } from '../../src/types/claims';
import { ProductJuryError } from '../integrity/errors';
import { ClaimSpine } from './spine';
import { ClaimReferenceError, ClaimValidationError } from './validation';
import { assertOriginCoverage, OriginCoverageError } from './originCoverage';
import type { OriginCoverage } from '../../src/types/claims';

/**
 * Stage 2 · Analyst reading → Claim Spine.
 *
 * PRD v1.1.1 CAP-01, CAP-03, FR-2.
 *
 * THE MODEL-LOCAL REF, AND WHY IT EXISTS
 *
 * A claim id is a digest of the run, the stage, the kind and the text, so it
 * cannot be computed until the statement exists. The model therefore cannot
 * emit one, and it has to be able to say "this inference rests on that fact"
 * inside a single response. So the wire contract carries a short, model-minted
 * `ref` on every statement — "F1", "I2" — and this transformer is the only
 * place those refs exist. They are resolved to real claim ids on the way in and
 * never leave this function.
 *
 * A ref that does not resolve is a SCHEMA_VIOLATION, which the provider client
 * turns into a FAILED run. It is not dropped, and the statement is not kept
 * without its antecedents: an inference whose basis cannot be found is an
 * unattributed statement, and CAP-03 says an unattributed statement is not
 * shown.
 *
 * There is no fallback in this file. If the reading cannot be turned into a
 * spine, the run fails.
 */

const STAGE = 'analyst';

/*
 * Stage 2.5 · Sub-stage labels, so the display projection can tell the three
 * headline attributes and the friction signals apart from ordinary inferences
 * without reading their text.
 *
 * Before this, `projectUnderstanding` matched claim text against the reading's
 * own strings to work out which inference was the product type. That worked and
 * would have broken the first time the phrasing changed. `producedBy` already
 * names what made a statement, so it is the right field to say which part of
 * the analyst made it; the origin's `stage` stays `analyst` throughout, because
 * that is the pipeline stage.
 */
export const ANALYST_ATTRIBUTE_STAGE = 'analyst:attribute';
export const ANALYST_FRICTION_STAGE = 'analyst:friction';

function violation(detail: string): ProductJuryError {
  return new ProductJuryError('SCHEMA_VIOLATION', {
    stage: STAGE,
    detail: { violation: detail },
  });
}

class RefTable {
  private readonly map = new Map<string, ClaimId>();

  declare(ref: unknown, claimId: ClaimId, what: string): void {
    if (typeof ref !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,15}$/.test(ref)) {
      throw violation(`${what} returned a malformed ref: ${JSON.stringify(ref)}`);
    }
    if (this.map.has(ref)) {
      throw violation(`ref "${ref}" was used for more than one statement`);
    }
    this.map.set(ref, claimId);
  }

  resolve(refs: unknown, what: string): ClaimId[] {
    if (!Array.isArray(refs)) {
      throw violation(`${what} did not name what it was derived from`);
    }
    if (refs.length === 0) {
      throw violation(
        `${what} names nothing it was derived from. An interpretation with no basis is not shown.`
      );
    }
    return refs.map((ref) => {
      const resolved = typeof ref === 'string' ? this.map.get(ref) : undefined;
      if (!resolved) {
        /*
         * Fail closed on an unresolvable reference (brief item 10). Silently
         * dropping it would leave an inference that looks grounded and is not.
         */
        throw violation(
          `${what} was derived from "${String(ref)}", which is not a statement in this reading`
        );
      }
      return resolved;
    });
  }

  resolveOptional(refs: unknown, what: string): ClaimId[] {
    if (refs === undefined || refs === null) return [];
    if (!Array.isArray(refs)) {
      throw violation(`${what} returned a malformed reference list`);
    }
    if (refs.length === 0) return [];
    return this.resolve(refs, what);
  }
}

function requireText(value: unknown, what: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw violation(`${what} is missing`);
  }
  return value.trim();
}

function requireConfidence(value: unknown, what: string): number {
  const reported = Number(value);
  if (!Number.isFinite(reported)) {
    throw violation(`${what} returned no confidence figure`);
  }
  if (reported < 0 || reported > 100) {
    throw violation(`${what} returned a confidence outside 0-100`);
  }
  return reported;
}

export interface AnalystSpineResult {
  spine: ClaimSpine;
  coverage: OriginCoverage;
}

export function buildSpineFromAnalystReading(
  reading: AnalystReading,
  runId: string
): AnalystSpineResult {
  const spine = new ClaimSpine(runId);
  const refs = new RefTable();

  try {
    /*
     * 1 · Observations first, because everything else is derived from them.
     *     A FACT's origin is the visible thing it rests on, and the model is
     *     already required to cite it (CAP-01: "Cite the exact visible element,
     *     text or layout component it rests on").
     */
    for (const [index, fact] of (reading.facts ?? []).entries()) {
      const entry = fact as AnalystFact;
      const claim = spine.add({
        text: requireText(entry?.statement, `facts[${index}].statement`),
        epistemicStatus: 'FACT',
        origin: {
          kind: 'ARTIFACT',
          evidence: requireText(entry?.evidence, `facts[${index}].evidence`),
          runId,
          stage: STAGE,
        },
        producedBy: STAGE,
      });
      refs.declare(entry?.ref, claim.id, `facts[${index}]`);
    }

    /*
     * 2 · The three headline attributes. These are the most visible statements
     *     in the product and, before Stage 2, the least grounded: each carried
     *     a free-text `evidence` field that nothing downstream could read.
     *     They are filed as INFERENCE because none of them is literally
     *     observable — "this is an onboarding wizard" is a reading of a screen,
     *     not a thing printed on it — and each must now name the observations
     *     it rests on.
     */
    const attribute = (
      value: AnalystAttribute | undefined,
      label: string,
      prefix: string
    ): void => {
      if (!value) throw violation(`${label} is missing`);
      const text = `${prefix}: ${requireText(value.value, `${label}.value`)}`;
      const claim = spine.add({
        text,
        epistemicStatus: 'INFERENCE',
        origin: {
          kind: 'MODEL_INFERENCE',
          reasoning: requireText(value.evidence, `${label}.evidence`),
          derivedFrom: refs.resolve(value.derivedFrom, label),
          runId,
          stage: STAGE,
        },
        confidence: requireConfidence(value.confidence, label),
        producedBy: ANALYST_ATTRIBUTE_STAGE,
      });
      refs.declare(value.ref, claim.id, label);
    };

    attribute(reading.productType, 'productType', 'Product type read from the artifact');
    attribute(reading.likelyUser, 'likelyUser', 'User role inferred from the artifact');
    attribute(reading.primaryJourney, 'primaryJourney', 'Journey read from the artifact');

    /*
     * 3 · Friction signals. A friction signal is an interpretation of something
     *     visible, so it is an INFERENCE that names the observation beneath it.
     */
    for (const [index, signal] of (reading.frictionSignals ?? []).entries()) {
      const entry = signal as AnalystFrictionSignal;
      const claim = spine.add({
        text: requireText(entry?.signal, `frictionSignals[${index}].signal`),
        epistemicStatus: 'INFERENCE',
        origin: {
          kind: 'MODEL_INFERENCE',
          reasoning: requireText(entry?.evidence, `frictionSignals[${index}].evidence`),
          derivedFrom: refs.resolve(entry?.derivedFrom, `frictionSignals[${index}]`),
          runId,
          stage: STAGE,
        },
        producedBy: ANALYST_FRICTION_STAGE,
      });
      refs.declare(entry?.ref, claim.id, `frictionSignals[${index}]`);
    }

    /*
     * 4 · Inferences proper.
     */
    for (const [index, inference] of (reading.inferences ?? []).entries()) {
      const entry = inference as AnalystInference;
      const claim = spine.add({
        text: requireText(entry?.statement, `inferences[${index}].statement`),
        epistemicStatus: 'INFERENCE',
        origin: {
          kind: 'MODEL_INFERENCE',
          reasoning: requireText(entry?.reasoning, `inferences[${index}].reasoning`),
          derivedFrom: refs.resolve(entry?.derivedFrom, `inferences[${index}]`),
          runId,
          stage: STAGE,
        },
        confidence: requireConfidence(entry?.confidence, `inferences[${index}].confidence`),
        producedBy: STAGE,
      });
      refs.declare(entry?.ref, claim.id, `inferences[${index}]`);
    }

    /*
     * 5 · Assumptions. An assumption rests on nothing observable by definition,
     *     so its origin carries why it remains unverified rather than an
     *     antecedent.
     */
    for (const [index, assumption] of (reading.assumptions ?? []).entries()) {
      const entry = assumption as AnalystAssumption;
      const claim = spine.add({
        text: requireText(entry?.statement, `assumptions[${index}].statement`),
        epistemicStatus: 'ASSUMPTION',
        origin: {
          kind: 'MODEL_ASSUMPTION',
          reason: requireText(entry?.reason, `assumptions[${index}].reason`),
          runId,
          stage: STAGE,
        },
        confidence: requireConfidence(entry?.confidence, `assumptions[${index}].confidence`),
        producedBy: STAGE,
      });
      refs.declare(entry?.ref, claim.id, `assumptions[${index}]`);
    }

    /*
     * 6 · Unknowns. Each is a claim and an open question: a claim so a later
     *     verdict can point at what it did not know, a question so CAP-02 can
     *     ask it and a refusal can name it (FR-15).
     */
    for (const [index, unknown] of (reading.unknowns ?? []).entries()) {
      const entry = unknown as AnalystUnknown;
      const question = requireText(entry?.question, `unknowns[${index}].question`);
      const claim = spine.add({
        text: question,
        epistemicStatus: 'UNKNOWN',
        origin: {
          kind: 'MODEL_ASSUMPTION',
          reason: requireText(
            entry?.whyItMatters,
            `unknowns[${index}].whyItMatters`
          ),
          runId,
          stage: STAGE,
        },
        producedBy: STAGE,
      });
      refs.declare(entry?.ref, claim.id, `unknowns[${index}]`);

      const impact = String(entry?.decisionImpact ?? '').toLowerCase();
      if (!['low', 'medium', 'high'].includes(impact)) {
        throw violation(
          `unknowns[${index}].decisionImpact was "${String(entry?.decisionImpact)}"; ` +
            `CAP-02 ranks unknowns by how much they would move the decision`
        );
      }

      spine.addOpenQuestion({
        claimId: claim.id,
        question,
        whyItMatters: requireText(entry?.whyItMatters, `unknowns[${index}].whyItMatters`),
        decisionImpact: impact as 'low' | 'medium' | 'high',
        ...(entry?.howToGetIt ? { howToGetIt: String(entry.howToGetIt) } : {}),
        blocks: refs.resolveOptional(entry?.blocks, `unknowns[${index}].blocks`),
      });
    }
  } catch (error) {
    if (error instanceof ClaimValidationError) {
      throw violation(error.errors.join('; '));
    }
    if (error instanceof ClaimReferenceError) {
      throw violation(error.message);
    }
    throw error;
  }

  /*
   * CAP-03's success criterion, checked before the reading leaves this
   * function. A reading that cannot attribute every visible statement is not
   * shown with the bad ones removed — it fails.
   */
  let coverage: OriginCoverage;
  try {
    coverage = assertOriginCoverage(spine);
  } catch (error) {
    if (error instanceof OriginCoverageError) {
      throw violation(error.message);
    }
    throw error;
  }

  return { spine, coverage };
}
