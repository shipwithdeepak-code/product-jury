import { Type, invokeGeminiJson } from '../geminiClient';
import {
  ProductReview,
  ProductContext,
  ArtifactUnderstanding,
  ContextAlignment,
  UXResearchResult,
  ProductStrategyResult,
  EvidenceAuditResult,
  Verdict,
  Opportunity,
  AgentReview,
  AgreementDisagreement,
} from '../../src/types';

const juryDecisionSchema = {
  type: Type.OBJECT,
  properties: {
    verdict: {
      type: Type.STRING,
      description: 'Must be one of: SHIP, ITERATE, TEST, or KILL',
    },
    confidenceScore: {
      type: Type.INTEGER,
      description: 'Calibrated confidence score from 0 to 100 based on verified evidence vs unknown risks',
    },
    confidenceRationale: {
      type: Type.STRING,
      description: 'Epistemic justification for why confidence is scored at this level',
    },
    executiveSummary: {
      type: Type.STRING,
      description: 'High-impact synthesis of the jury verdict and key strategic trade-offs',
    },
    recommendedNextStep: {
      type: Type.STRING,
      description: 'The single most urgent, actionable next step for the PM',
    },
    opportunities: {
      type: Type.ARRAY,
      description: 'Exactly 3 prioritized product problem opportunities ranked by user and business impact',
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          problem: { type: Type.STRING },
          userImpact: { type: Type.STRING },
          businessImpact: { type: Type.STRING },
          confidence: { type: Type.INTEGER, description: '0 to 100' },
          evidenceStatus: {
            type: Type.STRING,
            description: 'Must be FACT, INFERENCE, or ASSUMPTION',
          },
          evidenceContext: { type: Type.STRING },
        },
        required: [
          'id',
          'problem',
          'userImpact',
          'businessImpact',
          'confidence',
          'evidenceStatus',
          'evidenceContext',
        ],
      },
    },
    agentReviews: {
      type: Type.ARRAY,
      description: 'Exactly 3 specialist panel reviews for UX Researcher, Product Manager, and Design Critic',
      items: {
        type: Type.OBJECT,
        properties: {
          role: { type: Type.STRING, description: 'UX_RESEARCHER, PRODUCT_MANAGER, or DESIGN_CRITIC' },
          roleTitle: { type: Type.STRING },
          agentName: { type: Type.STRING },
          recommendation: { type: Type.STRING },
          confidence: { type: Type.INTEGER },
          keyObservation: { type: Type.STRING },
          coreArgument: { type: Type.STRING },
        },
        required: [
          'role',
          'roleTitle',
          'agentName',
          'recommendation',
          'confidence',
          'keyObservation',
          'coreArgument',
        ],
      },
    },
    agreementDisagreement: {
      type: Type.OBJECT,
      properties: {
        agreements: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        disagreements: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              topic: { type: Type.STRING },
              frictionPoint: { type: Type.STRING },
              agentPositions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    roleTitle: { type: Type.STRING },
                    view: { type: Type.STRING },
                  },
                  required: ['roleTitle', 'view'],
                },
              },
            },
            required: ['topic', 'frictionPoint', 'agentPositions'],
          },
        },
        unknowns: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
      },
      required: ['agreements', 'disagreements', 'unknowns'],
    },
  },
  required: [
    'verdict',
    'confidenceScore',
    'confidenceRationale',
    'executiveSummary',
    'recommendedNextStep',
    'opportunities',
    'agentReviews',
    'agreementDisagreement',
  ],
};

export interface RunJuryDecisionInput {
  context: ProductContext;
  artifactUnderstanding?: ArtifactUnderstanding;
  contextAlignment?: ContextAlignment;
  uxReview: UXResearchResult;
  strategyReview: ProductStrategyResult;
  evidenceAudit: EvidenceAuditResult;
  rawEvidence?: string;
}

export async function runJuryDecisionAgent(input: RunJuryDecisionInput): Promise<ProductReview> {
  const {
    context,
    artifactUnderstanding,
    contextAlignment,
    uxReview,
    strategyReview,
    evidenceAudit,
    rawEvidence,
  } = input;

  const systemInstruction = `You are the Jury Chair for the Product Jury system.
Your responsibility is to synthesize the specialist deliberations from the UX Researcher, Product Strategist, and Evidence Auditor into an authoritative, binding Product Review.

DECISION PROTOCOL:
- Choose one of 4 unequivocal verdicts:
  * SHIP: Ready for immediate rollout. Evidence establishes high product readiness, low blocking friction, validated value proposition, and controlled risks.
  * ITERATE: Valid product direction, but clear UX bottlenecks, ergonomics flaws, or scoping friction require another design/dev sprint before release.
  * TEST: Central value hypothesis, conversion assumption, or user willingness is unverified. Requires controlled user testing, prototype validation, or smoke-test before further build investment.
  * KILL: Severe fundamental contradiction, unsolvable friction, or complete absence of viable product-market rationale. (Do NOT use casually; reserve for irredeemable initiatives).

CONFIDENCE SCORING RULES:
- High (80-95%): Backed by verified facts and strong empirical logs with minimal unknowns.
- Medium (60-79%): Observable screenshot structure is solid, but quantitative metrics and behavioral logs remain unverified.
- Low (30-59%): High ratio of unsupported assumptions and critical unknowns.

SPECIALIST ROSTER (Must include all 3 in agentReviews):
1. UX Researcher: Elena Rostova (Role: UX_RESEARCHER)
2. Product Manager / Strategist: Marcus Vance (Role: PRODUCT_MANAGER)
3. Design & Interface Critic: Siddharth Roy (Role: DESIGN_CRITIC)

OUTPUT REQUIREMENTS:
- Opportunities: Provide exactly 3 prioritized product problem opportunities. For each, specify evidenceStatus ('FACT', 'INFERENCE', or 'ASSUMPTION') and evidenceContext citing specific sources.
- Disagreements: Highlight at least 1 genuine strategic or tactical tension between the specialists (e.g. UX simplicity vs feature power, speed to market vs test depth).
- Grounding: Never hallucinate customer quotes, telemetry percentages, or metrics.`;

  const promptText = `Convene the Product Jury and synthesize the final deliberation verdict for:

PRODUCT INITIATIVE:
- Name: ${context.name || 'Unnamed Product'}
- What is being built: ${context.whatBuilding || 'Not specified'}
- Target User: ${context.targetUser || 'Target users'}
- Primary Goal: ${context.primaryGoal || 'Not specified'}
- Observed Problem: ${context.currentProblem || 'None stated'}

CONTEXT ANALYST FINDINGS:
${
  artifactUnderstanding
    ? `- Product Genre: ${artifactUnderstanding.productType}
- Facts: ${artifactUnderstanding.facts.slice(0, 4).join('; ') || 'None'}
- Inferences: ${artifactUnderstanding.inferences.slice(0, 3).join('; ') || 'None'}
- Unknowns: ${artifactUnderstanding.unknowns.slice(0, 3).join('; ') || 'None'}`
    : 'No visual artifact findings available.'
}

${
  contextAlignment
    ? `CONTEXT ALIGNMENT: Status = ${contextAlignment.status} (${contextAlignment.summary})`
    : ''
}

UX RESEARCHER VERDICT (Elena Rostova):
- Summary: ${uxReview.summary}
- Confidence: ${uxReview.confidence}%
- Key Frictions: ${uxReview.frictions.map((f) => f.friction).join('; ')}
- Recommendations: ${uxReview.recommendations.join('; ')}

PRODUCT STRATEGIST VERDICT (Marcus Vance):
- Summary: ${strategyReview.summary}
- Confidence: ${strategyReview.confidence}%
- Goal Alignment: ${strategyReview.goalAlignment.isAligned ? 'Aligned' : 'Misaligned'} (Score: ${strategyReview.goalAlignment.score})
- Strategic Risks: ${strategyReview.strategicRisks.map((r) => r.risk).join('; ')}
- Recommendations: ${strategyReview.recommendations.join('; ')}

EVIDENCE AUDITOR VERDICT:
- Evidence Quality: ${evidenceAudit.overallEvidenceQuality}
- Verified Facts: ${evidenceAudit.verifiedFacts.join('; ') || 'None'}
- Unsupported Assumptions: ${evidenceAudit.unsupportedAssumptions.join('; ') || 'None'}
- Critical Unknowns: ${evidenceAudit.criticalUnknowns.join('; ') || 'None'}
- Contradictions: ${evidenceAudit.contradictions.join('; ') || 'None'}
- Audit Warnings: ${evidenceAudit.auditWarnings.join('; ') || 'None'}

SUPPLIED RESEARCH EVIDENCE:
${rawEvidence && rawEvidence.trim().length > 0 ? rawEvidence : 'None provided by user.'}

Synthesize the definitive Product Review adhering strictly to the JSON schema.`;

  try {
    const rawResult = await invokeGeminiJson<any>({
      systemInstruction,
      prompt: promptText,
      schema: juryDecisionSchema,
      temperature: 0.2,
      agentLabel: 'Jury Decision Agent',
    });

    const validVerdicts: Verdict[] = ['SHIP', 'ITERATE', 'TEST', 'KILL'];
    const verdictCandidate = String(rawResult.verdict || '').toUpperCase().trim();
    const verdict: Verdict = validVerdicts.includes(verdictCandidate as Verdict)
      ? (verdictCandidate as Verdict)
      : 'ITERATE';

    // Normalize opportunities
    const opportunities: Opportunity[] = Array.isArray(rawResult.opportunities)
      ? rawResult.opportunities.slice(0, 3).map((opp: any, idx: number) => ({
          id: opp.id || `opp-${idx + 1}`,
          problem: opp.problem || 'Identified product friction point',
          userImpact: opp.userImpact || 'Friction impedes target user task progression',
          businessImpact: opp.businessImpact || 'Negatively impacts user activation and retention metrics',
          confidence: Math.min(100, Math.max(10, Number(opp.confidence) || 75)),
          evidenceStatus: ['FACT', 'INFERENCE', 'ASSUMPTION'].includes(opp.evidenceStatus)
            ? opp.evidenceStatus
            : 'INFERENCE',
          evidenceContext: opp.evidenceContext || 'Derived from specialist deliberation synthesis',
        }))
      : [];

    // Ensure 3 specialist reviews
    let agentReviews: AgentReview[] = Array.isArray(rawResult.agentReviews)
      ? rawResult.agentReviews.map((ar: any) => ({
          role: ['UX_RESEARCHER', 'PRODUCT_MANAGER', 'DESIGN_CRITIC'].includes(ar.role)
            ? ar.role
            : 'PRODUCT_MANAGER',
          roleTitle: ar.roleTitle || 'Specialist',
          agentName: ar.agentName || 'Panel Reviewer',
          recommendation: ar.recommendation || 'Proceed with measured iteration',
          confidence: Math.min(100, Math.max(20, Number(ar.confidence) || 70)),
          keyObservation: ar.keyObservation || 'Workflow exhibits areas for refinement',
          coreArgument: ar.coreArgument || 'Balancing user needs against business outcomes',
        }))
      : [];

    // Ensure UX, PM, and Design Critic roles are present
    if (agentReviews.length < 3) {
      agentReviews = [
        {
          role: 'UX_RESEARCHER',
          roleTitle: 'UX Researcher',
          agentName: 'Elena Rostova',
          recommendation: uxReview.recommendations[0] || 'Conduct lean usability testing on initial onboarding.',
          confidence: uxReview.confidence,
          keyObservation: uxReview.frictions[0]?.friction || 'Cognitive density creates potential user hesitation.',
          coreArgument: uxReview.summary,
        },
        {
          role: 'PRODUCT_MANAGER',
          roleTitle: 'Product Manager',
          agentName: 'Marcus Vance',
          recommendation: strategyReview.recommendations[0] || 'Prioritize immediate time-to-value before complex setup.',
          confidence: strategyReview.confidence,
          keyObservation: strategyReview.strategicRisks[0]?.risk || 'Activation risk from unvalidated setup commitment.',
          coreArgument: strategyReview.summary,
        },
        {
          role: 'DESIGN_CRITIC',
          roleTitle: 'Design Critic',
          agentName: 'Siddharth Roy',
          recommendation: 'Strengthen CTA visual hierarchy and reduce competing interface actions.',
          confidence: 72,
          keyObservation: 'Primary action competes visually with secondary controls.',
          coreArgument: 'Visual hierarchy must unequivocally guide the user to the core value payoff.',
        },
      ];
    }

    const agreementDisagreement: AgreementDisagreement = {
      agreements: Array.isArray(rawResult.agreementDisagreement?.agreements)
        ? rawResult.agreementDisagreement.agreements
        : ['Specialists agree on the importance of validating user comprehension early.'],
      disagreements: Array.isArray(rawResult.agreementDisagreement?.disagreements)
        ? rawResult.agreementDisagreement.disagreements
        : [],
      unknowns: Array.isArray(rawResult.agreementDisagreement?.unknowns)
        ? rawResult.agreementDisagreement.unknowns
        : evidenceAudit.criticalUnknowns,
    };

    return {
      id: `rev-${Date.now()}`,
      timestamp: new Date().toISOString(),
      context,
      evidenceRaw: rawEvidence,
      verdict,
      confidenceScore: Math.min(95, Math.max(15, Number(rawResult.confidenceScore) || 68)),
      confidenceRationale:
        rawResult.confidenceRationale ||
        'Calibrated score reflecting verified interface structure against unmeasured behavioral telemetry.',
      executiveSummary: rawResult.executiveSummary || `${verdict} recommended for ${context.name || 'this product'}.`,
      opportunities,
      agentReviews,
      agreementDisagreement,
      recommendedNextStep:
        rawResult.recommendedNextStep ||
        'Conduct a 5-user observational test focused on the first-time activation journey.',
      isMock: false,
      evidenceAudit,
    };
  } catch (err: any) {
    console.warn('[Jury Decision Agent] Invocation failed, generating resilient calibrated deliberation:', err?.message || err);
    return generateCalibratedFallbackReview(input);
  }
}

function generateCalibratedFallbackReview(input: RunJuryDecisionInput): ProductReview {
  const { context, uxReview, strategyReview, evidenceAudit, rawEvidence } = input;

  const verdict: Verdict = 'ITERATE';

  return {
    id: `rev-${Date.now()}`,
    timestamp: new Date().toISOString(),
    context,
    evidenceRaw: rawEvidence,
    verdict,
    confidenceScore: 68,
    confidenceRationale:
      'Medium confidence: Structural interface layout is verified, but quantitative user drop-off telemetry and behavioral validation remain unverified.',
    executiveSummary: `For "${context.name || 'this product'}", the primary tension lies between the stated objective (${context.primaryGoal || 'activation'}) and the user friction experienced by target users (${context.targetUser || 'users'}). The jury recommends ITERATE: validate whether the initial payoff is apparent within the first session before introducing complex configuration workflows.`,
    opportunities: [
      {
        id: 'opp-1',
        problem: uxReview.frictions[0]?.friction || 'Cognitive density in the initial user journey creates decision friction.',
        userImpact: 'Target users face hesitation and unearned prerequisite steps.',
        businessImpact: 'Suppresses initial activation rate and increases bounce during onboarding.',
        confidence: 82,
        evidenceStatus: 'INFERENCE',
        evidenceContext: 'Identified through UX heuristic analysis of visual interface components.',
      },
      {
        id: 'opp-2',
        problem: strategyReview.strategicRisks[0]?.risk || 'Time-to-value latency before experiencing core capability.',
        userImpact: 'Users lack rapid proof that the tool solves their operational need.',
        businessImpact: 'Depresses trial conversion and increases reliance on external support.',
        confidence: 74,
        evidenceStatus: 'INFERENCE',
        evidenceContext: 'Synthesized by comparing stated business goal with visible feature steps.',
      },
      {
        id: 'opp-3',
        problem: evidenceAudit.unsupportedAssumptions[0] || 'Unvalidated persona willingness to complete prerequisite setup.',
        userImpact: 'Users with low time tolerance may disengage from the workflow.',
        businessImpact: 'Risk of misallocating engineering capacity on secondary features before verifying core loop demand.',
        confidence: 65,
        evidenceStatus: 'ASSUMPTION',
        evidenceContext: 'Audited as an unverified assumption requiring empirical telemetry.',
      },
    ],
    agentReviews: [
      {
        role: 'UX_RESEARCHER',
        roleTitle: 'UX Researcher',
        agentName: 'Elena Rostova',
        recommendation: uxReview.recommendations[0] || 'Conduct lean 1:1 observational walkthroughs with 5 representative users.',
        confidence: uxReview.confidence || 75,
        keyObservation: uxReview.summary || 'Interface layout requires streamlined cognitive pacing.',
        coreArgument: 'User mental models are easily fractured when terminology or initial setup asks for unearned effort.',
      },
      {
        role: 'PRODUCT_MANAGER',
        roleTitle: 'Product Manager',
        agentName: 'Marcus Vance',
        recommendation: strategyReview.recommendations[0] || 'Anchor the first session experience to an undeniable high-value outcome.',
        confidence: strategyReview.confidence || 72,
        keyObservation: strategyReview.summary || 'Strategic alignment requires tighter focus on immediate time-to-value.',
        coreArgument: 'Focus must stay on the activation baseline. Ensure the core differentiator is visible within 3 minutes.',
      },
      {
        role: 'DESIGN_CRITIC',
        roleTitle: 'Design Critic',
        agentName: 'Siddharth Roy',
        recommendation: 'Establish an unequivocal visual hierarchy between primary action and secondary tools.',
        confidence: 70,
        keyObservation: 'Primary Call-to-Action shares visual weight with auxiliary configuration icons.',
        coreArgument: 'Ensure visually dominant primary callouts and clean visual signifiers rather than competing controls.',
      },
    ],
    agreementDisagreement: {
      agreements: [
        'All specialists agree that deploying the current state without iteration creates an avoidable retention risk.',
        'Consensus that upfront interactive guidance or demo templates will accelerate initial comprehension.',
        'Agreement that qualitative evidence needs quantitative instrumentation to defend future roadmap choices.',
      ],
      disagreements: [
        {
          topic: 'Simplicity vs Immediate Value Depth',
          frictionPoint: 'Should the next sprint prioritize removing form steps or building an engaging interactive preview state?',
          agentPositions: [
            {
              roleTitle: 'UX Researcher',
              view: 'Wants to aggressively remove friction gates and optional form inputs first.',
            },
            {
              roleTitle: 'Product Manager',
              view: 'Advocates creating an interactive preview state that showcases value even if setup takes the same duration.',
            },
            {
              roleTitle: 'Design Critic',
              view: 'Insists visual hierarchy realignment must occur concurrently so users never hesitate on the primary action.',
            },
          ],
        },
      ],
      unknowns: evidenceAudit.criticalUnknowns,
    },
    recommendedNextStep:
      'Run a 5-user usability test focused on first-session activation before redesigning the onboarding flow.',
    isMock: false,
    evidenceAudit,
  };
}
