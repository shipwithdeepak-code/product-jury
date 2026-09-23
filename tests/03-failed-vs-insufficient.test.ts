import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  RefusalIntegrityError,
  failed,
  isFailed,
  isInsufficient,
  refusal,
  type MissingItem,
  type SufficiencyAssessment,
} from '../server/integrity/outcome';
import { FAILURE_CODES, ProductJuryError } from '../server/integrity/errors';
import { RunRecorder } from '../server/integrity/provenance';
import { __setGenAIClientForTests } from '../server/geminiClient';
import { runProductJuryDeliberation } from '../server/orchestrator';
import { stubProvider } from './helpers';

/**
 * Group 6 of the Stage 1 brief: the FAILED / INSUFFICIENT distinction.
 *
 * PRD v1.1.1 TR-13 and §51 never-9: a technical failure is never presented as
 * an epistemic refusal. INSUFFICIENT means the panel looked and cannot carry a
 * call. FAILED means the panel did not look.
 */

afterEach(() => {
  __setGenAIClientForTests(null);
});

const provenance = () => new RunRecorder('test').snapshot();

const completedAssessment: SufficiencyAssessment = {
  assessedAt: 'GATE',
  completed: true,
  sufficient: false,
  runId: 'test',
};

const twoMissing: MissingItem[] = [
  {
    item: 'A drop-off rate for the step in question',
    whyItMatters: 'The decision turns on whether this step is where users leave.',
    howToGetIt: 'One funnel query in your analytics tool.',
    bearsOnClaims: [],
  },
  {
    item: 'What the current activation rate is',
    whyItMatters: 'Without a baseline, an improvement cannot be judged.',
    howToGetIt: 'The same dashboard, one number.',
    bearsOnClaims: [],
  },
];

describe('6 · FAILED and INSUFFICIENT are different outcomes', () => {
  it('refuses to build a refusal out of a technical failure', () => {
    const error = new ProductJuryError('PROVIDER_TIMEOUT', { stage: 'auditor' });
    expect(() =>
      refusal(error as unknown as SufficiencyAssessment, twoMissing, provenance())
    ).toThrow(RefusalIntegrityError);
  });

  it('refuses to build a refusal without a completed assessment', () => {
    expect(() =>
      refusal(
        { ...completedAssessment, completed: false as unknown as true },
        twoMissing,
        provenance()
      )
    ).toThrow(RefusalIntegrityError);
  });

  it('refuses to build a refusal when the assessment found the evidence sufficient', () => {
    expect(() =>
      refusal({ ...completedAssessment, sufficient: true }, twoMissing, provenance())
    ).toThrow(RefusalIntegrityError);
  });

  it('refuses a refusal that names fewer than two missing items (FR-15)', () => {
    expect(() => refusal(completedAssessment, twoMissing.slice(0, 1), provenance())).toThrow(
      RefusalIntegrityError
    );
  });

  it('builds a refusal when a completed assessment genuinely refused', () => {
    const outcome = refusal(completedAssessment, twoMissing, provenance());
    expect(outcome.kind).toBe('INSUFFICIENT');
    expect(isInsufficient(outcome)).toBe(true);
    expect(isFailed(outcome)).toBe(false);
    expect(outcome.missing).toHaveLength(2);
  });

  it('turns every failure code into FAILED and never into INSUFFICIENT', () => {
    for (const code of FAILURE_CODES) {
      const outcome = failed(new ProductJuryError(code), provenance());
      expect(outcome.kind).toBe('FAILED');
      expect(isInsufficient(outcome as never)).toBe(false);
    }
  });

  it('turns an unknown thrown value into FAILED rather than a refusal', () => {
    const outcome = failed('something fell over', provenance());
    expect(outcome.kind).toBe('FAILED');
    expect(outcome.code).toBe('INTERNAL_ERROR');
  });

  it('has no failure code that means insufficient evidence', () => {
    // The taxonomy deliberately contains no INSUFFICIENT_EVIDENCE member: if
    // one existed, a failure could be spelled as a refusal by choosing it.
    expect(FAILURE_CODES.some((c) => /INSUFFICIENT|NOT_ENOUGH|EVIDENCE/.test(c))).toBe(false);
  });

  it('gives the orchestrator no branch that returns INSUFFICIENT from a failure', async () => {
    const { client } = stubProvider(() => {
      throw new Error('503 overloaded');
    });
    __setGenAIClientForTests(client);

    const outcome = await runProductJuryDeliberation({
      decisionQuestion: 'Should we ship the redesigned export flow before the Q4 freeze?',
      context: {
        name: 'T',
        whatBuilding: 'x',
        targetUser: 'y',
        primaryGoal: 'z',
        currentProblem: '',
        productUrl: '',
        additionalContext: '',
      },
    });
    expect(outcome.kind).toBe('FAILED');

    /*
     * Stage 5 built the gate, so the orchestrator does now construct refusals —
     * this assertion changed with the pipeline, and it changed to the stronger
     * form rather than being dropped.
     *
     * What must remain true is that no *failure* can become one. There is one
     * construction of a refusal in the file, and the catch block that every
     * error in the pipeline lands in contains `failed(` and nothing else.
     */
    const source = readFileSync(join(__dirname, '..', 'server/orchestrator.ts'), 'utf8');
    expect(source.match(/=\s*refusal\(/g)?.length).toBe(1);

    // The terminal catch — the single exit every failure in the pipeline
    // reaches — is the last one in the file.
    const catchBlock = source.slice(source.lastIndexOf('} catch (error) {'));
    expect(catchBlock).toContain('failed(error');
    expect(catchBlock).not.toMatch(/=\s*refusal\(/);
  });

  it('renders the two outcomes as different kinds of surface', () => {
    const view = readFileSync(
      join(__dirname, '..', 'src/components/RunOutcomeView.tsx'),
      'utf8'
    );
    // FR-41: distinct states, distinct rendering. The failure surface says in
    // as many words that nothing was judged and that it is not about evidence.
    expect(view).toMatch(/not a statement about your evidence/i);
    expect(view).toMatch(/Nothing was judged/i);
    // And the refusal surface does not present itself as an error.
    const insufficientHalf = view.slice(view.indexOf('export function InsufficientView'));
    expect(insufficientHalf).not.toMatch(/role="alert"/);
  });
});
