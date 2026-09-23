import { createHash } from 'node:crypto';
import type { ClaimId, EpistemicStatus } from '../../src/types/claims';

/**
 * Stage 2 · The identity strategy.
 *
 * The brief's constraints: deterministic within a decision/run context; must
 * survive specialist processing, cross-examination, verdict generation, Red
 * Team and future persistence; never an array index; never the displayed text.
 *
 * WHAT AN ID IS
 *
 *   CLM-<26 lowercase base32 characters>
 *
 * derived as the first 130 bits of
 *
 *   sha256( runId ␀ producedBy ␀ epistemicStatus ␀ normalise(text) )
 *
 * WHY THIS AND NOT A COUNTER
 *
 * An array index is positional, so inserting a statement renumbers everything
 * after it and every reference held by a later stage breaks silently. A random
 * uuid is stable but not reproducible, so the same run cannot be rebuilt from
 * the same model output — which matters for suite J's repeat runs and for
 * rebuilding a spine from its serialised form.
 *
 * A digest is neither. Rebuild the spine from the same analyst payload and
 * every id comes back identical; insert a statement in the middle and nothing
 * else moves.
 *
 * WHY THE TEXT IS IN THE DIGEST BUT IS NOT THE IDENTITY
 *
 * The digest is one-way and fixed-length, so nothing downstream can read the
 * statement back out of an id, compare ids for similarity, or reconstruct
 * lineage from them. The id is opaque at every point of use. What the text
 * buys is the determinism above, and one useful property: two identical
 * statements of the same kind from the same stage collide, which is how the
 * spine detects a model returning the same fact twice rather than silently
 * keeping both.
 *
 * WHAT HAPPENS WHEN THE PM EDITS A STATEMENT
 *
 * The edited text produces a different id, so the corrected claim is a new
 * claim whose origin is PM_EDIT and whose `supersedes` names the original.
 * CAP-03 requires exactly this: "the original is kept and the edited version is
 * attributed to them — a corrected statement is never presented as an
 * observation." An id therefore names one statement as it was at one moment,
 * permanently, which is what a later stage citing it needs.
 *
 * WHY THE RUN ID IS IN THE DIGEST
 *
 * It scopes identity to the decision/run, as the brief asks. Two runs over the
 * same screenshot produce different claims, because they are different
 * readings — and a verdict from one must never resolve a reference into the
 * other.
 */

const ID_PREFIX = 'CLM-';
const ID_BODY_LENGTH = 26;
const ID_PATTERN = new RegExp(`^${ID_PREFIX}[a-z2-7]{${ID_BODY_LENGTH}}$`);

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';

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

/**
 * Normalise before digesting so that whitespace differences do not produce two
 * ids for one statement. Case is preserved: "Continue" and "continue" are
 * different strings on a screen and may be different observations.
 */
export function normaliseClaimText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export interface ClaimIdentityInput {
  runId: string;
  producedBy: string;
  epistemicStatus: EpistemicStatus;
  text: string;
}

export function mintClaimId(input: ClaimIdentityInput): ClaimId {
  const digest = createHash('sha256')
    .update(input.runId)
    .update('\u0000')
    .update(input.producedBy)
    .update('\u0000')
    .update(input.epistemicStatus)
    .update('\u0000')
    .update(normaliseClaimText(input.text))
    .digest();

  return ID_PREFIX + base32(digest, ID_BODY_LENGTH);
}

export function isClaimId(value: unknown): value is ClaimId {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

export const CLAIM_ID_PATTERN = ID_PATTERN;
