import { ArtifactUnderstanding } from '../types';

/**
 * Stage 2.5 · The bundled sample's reading, as a Claim Spine.
 *
 * GENERATED. Rebuild it by running the analyst reading below through
 * `buildSpineFromAnalystReading` with the run id 'rev-sample-flowpilot-01';
 * the ids are a digest of that run id and the statement, so they come back
 * identical. `createdAt` is pinned so the file does not change on every run.
 *
 * Why it exists: until Stage 2.5 the sample was the last reading in the product
 * with no spine, and it was the reason the flattened prompt path had to stay.
 * Deleting that path meant giving the sample real statements with real ids, so
 * the demonstration dossier shows the same structure a real run produces
 * (TR-8: it is labelled, and it is not a claim about anyone's product).
 */
export const sampleArtifactUnderstanding: ArtifactUnderstanding = {
  "productType": "B2B SaaS / Interactive Workflow Canvas & Onboarding Automation",
  "likelyUser": "Mid-market RevOps Managers, Growth Product Managers, and Lifecycle Marketers",
  "detectedJourney": "Multi-step onboarding sequence setup & first-mile webhook configuration",
  "frictionSignals": [
    "Competing visual prominence between primary \"Deploy Journey\" action and auxiliary tools",
    "Mandatory schema mapping overlay presented prior to interactive sandbox testing"
  ],
  "facts": [
    "Canvas UI presents a 5-step progress header with Step 3 labeled \"Data Schema Mapping\"",
    "A modal dialog is active, requiring external integration fields before preview"
  ],
  "inferences": [
    "Users likely stall at Step 3 due to cognitive fatigue and missing IT/CRM credentials"
  ],
  "assumptions": [
    "Self-serve trial users have direct access to live production API credentials during onboarding"
  ],
  "unknowns": [
    "What is the target Day-14 activation conversion benchmark or North Star metric?"
  ],
  "isConfirmed": false,
  "isAnalyzedByGemini": true,
  "contextAlignment": {
    "status": "aligned",
    "summary": "The visual canvas interface with nodes, triggers, and action sequence headers directly aligns with an onboarding journey workflow automation builder.",
    "visualEvidence": "Observable multi-step progress indicators, node connector ports, and automation webhook trigger forms on the canvas.",
    "contextClaim": "A drag-and-drop workflow canvas for Revenue Operations and Lifecycle Marketing teams to orchestrate multi-channel onboarding sequences.",
    "needsClarification": false
  },
  "detailedAnalysis": {
    "productType": {
      "ref": "A1",
      "derivedFrom": [
        "F1"
      ],
      "value": "B2B SaaS / Interactive Workflow Canvas & Onboarding Automation",
      "confidence": 92,
      "evidence": "Observable visual canvas containing node trees, trigger cards, and pipeline headers.",
      "confidenceType": "evidence"
    },
    "likelyUser": {
      "ref": "A2",
      "derivedFrom": [
        "F1",
        "F2"
      ],
      "value": "Mid-market RevOps Managers, Growth Product Managers, and Lifecycle Marketers",
      "confidence": 72,
      "evidence": "Deduced from workflow automation nodes, webhook configurations, and campaign triggers.",
      "confidenceType": "inference"
    },
    "primaryJourney": {
      "ref": "A3",
      "derivedFrom": [
        "F1"
      ],
      "value": "Multi-step onboarding sequence setup & first-mile webhook configuration",
      "confidence": 78,
      "evidence": "Step-progress indicator showing journey sequence from source trigger to deploy.",
      "confidenceType": "inference"
    },
    "frictionSignals": [
      {
        "ref": "S1",
        "derivedFrom": [
          "F1"
        ],
        "signal": "Competing visual prominence between primary \"Deploy Journey\" action and auxiliary tools",
        "severity": "high",
        "evidence": "Primary CTA shares identical vertical line with four utility tool icons."
      },
      {
        "ref": "S2",
        "derivedFrom": [
          "F2"
        ],
        "signal": "Mandatory schema mapping overlay presented prior to interactive sandbox testing",
        "severity": "medium",
        "evidence": "Active modal obscures canvas view requiring technical database fields."
      }
    ],
    "facts": [
      {
        "ref": "F1",
        "statement": "Canvas UI presents a 5-step progress header with Step 3 labeled \"Data Schema Mapping\"",
        "evidence": "Observable step progress bar at top of layout with active step badge."
      },
      {
        "ref": "F2",
        "statement": "A modal dialog is active, requiring external integration fields before preview",
        "evidence": "Overlay container centered in viewport with input fields for webhook endpoints."
      }
    ],
    "inferences": [
      {
        "ref": "I1",
        "derivedFrom": [
          "F1",
          "F2"
        ],
        "statement": "Users likely stall at Step 3 due to cognitive fatigue and missing IT/CRM credentials",
        "reasoning": "Schema configuration contains technical JSON payload and database mapping options.",
        "confidence": 70
      }
    ],
    "assumptions": [
      {
        "ref": "P1",
        "statement": "Self-serve trial users have direct access to live production API credentials during onboarding",
        "reason": "Required integration fields appear before any sandbox mode or mock test option.",
        "confidence": 60
      }
    ],
    "unknowns": [
      {
        "ref": "U1",
        "question": "What is the target Day-14 activation conversion benchmark or North Star metric?",
        "whyItMatters": "Determines whether 18% current completion represents an acute bottleneck or acceptable baseline.",
        "decisionImpact": "high",
        "howToGetIt": "One number from the activation dashboard, or the target written into the quarter plan.",
        "blocks": [
          "I1"
        ]
      }
    ],
    "contextAlignment": {
      "status": "aligned",
      "summary": "The visual canvas interface with nodes, triggers, and action sequence headers directly aligns with an onboarding journey workflow automation builder.",
      "visualEvidence": "Observable multi-step progress indicators, node connector ports, and automation webhook trigger forms on the canvas.",
      "contextClaim": "A drag-and-drop workflow canvas for Revenue Operations and Lifecycle Marketing teams to orchestrate multi-channel onboarding sequences.",
      "needsClarification": false
    }
  },
  "claimSpine": {
    "version": 1,
    "runId": "rev-sample-flowpilot-01",
    "claims": [
      {
        "id": "CLM-szjpxn6t3rc5j6g22hg4ae2m2v",
        "text": "Canvas UI presents a 5-step progress header with Step 3 labeled \"Data Schema Mapping\"",
        "epistemicStatus": "FACT",
        "origin": {
          "kind": "ARTIFACT",
          "evidence": "Observable step progress bar at top of layout with active step badge.",
          "runId": "rev-sample-flowpilot-01",
          "stage": "analyst"
        },
        "supports": [],
        "loadBearing": "NOT_YET_DETERMINED",
        "producedBy": "analyst",
        "runId": "rev-sample-flowpilot-01",
        "createdAt": "2026-09-22T00:00:00.000Z",
        "surfaced": true
      },
      {
        "id": "CLM-ejmcykp25r4pcxsl7lryrhfeon",
        "text": "A modal dialog is active, requiring external integration fields before preview",
        "epistemicStatus": "FACT",
        "origin": {
          "kind": "ARTIFACT",
          "evidence": "Overlay container centered in viewport with input fields for webhook endpoints.",
          "runId": "rev-sample-flowpilot-01",
          "stage": "analyst"
        },
        "supports": [],
        "loadBearing": "NOT_YET_DETERMINED",
        "producedBy": "analyst",
        "runId": "rev-sample-flowpilot-01",
        "createdAt": "2026-09-22T00:00:00.000Z",
        "surfaced": true
      },
      {
        "id": "CLM-v2aczzfh3qw25a2ib5rtf3rryu",
        "text": "Product type read from the artifact: B2B SaaS / Interactive Workflow Canvas & Onboarding Automation",
        "epistemicStatus": "INFERENCE",
        "origin": {
          "kind": "MODEL_INFERENCE",
          "reasoning": "Observable visual canvas containing node trees, trigger cards, and pipeline headers.",
          "derivedFrom": [
            "CLM-szjpxn6t3rc5j6g22hg4ae2m2v"
          ],
          "runId": "rev-sample-flowpilot-01",
          "stage": "analyst"
        },
        "supports": [],
        "loadBearing": "NOT_YET_DETERMINED",
        "confidence": 92,
        "producedBy": "analyst:attribute",
        "runId": "rev-sample-flowpilot-01",
        "createdAt": "2026-09-22T00:00:00.000Z",
        "surfaced": true
      },
      {
        "id": "CLM-2m3dddn3hij43p5p4k6upkb2fn",
        "text": "User role inferred from the artifact: Mid-market RevOps Managers, Growth Product Managers, and Lifecycle Marketers",
        "epistemicStatus": "INFERENCE",
        "origin": {
          "kind": "MODEL_INFERENCE",
          "reasoning": "Deduced from workflow automation nodes, webhook configurations, and campaign triggers.",
          "derivedFrom": [
            "CLM-szjpxn6t3rc5j6g22hg4ae2m2v",
            "CLM-ejmcykp25r4pcxsl7lryrhfeon"
          ],
          "runId": "rev-sample-flowpilot-01",
          "stage": "analyst"
        },
        "supports": [],
        "loadBearing": "NOT_YET_DETERMINED",
        "confidence": 72,
        "producedBy": "analyst:attribute",
        "runId": "rev-sample-flowpilot-01",
        "createdAt": "2026-09-22T00:00:00.000Z",
        "surfaced": true
      },
      {
        "id": "CLM-ydc4awr6cmabghxk5ujuoqmszf",
        "text": "Journey read from the artifact: Multi-step onboarding sequence setup & first-mile webhook configuration",
        "epistemicStatus": "INFERENCE",
        "origin": {
          "kind": "MODEL_INFERENCE",
          "reasoning": "Step-progress indicator showing journey sequence from source trigger to deploy.",
          "derivedFrom": [
            "CLM-szjpxn6t3rc5j6g22hg4ae2m2v"
          ],
          "runId": "rev-sample-flowpilot-01",
          "stage": "analyst"
        },
        "supports": [],
        "loadBearing": "NOT_YET_DETERMINED",
        "confidence": 78,
        "producedBy": "analyst:attribute",
        "runId": "rev-sample-flowpilot-01",
        "createdAt": "2026-09-22T00:00:00.000Z",
        "surfaced": true
      },
      {
        "id": "CLM-yridb5vw6fea72hutgrk7wc26n",
        "text": "Competing visual prominence between primary \"Deploy Journey\" action and auxiliary tools",
        "epistemicStatus": "INFERENCE",
        "origin": {
          "kind": "MODEL_INFERENCE",
          "reasoning": "Primary CTA shares identical vertical line with four utility tool icons.",
          "derivedFrom": [
            "CLM-szjpxn6t3rc5j6g22hg4ae2m2v"
          ],
          "runId": "rev-sample-flowpilot-01",
          "stage": "analyst"
        },
        "supports": [],
        "loadBearing": "NOT_YET_DETERMINED",
        "producedBy": "analyst:friction",
        "runId": "rev-sample-flowpilot-01",
        "createdAt": "2026-09-22T00:00:00.000Z",
        "surfaced": true
      },
      {
        "id": "CLM-r3s2dsx4u6ilr4j2nxxthekbwh",
        "text": "Mandatory schema mapping overlay presented prior to interactive sandbox testing",
        "epistemicStatus": "INFERENCE",
        "origin": {
          "kind": "MODEL_INFERENCE",
          "reasoning": "Active modal obscures canvas view requiring technical database fields.",
          "derivedFrom": [
            "CLM-ejmcykp25r4pcxsl7lryrhfeon"
          ],
          "runId": "rev-sample-flowpilot-01",
          "stage": "analyst"
        },
        "supports": [],
        "loadBearing": "NOT_YET_DETERMINED",
        "producedBy": "analyst:friction",
        "runId": "rev-sample-flowpilot-01",
        "createdAt": "2026-09-22T00:00:00.000Z",
        "surfaced": true
      },
      {
        "id": "CLM-lcaaxw5senqs6j7li32ohvdpgo",
        "text": "Users likely stall at Step 3 due to cognitive fatigue and missing IT/CRM credentials",
        "epistemicStatus": "INFERENCE",
        "origin": {
          "kind": "MODEL_INFERENCE",
          "reasoning": "Schema configuration contains technical JSON payload and database mapping options.",
          "derivedFrom": [
            "CLM-szjpxn6t3rc5j6g22hg4ae2m2v",
            "CLM-ejmcykp25r4pcxsl7lryrhfeon"
          ],
          "runId": "rev-sample-flowpilot-01",
          "stage": "analyst"
        },
        "supports": [],
        "loadBearing": "NOT_YET_DETERMINED",
        "confidence": 70,
        "producedBy": "analyst",
        "runId": "rev-sample-flowpilot-01",
        "createdAt": "2026-09-22T00:00:00.000Z",
        "surfaced": true
      },
      {
        "id": "CLM-j4j27pc6whemroi6kauhlodxtp",
        "text": "Self-serve trial users have direct access to live production API credentials during onboarding",
        "epistemicStatus": "ASSUMPTION",
        "origin": {
          "kind": "MODEL_ASSUMPTION",
          "reason": "Required integration fields appear before any sandbox mode or mock test option.",
          "runId": "rev-sample-flowpilot-01",
          "stage": "analyst"
        },
        "supports": [],
        "loadBearing": "NOT_YET_DETERMINED",
        "confidence": 60,
        "producedBy": "analyst",
        "runId": "rev-sample-flowpilot-01",
        "createdAt": "2026-09-22T00:00:00.000Z",
        "surfaced": true
      },
      {
        "id": "CLM-hd2nnmw5p2sym4gcvjof6gq3wy",
        "text": "What is the target Day-14 activation conversion benchmark or North Star metric?",
        "epistemicStatus": "UNKNOWN",
        "origin": {
          "kind": "MODEL_ASSUMPTION",
          "reason": "Determines whether 18% current completion represents an acute bottleneck or acceptable baseline.",
          "runId": "rev-sample-flowpilot-01",
          "stage": "analyst"
        },
        "supports": [],
        "loadBearing": "NOT_YET_DETERMINED",
        "producedBy": "analyst",
        "runId": "rev-sample-flowpilot-01",
        "createdAt": "2026-09-22T00:00:00.000Z",
        "surfaced": true
      }
    ],
    "openQuestions": [
      {
        "claimId": "CLM-hd2nnmw5p2sym4gcvjof6gq3wy",
        "question": "What is the target Day-14 activation conversion benchmark or North Star metric?",
        "whyItMatters": "Determines whether 18% current completion represents an acute bottleneck or acceptable baseline.",
        "decisionImpact": "high",
        "howToGetIt": "One number from the activation dashboard, or the target written into the quarter plan.",
        "blocks": [
          "CLM-lcaaxw5senqs6j7li32ohvdpgo"
        ],
        "status": "OPEN"
      }
    ]
  },
  "originCoverage": {
    "covered": 10,
    "surfaced": 10,
    "ratio": 1,
    "uncovered": [],
    "threshold": 1,
    "passes": true
  }
};
