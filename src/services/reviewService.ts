import {
  AnalysisProgressStep,
  ProductContext,
  ProductReview,
  RunProvenance,
  RunResult,
} from '../types';

/**
 * Stage 1 · The deliberation client, with the progress simulator removed.
 *
 * What was here: a `setInterval` that marked one pipeline step complete every
 * 2,800 ms for the whole of the request, regardless of what the server was
 * doing, and a final loop that marked every step complete once the response
 * arrived — including on a run where three of the four stages had failed and
 * been replaced by hand-written content.
 *
 * NFR-4 is explicit: "Progress indication reflects actual stage completion.
 * Always; no simulated progress." §51 never-7: "Claim a model ran when it did
 * not."
 *
 * What is here now: one running state while the request is open, and stage
 * statuses read from the run provenance the server returns. Because the
 * response is not streamed, the honest thing during the request is to say the
 * deliberation is running and name no stage as complete. When streaming lands,
 * stages resolve as their events arrive; the shape below already takes them
 * from run state rather than from a clock.
 */

export interface ProductReviewRequest {
  context: ProductContext;
  /**
   * Stage 4 · CAP-04. The PM's confirmed wording. Sent as its own field, not
   * folded into `context`: it identifies the decision, not the product.
   */
  decisionQuestion: string;
  rawEvidence?: string;
}

export type ProgressCallback = (steps: AnalysisProgressStep[]) => void;

/**
 * The stages this build has. `gate`, `cross_examination` and `red_team` are
 * reported by the server as `not_run` with their real reason, and they are
 * shown that way rather than hidden — TR-4 asks for which stages ran *and
 * which did not*.
 */
const STAGE_LABELS: Record<string, string> = {
  analyst: 'Reading the artifact',
  context_alignment: 'Comparing your context with the artifact',
  gate: 'Assessing whether the evidence is sufficient',
  specialist_ux: 'User-experience lens taking a position',
  specialist_strategy: 'Strategy lens taking a position',
  cross_examination: 'Lenses reading each other’s positions',
  auditor: 'Auditing the evidence behind the positions',
  chair: 'Synthesising the panel’s position',
  red_team: 'Challenging the position',
};

const PIPELINE_ORDER = [
  'analyst',
  'gate',
  'specialist_ux',
  'specialist_strategy',
  'cross_examination',
  'auditor',
  'chair',
];

export function stepsFromProvenance(provenance?: RunProvenance): AnalysisProgressStep[] {
  if (!provenance) return [];
  const byStage = new Map(provenance.stages.map((entry) => [entry.stage, entry]));

  return PIPELINE_ORDER.filter((stage) => byStage.has(stage)).map((stage) => {
    const entry = byStage.get(stage)!;
    return {
      id: stage,
      label: STAGE_LABELS[stage] ?? stage,
      status: entry.status === 'completed' ? 'completed' : entry.status === 'failed' ? 'failed' : 'not_run',
      reason: entry.reason,
    };
  });
}

/** The running state. Names no stage as complete, because none is known to be. */
export function runningSteps(): AnalysisProgressStep[] {
  return [
    {
      id: 'deliberation',
      label: 'Running the deliberation',
      status: 'running',
      reason:
        'This build returns the whole run at once, so the stages resolve together when it finishes.',
    },
  ];
}

export interface IProductReviewService {
  runReview(request: ProductReviewRequest, onProgress?: ProgressCallback): Promise<RunResult>;
}

export class ProductJuryReviewService implements IProductReviewService {
  /**
   * Returns a `RunResult`, never throws for an expected condition. A failure is
   * an outcome the caller renders, not an exception it has to interpret
   * (FR-41, NFR-6).
   */
  async runReview(
    request: ProductReviewRequest,
    onProgress?: ProgressCallback
  ): Promise<RunResult> {
    onProgress?.(runningSteps());

    let response: Response;
    try {
      response = await fetch('/api/jury/deliberate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: request.context,
          decisionQuestion: request.decisionQuestion,
          rawEvidence: request.rawEvidence,
        }),
      });
    } catch {
      return {
        kind: 'FAILED',
        code: 'NETWORK_UNREACHABLE',
        message:
          'This product could not be reached, so nothing was analysed. Check your connection and try again.',
        retryable: true,
      };
    }

    let payload: any;
    try {
      payload = await response.json();
    } catch {
      return {
        kind: 'FAILED',
        code: 'MALFORMED_RESPONSE',
        message: 'The server returned something this product could not read. Nothing is shown.',
        retryable: true,
      };
    }

    onProgress?.(stepsFromProvenance(payload?.provenance));

    if (payload?.outcome === 'INSUFFICIENT') {
      return {
        kind: 'INSUFFICIENT',
        refusedAt: payload.refusedAt === 'CEILING' ? 'CEILING' : 'GATE',
        missing: Array.isArray(payload.missing) ? payload.missing : [],
        provenance: payload.provenance,
      };
    }

    if (!response.ok || payload?.success === false || payload?.outcome === 'FAILED') {
      return {
        kind: 'FAILED',
        code: typeof payload?.code === 'string' ? payload.code : 'STAGE_FAILED',
        message:
          typeof payload?.error === 'string'
            ? payload.error
            : 'The deliberation did not complete, so nothing is shown.',
        retryable: Boolean(payload?.retryable),
        stage: payload?.stage,
        provenance: payload?.provenance,
      };
    }

    if (!payload?.data) {
      return {
        kind: 'FAILED',
        code: 'EMPTY_RESPONSE',
        message: 'The deliberation returned no result. Nothing is shown in its place.',
        retryable: true,
        provenance: payload?.provenance,
      };
    }

    const review = payload.data as ProductReview;
    review.isSample = false;

    return { kind: 'VERDICT', review, provenance: payload.provenance };
  }
}

export const reviewService = new ProductJuryReviewService();
