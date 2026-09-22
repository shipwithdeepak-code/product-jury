/**
 * Stage 1 · Language-policy enforcement foundation.
 *
 * PRD v1.1.1 §11.1, §11.2, §11.3 (LP-1, LP-2, LP-3), A5, TR-7, suite L.
 *
 * A5 makes the policy binding on copy AND on model output, and §11.2 says the
 * model-facing surfaces matter more, "because a constraint absent from a prompt
 * reappears in the output".
 *
 * What Stage 1 builds:
 *  - LP-1: the inventory as a named artifact, with a review status per entry.
 *  - LP-2 (automated half): a substring check over banned phrasings that can
 *    run in the build and over prompt files.
 *  - LP-3: a runtime check callable over generated verdicts, refusals and
 *    attacks.
 *
 * What Stage 1 does not build: the human review half of LP-2 is a process, and
 * suite L is part of the §54 evaluation work. The inventory here is seeded with
 * the strings this stage adds; completing it across every surface is part of
 * the UI work in Stage 2.
 */

/** §11.1's table, as literal banned phrasings. Checked by substring (LP-2). */
export const BANNED_PHRASINGS: readonly string[] = Object.freeze([
  'you should ship this',
  'you should ship',
  'the ai recommends',
  'ai recommends',
  'product jury has decided',
  'product jury recommends',
  'verdict: final',
  'final verdict',
  'we recommend shipping',
  'we recommend',
  'i recommend',
  'the jury recommends',
  'our recommendation is',
  'binding verdict',
  'authoritative verdict',
  'you must ship',
  'you should kill',
  'you should hold',
]);

/**
 * First-person decisional voice. §11.3 says substring match cannot catch this
 * on its own and a human reads the changed entries; these patterns are the
 * automated half doing what it can, and they are why LP-2 has two halves.
 */
export const DECISIONAL_VOICE_PATTERNS: readonly RegExp[] = Object.freeze([
  /\b(we|i)\s+(recommend|advise|suggest|conclude|have\s+decided|decided)\b/i,
  /\b(we|i)\s+(would|will)\s+(ship|hold|kill|test)\b/i,
  /\bthe\s+(ai|system|product|tool|jury)\s+(recommends?|decides?|has\s+decided|advises?)\b/i,
  /\byour\s+decision\s+is\b/i,
  /\bthis\s+is\s+(the\s+)?final\b/i,
]);

export type PolicySurface =
  | 'interface_string'
  | 'system_prompt'
  | 'chair_prompt'
  | 'red_team_prompt'
  | 'output_template';

export type ReviewStatus = 'reviewed_compliant' | 'reviewed_changed' | 'not_yet_reviewed';

/** One entry in the LP-1 inventory. */
export interface InventoryEntry {
  id: string;
  surface: PolicySurface;
  /** Where it lives, so a reviewer can find it. */
  location: string;
  /** The text, or the template with its placeholders. */
  text: string;
  status: ReviewStatus;
}

export interface PolicyViolation {
  entryId?: string;
  surface?: PolicySurface;
  kind: 'banned_phrasing' | 'decisional_voice';
  match: string;
}

/**
 * LP-3 and the automated half of LP-2. Runs over any text: an inventory entry,
 * a prompt file, or a generated verdict.
 */
export function checkLanguagePolicy(text: string): PolicyViolation[] {
  const violations: PolicyViolation[] = [];
  if (!text) return violations;

  const lower = text.toLowerCase();

  for (const phrase of BANNED_PHRASINGS) {
    if (lower.includes(phrase)) {
      violations.push({ kind: 'banned_phrasing', match: phrase });
    }
  }

  for (const pattern of DECISIONAL_VOICE_PATTERNS) {
    const found = text.match(pattern);
    if (found) {
      violations.push({ kind: 'decisional_voice', match: found[0] });
    }
  }

  return violations;
}

/** LP-1: a release is blocked while any entry is unreviewed. */
export function inventoryGate(entries: readonly InventoryEntry[]): {
  passes: boolean;
  unreviewed: string[];
  violations: PolicyViolation[];
} {
  const unreviewed = entries
    .filter((entry) => entry.status === 'not_yet_reviewed')
    .map((entry) => entry.id);

  const violations: PolicyViolation[] = [];
  for (const entry of entries) {
    for (const violation of checkLanguagePolicy(entry.text)) {
      violations.push({ ...violation, entryId: entry.id, surface: entry.surface });
    }
  }

  return { passes: unreviewed.length === 0 && violations.length === 0, unreviewed, violations };
}

/**
 * The seed inventory (LP-1).
 *
 * It covers the strings and prompt fragments Stage 1 introduces or rewrites.
 * Every other user-facing string in the product is still `not_yet_reviewed`
 * and is enumerated as the surfaces are rebuilt — which is exactly what LP-1
 * means by "an unenumerated string is an unreviewed string".
 */
export const LANGUAGE_POLICY_INVENTORY: readonly InventoryEntry[] = Object.freeze([
  {
    id: 'failure.provider_unavailable',
    surface: 'interface_string',
    location: 'server/integrity/errors.ts',
    text: 'The AI provider did not respond. Nothing was analysed, so nothing is shown. Try again in a moment.',
    status: 'reviewed_compliant',
  },
  {
    id: 'failure.malformed_output',
    surface: 'interface_string',
    location: 'server/integrity/errors.ts',
    text: 'The model returned output that could not be read as structured data. It was discarded rather than guessed at. Try again.',
    status: 'reviewed_compliant',
  },
  {
    id: 'failure.usage_limit',
    surface: 'interface_string',
    location: 'server/integrity/errors.ts',
    text: 'You have reached this product’s usage limit for now. This is a limit, not a failure of the analysis. Try again later.',
    status: 'reviewed_compliant',
  },
  {
    id: 'standing_limitations.body',
    surface: 'interface_string',
    location: 'src/integrity/standingLimitations.ts',
    text: 'Product Jury has seen one frame of your product and none of your users.',
    status: 'reviewed_compliant',
  },
  {
    id: 'prompt.untrusted_preamble',
    surface: 'system_prompt',
    location: 'server/integrity/untrusted.ts',
    text: 'HANDLING OF SUPPLIED CONTENT — BINDING.',
    status: 'reviewed_compliant',
  },
  {
    id: 'privacy.disclosure',
    surface: 'interface_string',
    location: 'src/integrity/disclosures.ts',
    text: 'Your screenshot is sent to Google’s Gemini API to be read.',
    status: 'reviewed_compliant',
  },
]);
