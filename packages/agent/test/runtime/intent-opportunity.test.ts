import { describe, expect, it } from "vitest";
import { modelMessageContentToText, type ModelInputMessage } from "@zcode/contracts";
import {
  checkHardConstraints,
  evaluateIntentCandidates,
  validateOpportunityChain,
  type BuyerCommerceIntent,
  type IntentCandidate,
  type Opportunity,
} from "../../src/index.js";
import { UNICOM_COMMERCE_TOOL_NAME } from "@unicom/agent-kernel";
import { createRuntimeHarness } from "./support/harness.js";

function toolResultsOf(model: { requests: readonly { messages: ModelInputMessage[] }[] }): string[] {
  const requests = model.requests;
  const last = requests[requests.length - 1];
  if (!last) return [];
  return last.messages
    .filter((message) => message.toolCallId !== undefined)
    .map((message) => modelMessageContentToText(message.content));
}

const CAMERA_INTENT: BuyerCommerceIntent = {
  intentId: "intent:camera:1",
  buyerRef: { principalId: "user:buyer:1", kind: "user" },
  desired: ["item:camera"],
  statedAt: "2026-10-05T00:00:00.000Z",
  hardConstraints: {
    deadline: "2026-12-01T00:00:00.000Z",
    maxTotalCost: { currency: "GHS", minorUnits: "4500000" },
    minQuality: { minCondition: "GOOD", minAverageRating: 4.2 },
    minSellerCredibility: { minVerifiedTransactions: 50, minDisputeRateCeilingBps: 500 },
    privacyRequirements: ["MINIMIZE_DATA_COLLECTION"],
    securityRequirements: ["VERIFIED_MERCHANT", "SECURE_PAYMENT_RAIL"],
    deliveryConstraints: [{ kind: "MAX_LATENCY_HOURS", value: "1500" }],
    requiredProofLevel: "P2",
    recourseRequired: true,
    groupBuyWillingness: "ACCEPTED",
    tradeWillingness: "ACCEPTED",
  },
  softPreferences: { speedPreference: "CHEAPEST", financingPreference: "PREPAY" },
};

const CANDIDATES: readonly IntentCandidate[] = [
  {
    candidateRef: "cand:compliant",
    sellerRef: "merchant:1",
    totalCost: { currency: "GHS", minorUnits: "4000000" },
    estimatedDeliveryAt: "2026-11-20T00:00:00.000Z",
    averageRating: 4.6,
    reviewCount: 210,
    condition: "NEW",
    sellerVerifiedTransactions: 1_200,
    sellerDisputeRateBps: 120,
    privacyGuarantees: ["MINIMIZE_DATA_COLLECTION"],
    securityGuarantees: ["VERIFIED_MERCHANT", "SECURE_PAYMENT_RAIL"],
    financingAvailable: ["PREPAY"],
    proofLevel: "P3",
    recourseAvailable: true,
  },
  {
    candidateRef: "cand:over-budget",
    sellerRef: "merchant:2",
    totalCost: { currency: "GHS", minorUnits: "6000000" },
    estimatedDeliveryAt: "2026-11-20T00:00:00.000Z",
    averageRating: 4.9,
    reviewCount: 400,
    condition: "NEW",
    sellerVerifiedTransactions: 2_000,
    sellerDisputeRateBps: 90,
    privacyGuarantees: ["MINIMIZE_DATA_COLLECTION"],
    securityGuarantees: ["VERIFIED_MERCHANT", "SECURE_PAYMENT_RAIL"],
    proofLevel: "P4",
    recourseAvailable: true,
  },
  {
    candidateRef: "cand:too-slow",
    sellerRef: "merchant:3",
    totalCost: { currency: "GHS", minorUnits: "4100000" },
    estimatedDeliveryAt: "2026-12-20T00:00:00.000Z",
    averageRating: 4.4,
    reviewCount: 180,
    condition: "LIKE_NEW",
    sellerVerifiedTransactions: 300,
    sellerDisputeRateBps: 300,
    privacyGuarantees: ["MINIMIZE_DATA_COLLECTION"],
    securityGuarantees: ["VERIFIED_MERCHANT", "SECURE_PAYMENT_RAIL"],
    proofLevel: "P3",
    recourseAvailable: true,
  },
];

describe("W2-001 scenario 1 — buyer intent with deadline, cost, quality, privacy, security and speed", () => {
  it("hard constraints are checked BEFORE soft optimization and exclude violating candidates outright", () => {
    expect(checkHardConstraints(CAMERA_INTENT, CANDIDATES[0] as IntentCandidate)).toEqual({ satisfied: true });

    const overBudget = checkHardConstraints(CAMERA_INTENT, CANDIDATES[1] as IntentCandidate);
    expect(overBudget.satisfied).toBe(false);
    if (!overBudget.satisfied) expect(overBudget.violations).toContain("COST_EXCEEDED");

    const tooSlow = checkHardConstraints(CAMERA_INTENT, CANDIDATES[2] as IntentCandidate);
    expect(tooSlow.satisfied).toBe(false);
    if (!tooSlow.satisfied) {
      expect(tooSlow.violations).toContain("DEADLINE_EXCEEDED");
      expect(tooSlow.violations).toContain("DELIVERY_LATENCY_EXCEEDED");
    }

    const scored = evaluateIntentCandidates(CAMERA_INTENT, CANDIDATES);
    // The only hard-constraint survivor is the compliant candidate.
    const survivor = scored.find((entry) => entry.hardCheck.satisfied);
    expect(survivor?.candidateRef).toBe("cand:compliant");
    // Hard-violating candidates never receive a soft score.
    for (const entry of scored) {
      if (!entry.hardCheck.satisfied) expect(entry.softScore).toBeUndefined();
    }
    // Missing candidate data fails closed.
    const missing = checkHardConstraints(CAMERA_INTENT, { candidateRef: "cand:opaque" });
    expect(missing.satisfied).toBe(false);
    if (!missing.satisfied) expect(missing.violations).toContain("MISSING_REQUIRED_DATA");
  });

  it("runtime budget bounds refuse over-budget proposals at the kernel before the seam", async () => {
    const harness = createRuntimeHarness({
      main: [
        {
          toolCalls: [
            {
              name: UNICOM_COMMERCE_TOOL_NAME,
              input: {
                commandType: "listing.create",
                payloadRef: "payload:over-budget",
                impact: "MEDIUM",
                proofLevel: "P1",
                spendCurrency: "GHS",
                spendMinorUnits: "9000000",
              },
            },
          ],
        },
        { text: "refused" },
      ],
    });

    await harness.runtime.executeTurn("Propose the over-budget purchase.");

    const results = toolResultsOf(harness.models.main);
    expect(results[0]).toContain("DELEGATE_BUDGET_EXHAUSTED");
    expect(results[0]).toContain("maxSpend");
    expect(harness.recorder?.submissions.length ?? 0).toBe(0);
  });
});

describe("W2-001 scenario 5 — unused owned item becomes a resale/rental opportunity with distinct epistemics", () => {
  it("an epistemic chain observes, infers, predicts, then recommends — with lineage enforced", () => {
    const chain: readonly Opportunity[] = [
      {
        opportunityId: "opp:obs:1",
        forRef: { principalId: "user:buyer:1", kind: "user" },
        kind: "RESALE",
        epistemics: { kind: "OBSERVATION", observedFactRefs: ["obs:wardrobe:owned"] },
        subjectRef: "item:wardrobe:1",
        detectedAt: "2026-10-05T00:00:00.000Z",
      },
      {
        opportunityId: "opp:inf:1",
        forRef: { principalId: "user:buyer:1", kind: "user" },
        kind: "RESALE",
        epistemics: { kind: "INFERENCE", inferenceBasis: "worn 5 times in 12 months" },
        subjectRef: "item:wardrobe:1",
        detectedAt: "2026-10-05T00:00:00.000Z",
      },
      {
        opportunityId: "opp:pred:1",
        forRef: { principalId: "user:buyer:1", kind: "user" },
        kind: "RESALE",
        epistemics: { kind: "PREDICTION", predictionConfidence: 0.72 },
        subjectRef: "item:wardrobe:1",
        estimatedValue: { currency: "GHS", minorUnits: "800000" },
        detectedAt: "2026-10-05T00:00:00.000Z",
      },
      {
        opportunityId: "opp:rec:1",
        forRef: { principalId: "user:buyer:1", kind: "user" },
        kind: "RESALE",
        epistemics: { kind: "RECOMMENDATION", basedOnOpportunityIds: ["opp:obs:1", "opp:inf:1", "opp:pred:1"] },
        subjectRef: "item:wardrobe:1",
        resaleTerms: { askingPrice: { currency: "GHS", minorUnits: "850000" }, condition: "GOOD" },
        detectedAt: "2026-10-05T00:00:00.000Z",
      },
    ];
    expect(validateOpportunityChain(chain)).toEqual([]);

    // Observations may not carry predictive fields.
    const observationWithConfidence: Opportunity = {
      opportunityId: "opp:obs:bad",
      forRef: { principalId: "user:buyer:1", kind: "user" },
      kind: "RESALE",
      epistemics: { kind: "OBSERVATION", predictionConfidence: 0.9 },
      subjectRef: "item:wardrobe:1",
      detectedAt: "2026-10-05T00:00:00.000Z",
    };
    expect(validateOpportunityChain([observationWithConfidence])).toContain(
      "OBSERVATION_CARRIES_PREDICTIVE_FIELDS",
    );

    // Recommendations must cite KNOWN lineage.
    const orphanRecommendation: Opportunity = {
      opportunityId: "opp:rec:orphan",
      forRef: { principalId: "user:buyer:1", kind: "user" },
      kind: "RESALE",
      epistemics: { kind: "RECOMMENDATION", basedOnOpportunityIds: ["opp:does:not:exist"] },
      subjectRef: "item:wardrobe:1",
      detectedAt: "2026-10-05T00:00:00.000Z",
    };
    expect(validateOpportunityChain([orphanRecommendation])).toContain("RECOMMENDATION_BASIS_NOT_FOUND");
  });

  it("rental opportunities are first-class with typed terms (borrow/rent as a planning choice)", () => {
    const rental: Opportunity = {
      opportunityId: "opp:rental:1",
      forRef: { principalId: "user:buyer:1", kind: "user" },
      kind: "RENTAL",
      epistemics: { kind: "RECOMMENDATION", basedOnOpportunityIds: ["opp:obs:lens"] },
      subjectRef: "item:lens:1",
      rentalTerms: {
        ratePerPeriod: { currency: "GHS", minorUnits: "15000" },
        period: "WEEK",
        depositRequired: { currency: "GHS", minorUnits: "200000" },
      },
      detectedAt: "2026-10-05T00:00:00.000Z",
    };
    expect(validateOpportunityChain([rental, {
      opportunityId: "opp:obs:lens",
      forRef: { principalId: "user:buyer:1", kind: "user" },
      kind: "RENTAL",
      epistemics: { kind: "OBSERVATION", observedFactRefs: ["obs:lens:idle"] },
      subjectRef: "item:lens:1",
      detectedAt: "2026-10-05T00:00:00.000Z",
    }])).toEqual([]);
  });
});
