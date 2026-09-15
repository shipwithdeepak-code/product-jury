import {
  ProductContext,
  ProductReview,
  AnalysisProgressStep,
} from '../types';
import { sampleProductReview } from '../data/sampleReview';

export interface ProductReviewRequest {
  context: ProductContext;
  rawEvidence?: string;
}

export type ProgressCallback = (step: AnalysisProgressStep) => void;

export interface IProductReviewService {
  runReview(
    request: ProductReviewRequest,
    onProgress?: ProgressCallback
  ): Promise<ProductReview>;
}

export class GeminiMultiAgentReviewService implements IProductReviewService {
  private readonly steps: Omit<AnalysisProgressStep, 'status'>[] = [
    { id: '1', label: 'Analyzing product context & visual artifact layout' },
    { id: '2', label: 'UX Researcher deliberating (ergonomics & cognitive density)' },
    { id: '3', label: 'Product Strategist deliberating (goal alignment & strategic risks)' },
    { id: '4', label: 'Evidence Auditor evaluating claims (facts vs assumptions)' },
    { id: '5', label: 'Jury Chair synthesizing binding verdict & trade-offs' },
  ];

  async runReview(
    request: ProductReviewRequest,
    onProgress?: ProgressCallback
  ): Promise<ProductReview> {
    // 1. Preserve static sample dossier if the user explicitly loaded and ran the sample
    const isUnmodifiedSample =
      request.context.name === sampleProductReview.context.name &&
      !request.context.screenshotUrl &&
      (!request.rawEvidence || request.rawEvidence === sampleProductReview.evidenceRaw);

    if (isUnmodifiedSample) {
      // Simulate steps for the sample demonstration
      for (let i = 0; i < this.steps.length; i++) {
        if (onProgress) {
          onProgress({
            id: this.steps[i].id,
            label: this.steps[i].label,
            status: 'active',
          });
        }
        await new Promise((resolve) => setTimeout(resolve, 350));
        if (onProgress) {
          onProgress({
            id: this.steps[i].id,
            label: this.steps[i].label,
            status: 'completed',
          });
        }
      }

      return {
        ...sampleProductReview,
        id: `rev-${Date.now()}`,
        timestamp: new Date().toISOString(),
        isMock: true,
      };
    }

    // 2. Real Multi-Agent Pipeline for all custom reviews
    // Launch server deliberation
    let stepIndex = 0;
    if (onProgress) {
      onProgress({
        id: this.steps[0].id,
        label: this.steps[0].label,
        status: 'active',
      });
    }

    // Advance step indicators while server-side deliberation is computing
    const stepInterval = setInterval(() => {
      if (stepIndex < this.steps.length - 1) {
        if (onProgress) {
          onProgress({
            id: this.steps[stepIndex].id,
            label: this.steps[stepIndex].label,
            status: 'completed',
          });
        }
        stepIndex++;
        if (onProgress) {
          onProgress({
            id: this.steps[stepIndex].id,
            label: this.steps[stepIndex].label,
            status: 'active',
          });
        }
      }
    }, 2800);

    try {
      const response = await fetch('/api/jury/deliberate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          context: request.context,
          rawEvidence: request.rawEvidence,
        }),
      });

      clearInterval(stepInterval);

      if (!response.ok) {
        let errMessage = 'Deliberation request failed.';
        try {
          const errJson = await response.json();
          if (errJson?.error) {
            errMessage = errJson.error;
          }
        } catch {
          errMessage = `Server error ${response.status}: ${response.statusText}`;
        }
        throw new Error(errMessage);
      }

      const result = await response.json();

      if (!result.success || !result.data) {
        throw new Error(result.error || 'Server did not return a valid Product Review.');
      }

      // Mark final step completed
      if (onProgress) {
        for (const step of this.steps) {
          onProgress({
            id: step.id,
            label: step.label,
            status: 'completed',
          });
        }
      }

      const review: ProductReview = result.data;
      review.isMock = false;

      return review;
    } catch (error: any) {
      clearInterval(stepInterval);
      console.error('[Product Jury Service] Deliberation error:', error);
      throw error;
    }
  }
}

// Global singleton service instance
export const reviewService = new GeminiMultiAgentReviewService();
