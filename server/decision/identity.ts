import { createHash, randomBytes } from 'node:crypto';
import type { DecisionId, OpenLoopId, VersionId } from '../../src/types/decision';

/**
 * Stage 3 · The identity of a Decision, a Version and an open loop.
 *
 * The rules are Stage 2's (`server/claims/identity.ts`), applied to three more
 * kinds of thing, with one deliberate difference at the top.
 *
 * A DECISION ID IS RANDOM, NOT DERIVED.
 *
 * Every other id in this product is a digest of its own content, because a
 * claim is the statement it makes and rebuilding the same reading must produce
 * the same ids. A decision is not its question. §17 says the decision question
 * is the decision's *identity to a person* — what they find it by — but two
 * decisions can legitimately ask the same question three months apart, and
 * they are two decisions. Digesting the question would silently merge them.
 *
 * §55 adds the second reason: the decision identifier travels with the
 * content-free event stream, and it must be "meaningless outside the browser
 * that made it". A digest of the question is not meaningless: it is a stable
 * fingerprint of decision content, and anyone holding a guess at the question
 * could confirm it. Random bytes cannot be reversed into anything.
 *
 * A VERSION ID IS DERIVED FROM ITS OWN IDENTITY.
 *
 * §17: a version's identity is "Decision + sequence number". `mintVersionId`
 * is exactly that pair, digested — so the id is the identity rather than a
 * second, looser handle that could drift from it, and a round trip cannot
 * invent a different one.
 *
 * AN OPEN LOOP ID IS DERIVED FROM WHAT IT IS WAITING FOR.
 *
 * The same check, created twice against the same version for the same due
 * point, is one loop. Digesting the pair is how that stays true without a
 * separate de-duplication rule.
 *
 * All three match §55's permitted shape for `decisionId`
 * (`^[A-Za-z0-9_-]{1,64}$`), so an id can be carried by telemetry without
 * carrying anything else.
 */

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';
const BODY_LENGTH = 26;

const DECISION_PREFIX = 'DEC-';
const VERSION_PREFIX = 'VER-';
const LOOP_PREFIX = 'LOOP-';

export const DECISION_ID_PATTERN = new RegExp(`^${DECISION_PREFIX}[a-z2-7]{${BODY_LENGTH}}$`);
export const VERSION_ID_PATTERN = new RegExp(`^${VERSION_PREFIX}[a-z2-7]{${BODY_LENGTH}}$`);
export const OPEN_LOOP_ID_PATTERN = new RegExp(`^${LOOP_PREFIX}[a-z2-7]{${BODY_LENGTH}}$`);

function base32(bytes: Buffer, length: number): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
      if (output.length === length) return output;
    }
  }
  if (bits > 0 && output.length < length) {
    output += BASE32[(value << (5 - bits)) & 31];
  }
  return output.slice(0, length);
}

function normalise(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** A fresh decision identifier. Random, for the two reasons above. */
export function mintDecisionId(): DecisionId {
  return DECISION_PREFIX + base32(randomBytes(20), BODY_LENGTH);
}

/** §17's "Decision + sequence number", as a handle. */
export function mintVersionId(decisionId: DecisionId, versionNumber: number): VersionId {
  if (!Number.isInteger(versionNumber) || versionNumber < 1) {
    throw new Error(`a version number is an integer from 1, not ${String(versionNumber)}`);
  }
  const digest = createHash('sha256')
    .update(decisionId)
    .update('\u0000')
    .update('VERSION')
    .update('\u0000')
    .update(String(versionNumber))
    .digest();
  return VERSION_PREFIX + base32(digest, BODY_LENGTH);
}

/** CAP-19. The same expected evidence, against the same version, for the same due point. */
export function mintOpenLoopId(input: {
  decisionId: DecisionId;
  versionId: VersionId;
  expectedEvidence: string;
  duePoint: string;
}): OpenLoopId {
  const digest = createHash('sha256')
    .update(input.decisionId)
    .update('\u0000')
    .update(input.versionId)
    .update('\u0000')
    .update(normalise(input.expectedEvidence))
    .update('\u0000')
    .update(normalise(input.duePoint))
    .digest();
  return LOOP_PREFIX + base32(digest, BODY_LENGTH);
}

export function isDecisionId(value: unknown): value is DecisionId {
  return typeof value === 'string' && DECISION_ID_PATTERN.test(value);
}

export function isVersionId(value: unknown): value is VersionId {
  return typeof value === 'string' && VERSION_ID_PATTERN.test(value);
}

export function isOpenLoopId(value: unknown): value is OpenLoopId {
  return typeof value === 'string' && OPEN_LOOP_ID_PATTERN.test(value);
}
