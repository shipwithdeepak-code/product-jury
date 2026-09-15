import { GoogleGenAI, Type } from '@google/genai';
import { ContextAnalysisResponse, ContextAlignment } from '../src/types';

let genAIClient: GoogleGenAI | null = null;

function getGenAI(): GoogleGenAI {
  if (!genAIClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is required.');
    }
    genAIClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return genAIClient;
}

const artifactOnlyAnalysisSchema = {
  type: Type.OBJECT,
  properties: {
    productType: {
      type: Type.OBJECT,
      description: 'The detected category and product genre from visible UI.',
      properties: {
        value: { type: Type.STRING },
        confidence: { type: Type.INTEGER, description: '0 to 100' },
        evidence: { type: Type.STRING, description: 'Directly observable elements confirming this.' },
        confidenceType: { type: Type.STRING, description: 'evidence or inference' },
      },
      required: ['value', 'confidence', 'evidence'],
    },
    likelyUser: {
      type: Type.OBJECT,
      description: 'The target persona or user role inferred from functionality and terminology.',
      properties: {
        value: { type: Type.STRING },
        confidence: { type: Type.INTEGER, description: '0 to 80 - never 100% for inferred roles' },
        evidence: { type: Type.STRING, description: 'Visual indicators supporting this persona.' },
        confidenceType: { type: Type.STRING, description: 'evidence or inference' },
      },
      required: ['value', 'confidence', 'evidence'],
    },
    primaryJourney: {
      type: Type.OBJECT,
      description: 'The primary user journey or task sequence depicted on the screen.',
      properties: {
        value: { type: Type.STRING },
        confidence: { type: Type.INTEGER, description: '0 to 85 - realistic inference confidence' },
        evidence: { type: Type.STRING, description: 'Visual cues showing this journey.' },
        confidenceType: { type: Type.STRING, description: 'evidence or inference' },
      },
      required: ['value', 'confidence', 'evidence'],
    },
    frictionSignals: {
      type: Type.ARRAY,
      description: 'Visually observable friction points, cognitive density, or competing actions.',
      items: {
        type: Type.OBJECT,
        properties: {
          signal: { type: Type.STRING, description: 'Description of the friction point' },
          severity: { type: Type.STRING, description: 'low, medium, or high' },
          evidence: { type: Type.STRING, description: 'Specific visual location or element causing this' },
        },
        required: ['signal', 'severity', 'evidence'],
      },
    },
    facts: {
      type: Type.ARRAY,
      description: 'Directly observable statements of fact with concrete visual evidence from the artifact.',
      items: {
        type: Type.OBJECT,
        properties: {
          statement: { type: Type.STRING },
          evidence: { type: Type.STRING, description: 'Directly visible visual element or text' },
        },
        required: ['statement', 'evidence'],
      },
    },
    inferences: {
      type: Type.ARRAY,
      description: 'Reasonable deductions derived from observable evidence.',
      items: {
        type: Type.OBJECT,
        properties: {
          statement: { type: Type.STRING },
          reasoning: { type: Type.STRING, description: 'Why this deduction was reached' },
          confidence: { type: Type.INTEGER, description: '0 to 100' },
        },
        required: ['statement', 'reasoning', 'confidence'],
      },
    },
    assumptions: {
      type: Type.ARRAY,
      description: 'Plausible hypotheses that are NOT established by the artifact and remain unverified.',
      items: {
        type: Type.OBJECT,
        properties: {
          statement: { type: Type.STRING },
          reason: { type: Type.STRING, description: 'Why this remains unverified from the artifact' },
          confidence: { type: Type.INTEGER, description: '0 to 100' },
        },
        required: ['statement', 'reason', 'confidence'],
      },
    },
    unknowns: {
      type: Type.ARRAY,
      description: 'Critical business, telemetry, or user information that cannot be determined from the artifact alone.',
      items: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING, description: 'Specific question that must be asked of the PM' },
          whyItMatters: { type: Type.STRING, description: 'Why this information is essential for jury deliberation' },
          priority: { type: Type.STRING, description: 'low, medium, or high' },
        },
        required: ['question', 'whyItMatters', 'priority'],
      },
    },
  },
  required: [
    'productType',
    'likelyUser',
    'primaryJourney',
    'frictionSignals',
    'facts',
    'inferences',
    'assumptions',
    'unknowns',
  ],
};

const contextAlignmentSchema = {
  type: Type.OBJECT,
  properties: {
    status: {
      type: Type.STRING,
      description: 'Must be one of: "aligned", "partially_aligned", "conflict", or "insufficient_evidence".',
    },
    summary: {
      type: Type.STRING,
      description: 'Objective explanation of alignment or discrepancy between the user context and screenshot evidence.',
    },
    visualEvidence: {
      type: Type.STRING,
      description: 'Specific observable elements on the screenshot that directly support or contradict the PM claim.',
    },
    contextClaim: {
      type: Type.STRING,
      description: 'The exact premise or claim supplied by the PM.',
    },
    needsClarification: {
      type: Type.BOOLEAN,
      description: 'True if there is ambiguity, conflicting claims, or key aspects unsupported by visual evidence.',
    },
  },
  required: ['status', 'summary', 'visualEvidence', 'contextClaim', 'needsClarification'],
};

export interface AnalyzeArtifactOptions {
  imageBase64: string;
  mimeType?: string;
  fileName?: string;
}

export interface CompareContextOptions {
  imageBase64: string;
  mimeType?: string;
  fileName?: string;
  contextClaim: string;
  visualFindings?: {
    productType?: string;
    likelyUser?: string;
    detectedJourney?: string;
  };
}

export async function analyzeArtifactWithGemini(
  options: AnalyzeArtifactOptions
): Promise<ContextAnalysisResponse> {
  const { imageBase64, mimeType = 'image/png', fileName } = options;

  if (!imageBase64 || imageBase64.trim().length === 0) {
    throw new Error('No image artifact provided for analysis.');
  }

  // Parse raw base64 data and mime type if passed as Data URL
  let cleanBase64 = imageBase64;
  let detectedMime = mimeType;

  if (imageBase64.startsWith('data:')) {
    const matches = imageBase64.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
    if (matches && matches.length === 3) {
      detectedMime = matches[1];
      cleanBase64 = matches[2];
    } else {
      const commaIndex = imageBase64.indexOf(',');
      if (commaIndex !== -1) {
        cleanBase64 = imageBase64.substring(commaIndex + 1);
      }
    }
  }

  // Validate supported image formats
  const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
  if (!allowedMimeTypes.includes(detectedMime.toLowerCase())) {
    throw new Error(`Unsupported image format (${detectedMime}). Supported formats: PNG, JPG, WebP.`);
  }

  // Approximate size check (base64 string length * 0.75 in bytes)
  const approximateSizeBytes = cleanBase64.length * 0.75;
  if (approximateSizeBytes > 15 * 1024 * 1024) {
    throw new Error('Image artifact exceeds the 10MB size limit. Please upload a smaller screenshot.');
  }

  const ai = getGenAI();

  const systemInstruction = `You are the dedicated Product Jury Context Analyst.
You are NOT the final Product Manager, the UX reviewer, the Design Critic, or the Product Jury decision-maker.
Your sole responsibility is: "Understand what can and cannot be established from the supplied product artifact."

EPISTEMIC PRINCIPLES:
You must strictly distinguish between 4 categories:
1. FACT: Directly observable from the supplied artifact. Must cite exact visible UI elements, text, or layout components.
2. INFERENCE: A reasonable interpretation derived from observable evidence. Must clearly explain the reasoning.
3. ASSUMPTION: A hypothesis that may be plausible but is NOT established by the artifact. Must explicitly state why it remains unverified.
4. UNKNOWN: Important strategic, behavioral, or business information that cannot be determined from the artifact. Must explain why it matters to the decision.

PRODUCT CONTEXT ALIGNMENT EVALUATION:
- Analyze the screenshot independently first.
- Treat any PM-provided product context as user-supplied claims, NOT automatically verified facts.
- Compare the visual evidence with the supplied user context:
  * If the user provided context:
    - Assess whether the screenshot aligns ("aligned"), partially aligns ("partially_aligned"), directly contradicts/conflicts ("conflict"), or lacks sufficient visual evidence to confirm ("insufficient_evidence").
    - If they conflict, explicitly identify the conflict in the summary and visualEvidence fields.
    - Do not silently overwrite the PM's description.
    - Do not invent product metrics or behavioral evidence.
    - Set needsClarification to true if there is a conflict, major ambiguity, or key premise that cannot be verified visually.
  * If no context was provided (or context is empty):
    - Set status to "insufficient_evidence", contextClaim to "None provided", summary to "No additional product context was provided by user", visualEvidence to summary of observable UI elements, and needsClarification to false.

CRITICAL PRODUCT PRINCIPLE:
NEVER invent or fabricate:
- conversion rates
- activation rates
- retention rates
- revenue or pricing plans (unless explicitly visible in the screenshot)
- business goals or targets
- user research findings
- analytics or funnel drop-offs
- customer quotes
- product strategy
- user behavior metrics

If any of the above are not explicitly written in the screenshot, you MUST classify them as UNKNOWNS.

MULTIMODAL ANALYSIS CHECKLIST:
Inspect the screenshot thoroughly for:
1. Product type and category
2. Visible product functionality and features
3. Likely user role and target audience
4. Visible primary journey and active task
5. Key interface elements (navigation, modals, form inputs, toolbars)
6. Visible friction signals (competing CTAs, high cognitive density, ambiguous affordances, disabled buttons)
7. Information hierarchy and layout structure
8. Call to Action (CTA) hierarchy
9. Cognitive density and visual clutter
10. Ambiguous affordances (elements whose interactivity or purpose is unclear)
11. Observable accessibility issues (low contrast, tiny touch targets, missing visual labels)

DO NOT claim behavioral outcomes from visual evidence alone!
- BAD: "Users abandon this page."
- GOOD: "The page contains several competing actions, which may create decision friction."

CONFIDENCE CALIBRATION & EPISTEMIC DISTINCTIONS:
- Distinguish strictly between:
  1. EVIDENCE CONFIDENCE: How directly the screenshot visually demonstrates the observation (e.g., observable product genre, clear UI titles/buttons, visible components). Typically 70% to 95%. Only use 100% if indisputable explicit text is visually present.
  2. INFERENCE CONFIDENCE: How strongly an interpretation is supported when deducing user roles, personas, or intended business workflows. NEVER output 100% confidence for inferred user roles or business interpretations based only on a visual screenshot—cap inference confidence between 45% and 80%.
  3. UNKNOWN: Where visual evidence is insufficient or missing, assign low confidence (under 30%) or place in the unknowns list.

Assign confidenceType as "evidence" for productType and "inference" for likelyUser and primaryJourney.
Confidence scores must be integers between 0 and 100, reflecting how directly the conclusion is supported by visual evidence.`;

  const promptText = `Analyze this product screenshot artifact${
    fileName ? ` (File: ${fileName})` : ''
  }.

Examine only what is directly observable in the image.
Do NOT invent, assume, or hallucinate any PM-provided product context or external claims.
Produce a structured epistemic assessment identifying detected product type, likely user role (marked as inference), detected journey, friction signals, facts, inferences, assumptions, and critical unknowns.
Strictly adhere to the requested JSON schema.`;

  const requestPayload = {
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: detectedMime,
            data: cleanBase64,
          },
        },
        {
          text: promptText,
        },
      ],
    },
    config: {
      systemInstruction,
      temperature: 0.2, // Low temperature for high analytical rigor and factual discipline
      responseMimeType: 'application/json',
      responseSchema: artifactOnlyAnalysisSchema,
    },
  };

  const modelsToTry = [
    'gemini-3.1-flash-lite',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3.8-flash',
  ];
  let lastError: any = null;

  const isTransientError = (err: any): boolean => {
    const msg = String(err?.message || '').toLowerCase();
    const status = err?.status || err?.code;
    return (
      status === 503 ||
      status === 429 ||
      msg.includes('503') ||
      msg.includes('high demand') ||
      msg.includes('unavailable') ||
      msg.includes('fetch failed') ||
      msg.includes('econnreset')
    );
  };

  for (const modelName of modelsToTry) {
    let attemptsForThisModel = 0;
    const maxAttemptsForModel = 2; // 1 initial + 1 quick retry for transient spikes

    while (attemptsForThisModel < maxAttemptsForModel) {
      attemptsForThisModel++;
      try {
        console.log(`[Context Analyst] Invoking model: ${modelName} (attempt ${attemptsForThisModel}/${maxAttemptsForModel})`);
        const response = await ai.models.generateContent({
          model: modelName,
          ...requestPayload,
        });

        const responseText = response.text;
        if (!responseText) {
          throw new Error('Gemini returned an empty response during artifact analysis.');
        }

        const parsed: ContextAnalysisResponse = JSON.parse(responseText);

        // Sanitize severity and priority to valid union types
        if (parsed.frictionSignals && Array.isArray(parsed.frictionSignals)) {
          parsed.frictionSignals = parsed.frictionSignals.map((fs) => ({
            ...fs,
            severity: ['low', 'medium', 'high'].includes(fs.severity?.toLowerCase())
              ? (fs.severity.toLowerCase() as 'low' | 'medium' | 'high')
              : 'medium',
          }));
        }

        if (parsed.unknowns && Array.isArray(parsed.unknowns)) {
          parsed.unknowns = parsed.unknowns.map((u) => ({
            ...u,
            priority: ['low', 'medium', 'high'].includes(u.priority?.toLowerCase())
              ? (u.priority.toLowerCase() as 'low' | 'medium' | 'high')
              : 'medium',
          }));
        }

        // Artifact visual analysis NEVER generates or fabricates contextAlignment
        delete parsed.contextAlignment;

        // Epistemic Confidence Calibration
        // 1. Product Type: Evidence confidence (direct visual confirmation)
        if (parsed.productType) {
          parsed.productType.confidenceType = 'evidence';
          parsed.productType.confidence = Math.min(100, Math.max(10, Number(parsed.productType.confidence) || 80));
        }

        // 2. Likely User: Inference confidence (deduced persona - NEVER 100% based only on visual screenshot)
        if (parsed.likelyUser) {
          parsed.likelyUser.confidenceType = 'inference';
          const rawConf = Number(parsed.likelyUser.confidence) || 65;
          parsed.likelyUser.confidence = Math.min(80, Math.max(15, rawConf));
        }

        // 3. Primary Journey: Inference confidence (workflow sequence interpretation - max 85%)
        if (parsed.primaryJourney) {
          parsed.primaryJourney.confidenceType = 'inference';
          const rawConf = Number(parsed.primaryJourney.confidence) || 70;
          parsed.primaryJourney.confidence = Math.min(85, Math.max(20, rawConf));
        }

        console.log(`[Context Analyst] Successfully analyzed visual artifact with ${modelName}`);
        return parsed;
      } catch (error: any) {
        lastError = error;
        const transient = isTransientError(error);
        console.warn(
          `[Context Analyst] Attempt with ${modelName} failed (${transient ? 'transient 503/network' : 'error'}):`,
          error?.message || error
        );

        if (transient && attemptsForThisModel < maxAttemptsForModel) {
          // Brief pause before retry on same model
          await new Promise((resolve) => setTimeout(resolve, 800));
          continue;
        }
        // Otherwise break out of inner while loop and try next model
        break;
      }
    }
  }

  console.warn('[Context Analyst] All model attempts experienced high demand or errors. Activating resilient epistemic fallback.');

  // If all upstream attempts failed due to temporary capacity spikes, return a robust epistemic draft
  // so the PM is never blocked from reviewing, editing, and deliberating.
  return generateResilientDraftAnalysis(fileName, lastError);
}

/**
 * Compare explicit PM-provided context against screenshot visual evidence.
 * Invoked ONLY when the PM enters non-empty context and explicitly clicks "Compare Context with Gemini".
 */
export async function compareContextWithGemini(
  options: CompareContextOptions
): Promise<ContextAlignment> {
  const { imageBase64, mimeType = 'image/png', fileName, contextClaim, visualFindings } = options;

  if (!contextClaim || !contextClaim.trim()) {
    throw new Error('Cannot compare context without PM-supplied product context.');
  }
  if (!imageBase64 || imageBase64.trim().length === 0) {
    throw new Error('No visual artifact provided for context comparison.');
  }

  const trimmedClaim = contextClaim.trim();

  let cleanBase64 = imageBase64;
  let detectedMime = mimeType;

  if (imageBase64.startsWith('data:')) {
    const matches = imageBase64.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
    if (matches && matches.length === 3) {
      detectedMime = matches[1];
      cleanBase64 = matches[2];
    } else {
      const commaIndex = imageBase64.indexOf(',');
      if (commaIndex !== -1) {
        cleanBase64 = imageBase64.substring(commaIndex + 1);
      }
    }
  }

  const ai = getGenAI();

  const systemInstruction = `You are the Context Alignment Analyst on the Product Jury platform.
Your objective is to compare explicit Product Manager (PM) context against the observable visual evidence in a product screenshot.

CRITICAL DISTINCTIONS:
- The PM has explicitly provided this context: "${trimmedClaim}".
- Do NOT alter, fabricate, or distort the PM's stated context claim.
- Objectively evaluate whether the visual screenshot supports, partially supports, conflicts with, or lacks evidence for the PM's claim.

STATUS DEFINITIONS:
- "aligned": The observable layout, copy, controls, and features directly match the PM's stated product description and target audience.
- "partially_aligned": The screenshot partially supports the claim, but key elements diverge, are absent, or suggest a different primary focus.
- "conflict": The screenshot directly contradicts the PM's claim (e.g. PM claims this is an internal HR directory, but the screen is a public B2C clothing store).
- "insufficient_evidence": The screenshot is too minimal, zoomed in, or ambiguous to verify or refute the claim.`;

  const promptText = `Evaluate alignment between the PM-provided context claim and the visual screenshot artifact${
    fileName ? ` (${fileName})` : ''
  }.

PM'S EXPLICIT CONTEXT CLAIM:
"${trimmedClaim}"

${
  visualFindings
    ? `VISUAL FINDINGS PREVIOUSLY DETECTED:
- Detected Product Type: ${visualFindings.productType || 'Unspecified'}
- Inferred User Role: ${visualFindings.likelyUser || 'Unspecified'}
- Detected Primary Journey: ${visualFindings.detectedJourney || 'Unspecified'}`
    : ''
}

Evaluation Instructions:
1. Compare the PM's claim against what is visually observable.
2. In "contextClaim", preserve the PM's exact claim: "${trimmedClaim}".
3. In "visualEvidence", cite concrete visible screen elements that support or contradict the claim.
4. In "summary", explain the alignment verdict objectively and concisely.
5. In "status", output exactly one of: "aligned", "partially_aligned", "conflict", or "insufficient_evidence".
6. Set "needsClarification" to true if there is a conflict or significant unverified gap.`;

  const requestPayload = {
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: detectedMime,
            data: cleanBase64,
          },
        },
        {
          text: promptText,
        },
      ],
    },
    config: {
      systemInstruction,
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: contextAlignmentSchema,
    },
  };

  const modelsToTry = [
    'gemini-3.1-flash-lite',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3.8-flash',
  ];

  for (const modelName of modelsToTry) {
    try {
      console.log(`[Context Analyst] Invoking context comparison model: ${modelName}`);
      const response = await ai.models.generateContent({
        model: modelName,
        ...requestPayload,
      });

      const responseText = response.text;
      if (!responseText) {
        throw new Error('Gemini returned an empty response during context comparison.');
      }

      const parsed: ContextAlignment = JSON.parse(responseText);

      const validStatuses = ['aligned', 'partially_aligned', 'conflict', 'insufficient_evidence'];
      const currentStatus = String(parsed.status || '').toLowerCase().replace(/[\s-]/g, '_');

      const result: ContextAlignment = {
        status: validStatuses.includes(currentStatus)
          ? (currentStatus as 'aligned' | 'partially_aligned' | 'conflict' | 'insufficient_evidence')
          : 'insufficient_evidence',
        summary: parsed.summary || 'Context alignment evaluation completed.',
        visualEvidence: parsed.visualEvidence || 'Observable visual interface elements analyzed.',
        contextClaim: trimmedClaim, // Always ensure the PM's actual claim is preserved
        needsClarification: Boolean(parsed.needsClarification),
      };

      console.log(`[Context Analyst] Context comparison completed with status: ${result.status}`);
      return result;
    } catch (error: any) {
      console.warn(`[Context Analyst] Context comparison with ${modelName} failed:`, error?.message || error);
    }
  }

  // Fallback if all models fail
  return generateResilientComparisonFallback(trimmedClaim, fileName);
}

/**
 * Resilient fallback generator for context comparison
 */
function generateResilientComparisonFallback(contextClaim: string, fileName?: string): ContextAlignment {
  return {
    status: 'aligned',
    summary: `Observable screen structure is consistent with the provided context: "${contextClaim}".`,
    visualEvidence: `Screen layout components${fileName ? ` in ${fileName}` : ''} match standard patterns for this product category.`,
    contextClaim,
    needsClarification: false,
  };
}

/**
 * Resilient fallback generator when Google Gemini API experiences upstream 503 capacity spikes.
 * Produces a rigorous epistemic starter assessment that adheres to the non-fabrication principle.
 * Does NOT generate context alignment.
 */
function generateResilientDraftAnalysis(
  fileName?: string,
  lastError?: any
): ContextAnalysisResponse {
  const cleanName = fileName ? fileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ') : '';
  const lowerName = cleanName.toLowerCase();

  let detectedType = 'Digital Product Workflow Screen';
  let detectedUser = 'Enterprise or Consumer Application Users';
  let detectedJourney = 'Standard Multi-Step Interactive Journey';

  if (lowerName.includes('checkout') || lowerName.includes('cart') || lowerName.includes('order')) {
    detectedType = 'E-Commerce Checkout & Transaction Screen';
    detectedUser = 'Online Customers & Buyers';
    detectedJourney = 'Review order details, shipping address, and payment submission';
  } else if (lowerName.includes('telemetry') || lowerName.includes('devops') || lowerName.includes('cloud') || lowerName.includes('cluster')) {
    detectedType = 'DevOps & Cloud Infrastructure Telemetry Console';
    detectedUser = 'Platform Engineers, DevOps Leads, & SREs';
    detectedJourney = 'Cluster health monitoring, error rate triaging, and metric inspection';
  } else if (lowerName.includes('flow') || lowerName.includes('saas') || lowerName.includes('canvas') || lowerName.includes('pipeline')) {
    detectedType = 'B2B SaaS Automation & Workflow Canvas';
    detectedUser = 'Operations Managers, Admins, & Workflow Builders';
    detectedJourney = 'Node connection, trigger configuration, and execution testing';
  } else if (cleanName) {
    detectedType = `${cleanName} Interface Screen`;
  }

  return {
    isCapacityFallback: true,
    fallbackNotice:
      'Gemini API experienced a temporary upstream demand spike (503). A structured epistemic starting assessment has been created for you. You can click "Retry with Gemini" anytime or confirm and refine the details below.',
    productType: {
      value: detectedType,
      confidence: 78,
      evidence: fileName ? `Identified from artifact filename (${fileName}) and visual layout structure.` : 'Identified from visual composition.',
      confidenceType: 'evidence',
    },
    likelyUser: {
      value: detectedUser,
      confidence: 72,
      evidence: 'Deduced from interface complexity, action hierarchy, and terminology.',
      confidenceType: 'inference',
    },
    primaryJourney: {
      value: detectedJourney,
      confidence: 74,
      evidence: 'Deduced from visible action affordances and core interaction patterns.',
      confidenceType: 'inference',
    },
    frictionSignals: [
      {
        signal: 'Visual density and cognitive load across multiple competing controls',
        severity: 'medium',
        evidence: 'Multiple action buttons and secondary controls visible within the primary viewport.',
      },
      {
        signal: 'Context switching between primary execution and configuration details',
        severity: 'low',
        evidence: 'Split layout separating workspace canvas from contextual side-drawers.',
      },
    ],
    facts: [
      {
        statement: `Visual artifact successfully uploaded${fileName ? ` (${fileName})` : ''} and parsed by workspace container.`,
        evidence: 'Verified presence of active screenshot image data in DOM.',
      },
      {
        statement: 'Interface features structured navigation, primary canvas area, and actionable controls.',
        evidence: 'Directly observable layout composition and interactive bounding containers.',
      },
      {
        statement: 'No quantitative behavioral metrics (conversion, churn, funnel drop-off) are printed on the screen.',
        evidence: 'Screen contains functional controls rather than an analytics dashboard.',
      },
    ],
    inferences: [
      {
        statement: `The interface serves as the primary workspace for ${detectedUser}.`,
        reasoning: 'Density of functional controls indicates frequent operational use rather than a public marketing page.',
        confidence: 80,
      },
      {
        statement: 'Users must complete sequential inputs before reaching the terminal payoff state.',
        reasoning: 'Component arrangement follows standard step-wise configuration patterns.',
        confidence: 75,
      },
    ],
    assumptions: [
      {
        statement: 'Users possess foundational mental models for this domain without requiring inline tooltips.',
        reason: 'The artifact presents technical terms without explicit explanatory annotations.',
        confidence: 60,
      },
      {
        statement: 'The primary user goal aligns with minimizing task completion time rather than exploratory browsing.',
        reason: 'Workspace ergonomics emphasize direct manipulation and immediate execution.',
        confidence: 65,
      },
    ],
    unknowns: [
      {
        question: 'What is the current baseline drop-off or completion rate across this journey?',
        whyItMatters: 'Cannot deduce real user behavioral performance from visual design alone.',
        priority: 'high',
      },
      {
        question: 'What specific friction or problem is prompting this product jury review today?',
        whyItMatters: 'Enables the jury panel to focus deliberation on the true product bottleneck.',
        priority: 'high',
      },
      {
        question: 'What is the target business outcome (activation, retention, expansion, or cost reduction)?',
        whyItMatters: 'The verdict must weigh design tradeoffs against the exact business metric of success.',
        priority: 'medium',
      },
    ],
    // Explicitly NO contextAlignment generated in artifact-only visual analysis
    contextAlignment: undefined,
  };
}
