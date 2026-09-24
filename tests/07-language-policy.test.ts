import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BANNED_PHRASINGS,
  LANGUAGE_POLICY_INVENTORY,
  checkLanguagePolicy,
  inventoryGate,
} from '../server/integrity/languagePolicy';
import { FAILURE_CODES, failureDefinition } from '../server/integrity/errors';
import { STANDING_LIMITATIONS, BUILD_LIMITATIONS } from '../src/integrity/standingLimitations';
import { PRIVACY_DISCLOSURE, OPT_OUT_DISCLOSURE, DELETION_DISCLOSURE } from '../src/integrity/disclosures';

/**
 * Group 12 of the Stage 1 brief: language-policy banned phrases.
 *
 * PRD v1.1.1 §11 and LP-1..LP-3. The policy exists because the product's whole
 * claim is that the PM decides: a string that decides for them contradicts the
 * product in the one place the PM is actually reading.
 */

describe('12 · language policy', () => {
  it('flags each banned phrasing from §11.1', () => {
    for (const phrase of BANNED_PHRASINGS) {
      const violations = checkLanguagePolicy(`Here is the summary. ${phrase}. That is all.`);
      expect(violations.length, `"${phrase}" passed`).toBeGreaterThan(0);
    }
  });

  it('flags first-person decisional voice that no substring list would catch', () => {
    for (const text of [
      'Having weighed the evidence, we recommend shipping in the next sprint.',
      'I would ship this once the copy is fixed.',
      'The system recommends holding until activation data exists.',
      'Your decision is to iterate on the schema mapping step.',
      'This is final.',
    ]) {
      expect(checkLanguagePolicy(text).length, `"${text}" passed`).toBeGreaterThan(0);
    }
  });

  it('passes the phrasings the PRD asks for instead', () => {
    for (const text of [
      'On this evidence, the panel cannot carry a SHIP call.',
      'The evidence supports ITERATE at a confidence ceiling of 0.4.',
      'This is what the panel found. The call is yours.',
      'Two things would change this assessment.',
    ]) {
      expect(checkLanguagePolicy(text)).toEqual([]);
    }
  });

  it('holds every failure message the product can show to the policy (LP-3)', () => {
    for (const code of FAILURE_CODES) {
      const { userMessage } = failureDefinition(code);
      expect(checkLanguagePolicy(userMessage), `${code}: ${userMessage}`).toEqual([]);
    }
  });

  it('holds the standing limitations and the disclosures to the policy', () => {
    const strings = [
      ...STANDING_LIMITATIONS.map((p) => `${p.heading}. ${p.body}`),
      ...BUILD_LIMITATIONS,
      ...Object.values(PRIVACY_DISCLOSURE),
      OPT_OUT_DISCLOSURE,
      DELETION_DISCLOSURE,
    ];
    for (const text of strings) {
      expect(checkLanguagePolicy(text), text.slice(0, 60)).toEqual([]);
    }
  });

  it('blocks on an unreviewed inventory entry (LP-1)', () => {
    const gate = inventoryGate([
      ...LANGUAGE_POLICY_INVENTORY,
      {
        id: 'test.unreviewed',
        surface: 'interface_string',
        location: 'nowhere',
        text: 'A perfectly compliant sentence.',
        status: 'not_yet_reviewed',
      },
    ]);
    expect(gate.passes).toBe(false);
    expect(gate.unreviewed).toContain('test.unreviewed');
  });

  it('passes on the seeded inventory as it stands', () => {
    const gate = inventoryGate(LANGUAGE_POLICY_INVENTORY);
    expect(gate.violations).toEqual([]);
    expect(gate.passes).toBe(true);
  });

  it('is enforced at runtime on what the chair writes (LP-3)', () => {
    const chair = readFileSync(
      join(__dirname, '..', 'server/agents/juryDecisionAgent.ts'),
      'utf8'
    );
    expect(chair).toContain('checkLanguagePolicy');
  });
});
