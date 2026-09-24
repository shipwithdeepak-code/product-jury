/**
 * Stage 1 · Payload-size protection.
 *
 * PRD v1.1.1 SR-3 (shared capacity), NFR-9 (bounded cost), NFR-6 (a real,
 * specific cause), CAP-01 edge cases.
 *
 * The previous build set the JSON body limit to 30 MB to accommodate a base64
 * screenshot and checked nothing else. A 30 MB image is also a large multimodal
 * prompt, so the size limit and the cost ceiling are the same concern.
 *
 * Limits are checked before anything is sent to the provider, and a payload
 * that is too large is a named failure (PAYLOAD_TOO_LARGE), never a silent
 * truncation.
 */

import { ProductJuryError } from './errors';

export const PAYLOAD_LIMITS = Object.freeze({
  /** Whole request body. Sized to hold one artifact plus its context. */
  maxBodyBytes: Number(process.env.PJ_MAX_BODY_BYTES ?? 8 * 1024 * 1024),
  /** The decoded artifact itself. */
  maxArtifactBytes: Number(process.env.PJ_MAX_ARTIFACT_BYTES ?? 6 * 1024 * 1024),
  /** Free-form evidence the PM pastes. */
  maxEvidenceChars: Number(process.env.PJ_MAX_EVIDENCE_CHARS ?? 20_000),
  /** Any single typed context or claim field. */
  maxContextFieldChars: Number(process.env.PJ_MAX_CONTEXT_FIELD_CHARS ?? 4_000),
});

export const ACCEPTED_IMAGE_TYPES = Object.freeze([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);

export interface ParsedArtifact {
  base64: string;
  mimeType: string;
  byteLength: number;
}

/**
 * Parse and bound a data URL or bare base64 string.
 *
 * Throws rather than returning a best effort: an artifact that cannot be read
 * is not an artifact, and CAP-01's failure state says the product gives the
 * real reason and offers a retry.
 */
export function parseArtifact(
  input: unknown,
  declaredMimeType?: unknown,
  stage = 'analyst'
): ParsedArtifact {
  if (typeof input !== 'string' || input.trim().length === 0) {
    throw new ProductJuryError('INVALID_REQUEST', {
      stage,
      detail: { field: 'image' },
    });
  }

  let base64 = input.trim();
  let mimeType = typeof declaredMimeType === 'string' ? declaredMimeType : 'image/png';

  if (base64.startsWith('data:')) {
    const match = base64.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/s);
    if (!match) {
      throw new ProductJuryError('UNSUPPORTED_MEDIA_TYPE', { stage });
    }
    mimeType = match[1];
    base64 = match[2];
  }

  if (!ACCEPTED_IMAGE_TYPES.includes(mimeType.toLowerCase())) {
    throw new ProductJuryError('UNSUPPORTED_MEDIA_TYPE', {
      stage,
      detail: { mimeType },
    });
  }

  // base64 decodes at 3 bytes per 4 characters, less any padding.
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  const byteLength = Math.floor((base64.length * 3) / 4) - padding;

  if (byteLength > PAYLOAD_LIMITS.maxArtifactBytes) {
    throw new ProductJuryError('PAYLOAD_TOO_LARGE', {
      stage,
      detail: { byteLength, limit: PAYLOAD_LIMITS.maxArtifactBytes },
    });
  }

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new ProductJuryError('UNSUPPORTED_MEDIA_TYPE', { stage });
  }

  return { base64, mimeType, byteLength };
}

/**
 * Bound a supplied text field. Returns the trimmed value; throws when it is
 * over the limit rather than truncating, because a truncated claim is a
 * different claim and the product would be judging something the PM did not
 * write.
 */
export function boundedText(
  value: unknown,
  field: string,
  maxChars: number,
  stage = 'request'
): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') {
    throw new ProductJuryError('INVALID_REQUEST', { stage, detail: { field } });
  }
  if (value.length > maxChars) {
    throw new ProductJuryError('PAYLOAD_TOO_LARGE', {
      stage,
      detail: { field, length: value.length, limit: maxChars },
    });
  }
  return value.trim();
}
