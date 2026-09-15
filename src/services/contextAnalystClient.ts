import { ArtifactUnderstanding, ContextAnalysisResponse, ContextAlignment } from '../types';

export interface AnalysisError {
  message: string;
  isApiError: boolean;
}

export async function analyzeArtifactViaServer(
  imageBase64: string,
  fileName?: string,
  mimeType?: string
): Promise<ArtifactUnderstanding> {
  if (!imageBase64 || imageBase64.trim().length === 0) {
    throw new Error('Please provide an image screenshot to analyze.');
  }

  const payload = {
    image: imageBase64,
    fileName,
    mimeType: mimeType || 'image/png',
  };

  const response = await fetch('/api/context/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errorDetail = 'Failed to analyze product artifact.';
    try {
      const errJson = await response.json();
      if (errJson?.error) {
        errorDetail = errJson.error;
      }
    } catch {
      errorDetail = `Server returned HTTP ${response.status}: ${response.statusText}`;
    }
    throw new Error(errorDetail);
  }

  const result = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error || 'Server did not return valid context analysis.');
  }

  const data: ContextAnalysisResponse = result.data;

  // Convert rich structured analysis to standard ArtifactUnderstanding with detailedAnalysis attached
  const understanding: ArtifactUnderstanding = {
    productType: data.productType?.value || 'Web Application Screen',
    likelyUser: data.likelyUser?.value || 'End users of the application',
    detectedJourney: data.primaryJourney?.value || 'User workflow and task progression',
    frictionSignals: (data.frictionSignals || []).map((fs) => fs.signal),
    facts: (data.facts || []).map((f) => f.statement),
    inferences: (data.inferences || []).map((inf) => inf.statement),
    assumptions: (data.assumptions || []).map((a) => a.statement),
    unknowns: (data.unknowns || []).map((u) => u.question),
    isConfirmed: false,
    isAnalyzedByGemini: !data.isCapacityFallback,
    contextAlignment: undefined, // Artifact-only analysis does NOT include context alignment
    detailedAnalysis: data,
    isCapacityFallback: data.isCapacityFallback,
    fallbackNotice: data.fallbackNotice,
  };

  return understanding;
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
    throw new Error('Please provide an image screenshot to compare with context.');
  }
  if (!contextClaim || !contextClaim.trim()) {
    throw new Error('Please enter product context before comparing with Gemini.');
  }

  const payload = {
    image: imageBase64,
    fileName,
    mimeType: mimeType || 'image/png',
    contextClaim: contextClaim.trim(),
    visualFindings,
  };

  const response = await fetch('/api/context/compare', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errorDetail = 'Failed to compare product context with screenshot.';
    try {
      const errJson = await response.json();
      if (errJson?.error) {
        errorDetail = errJson.error;
      }
    } catch {
      errorDetail = `Server returned HTTP ${response.status}: ${response.statusText}`;
    }
    throw new Error(errorDetail);
  }

  const result = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error || 'Server did not return valid context comparison.');
  }

  return result.data as ContextAlignment;
}
