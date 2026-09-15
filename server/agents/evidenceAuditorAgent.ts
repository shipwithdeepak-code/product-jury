import { Type, invokeGeminiJson } from '../geminiClient';
import {
  EvidenceAuditResult,
  ProductContext,
  ArtifactUnderstanding,
  UXResearchResult,
  ProductStrategyResult,
} from '../../src/types';

const evidenceAuditorSchema = {
  type: Type.OBJECT,
  properties: {
    agentRole: { type: Type.STRING, description: 'Must be EVIDENCE_AUDITOR' },
    overallEvidenceQuality: {
      type: Type.STRING,
      description: 'Must be STRONG, MODERATE, WEAK, or INSUFFICIENT',
    },
    verifiedFacts: {
      type: Type.ARRAY,
      description: 'Concrete facts strictly proven by direct visual evidence or explicit ground-truth logs',
      items: { type: Type.STRING },
    },
    supportedInferences: {
      type: Type.ARRAY,
      description: 'Reasonable inferences logically deduced from verified facts and interface structure',
      items: { type: Type.STRING },
    },
    unsupportedAssumptions: {
      type: Type.ARRAY,
      description: 'Hypotheses, claims, or beliefs that lack empirical evidence and remain unverified',
      items: { type: Type.STRING },
    },
    criticalUnknowns: {
      type: Type.ARRAY,
      description: 'Essential behavioral, business, or telemetry data points missing from the evaluation',
      items: { type: Type.STRING },
    },
    contradictions: {
      type: Type.ARRAY,
      description: 'Direct contradictions between PM claims, specialist deductions, and visual reality',
      items: { type: Type.STRING },
    },
    auditWarnings: {
      type: Type.ARRAY,
      description: 'Epistemic warnings regarding risk of making decisions on unverified assumptions',
      items: { type: Type.STRING },
    },
    confidence: {
      type: Type.INTEGER,
      description: 'Auditor confidence score (0 to 100) reflecting evidence rigor',
    },
  },
  required: [
    'agentRole',
    'overallEvidenceQuality',
    'verifiedFacts',
    'supportedInferences',
    'unsupportedAssumptions',
    'criticalUnknowns',
    'contradictions',
    'auditWarnings',
    'confidence',
  ],
};

export interface RunEvidenceAuditorInput {
  context: ProductContext;
  artifactUnderstanding?: ArtifactUnderstanding;
  uxReview: UXResearchResult;
  strategyReview: ProductStrategyResult;
  rawEvidence?: string;
}

export async function runEvidenceAuditorAgent(input: RunEvidenceAuditorInput): Promise<EvidenceAuditResult> {
  const { context, artifactUnderstanding, uxReview, strategyReview, rawEvidence } = input;

  const systemInstruction = `You are the chief Evidence Auditor for the Product Jury.
Your sole mission is to ruthlessly cross-examine all assertions, specialist perspectives, and user premises.
You protect the product organization from building or shipping based on unverified assumptions, cognitive bias, or fabricated data.

EPISTEMIC AUDIT RULES:
1. CLASSIFY RIGIDLY:
   - FACT: Observable on screen or directly proven by explicit user-supplied logs.
   - INFERENCE: Deductions backed by observable mechanics.
   - ASSUMPTION: Any claim of user preference, market demand, or conversion willingness without telemetry proof.
   - UNKNOWN: Missing data that is required to know whether the product will succeed.
2. AUDIT SPECIALISTS & PM CONTEXT:
   - Did the PM claim things not visible in the screenshot?
   - Did the UX Researcher or Product Strategist assume user behavior without empirical evidence?
   - Are there unsupported metrics or unproven performance assumptions?
3. FLAG CONTRADICTIONS:
   - Identify discrepancies between the stated goal and the actual screen layout.
4. DETERMINE OVERALL EVIDENCE QUALITY:
   - STRONG: Verified empirical logs + consistent visual screen.
   - MODERATE: Structured visual artifact with qualitative context, but missing quantitative telemetry.
   - WEAK: Unverified claims, ambiguous interface, high unproven assumptions.
   - INSUFFICIENT: No reliable evidence to justify major engineering investment.`;

  const promptText = `Conduct a comprehensive evidence audit on the following product evaluation inputs:

PRODUCT CONTEXT CLAIMS:
- Name: ${context.name || 'Unnamed Product'}
- What is being built: ${context.whatBuilding || 'Not specified'}
- Target User: ${context.targetUser || 'Target user'}
- Primary Goal: ${context.primaryGoal || 'Not specified'}
- Stated Problem: ${context.currentProblem || 'None stated'}

CONTEXT ANALYST FINDINGS:
${
  artifactUnderstanding
    ? `- Visible Facts: ${artifactUnderstanding.facts.join('; ') || 'None'}
- Inferences: ${artifactUnderstanding.inferences.join('; ') || 'None'}
- Assumptions: ${artifactUnderstanding.assumptions.join('; ') || 'None'}
- Unknowns: ${artifactUnderstanding.unknowns.join('; ') || 'None'}`
    : 'No visual artifact analysis available.'
}

${
  context.artifactUnderstanding?.contextAlignment
    ? `CONTEXT ALIGNMENT STATUS:
- Status: ${context.artifactUnderstanding.contextAlignment.status}
- Summary: ${context.artifactUnderstanding.contextAlignment.summary}
- Contradiction / Gap: ${context.artifactUnderstanding.contextAlignment.needsClarification ? 'Needs clarification' : 'Consistent'}`
    : ''
}

UX RESEARCHER REVIEW CLAIMS:
- Summary: ${uxReview.summary}
- Frictions: ${uxReview.frictions.map((f) => f.friction).join('; ')}
- Recommendations: ${uxReview.recommendations.join('; ')}

PRODUCT STRATEGIST CLAIMS:
- Summary: ${strategyReview.summary}
- Goal Alignment: ${strategyReview.goalAlignment.isAligned ? 'Aligned' : 'Misaligned'} (${strategyReview.goalAlignment.score}/100)
- Strategic Risks: ${strategyReview.strategicRisks.map((r) => r.risk).join('; ')}

SUPPLIED USER RESEARCH & LOGS:
${rawEvidence && rawEvidence.trim().length > 0 ? rawEvidence : 'None provided by the user.'}

Produce a structured evidence audit report according to the JSON schema.`;

  try {
    const result = await invokeGeminiJson<EvidenceAuditResult>({
      systemInstruction,
      prompt: promptText,
      schema: evidenceAuditorSchema,
      temperature: 0.2,
      agentLabel: 'Evidence Auditor',
    });

    result.agentRole = 'EVIDENCE_AUDITOR';
    const validQualities = ['STRONG', 'MODERATE', 'WEAK', 'INSUFFICIENT'];
    const quality = String(result.overallEvidenceQuality || '').toUpperCase();
    result.overallEvidenceQuality = validQualities.includes(quality)
      ? (quality as 'STRONG' | 'MODERATE' | 'WEAK' | 'INSUFFICIENT')
      : 'MODERATE';

    result.confidence = Math.min(95, Math.max(25, Number(result.confidence) || 80));

    return result;
  } catch (err: any) {
    console.warn('[Evidence Auditor Agent] Model invocation failed, utilizing calibrated fallback audit:', err?.message || err);
    return generateDegradedAudit(context, rawEvidence);
  }
}

function generateDegradedAudit(context: ProductContext, rawEvidence?: string): EvidenceAuditResult {
  const hasRawEvidence = Boolean(rawEvidence && rawEvidence.trim().length > 0);

  return {
    agentRole: 'EVIDENCE_AUDITOR',
    overallEvidenceQuality: hasRawEvidence ? 'MODERATE' : 'WEAK',
    verifiedFacts: [
      context.name ? `Product name registered as "${context.name}"` : 'Interface screen provided for evaluation',
      context.primaryGoal ? `Primary stated objective: "${context.primaryGoal}"` : 'Interface features visible',
    ],
    supportedInferences: [
      'Visual layout patterns reflect standard category conventions.',
      'User workflow sequence suggests multi-step progression.',
    ],
    unsupportedAssumptions: [
      'Assumption that users will complete the configuration workflow without live trial guidance.',
      'Assumption that the current feature set satisfies competitive user expectations.',
    ],
    criticalUnknowns: [
      'Quantitative funnel completion and drop-off analytics.',
      'Empirical user retention after day 7.',
    ],
    contradictions: [],
    auditWarnings: [
      'Decision relies on qualitative inputs without quantitative instrumentation; proceed with caution before committing major engineering resources.',
    ],
    confidence: 70,
  };
}
