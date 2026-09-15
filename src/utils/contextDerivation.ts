/**
 * Utility functions for deriving structured product context fields
 * from unstructured product descriptions entered by PMs.
 * 
 * Guiding principle: Only derive fields that can be reliably inferred (e.g. Target User,
 * Product Purpose). NEVER invent business goals, metric targets, problems, or research logs.
 */

export interface DerivedProductContext {
  targetUser?: string;
  whatBuilding?: string;
  productName?: string;
}

export function deriveContextFromText(rawText: string): DerivedProductContext {
  if (!rawText || !rawText.trim()) {
    return {};
  }

  const clean = rawText.trim();
  const result: DerivedProductContext = {};

  // 1. Target user extraction
  // Handles:
  // - "This is an employee dashboard for HR managers."
  // - "Target user: Mid-market Sales Reps"
  // - "Built for DevOps engineers and SREs to monitor clusters"
  // - "Targeting freelance designers"
  const userPatterns = [
    /(?:target\s+users?|audience|intended\s+for|built\s+for|designed\s+for|aimed\s+at|targeting)\s*[:=]?\s*([^.;,\n]+)/i,
    /(?:for|used\s+by)\s+([A-Z0-9][A-Za-z0-9\s/&-]+?)(?=\s+(?:to|who|that|in|on|with|by|at|\.|\;|\,|$))/i,
    /\bfor\s+([^.;,\n]+)/i,
  ];

  for (const pattern of userPatterns) {
    const match = clean.match(pattern);
    if (match && match[1]) {
      let userCandidate = match[1].trim();
      // Remove trailing purpose clauses like "to publish automations"
      userCandidate = userCandidate.replace(/\s+(?:to|who|that|which)\s+.*$/i, '').trim();
      // Remove leading articles
      userCandidate = userCandidate.replace(/^(?:the|an?)\s+/i, '');
      
      if (userCandidate.length >= 2 && userCandidate.length <= 80) {
        result.targetUser = userCandidate.charAt(0).toUpperCase() + userCandidate.slice(1);
        break;
      }
    }
  }

  // 2. What are you building / product purpose
  // Handles:
  // - "This is an internal employee dashboard for HR managers." -> "Internal employee dashboard"
  // - "We are building an AI note taker for clinicians" -> "AI note taker"
  // - "A checkout flow redesign for mobile shoppers" -> "Checkout flow redesign"
  const buildingPatterns = [
    /^(?:this\s+is\s+(?:an?|the)?\s*)([^.;,\n]+?)(?=\s+(?:for|to|that|designed|intended|\.|\;|$))/i,
    /^(?:we\s+are\s+building\s+(?:an?|the)?\s*)([^.;,\n]+?)(?=\s+(?:for|to|that|\.|\;|$))/i,
    /^(?:a|an|the)\s+([^.;,\n]+?)(?=\s+(?:for|to|that|\.|\;|$))/i,
  ];

  for (const pattern of buildingPatterns) {
    const match = clean.match(pattern);
    if (match && match[1]) {
      const purposeCandidate = match[1].trim();
      if (purposeCandidate.length >= 3 && purposeCandidate.length <= 100) {
        result.whatBuilding = purposeCandidate.charAt(0).toUpperCase() + purposeCandidate.slice(1);
        break;
      }
    }
  }

  // Fallback: If no regex pattern matched but the context is a concise single statement (< 120 chars)
  if (!result.whatBuilding && clean.length > 0 && clean.length <= 120) {
    result.whatBuilding = clean;
  }

  // 3. Optional Product Name derivation if a short distinct purpose is identified
  if (result.whatBuilding && result.whatBuilding.length <= 40 && !result.whatBuilding.includes('.')) {
    result.productName = result.whatBuilding
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  return result;
}
