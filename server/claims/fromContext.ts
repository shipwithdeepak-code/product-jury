import { ProductContext } from '../../src/types';
import { Claim } from '../../src/types/claims';
import { ClaimSpine } from './spine';

/**
 * Stage 2 · What the PM said, entered as claims.
 *
 * CAP-03 names four sources of statements: "the artifact reading, the PM's
 * answers, pasted evidence, and the panel's reasoning". Two of those are the
 * PM's own words, and before this they existed only as fields on a context
 * object that the prompt builder flattened into a paragraph.
 *
 * Entering them as claims does two things. A later verdict that rests on
 * something the PM asserted can point at it, exactly as it points at an
 * observation. And the epistemic distinction survives: a PM_STATEMENT is not a
 * FACT, which is the whole point of the model and the thing §51 always-1 calls
 * for — "observed, inferred, assumed, unknown, supplied by the PM".
 *
 * These claims are surfaced, so they count toward origin coverage. Their origin
 * is the field the PM typed them into, which is as precise an answer to "where
 * did this come from" as exists.
 */

const PM_CONTEXT_FIELDS: Array<{
  field: keyof ProductContext;
  label: string;
}> = [
  { field: 'name', label: 'Product or feature name' },
  { field: 'whatBuilding', label: 'What is being built' },
  { field: 'targetUser', label: 'Who the target user is' },
  { field: 'primaryGoal', label: 'The primary product or business goal' },
  { field: 'currentProblem', label: 'The problem currently observed' },
  { field: 'additionalContext', label: 'Additional product context' },
];

export interface PmClaimResult {
  claims: Claim[];
  /**
   * Statements the PM supplied twice — the same words in two fields. Recorded
   * rather than silently deduplicated, because it is a fact about the input.
   */
  duplicates: string[];
}

export function addPmContextClaims(
  spine: ClaimSpine,
  context: ProductContext | undefined,
  rawEvidence?: string
): PmClaimResult {
  const claims: Claim[] = [];
  const duplicates: string[] = [];

  if (!context) return { claims, duplicates };

  for (const { field, label } of PM_CONTEXT_FIELDS) {
    const value = context[field];
    if (typeof value !== 'string' || !value.trim()) continue;

    try {
      claims.push(
        spine.add({
          text: `${label}: ${value.trim()}`,
          epistemicStatus: 'PM_STATEMENT',
          origin: { kind: 'PM_INPUT', field: String(field) },
          producedBy: 'pm',
        })
      );
    } catch {
      // The identical sentence in two fields. One statement, recorded once.
      duplicates.push(String(field));
    }
  }

  if (typeof rawEvidence === 'string' && rawEvidence.trim()) {
    try {
      claims.push(
        spine.add({
          text: rawEvidence.trim(),
          epistemicStatus: 'EVIDENCE',
          origin: { kind: 'PM_EVIDENCE', channel: 'pasted' },
          producedBy: 'pm',
        })
      );
    } catch {
      duplicates.push('rawEvidence');
    }
  }

  return { claims, duplicates };
}
