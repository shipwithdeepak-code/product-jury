import {
  ProductContext,
  ProductReview,
  AnalysisProgressStep,
  Verdict,
} from '../types';
import { sampleProductReview } from '../data/sampleReview';

export interface ProductReviewRequest {
  context: ProductContext;
  rawEvidence?: string;
}

export type ProgressCallback = (step: AnalysisProgressStep) => void;

/**
 * Interface representing the Product Jury Analysis Engine.
 *
 * EXTENSION POINT:
 * In v1.1+, this will be implemented by `GeminiMultiAgentReviewService`,
 * calling Google GenAI SDK (`@google/genai`) on the server to coordinate:
 *  1. Gemini 2.5/Flash Vision for Screenshot UI analysis
 *  2. Specialist sub-agents (UX Researcher, PM, Design Critic)
 *  3. Epistemic Evidence classifier (FACT / INFERENCE / ASSUMPTION / UNKNOWN)
 *  4. Decision Synthesis Agent for the Verdict & Actionable Next Step
 *  5. Red Team Adversarial Agent for challenging decisions
 */
export interface IProductReviewService {
  runReview(
    request: ProductReviewRequest,
    onProgress?: ProgressCallback
  ): Promise<ProductReview>;
}

export class MockProductReviewService implements IProductReviewService {
  private readonly steps: Omit<AnalysisProgressStep, 'status'>[] = [
    { id: '1', label: 'Analyzing product context, user goals & screenshot signals' },
    { id: '2', label: 'Consulting specialist panel (UX, PM, Design Critic)' },
    { id: '3', label: 'Classifying epistemic evidence (FACT / INFERENCE / ASSUMPTION / UNKNOWN)' },
    { id: '4', label: 'Mapping points of consensus vs. strategic disagreement' },
    { id: '5', label: 'Synthesizing Verdict & actionable PM decision defense' },
  ];

  async runReview(
    request: ProductReviewRequest,
    onProgress?: ProgressCallback
  ): Promise<ProductReview> {
    // Simulate real pipeline progression so PMs experience the analytical decision workflow
    for (let i = 0; i < this.steps.length; i++) {
      if (onProgress) {
        onProgress({
          id: this.steps[i].id,
          label: this.steps[i].label,
          status: 'active',
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 650));
      if (onProgress) {
        onProgress({
          id: this.steps[i].id,
          label: this.steps[i].label,
          status: 'completed',
        });
      }
    }

    // Determine tailored verdict and content based on input if user provided custom context
    const hasCustomInput =
      request.context.whatBuilding.trim().length > 0 &&
      request.context.name !== sampleProductReview.context.name;

    if (!hasCustomInput) {
      return {
        ...sampleProductReview,
        id: `rev-${Date.now()}`,
        timestamp: new Date().toISOString(),
        context: {
          ...request.context,
          name: request.context.name || sampleProductReview.context.name,
        },
        evidenceRaw: request.rawEvidence || sampleProductReview.evidenceRaw,
        isMock: true,
      };
    }

    // Dynamically contextualize the mock review for custom inputs
    const verdict: Verdict = 'ITERATE';
    return {
      id: `rev-${Date.now()}`,
      timestamp: new Date().toISOString(),
      context: request.context,
      evidenceRaw: request.rawEvidence,
      verdict,
      confidenceScore: 68,
      confidenceRationale:
        'Medium confidence: Strong structural signals identified from user intent, but quantitative behavioral metrics and live engagement logs remain unverified.',
      executiveSummary: `For "${request.context.name || 'this product'}", the primary tension lies between the stated goal (${request.context.primaryGoal || 'activation'}) and the user friction experienced by target users (${request.context.targetUser || 'users'}). The jury recommends ITERATE: validate whether the initial payoff is apparent within the first session before introducing complex configuration workflows.`,
      opportunities: [
        {
          id: 'opp-c1',
          problem: request.context.currentProblem
            ? `Reported User Friction: ${request.context.currentProblem}`
            : 'Friction between initial onboarding discovery and user value comprehension.',
          userImpact:
            'Target users encounter steep cognitive barriers before witnessing tangible proof of value.',
          businessImpact:
            'Suppresses funnel throughput and increases user bounce rate during onboarding.',
          confidence: 85,
          evidenceStatus: request.rawEvidence ? 'FACT' : 'INFERENCE',
          evidenceContext: request.rawEvidence
            ? 'Grounded directly in user notes and feedback provided in evidence dossier.'
            : 'Derived logically from stated product problem and persona profile.',
        },
        {
          id: 'opp-c2',
          problem:
            'Time-to-Value Latency: Users are asked for commitment before experiencing the core product capability.',
          userImpact:
            'Users lack immediate confirmation that the tool solves their primary operational headache.',
          businessImpact:
            'Weakens initial trial conversion and increases reliance on external documentation.',
          confidence: 72,
          evidenceStatus: 'INFERENCE',
          evidenceContext:
            'Synthesized by evaluating persona workflow expectations against the stated business goal.',
        },
        {
          id: 'opp-c3',
          problem:
            'Unvalidated Persona Assumptions: Hypotheses regarding workflow readiness have not yet been stress-tested.',
          userImpact:
            'Non-technical or time-crunched operators may find the experience disorienting.',
          businessImpact:
            'Risk of misallocating engineering capacity on secondary features before core journey validation.',
          confidence: 60,
          evidenceStatus: 'ASSUMPTION',
          evidenceContext:
            'Key persona behaviors are currently assumed based on qualitative statements.',
        },
      ],
      agentReviews: [
        {
          role: 'UX_RESEARCHER',
          roleTitle: 'UX Researcher',
          agentName: 'Elena Rostova',
          recommendation: 'Conduct lean 1:1 observational walkthroughs with 5 representative users.',
          confidence: 80,
          keyObservation: 'Onboarding appears to create unnecessary friction.',
          coreArgument:
            'User mental models are easily fractured when terminology or initial setup asks for unearned effort. Minimizing initial prerequisites will expose the true value proposition.',
        },
        {
          role: 'PRODUCT_MANAGER',
          roleTitle: 'Product Manager',
          agentName: 'Marcus Vance',
          recommendation: 'Anchor the first 5 minutes to an undeniable high-value outcome.',
          confidence: 75,
          keyObservation: 'The larger concern may be that users do not experience value early enough.',
          coreArgument:
            'PM focus must stay on the activation baseline. Even with frictionless steps, if the user doesn\'t understand why this product is 10x better than their existing alternative within 3 minutes, they will drop off.',
        },
        {
          role: 'DESIGN_CRITIC',
          roleTitle: 'Design Critic',
          agentName: 'Siddharth Roy',
          recommendation: 'Establish an unequivocal hierarchy between primary deployment and peripheral configuration.',
          confidence: 70,
          keyObservation: 'The primary CTA competes with secondary actions.',
          coreArgument:
            'Ensure visually dominant primary callouts, clean visual signifiers, and explicit contextual affordances rather than competing equal-weight controls.',
        },
      ],
      agreementDisagreement: {
        agreements: [
          'All specialists agree that shipping the current state without iteration poses an avoidable retention risk.',
          'Consensus that early demo templates or sandbox data would accelerate comprehension.',
          'Agreement that qualitative evidence needs quantitative instrumentation to defend future roadmap choices.',
        ],
        disagreements: [
          {
            topic: 'Simplicity vs. Immediate Value Depth',
            frictionPoint:
              'Should the next sprint prioritize removing form steps or creating an engaging interactive demo?',
            agentPositions: [
              {
                roleTitle: 'UX Researcher',
                view: 'Wants to aggressively remove friction gates and optional form inputs first.',
              },
              {
                roleTitle: 'Product Manager',
                view: 'Advocates for creating an interactive preview state that showcases value even if setup takes the same duration.',
              },
              {
                roleTitle: 'Design Critic',
                view: 'Insists visual hierarchy realignment must occur concurrently so users never hesitate on the primary action.',
              },
            ],
          },
        ],
        unknowns: [
          'Granular drop-off step telemetry in the live production funnel.',
          'Willingness of user persona to import real live data on day 1.',
          'Relative value of self-serve activation versus high-touch sales onboarding for this persona.',
        ],
      },
      recommendedNextStep:
        'Run a 5-user usability test focused on first-session activation before redesigning the onboarding flow.',
      isMock: true,
    };
  }
}

// Global singleton service instance
export const reviewService = new MockProductReviewService();
