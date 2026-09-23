import { ProductReview, ProductContext, ArtifactUnderstanding } from '../types';

export const sampleArtifactUnderstanding: ArtifactUnderstanding = {
  productType: 'B2B SaaS / Interactive Workflow Canvas & Onboarding Automation',
  likelyUser: 'Mid-market RevOps Managers, Growth Product Managers, and Lifecycle Marketers',
  detectedJourney: 'Multi-step onboarding sequence setup & first-mile webhook configuration',
  frictionSignals: [
    'Competing visual prominence between primary "Deploy Journey" action and auxiliary tools',
    'Mandatory schema mapping overlay presented prior to interactive sandbox testing',
    'Dense configuration drawer with ambiguous trigger draft / live status indicators',
  ],
  facts: [
    'Canvas UI presents a 5-step progress header with Step 3 labeled "Data Schema Mapping"',
    'A modal dialog is active, requiring at least 4 external integration fields before preview',
    'Action toolbar displays 4 equally weighted grey buttons alongside 1 dark primary CTA',
  ],
  inferences: [
    'Users likely stall at Step 3 due to cognitive fatigue and missing IT/CRM credentials',
    'Workflow prioritizes exhaustive technical setup over rapid initial time-to-value payoff',
  ],
  assumptions: [
    'Self-serve trial users have direct access to live production API credentials during onboarding',
    'Users prefer configuring complex branching rules over standard linear starter templates',
  ],
  unknowns: [
    'Target day-14 activation conversion rate or North Star business objective',
    'Specific qualitative complaints and feedback from churned user cohorts',
    'Funnel completion rates and drop-off analytics across steps 1 through 5',
  ],
  isConfirmed: false,
  detailedAnalysis: {
    productType: {
      ref: 'A1',
      derivedFrom: ['F1'],
      value: 'B2B SaaS / Interactive Workflow Canvas & Onboarding Automation',
      confidence: 92,
      evidence: 'Observable visual canvas containing node trees, trigger cards, and pipeline headers.',
      confidenceType: 'evidence',
    },
    likelyUser: {
      ref: 'A2',
      derivedFrom: ['F1', 'F2'],
      value: 'Mid-market RevOps Managers, Growth Product Managers, and Lifecycle Marketers',
      confidence: 72,
      evidence: 'Deduced from workflow automation nodes, webhook configurations, and campaign triggers.',
      confidenceType: 'inference',
    },
    primaryJourney: {
      ref: 'A3',
      derivedFrom: ['F1'],
      value: 'Multi-step onboarding sequence setup & first-mile webhook configuration',
      confidence: 78,
      evidence: 'Step-progress indicator showing journey sequence from source trigger to deploy.',
      confidenceType: 'inference',
    },
    frictionSignals: [
      {
        ref: 'S1',
        derivedFrom: ['F1'],
        signal: 'Competing visual prominence between primary "Deploy Journey" action and auxiliary tools',
        severity: 'high',
        evidence: 'Primary CTA shares identical vertical line with four utility tool icons.',
      },
      {
        ref: 'S2',
        derivedFrom: ['F2'],
        signal: 'Mandatory schema mapping overlay presented prior to interactive sandbox testing',
        severity: 'medium',
        evidence: 'Active modal obscures canvas view requiring technical database fields.',
      },
    ],
    facts: [
      {
        ref: 'F1',
        statement: 'Canvas UI presents a 5-step progress header with Step 3 labeled "Data Schema Mapping"',
        evidence: 'Observable step progress bar at top of layout with active step badge.',
      },
      {
        ref: 'F2',
        statement: 'A modal dialog is active, requiring external integration fields before preview',
        evidence: 'Overlay container centered in viewport with input fields for webhook endpoints.',
      },
    ],
    inferences: [
      {
        ref: 'I1',
        derivedFrom: ['F1', 'F2'],
        statement: 'Users likely stall at Step 3 due to cognitive fatigue and missing IT/CRM credentials',
        reasoning: 'Schema configuration contains technical JSON payload and database mapping options.',
        confidence: 70,
      },
    ],
    assumptions: [
      {
        ref: 'P1',
        statement: 'Self-serve trial users have direct access to live production API credentials during onboarding',
        reason: 'Required integration fields appear before any sandbox mode or mock test option.',
        confidence: 60,
      },
    ],
    unknowns: [
      {
        ref: 'U1',
        question: 'What is the target Day-14 activation conversion benchmark or North Star metric?',
        whyItMatters: 'Determines whether 18% current completion represents an acute bottleneck or acceptable baseline.',
        decisionImpact: 'high',
        howToGetIt: 'One number from the activation dashboard, or the target written into the quarter plan.',
        blocks: ['I1'],
      },
    ],
    contextAlignment: {
      status: 'aligned',
      summary:
        'The visual canvas interface with nodes, triggers, and action sequence headers directly aligns with an onboarding journey workflow automation builder.',
      visualEvidence:
        'Observable multi-step progress indicators, node connector ports, and automation webhook trigger forms on the canvas.',
      contextClaim:
        'A drag-and-drop workflow canvas for Revenue Operations and Lifecycle Marketing teams to orchestrate multi-channel onboarding sequences.',
      needsClarification: false,
    },
  },
  contextAlignment: {
    status: 'aligned',
    summary:
      'The visual canvas interface with nodes, triggers, and action sequence headers directly aligns with an onboarding journey workflow automation builder.',
    visualEvidence:
      'Observable multi-step progress indicators, node connector ports, and automation webhook trigger forms on the canvas.',
    contextClaim:
      'A drag-and-drop workflow canvas for Revenue Operations and Lifecycle Marketing teams to orchestrate multi-channel onboarding sequences.',
    needsClarification: false,
  },
};

/*
 * Stage 1 \u00b7 createDefaultArtifactUnderstanding() is deleted.
 *
 * It returned a complete artifact reading \u2014 product type, likely user,
 * detected journey, three friction signals, three "facts" including the file
 * name, two inferences, two assumptions and three unknowns \u2014 built from
 * nothing but a file name and a URL. Four call sites used it, and none of them
 * labelled the result. CAP-01's failure state forbids it in so many words, and
 * \u00a751 never-1 forbids the whole class.
 *
 * There is no replacement. An artifact that could not be read has no reading.
 */

export const sampleProductContext: ProductContext = {
  name: 'FlowPilot (Customer Journey Automations)',
  whatBuilding:
    'A drag-and-drop workflow canvas for Revenue Operations and Lifecycle Marketing teams to orchestrate multi-channel onboarding sequences and product triggers.',
  targetUser:
    'Mid-market RevOps Managers and Growth Product Managers who manage complex onboarding logic across email, in-app webhooks, and CRM updates.',
  primaryGoal:
    'Achieve 45% day-14 activation rate by enabling self-serve users to publish their first live automation within their initial 30 minutes.',
  currentProblem:
    'Signups are healthy (~800/week), but only 18% complete the setup checklist and activate their first workflow. Many drop off on the canvas configuration screen.',
  productUrl: 'https://app.flowpilot.example.com/onboarding/wizard',
  screenshotUrl: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1200&q=80',
  screenshotName: 'flowpilot-canvas-onboarding-v2.png',
  additionalContext:
    'A drag-and-drop workflow canvas for Revenue Operations and Lifecycle Marketing teams to orchestrate multi-channel onboarding sequences and product triggers.',
  artifactUnderstanding: sampleArtifactUnderstanding,
};

export const sampleRawEvidence = `User Research & Data Log:
- 6 customer discovery interviews conducted in August with churned trial users.
- Quote (User A): "I didn't understand whether I needed to connect HubSpot before testing a mock trigger or if I could test with dummy leads first."
- Amplitude cohort data: 62% of users drop off at Step 3 (Data Schema Mapping) of the 5-step onboarding wizard.
- Hotjar heatmaps show 48% of clicks occur on secondary documentation links rather than the primary "Activate Workflow" button.
- Support tickets: 14 tickets this month asking "Why is my test trigger grayed out?".
- No production event instrumentation currently exists for time-to-first-webhook response.`;

export const sampleProductReview: ProductReview = {
  id: 'rev-sample-flowpilot-01',
  timestamp: new Date().toISOString(),
  context: sampleProductContext,
  evidenceRaw: sampleRawEvidence,
  verdict: 'ITERATE',
  confidenceScore: 68,
  confidenceRationale:
    'Medium confidence: Strong qualitative friction signals and drop-off funnel data exist, but causal telemetry on time-to-value realization vs cognitive overload is still missing.',
  executiveSummary:
    'The product has healthy inbound acquisition but suffers from an activation bottleneck caused by premature configuration demands. The onboarding flow requires deep integration credentials before demonstrating core value payoff. While UX points to interface friction and Design identifies conflicting visual hierarchy, the existential risk is cognitive fatigue before value realization. You must iterate the activation sequence to deliver an interactive sandbox preview before demanding full schema mapping.',
  opportunities: [
    {
      id: 'opp-1',
      problem:
        'Premature Data Source Requirement: Users are forced into a complex 5-field schema mapping modal before seeing how an automated sequence triggers in real time.',
      userImpact:
        'Creates immediate cognitive stall; users feel unprepared and abandon the session to find IT or CRM administrator credentials.',
      businessImpact:
        'High trial abandonment. Amplitude shows 62% funnel loss at Step 3, depressing day-14 activation by an estimated 27 percentage points.',
      confidence: 88,
      evidenceStatus: 'FACT',
      evidenceContext:
        'Directly supported by Amplitude funnel drop-off metrics (62% at step 3) and direct user interview transcripts.',
    },
    {
      id: 'opp-2',
      problem:
        'Delayed First-Mile Value Realization: The application optimizes for comprehensive setup rather than early dopamine or a fast "aha moment" with sample test data.',
      userImpact:
        'Users perceive the tool as an enterprise maintenance burden rather than a lightweight productivity accelerator.',
      businessImpact:
        'Reduces sales velocity; self-serve conversion remains suppressed at 18%, forcing expensive sales engineer interventions.',
      confidence: 74,
      evidenceStatus: 'INFERENCE',
      evidenceContext:
        'Derived by synthesizing interview feedback ("didn\'t know if I could test with dummy leads") and support ticket trends.',
    },
    {
      id: 'opp-3',
      problem:
        'Competing Visual Affordances on Canvas: The primary "Deploy Journey" action shares visual weight with four secondary configuration buttons and documentation links.',
      userImpact:
        'Users experience analysis paralysis when deciding whether their canvas state is safe to publish or still in draft mode.',
      businessImpact:
        'Dilutes intent funnel; 48% of exploratory clicks leak out to external docs without completing session activation.',
      confidence: 62,
      evidenceStatus: 'ASSUMPTION',
      evidenceContext:
        'Observed in Hotjar heatmaps, but unvalidated whether clicking docs is a symptom of confusion or standard technical preparation.',
    },
  ],
  agentReviews: [
    {
      role: 'UX_RESEARCHER',
      roleTitle: 'UX Researcher',
      agentName: 'Elena Rostova',
      recommendation: 'Streamline the friction gates and introduce guided sandbox defaults.',
      confidence: 82,
      keyObservation:
        'Onboarding appears to create unnecessary friction.',
      coreArgument:
        'The cognitive load spikes sharply at step 3. Users express anxiety over whether test triggers will inadvertently fire live customer emails. Providing pre-populated dummy leads and non-destructive "dry-run" modes will eliminate the fear barrier and reduce drop-off.',
    },
    {
      role: 'PRODUCT_MANAGER',
      roleTitle: 'Product Manager',
      agentName: 'Marcus Vance',
      recommendation: 'Re-sequence the activation funnel around immediate value realization rather than technical completion.',
      confidence: 76,
      keyObservation:
        'The larger concern may be that users do not experience value early enough.',
      coreArgument:
        'Friction is acceptable if the perceived value is extraordinary. Right now, users do not feel the power of FlowPilot until they have invested 20 minutes of data entry. If we let them simulate a 3-step automation in 45 seconds using pre-canned templates, activation will rise even if the full setup stays rigorous.',
    },
    {
      role: 'DESIGN_CRITIC',
      roleTitle: 'Design Critic',
      agentName: 'Siddharth Roy',
      recommendation: 'Establish an unequivocal hierarchy between primary deployment and peripheral configuration.',
      confidence: 71,
      keyObservation:
        'The primary CTA competes with secondary actions.',
      coreArgument:
        'The canvas chrome suffers from button bloat: four filled grey buttons sit beside one dark CTA with identical corner radiuses and padding. The primary activation button does not command the viewport, and error states on disabled triggers provide zero affordance on hover.',
    },
  ],
  agreementDisagreement: {
    agreements: [
      'All agents agree that the current step 3 (Schema Mapping) is the fatal chokepoint in the activation funnel.',
      'Unanimous agreement that shipping the current experience without revisions will solidify the 18% activation ceiling.',
      'Consensus that providing sample/mock test data will lower anxiety across both technical and non-technical personas.',
    ],
    disagreements: [
      {
        topic: 'Friction Removal vs. Value Acceleration Priority',
        frictionPoint:
          'Is the primary failure UX friction (too many form fields) or product positioning (delayed time-to-value)?',
        agentPositions: [
          {
            roleTitle: 'UX Researcher',
            view:
              'Prioritizes cutting steps, deferring API key requirements, and simplifying the form layout directly.',
          },
          {
            roleTitle: 'Product Manager',
            view:
              'Argues that friction is secondary; users tolerate tedious setup if they experience an early emotional payoff or demo win first.',
          },
          {
            roleTitle: 'Design Critic',
            view:
              'Contends that visual hierarchy confusion is masking the true product utility regardless of how many steps exist.',
          },
        ],
      },
    ],
    unknowns: [
      'Exact session duration before user abandonment occurs on Step 3 (need granular client-side dwell telemetry).',
      'Whether enterprise accounts have different schema prerequisites than mid-market self-serve users.',
      'True correlation between first-day sandbox simulation completion and day-30 paid retention.',
    ],
  },
  recommendedNextStep:
    'Run a 5-user usability test focused on first-session activation before redesigning the onboarding flow.',
  isSample: true,
};
