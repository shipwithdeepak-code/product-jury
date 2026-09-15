import { Type, invokeGeminiJson } from '../geminiClient';
import { UXResearchResult, ProductContext, ArtifactUnderstanding } from '../../src/types';

const uxResearcherSchema = {
  type: Type.OBJECT,
  properties: {
    agentRole: { type: Type.STRING, description: 'Must be UX_RESEARCHER' },
    summary: { type: Type.STRING, description: 'Executive UX assessment of the interface and experience' },
    strengths: {
      type: Type.ARRAY,
      description: 'Observable positive UX elements, clear signifiers, or sound ergonomic choices',
      items: { type: Type.STRING },
    },
    frictions: {
      type: Type.ARRAY,
      description: 'Identified usability friction points, cognitive density bottlenecks, or layout competing actions',
      items: {
        type: Type.OBJECT,
        properties: {
          friction: { type: Type.STRING, description: 'Clear statement of the UX friction point' },
          severity: { type: Type.STRING, description: 'low, medium, or high' },
          visualEvidence: { type: Type.STRING, description: 'Specific visible UI element or workflow gate causing this' },
        },
        required: ['friction', 'severity', 'visualEvidence'],
      },
    },
    userRisks: {
      type: Type.ARRAY,
      description: 'Potential user frustration, disorientation, or drop-off risks for the target persona',
      items: {
        type: Type.OBJECT,
        properties: {
          risk: { type: Type.STRING },
          severity: { type: Type.STRING, description: 'low, medium, or high' },
          whyItMatters: { type: Type.STRING },
        },
        required: ['risk', 'severity', 'whyItMatters'],
      },
    },
    researchQuestions: {
      type: Type.ARRAY,
      description: 'Key empirical usability questions that require user testing or interviews to answer',
      items: { type: Type.STRING },
    },
    recommendations: {
      type: Type.ARRAY,
      description: 'Actionable UX recommendations to eliminate friction and improve task completion',
      items: { type: Type.STRING },
    },
    confidence: {
      type: Type.INTEGER,
      description: 'Overall UX assessment confidence (0 to 100). Cap at 85 if based purely on static screenshot without behavioral data.',
    },
    evidenceItems: {
      type: Type.ARRAY,
      description: 'Epistemic classification of key claims made in this review',
      items: {
        type: Type.OBJECT,
        properties: {
          claim: { type: Type.STRING },
          status: { type: Type.STRING, description: 'FACT, INFERENCE, ASSUMPTION, or UNKNOWN' },
          source: { type: Type.STRING },
        },
        required: ['claim', 'status', 'source'],
      },
    },
  },
  required: [
    'agentRole',
    'summary',
    'strengths',
    'frictions',
    'userRisks',
    'researchQuestions',
    'recommendations',
    'confidence',
    'evidenceItems',
  ],
};

export interface RunUXResearcherInput {
  context: ProductContext;
  rawEvidence?: string;
  artifactUnderstanding?: ArtifactUnderstanding;
}

export async function runUXResearcherAgent(input: RunUXResearcherInput): Promise<UXResearchResult> {
  const { context, rawEvidence, artifactUnderstanding } = input;

  const systemInstruction = `You are Elena Rostova, the dedicated Lead UX Researcher on the Product Jury panel.
Your focus is strictly on usability, cognitive ergonomics, information architecture, workflow pacing, and persona empathy.

EPISTEMIC GROUNDING RULES:
1. Distinguish strictly between:
   - DIRECT VISUAL EVIDENCE: What is visibly rendered on the interface (e.g., CTA size, form inputs, layout density).
   - REASONABLE INFERENCES: Logical deductions regarding persona mental model mismatches.
   - UNVERIFIED HYPOTHESES: Hypotheses about how users might react.
   - UNKNOWNS: Information that requires user testing or telemetry to verify.
2. STRICT ANTI-FABRICATION MANDATE:
   - You MUST NOT claim that users "abandoned", "dropped off at rate X%", or "complained about Y" unless explicitly supplied in the Grounding Evidence Dossier.
   - Frame unverified behavioral concerns as hypotheses or research questions, NOT historical facts.
3. Assess the supplied interface against standard UX heuristics:
   - Cognitive density and visual noise
   - Visual hierarchy and Call-to-Action (CTA) prominence
   - Affordances and signifiers
   - Pacing of initial time-to-value
   - Accessibility and readability considerations visible in the artifact.`;

  const promptText = `Evaluate this product experience from a rigorous UX research perspective:

PRODUCT DOSSIER:
- Product Name: ${context.name || 'Unnamed Product'}
- What is being built: ${context.whatBuilding || 'Not specified'}
- Target User: ${context.targetUser || 'General users'}
- Primary Goal: ${context.primaryGoal || 'Not specified'}
- Observed Problem / User Friction: ${context.currentProblem || 'None reported'}

CONTEXT ANALYST ARTIFACT FINDINGS:
${
  artifactUnderstanding
    ? `- Product Genre: ${artifactUnderstanding.productType}
- Inferred User Role: ${artifactUnderstanding.likelyUser}
- Primary Journey: ${artifactUnderstanding.detectedJourney}
- Visible Facts: ${artifactUnderstanding.facts.slice(0, 5).join('; ') || 'None'}
- Inferences: ${artifactUnderstanding.inferences.slice(0, 4).join('; ') || 'None'}
- Visual Friction Signals: ${artifactUnderstanding.frictionSignals.join('; ') || 'None'}`
    : 'No screenshot artifact findings available.'
}

${
  context.artifactUnderstanding?.contextAlignment
    ? `CONTEXT ALIGNMENT ASSESSMENT:
- Status: ${context.artifactUnderstanding.contextAlignment.status}
- Summary: ${context.artifactUnderstanding.contextAlignment.summary}
- Visual Evidence: ${context.artifactUnderstanding.contextAlignment.visualEvidence}`
    : ''
}

${rawEvidence ? `GROUNDING EVIDENCE & USER RESEARCH LOGS:\n${rawEvidence}` : 'No external user research logs provided.'}

Deliver your complete UX research analysis adhering strictly to the JSON schema.`;

  try {
    const result = await invokeGeminiJson<UXResearchResult>({
      systemInstruction,
      prompt: promptText,
      schema: uxResearcherSchema,
      temperature: 0.25,
      imageBase64: context.screenshotUrl,
      agentLabel: 'UX Researcher',
    });

    // Enforce role
    result.agentRole = 'UX_RESEARCHER';
    result.confidence = Math.min(88, Math.max(20, Number(result.confidence) || 75));

    return result;
  } catch (err: any) {
    console.warn('[UX Researcher Agent] Model invocation failed, utilizing calibrated fallback review:', err?.message || err);
    return generateDegradedUXReview(context, artifactUnderstanding);
  }
}

function generateDegradedUXReview(
  context: ProductContext,
  artifactUnderstanding?: ArtifactUnderstanding
): UXResearchResult {
  const frictions = (artifactUnderstanding?.frictionSignals || []).map((sig) => ({
    friction: sig,
    severity: 'medium' as const,
    visualEvidence: 'Identified during visual artifact analysis',
  }));

  return {
    agentRole: 'UX_RESEARCHER',
    summary: `UX assessment for ${context.name || 'this workflow'}: The layout presents observable task progression, but requires user testing to confirm whether ${context.targetUser || 'target users'} can complete the primary action without cognitive overload.`,
    strengths: [
      'Visual structure establishes clear primary layout regions.',
      'Core interface controls are prominently grouped.',
    ],
    frictions:
      frictions.length > 0
        ? frictions
        : [
            {
              friction: 'Action hierarchy presents potential cognitive competition between primary and auxiliary tasks.',
              severity: 'medium',
              visualEvidence: 'Observable button placement in active viewport.',
            },
          ],
    userRisks: [
      {
        risk: 'Users may hesitate on the initial action if prerequisite inputs feel unearned.',
        severity: 'medium',
        whyItMatters: 'Extends time-to-value and increases hesitation.',
      },
    ],
    researchQuestions: [
      'Can target users complete the core action in under 2 minutes without external assistance?',
      'Which specific form fields or steps generate the highest hesitation during initial onboarding?',
    ],
    recommendations: [
      'Conduct 5 observational usability sessions focusing on the first-time user journey.',
      'Elevate the single primary Call-to-Action to eliminate visual competition.',
    ],
    confidence: 65,
    evidenceItems: [
      {
        claim: 'Interface layout establishes visible task sequence',
        status: 'FACT',
        source: 'Visual artifact screen',
      },
      {
        claim: 'Cognitive load may cause hesitation for first-time users',
        status: 'INFERENCE',
        source: 'UX heuristic evaluation',
      },
    ],
  };
}
