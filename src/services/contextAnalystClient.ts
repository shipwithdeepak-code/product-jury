import {
  ArtifactUnderstanding,
  ContextAlignment,
  ContextAnalysisResponse,
  EmbeddedInstructionObservation,
} from '../types';

/**
 * Stage 1 · The analyst client.
 *
 * Two changes:
 *
 *  1. Failures carry the taxonomy code and the server's user-facing sentence
 *     rather than a provider string (SR-4, NFR-6). `AnalysisFailure` is thrown
 *     so callers can render the real cause.
 *  2. The flattening that dropped every statement's origin is gone. PRD v1.1.1
 *     CAP-03 requires 100% of visible statements to carry an origin, and the
 *     previous version reduced each structured statement to its bare text at
 *     this line — `facts: data.facts.map(f => f.statement)` — so the evidence
 *     that justified it never reached any later stage. The structured analysis
 *     is now carried alongside the flattened view, and the flattened view is
 *     for display only.
 */

export class AnalysisFailure extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(message: string, code: string, retryable: boolean) {
    super(message);
    this.name = 'AnalysisFailure';
    this.code = code;
    this.retryable = retryable;
  }
}

async function readFailure(response: Response): Promise<AnalysisFailure> {
  try {
    const payload = await response.json();
    return new AnalysisFailure(
      typeof payload?.error === 'string'
        ? payload.error
        : 'The request did not complete, and nothing was produced in its place.',
      typeof payload?.code === 'string' ? payload.code : 'STAGE_FAILED',
      Boolean(payload?.retryable)
    );
  } catch {
    return new AnalysisFailure(
      'The request did not complete, and nothing was produced in its place.',
      'MALFORMED_RESPONSE',
      true
    );
  }
}

export interface ArtifactReading {
  understanding: ArtifactUnderstanding;
  /** SR-8: instructions found in the input, recorded rather than obeyed. */
  observations: EmbeddedInstructionObservation[];
}

export async function analyzeArtifactViaServer(
  imageBase64: string,
  fileName?: string,
  mimeType?: string
): Promise<ArtifactReading> {
  if (!imageBase64 || imageBase64.trim().length === 0) {
    throw new AnalysisFailure(
      'No screenshot was provided, so nothing was read.',
      'INVALID_REQUEST',
      false
    );
  }

  const response = await fetch('/api/context/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageBase64, fileName, mimeType: mimeType || 'image/png' }),
  });

  if (!response.ok) {
    throw await readFailure(response);
  }

  const result = await response.json();
  if (!result?.success || !result?.data) {
    throw new AnalysisFailure(
      'The server returned no artifact reading. Nothing is shown in its place.',
      'EMPTY_RESPONSE',
      true
    );
  }

  const data: ContextAnalysisResponse = result.data;

  const understanding: ArtifactUnderstanding = {
    productType: data.productType.value,
    likelyUser: data.likelyUser?.value ?? '',
    detectedJourney: data.primaryJourney?.value ?? '',
    frictionSignals: (data.frictionSignals || []).map((fs) => fs.signal),
    facts: (data.facts || []).map((f) => f.statement),
    inferences: (data.inferences || []).map((inf) => inf.statement),
    assumptions: (data.assumptions || []).map((a) => a.statement),
    unknowns: (data.unknowns || []).map((u) => u.question),
    isConfirmed: false,
    isAnalyzedByGemini: true,
    // An artifact-only reading never carries an alignment (§51, fail closed).
    contextAlignment: undefined,
    // CAP-03: the origins survive here. The arrays above are a display
    // convenience, not the record.
    detailedAnalysis: data,
  };

  return {
    understanding,
    observations: Array.isArray(result.observations) ? result.observations : [],
  };
}

export async function compareContextViaServer(
  imageBase64: string,
  contextClaim: string,
  fileName?: string,
  mimeType?: string,
  visualFindings?: {
    productType?: string;
    likelyUser?: string;
    detectedJourney?: string;
  }
): Promise<ContextAlignment> {
  if (!imageBase64 || imageBase64.trim().length === 0) {
    throw new AnalysisFailure(
      'No screenshot was provided, so there was nothing to compare against.',
      'INVALID_REQUEST',
      false
    );
  }
  if (!contextClaim || !contextClaim.trim()) {
    throw new AnalysisFailure(
      'No context was entered, so there was no claim to compare.',
      'INVALID_REQUEST',
      false
    );
  }

  const response = await fetch('/api/context/compare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: imageBase64,
      fileName,
      mimeType: mimeType || 'image/png',
      contextClaim: contextClaim.trim(),
      visualFindings,
    }),
  });

  if (!response.ok) {
    throw await readFailure(response);
  }

  const result = await response.json();
  if (!result?.success || !result?.data) {
    // §51 fail closed: an absent alignment, never a manufactured one.
    throw new AnalysisFailure(
      'The comparison did not complete, so no alignment is shown.',
      'EMPTY_RESPONSE',
      true
    );
  }

  return result.data as ContextAlignment;
}
