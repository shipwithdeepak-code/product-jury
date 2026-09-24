import { ProductReview, ProductContext } from '../src/types';
import { runUXResearcherAgent } from './agents/uxResearcherAgent';
import { runProductStrategistAgent } from './agents/productStrategistAgent';
import { runEvidenceAuditorAgent } from './agents/evidenceAuditorAgent';
import { runJuryDecisionAgent } from './agents/juryDecisionAgent';
import { ProductJuryError, isProductJuryError } from './integrity/errors';
import { DecisionBudget } from './integrity/budget';
import { RunRecorder } from './integrity/provenance';
import { RunOutcome, failed, verdict } from './integrity/outcome';
import { ClaimSpine } from './claims/spine';
import { spineFromUnderstanding } from './claims/specialistInput';
import { addPmContextClaims } from './claims/fromContext';
import { measureOriginCoverage } from './claims/originCoverage';
import type { SpecialistPosition } from '../src/types/claims';
import type { Decision } from '../src/types/decision';
import { decisionFromRun } from './decision/fromLegacy';
import { runSufficiencyGate } from './agents/sufficiencyGateAgent';
import { refusal } from './integrity/outcome';

/**
 * Stage 1 · The pipeline, rebuilt so that it can produce nothing.
 *
 * What was here before: `Promise.allSettled` over the two specialists, with a
 * hand-written review substituted for either one that rejected; a hand-written
 * audit substituted when the auditor threw; and a chair that, on failure,
 * returned a complete fabricated verdict. The run always produced a verdict.
 *
 * What is here now:
 *  - A failed specialist fails the run (CAP-05 failure state: "If both fail,
 *    there is no verdict"; TR-5: "a missing specialist is never substituted").
 *    Stage 1 takes the stricter reading and fails on either, because the
 *    "panel shown as incomplete with confidence capped for that reason" half
 *    of CAP-05 needs the binding ceiling, which is Stage 2. Failing closed is
 *    the reversible choice; degrading is not.
 *  - A failed audit fails the run (CAP-06: "If the audit cannot run, there is
 *    no verdict").
 *  - A failed chair fails the run (CAP-08: "If synthesis fails there is no
 *    verdict and the decision says so").
 *  - Every stage records which model served it, and every stage that did not
 *    run is recorded as not run, with the real reason (TR-4).
 *  - The run carries a budget ceiling (NFR-9).
 *
 * What is NOT here, and is Stage 2: the early sufficiency gate (CAP-18) and
 * the binding ceiling (CAP-06's ceiling half). The stage list below records
 * `gate` and `cross_examination` as `not_run` with the reason, rather than
 * pretending the pipeline has six stages when it has four.
 *
 * Stage 2 adds one thing to this file: the run rebuilds the Claim Spine once,
 * adds the PM's own statements to it, and passes it to every stage. All four
 * agents therefore see the same statements under the same ids, which is what a
 * later verdict citing one of them will depend on. The spine is rebuilt through
 * `ClaimSpine.fromJSON`, which revalidates every claim and every reference, so
 * a reading that came back from the browser altered fails the run rather than
 * reaching a prompt.
 *
 * Stage 4 adds two things, and they are the same thing seen from both ends.
 *
 *  - The run carries the PM's confirmed decision question (CAP-04). It is
 *    required, because CAP-04's trigger is "after understanding, before any
 *    judgement. Required — no verdict is possible without it", and because a
 *    Decision is identified by its question. It reaches every stage through
 *    `buildSuppliedContent`, as PM-supplied content, never as an instruction.
 *  - A successful run ends as a Decision. `decisionFromRun()` — the bridge
 *    Stage 3 built and the only one — turns the spine, the positions, the
 *    provenance and the outcome into Decision version 1 here, at the one
 *    success exit. There is deliberately no second construction path and no
 *    second pipeline: what this function returns IS the canonical Decision,
 *    with the legacy `ProductReview` carried alongside it for the surfaces
 *    that still read it.
 *
 * Stage 5 adds the early sufficiency gate (CAP-18) between the statements and
 * the panel. It is the first code in this product that can produce
 * INSUFFICIENT: the outcome has been a reachable state in the type system
 * since Stage 1 and nothing has ever built one. Three things about it matter
 * more than the call itself.
 *
 *  - It runs BEFORE the lenses. A refusal that arrives after the whole
 *    deliberation reads as a failure whatever it says (CAP-18's user problem),
 *    and the specialists are the expensive part.
 *  - On a refusal, nothing downstream runs. The lenses, the cross-examination
 *    and the chair are recorded as `skipped` with the real reason, so TR-4 can
 *    say what did not run and why.
 *  - It cannot refuse on the product's behalf. The gate agent returns an
 *    assessment or throws; a thrown error lands in the one catch below and
 *    becomes FAILED. `refusal()` will not build an INSUFFICIENT outcome
 *    without a completed assessment, and a ProductJuryError is not one.
 *
 * What a FAILED run does NOT do is become a Decision. A run that fails before
 * a spine exists has no statements, no positions and no reading; a Version
 * built from it would be a record of a deliberation that never happened. The
 * failure exit below returns the failure and nothing else.
 */

export interface DeliberationOptions {
  context: ProductContext;
  /**
   * CAP-04. The PM's confirmed wording, and required. It is NOT on
   * `ProductContext`: the question belongs to the decision, not to the
   * product, and `ProductContext` is read by two dozen modules with no
   * business seeing it.
   */
  decisionQuestion: string;
  rawEvidence?: string;
  budget?: DecisionBudget;
  recorder?: RunRecorder;
  isSample?: boolean;
  clock?: () => string;
}

/**
 * Stage 4 · What a successful run is.
 *
 * The Decision is the result. `review` is the pipeline's own output type,
 * carried so the existing surfaces keep working during the transition; it is
 * the same verdict that is already inside `decision`'s version 1, not a second
 * one.
 */
export interface DeliberationResult {
  decision: Decision;
  review: ProductReview;
}

/**
 * The reasons the gate writes into the provenance. Constants, because PR-6
 * forbids anything model-written or PM-written in a stage record.
 */
const GATE_PASSED =
  'The evidence can support a defensible call on the stated question, so the panel ran.';
const GATE_REFUSED =
  'The evidence cannot support a defensible call on the stated question, so the run stopped here.';
const GATE_STOPPED_THE_RUN =
  'The sufficiency gate refused, so this stage was not attempted (CAP-18).';

/**
 * Stage 5 · The one place a run becomes a Decision, for both of the outcomes
 * that are allowed to become one.
 *
 * A verdict and a refusal are both complete outcomes and both belong in the
 * record (§17, CAP-18). A FAILED run is not, and cannot reach here: there is
 * no call to this function on that path.
 */
function asDecision(
  outcome: RunOutcome<ProductReview>,
  spine: ClaimSpine,
  specialistPositions: SpecialistPosition[],
  options: DeliberationOptions
): Decision {
  return decisionFromRun({
    decisionQuestion: options.decisionQuestion.trim(),
    outcome,
    spine,
    specialistPositions,
    origin: 'pipeline',
    isSample: options.isSample,
    clock: options.clock,
  });
}

export async function runProductJuryDeliberation(
  options: DeliberationOptions
): Promise<RunOutcome<DeliberationResult>> {
  const { context, rawEvidence } = options;
  const decisionQuestion = (options.decisionQuestion ?? '').trim();
  const budget = options.budget ?? new DecisionBudget();

  /*
   * Stage 4 · The deliberation joins the run the reading already started.
   *
   * The statements were built by the analyst, under the analyst's recorder, and
   * every claim id and every position id is content-addressed with that run id
   * in it. A Decision whose provenance said one run and whose statements said
   * another would be a record of two readings filed as one — which is exactly
   * what `decisionFromRun()` refuses, and it is right to refuse it.
   *
   * So the deliberation adopts the reading's run id rather than minting a
   * second one. One decision, one run id, from the artifact being read to the
   * version being written. A run with no reading behind it (no artifact) mints
   * its own, as before.
   */
  const recorder =
    options.recorder ?? new RunRecorder(context?.artifactUnderstanding?.claimSpine?.runId);

  // Stages this build does not have. Declared rather than omitted, so TR-4's
  // "which stages ran and which did not" is answerable and honest.
  recorder.notRun(
    'cross_examination',
    'The cross-examination round (CAP-05) is not built in this stage; the lenses do not see each other.'
  );
  recorder.notRun('red_team', 'The Red Team round (CAP-10) is not built in this stage.');

  try {
    if (!context) {
      throw new ProductJuryError('INVALID_REQUEST', { detail: { field: 'context' } });
    }

    /*
     * CAP-04: "Required — no verdict is possible without it." The run refuses
     * rather than judging an unstated call, and it refuses here rather than
     * failing later inside the conversion, so the PM is told what is missing
     * before anything is spent.
     */
    if (!decisionQuestion) {
      throw new ProductJuryError('INVALID_REQUEST', { detail: { field: 'decisionQuestion' } });
    }

    const artifactUnderstanding = context.artifactUnderstanding;
    const contextAlignment = artifactUnderstanding?.contextAlignment;

    /*
     * CAP-03. One spine per run, built before any stage sees anything.
     *
     * Stage 2.5 makes this unconditional. Previously a reading that carried no
     * spine produced a null one and the prompt builder rendered the flattened
     * view instead — two shapes for the same statements, and the second had no
     * ids in it, so a lens reading it could cite nothing. There is now one
     * shape:
     *
     *   - a reading carrying a spine: rebuilt and revalidated here;
     *   - a reading carrying none: a schema violation, because a reading
     *     without addressable statements is a reading Stage 2 did not produce;
     *   - no reading at all (no artifact was supplied): a fresh spine, which
     *     the PM's own statements go into below. Not an error, and not empty.
     */
    let spine: ClaimSpine;
    try {
      const rebuilt = spineFromUnderstanding(artifactUnderstanding);
      if (!rebuilt && artifactUnderstanding) {
        throw new ProductJuryError('SCHEMA_VIOLATION', {
          stage: 'analyst',
          detail: {
            violation: 'the artifact reading carries no claim spine, so its statements cannot be cited',
          },
        });
      }
      spine = rebuilt ?? new ClaimSpine(recorder.id);
    } catch (error) {
      if (isProductJuryError(error)) throw error;
      throw new ProductJuryError('SCHEMA_VIOLATION', {
        stage: 'analyst',
        detail: {
          violation:
            'the artifact reading carried a claim spine that does not validate',
        },
        cause: error,
      });
    }

    // CAP-03: the PM's own words are statements too, and are filed as the
    // PM's rather than promoted to observations.
    addPmContextClaims(spine, context, rawEvidence);
    const coverage = measureOriginCoverage(spine);
    if (!coverage.passes) {
      throw new ProductJuryError('SCHEMA_VIOLATION', {
        stage: 'analyst',
        detail: {
          violation: `${coverage.uncovered.length} statements carry no usable origin`,
        },
      });
    }

    /*
     * Phase 0 — CAP-18. The cheap half of the audit, before anything expensive.
     *
     * Sufficiency is relative to the confirmed question, which is why this
     * stage could not exist before CAP-04 did: "is there enough information
     * about this product" has no answer, and "can this evidence carry a call
     * on this question" has one.
     */
    const gate = await runSufficiencyGate({
      context,
      decisionQuestion,
      rawEvidence,
      spine,
      budget,
      recorder,
    });

    if (gate.sufficient === false) {
      recorder.note('gate', GATE_REFUSED);
      for (const stage of ['specialist_ux', 'specialist_strategy', 'auditor', 'chair'] as const) {
        recorder.skipped(stage, GATE_STOPPED_THE_RUN);
      }

      /*
       * The one construction of a refusal. `refusal()` re-checks the
       * assessment and the two-item floor before it will build anything, so a
       * malformed gate result cannot become an outcome even from here.
       */
      /*
       * Stage 5.1 · The gate's missing items go through unchanged, claim
       * references and all. Stage 5 projected them down to three fields here
       * because `MissingItem` had no room for the fourth; it has room now, so
       * there is nothing left to drop. The ids were resolved against this
       * run's spine before this line, and the Decision's validator resolves
       * them again against the version's own statements.
       */
      const outcome = refusal(gate.assessment, gate.missing, recorder.snapshot());

      // CAP-18: "the decision enters an explicit awaiting-evidence state" and
      // "remains a real object, not a failed attempt". No verdict, no
      // positions, and the version says which point refused.
      return { ...outcome, decision: asDecision(outcome, spine, [], options) };
    }

    recorder.note('gate', GATE_PASSED);

    // Phase 1 — the two lenses. Run in parallel; either failing fails the run.
    const [uxSettled, strategySettled] = await Promise.allSettled([
      runUXResearcherAgent({
        context,
        decisionQuestion,
        rawEvidence,
        artifactUnderstanding,
        spine,
        budget,
        recorder,
      }),
      runProductStrategistAgent({
        context,
        decisionQuestion,
        rawEvidence,
        artifactUnderstanding,
        spine,
        budget,
        recorder,
      }),
    ]);

    if (uxSettled.status === 'rejected' || strategySettled.status === 'rejected') {
      const reason =
        uxSettled.status === 'rejected' ? uxSettled.reason : (strategySettled as PromiseRejectedResult).reason;
      const stage = uxSettled.status === 'rejected' ? 'specialist_ux' : 'specialist_strategy';

      if (uxSettled.status === 'fulfilled') {
        // Record that one lens did produce a position, so the failure report is
        // accurate about what ran.
        recorder.notRun('auditor', 'The panel was incomplete, so no audit was attempted.');
      }
      throw isProductJuryError(reason)
        ? reason
        : new ProductJuryError('STAGE_FAILED', { stage, cause: reason });
    }

    const uxReview = uxSettled.value;
    const strategyReview = strategySettled.value;

    // Phase 2 — the audit. No audit, no verdict (CAP-06).
    const evidenceAudit = await runEvidenceAuditorAgent({
      context,
      decisionQuestion,
      artifactUnderstanding,
      spine,
      uxReview,
      strategyReview,
      rawEvidence,
      budget,
      recorder,
    });

    // Phase 3 — the chair.
    const review = await runJuryDecisionAgent({
      context,
      decisionQuestion,
      artifactUnderstanding,
      spine,
      contextAlignment,
      uxReview,
      strategyReview,
      evidenceAudit,
      rawEvidence,
      budget,
      recorder,
      runId: recorder.id,
    });

    /*
     * Stage 4 · The one success exit, and the one place a Decision is built.
     *
     * The positions are the lenses' own, already validated against this spine
     * and already recorded as dependants of the claims they cite (FR-9). They
     * are not re-derived, re-matched or rebuilt here.
     */
    const specialistPositions: SpecialistPosition[] = [
      ...(uxReview.positions ?? []),
      ...(strategyReview.positions ?? []),
    ];

    const outcome = verdict(review, recorder.snapshot());
    const decision = asDecision(outcome, spine, specialistPositions, options);

    return verdict({ decision, review }, outcome.provenance);
  } catch (error) {
    // The single exit for every failure in this pipeline. There is deliberately
    // no branch here that could produce INSUFFICIENT: a refusal requires a
    // completed sufficiency assessment, and a thrown error is not one
    // (TR-13, §51 never-9).
    return failed(error, recorder.snapshot());
  }
}
