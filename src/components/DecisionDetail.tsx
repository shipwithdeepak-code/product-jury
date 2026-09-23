import React from 'react';
import { currentVersion, decisionState } from '../../server/decision/decision';
import { EPISTEMIC_STATUSES } from '../types/claims';
import type { Claim, EpistemicStatus, OpenQuestion } from '../types/claims';
import type { Decision, DecisionVersion } from '../types/decision';
import type { StoredDecision } from '../services/decisionPersistence';

/**
 * Stage 7 · The decision, reopened.
 *
 * Everything on this surface comes from the canonical `Decision` handed to it.
 * It does not import `ProductReview`, it does not read `reviewHistory`, and it
 * holds no state of its own — there is nothing here that could disagree with
 * what is in storage.
 *
 * THE ORDER IS THE ARGUMENT.
 *
 *   the question  →  where it stands  →  what it rests on  →  the statements
 *   →  what is still unknown  →  what the panel came to
 *
 * A decision read top to bottom arrives at the outcome having already seen
 * what the outcome is made of. The opposite order — verdict first, evidence
 * underneath — is how a product teaches a PM to trust a conclusion without
 * looking at it, and CAP-03's whole point is the other way round.
 */

export const DECISION_DETAIL_TESTID = 'decision-detail';

const STATE_SENTENCES: Record<ReturnType<typeof decisionState>, string> = {
  provisional: 'Provisional — a call has been made on the evidence available.',
  awaiting_evidence: 'Awaiting evidence — no call has been made.',
  waiting_on_a_check: 'Waiting on a check — something was expected that has not arrived.',
  failed: 'Did not complete — nothing was judged.',
};

/**
 * CAP-03's four kinds, plus the two the PRD's own classification adds. The
 * label says which one it is in words, because the whole capability is that a
 * PM can tell an inference from a fact at a glance — and a colour is not a
 * glance for everyone.
 */
const STATUS_LABELS: Record<EpistemicStatus, string> = {
  FACT: 'Observed',
  INFERENCE: 'Inferred',
  ASSUMPTION: 'Assumed',
  UNKNOWN: 'Unknown',
  PM_STATEMENT: 'Said by you',
  EVIDENCE: 'From evidence you supplied',
};

const STATUS_NOTES: Record<EpistemicStatus, string> = {
  FACT: 'Read directly off the artifact. Nothing was concluded to get here.',
  INFERENCE: 'Concluded from what was observed. It may be wrong.',
  ASSUMPTION: 'Taken as true without evidence for it.',
  UNKNOWN: 'Named as missing, and left missing.',
  PM_STATEMENT: 'Your own words, kept as yours. Never promoted to fact.',
  EVIDENCE: 'From the material you pasted in.',
};

const IMPACT_LABELS: Record<OpenQuestion['decisionImpact'], string> = {
  high: 'Would move this decision a lot',
  medium: 'Would move this decision somewhat',
  low: 'Would move this decision a little',
};

function originLabel(claim: Claim): string {
  switch (claim.origin.kind) {
    case 'ARTIFACT':
      return 'from the artifact';
    case 'PM_INPUT':
      return 'from what you wrote';
    case 'PM_EDIT':
      return 'your correction';
    case 'PM_EVIDENCE':
      return 'from your pasted evidence';
    case 'PM_ANSWER':
      return 'your answer to an open question';
    case 'MODEL_INFERENCE':
      return 'concluded by the panel';
    case 'MODEL_ASSUMPTION':
      return 'assumed by the panel';
    case 'DERIVED_FROM_CLAIM':
      return 'derived from another statement';
  }
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-stone-500 dark:text-stone-400">
      {children}
    </h2>
  );
}

/**
 * One statement. The id is present and copyable but small and quiet: §5 asks
 * for traceability, not for the id to be the thing a PM reads first.
 */
function ClaimRow({ claim }: { claim: Claim }) {
  return (
    <li className="py-3 border-b border-stone-200 dark:border-stone-800 last:border-b-0">
      <p className="text-[15px] text-stone-900 dark:text-stone-100 leading-relaxed">{claim.text}</p>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
        <span>{originLabel(claim)}</span>
        {claim.loadBearing === 'LOAD_BEARING' && (
          <span className="text-stone-700 dark:text-stone-300">something rests on this</span>
        )}
        {typeof claim.confidence === 'number' && <span>confidence {claim.confidence}</span>}
        <code className="font-mono text-[10px] text-stone-400 dark:text-stone-600 break-all">
          {claim.id}
        </code>
      </p>
    </li>
  );
}

function ClaimGroup({ status, claims }: { status: EpistemicStatus; claims: Claim[] }) {
  if (claims.length === 0) return null;
  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
          {STATUS_LABELS[status]}
        </h3>
        <span className="text-xs text-stone-500 dark:text-stone-400">
          {claims.length} {claims.length === 1 ? 'statement' : 'statements'}
        </span>
      </div>
      <p className="mt-1 text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
        {STATUS_NOTES[status]}
      </p>
      <ul className="mt-3 border-t border-stone-200 dark:border-stone-800">
        {claims.map((claim) => (
          <ClaimRow key={claim.id} claim={claim} />
        ))}
      </ul>
    </section>
  );
}

function OpenQuestions({ questions, claims }: { questions: OpenQuestion[]; claims: Claim[] }) {
  if (questions.length === 0) return null;
  const textOf = (id: string) => claims.find((claim) => claim.id === id)?.text;

  return (
    <section className="mt-12">
      <Heading>Still unknown</Heading>
      <p className="mt-2 text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
        Named as missing and left missing. Nothing below has been answered by guessing at it.
      </p>
      <ul className="mt-5 space-y-6">
        {questions.map((question) => (
          <li key={question.claimId} className="border-l-2 border-stone-300 dark:border-stone-700 pl-4">
            <p className="text-[15px] text-stone-900 dark:text-stone-100 leading-relaxed">
              {question.question}
            </p>
            <dl className="mt-2 space-y-1.5 text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
              <div>
                <dt className="sr-only">Why it matters</dt>
                <dd>{question.whyItMatters}</dd>
              </div>
              <div>
                <dt className="sr-only">Decision impact</dt>
                <dd>{IMPACT_LABELS[question.decisionImpact]}</dd>
              </div>
              {question.howToGetIt && (
                <div>
                  <dt className="sr-only">Cheapest way to resolve it</dt>
                  <dd>Cheapest way to settle it: {question.howToGetIt}</dd>
                </div>
              )}
            </dl>
            {question.blocks.length > 0 && (
              <div className="mt-2 text-xs text-stone-500 dark:text-stone-400">
                <p>Holds up:</p>
                <ul className="mt-1 space-y-1">
                  {question.blocks.map((id) => (
                    <li key={id}>
                      {textOf(id) ?? 'a statement in this decision'}{' '}
                      <code className="font-mono text-[10px] text-stone-400 dark:text-stone-600 break-all">
                        {id}
                      </code>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="mt-2 text-xs uppercase tracking-wider text-stone-500 dark:text-stone-400">
              {question.status === 'OPEN'
                ? 'Open'
                : question.status === 'ANSWERED'
                ? 'Answered — kept as your statement, not as a fact'
                : 'Set aside'}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Outcome({ version }: { version: DecisionVersion }) {
  const { outcome, verdict } = version;

  if (outcome.kind === 'INSUFFICIENT') {
    const skipped = version.runMeta.stages.filter((stage) => stage.status === 'skipped');
    return (
      <section className="mt-12">
        <Heading>Where it came out</Heading>
        <h3 className="mt-3 text-lg font-semibold text-stone-900 dark:text-stone-100">
          Not enough to judge this
        </h3>
        <p className="mt-2 text-sm text-stone-700 dark:text-stone-300 leading-relaxed">
          {outcome.refusedAt === 'GATE'
            ? 'The evidence was assessed against the question above, before the panel was convened. It could not carry a defensible call, so the deliberation was stopped rather than run to a fluent and unfounded verdict. No lens, no cross-examination and no chair ran.'
            : 'The panel ran and assessed the evidence. It could not carry a defensible call on the question as asked.'}
        </p>

        <ul className="mt-6 space-y-6">
          {outcome.missing.map((item) => (
            <li key={item.item} className="border-l-2 border-amber-400 dark:border-amber-700 pl-4">
              <p className="text-[15px] font-medium text-stone-900 dark:text-stone-100 leading-relaxed">
                {item.item}
              </p>
              <p className="mt-1.5 text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
                {item.whyItMatters}
              </p>
              <p className="mt-1 text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
                Cheapest way to get it: {item.howToGetIt}
              </p>
              {item.bearsOnClaims.length > 0 && (
                <p className="mt-1.5 text-xs text-stone-500 dark:text-stone-400">
                  Undermines{' '}
                  {item.bearsOnClaims.map((id) => (
                    <code
                      key={id}
                      className="font-mono text-[10px] text-stone-400 dark:text-stone-600 break-all mr-2"
                    >
                      {id}
                    </code>
                  ))}
                </p>
              )}
            </li>
          ))}
        </ul>

        {skipped.length > 0 && (
          <div className="mt-8 text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
            <p>Stages that did not run:</p>
            <ul className="mt-1.5 space-y-1">
              {skipped.map((stage) => (
                <li key={stage.stage}>
                  <span className="font-mono text-[11px]">{stage.stage}</span> — {stage.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    );
  }

  if (outcome.kind === 'FAILED') {
    return (
      <section className="mt-12">
        <Heading>Where it came out</Heading>
        <h3 className="mt-3 text-lg font-semibold text-stone-900 dark:text-stone-100">
          This run did not complete
        </h3>
        <p className="mt-2 text-sm text-stone-700 dark:text-stone-300 leading-relaxed">
          {outcome.userMessage} Nothing was judged, and this is not a statement about your evidence.
        </p>
      </section>
    );
  }

  if (!verdict) return null;

  return (
    <section className="mt-12">
      <Heading>Where it came out</Heading>
      <h3 className="mt-3 text-lg font-semibold text-stone-900 dark:text-stone-100">
        {verdict.outcome}
      </h3>
      <p className="mt-3 text-[15px] text-stone-800 dark:text-stone-200 leading-relaxed">
        {verdict.executiveSummary}
      </p>
      <p className="mt-4 text-sm text-stone-700 dark:text-stone-300 leading-relaxed">
        <span className="font-medium">Next step:</span> {verdict.recommendedNextStep}
      </p>
      {/* TR-3: a confidence figure is never shown without the reason for it. */}
      <p className="mt-4 text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
        Confidence {verdict.confidence}. {verdict.confidenceRationale}
      </p>
    </section>
  );
}

export function DecisionDetail({
  state,
  onBack,
}: {
  state: StoredDecision | { status: 'loading' };
  onBack: () => void;
}) {
  const back = (
    <button
      type="button"
      onClick={onBack}
      className="text-sm text-stone-600 dark:text-stone-400 underline underline-offset-4 hover:text-stone-900 dark:hover:text-stone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-500 rounded-sm"
    >
      All decisions
    </button>
  );

  if (state.status === 'loading') {
    return (
      <section data-testid={DECISION_DETAIL_TESTID} className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        {back}
        <p role="status" className="mt-8 text-sm text-stone-500 dark:text-stone-400">
          Reading this decision from this device…
        </p>
      </section>
    );
  }

  if (state.status === 'not_found') {
    return (
      <section data-testid={DECISION_DETAIL_TESTID} className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        {back}
        <h1 className="mt-8 text-xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
          No decision here
        </h1>
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
          Nothing is kept on this device under that address. Decisions live in this browser only, so
          one made elsewhere, or deleted, will not be here.
        </p>
      </section>
    );
  }

  if (state.status === 'error') {
    return (
      <section data-testid={DECISION_DETAIL_TESTID} className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        {back}
        <h1 className="mt-8 text-xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
          This decision would not open
        </h1>
        {/* §2: the stored record is left exactly as it is. Nothing is repaired
            here, and nothing is shown in its place. */}
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
          {state.userMessage}
        </p>
      </section>
    );
  }

  const decision: Decision = state.decision;
  const version = currentVersion(decision);
  const claims = version.claimSpine.claims.filter((claim) => claim.surfaced);
  const openQuestions = version.claimSpine.openQuestions;

  return (
    <section data-testid={DECISION_DETAIL_TESTID} className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      {back}

      <h1 className="mt-6 text-2xl sm:text-[28px] font-semibold tracking-tight text-stone-900 dark:text-stone-100 leading-tight text-balance">
        {decision.decisionQuestion}
      </h1>

      <p className="mt-3 text-sm text-stone-700 dark:text-stone-300 leading-relaxed">
        {STATE_SENTENCES[decisionState(decision)]}
      </p>
      <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
        Version {version.versionNumber} · last activity{' '}
        {new Date(decision.updatedAt).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })}
        {decision.isSample && ' · sample'}
      </p>

      <section className="mt-12">
        <Heading>What this rests on</Heading>
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
          {claims.length} {claims.length === 1 ? 'statement' : 'statements'} were read, and each one
          says which kind it is and where it came from. They are grouped by kind below, because the
          difference between something observed and something concluded is the difference between a
          call you can defend and one you cannot.
        </p>

        {EPISTEMIC_STATUSES.map((status) => (
          <ClaimGroup
            key={status}
            status={status}
            claims={claims.filter((claim) => claim.epistemicStatus === status)}
          />
        ))}
      </section>

      <OpenQuestions questions={openQuestions} claims={claims} />

      <Outcome version={version} />
    </section>
  );
}
