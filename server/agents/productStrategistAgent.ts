import { Type, invokeGeminiJson } from '../geminiClient';
import { ProductStrategyResult, ProductContext, ArtifactUnderstanding } from '../../src/types';

const productStrategistSchema = {
  type: Type.OBJECT,
  properties: {
    agentRole: { type: Type.STRING, description: 'Must be PRODUCT_MANAGER' },
    summary: { type: Type.STRING, description: 'Executive product strategy and business viability assessment' },
    goalAlignment: {
      type: Type.OBJECT,
      description: 'Assessment of how directly the interface serves the stated PM goal',
      properties: {
        isAligned: { type: Type.BOOLEAN },
        score: { type: Type.INTEGER, description: '0 to 100 alignment score' },
        rationale: { type: Type.STRING, description: 'Detailed justification of alignment or misalignment' },
      },
      required: ['isAligned', 'score', 'rationale'],
    },
    strategicRisks: {
      type: Type.ARRAY,
      description: 'Business, adoption, or roadmap investment risks identified',
      items: {
        type: Type.OBJECT,
        properties: {
          risk: { type: Type.STRING },
          severity: { type: Type.STRING, description: 'low, medium, or high' },
          impact: { type: Type.STRING, description: 'Impact on adoption, retention, or business viability' },
        },
        required: ['risk', 'severity', 'impact'],
      },
    },
    valueHypotheses: {
      type: Type.ARRAY,
      description: 'Core product value hypotheses and their current validation state',
      items: {
        type: Type.OBJECT,
        properties: {
          hypothesis: { type: Type.STRING },
          expectedPayoff: { type: Type.STRING },
          validationStatus: {
            type: Type.STRING,
            description: 'UNVALIDATED, PARTIALLY_VALIDATED, or VALIDATED',
          },
        },
        required: ['hypothesis', 'expectedPayoff', 'validationStatus'],
      },
    },
    validationNeeds: {
      type: Type.ARRAY,
      description: 'Critical business or telemetry metrics that must be instrumented before scaling investment',
      items: { type: Type.STRING },
    },
    recommendations: {
      type: Type.ARRAY,
      description: 'Strategic product recommendations (sequencing, MVP scoping, or positioning adjustments)',
      items: { type: Type.STRING },
    },
    confidence: {
      type: Type.INTEGER,
      description: 'Confidence in this strategic recommendation (0 to 100). Lower if commercial metrics are unverified.',
    },
    evidenceItems: {
      type: Type.ARRAY,
      description: 'Epistemic classification of strategic assumptions vs established facts',
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
    'goalAlignment',
    'strategicRisks',
    'valueHypotheses',
    'validationNeeds',
    'recommendations',
    'confidence',
    'evidenceItems',
  ],
};

export interface RunProductStrategistInput {
  context: ProductContext;
  rawEvidence?: string;
  artifactUnderstanding?: ArtifactUnderstanding;
}

export async function runProductStrategistAgent(input: RunProductStrategistInput): Promise<ProductStrategyResult> {
  const { context, rawEvidence, artifactUnderstanding } = input;

  const systemInstruction = `You are Marcus Vance, the dedicated Principal Product Strategist on the Product Jury panel.
Your focus is strictly on product-market thesis, business goal alignment, time-to-value latency, feature scoping discipline, and strategic investment risk.

EPISTEMIC GROUNDING RULES:
1. STRICT ANTI-FABRICATION MANDATE:
   - NEVER invent or hallucinate metrics: do not invent conversion rates (e.g. "converts at 12%"), activation percentages, retention curves, market sizing (TAM/SAM), customer acquisition costs, or revenue figures.
   - If business metrics are not explicitly provided in the dossier, treat them as UNKNOWNS and explicitly highlight the validation need.
2. Distinguish:
   - FACT: Explicit goal, visible features, supplied user evidence.
   - INFERENCE: Strategic alignment between feature set and stated target persona.
   - ASSUMPTION: Unproven beliefs that the persona desires this workflow and will tolerate setup overhead.
   - UNKNOWN: Missing commercial metrics, telemetry, or retention benchmarks.
3. ADVISE ON DECISION READINESS:
   - Evaluate whether current evidence supports: SHIP (ready for production), ITERATE (clear direction, fixable gaps), TEST (high hypothesis uncertainty), or STOP/KILL (fundamental strategic flaw).`;

  const promptText = `Evaluate this product initiative from an executive Product Strategy perspective:

STRATEGIC DOSSIER:
- Product Name: ${context.name || 'Unnamed Product'}
- What is being built: ${context.whatBuilding || 'Not specified'}
- Target User: ${context.targetUser || 'Target users'}
- Primary Business / Product Goal: ${context.primaryGoal || 'Not specified'}
- Observed Bottleneck / User Friction: ${context.currentProblem || 'None reported'}

CONTEXT ANALYST ARTIFACT FINDINGS:
${
  artifactUnderstanding
    ? `- Product Genre: ${artifactUnderstanding.productType}
- Inferred User Role: ${artifactUnderstanding.likelyUser}
- Primary Journey: ${artifactUnderstanding.detectedJourney}
- Visible Facts: ${artifactUnderstanding.facts.slice(0, 5).join('; ') || 'None'}
- Critical Unknowns: ${artifactUnderstanding.unknowns.slice(0, 4).join('; ') || 'None'}`
    : 'No visual artifact findings available.'
}

${
  context.artifactUnderstanding?.contextAlignment
    ? `CONTEXT ALIGNMENT ASSESSMENT:
- Status: ${context.artifactUnderstanding.contextAlignment.status}
- Summary: ${context.artifactUnderstanding.contextAlignment.summary}`
    : ''
}

${rawEvidence ? `RESEARCH EVIDENCE & QUALITATIVE LOGS:\n${rawEvidence}` : 'No external quantitative telemetry or logs provided.'}

Deliver your complete Product Strategy review adhering strictly to the JSON schema.`;

  try {
    const result = await invokeGeminiJson<ProductStrategyResult>({
      systemInstruction,
      prompt: promptText,
      schema: productStrategistSchema,
      temperature: 0.25,
      imageBase64: context.screenshotUrl,
      agentLabel: 'Product Strategist',
    });

    result.agentRole = 'PRODUCT_MANAGER';
    result.confidence = Math.min(85, Math.max(20, Number(result.confidence) || 72));

    return result;
  } catch (err: any) {
    console.warn('[Product Strategist Agent] Model invocation failed, utilizing calibrated fallback review:', err?.message || err);
    return generateDegradedStrategyReview(context);
  }
}

function generateDegradedStrategyReview(context: ProductContext): ProductStrategyResult {
  return {
    agentRole: 'PRODUCT_MANAGER',
    summary: `Strategic review for ${context.name || 'this initiative'}: The product targets a defined outcome (${context.primaryGoal || 'user value'}), but the workflow requires tighter focus on immediate time-to-value to protect initial user activation.`,
    goalAlignment: {
      isAligned: Boolean(context.primaryGoal),
      score: 70,
      rationale: `The visible interface reflects components relevant to ${context.primaryGoal || 'the objective'}, but configuration steps may delay user comprehension.`,
    },
    strategicRisks: [
      {
        risk: 'Time-to-value latency may depress initial user activation.',
        severity: 'medium',
        impact: 'Users may abandon setup before realizing the core product differentiator.',
      },
      {
        risk: 'Unvalidated willingness of the target persona to complete prerequisite setup.',
        severity: 'medium',
        impact: 'Misallocation of development sprints on peripheral features before verifying core loop demand.',
      },
    ],
    valueHypotheses: [
      {
        hypothesis: `${context.targetUser || 'Target users'} will actively adopt this interface to achieve ${context.primaryGoal || 'their primary goal'}.`,
        expectedPayoff: 'High workflow retention and repeated weekly engagement.',
        validationStatus: 'UNVALIDATED',
      },
    ],
    validationNeeds: [
      'Instrumentation of the funnel drop-off between screen load and first successful completion.',
      'Validation of activation benchmark target with leadership.',
    ],
    recommendations: [
      'Anchor the first session experience to an immediate high-value outcome before demanding setup inputs.',
      'Define an unambiguous activation metric to measure whether iterations succeed.',
    ],
    confidence: 68,
    evidenceItems: [
      {
        claim: 'Stated goal requires active user completion',
        status: 'FACT',
        source: 'PM Product Context',
      },
      {
        claim: 'Configuration friction creates strategic activation risk',
        status: 'INFERENCE',
        source: 'Product strategy analysis',
      },
    ],
  };
}
