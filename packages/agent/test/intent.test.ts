import { describe, expect, it } from "vitest";
import type { BuyerCommerceIntent, IntentCandidate, PrincipalRef } from "../src/index.js";
import { checkHardConstraints, evaluateIntentCandidates, money } from "../src/index.js";

/**
 * Acceptance scenario 1 — Buyer intent with deadline, max cost, quality,
 * privacy, security and speed constraints, modeled as typed hard/soft
 * constraints. Hard constraints are checked before soft optimization
 * (FROZEN-ARCHITECTURE §5).
 */
const BUYER: PrincipalRef = { principalId: "user-amara", kind: "user" };

function buildIntent(): BuyerCommerceIntent {
  return {
    intentId: "intent-1001",
    buyerRef: BUYER,
    desired: ["desired://camera/mirrorless-x100"],
    hardConstraints: {
      deadline: "2026-11-20T18:00:00.000Z",
      maxTotalCost: money("GHS", "450000"), // GHS 4,500.00 in minor units
      minQuality: { minAverageRating: 4.2, minReviewCount: 25, minCondition: "LIKE_NEW" },
      minSellerCredibility: { minVerifiedTransactions: 40, minDisputeRateCeilingBps: 200 },
      privacyRequirements: ["NO_THIRD_PARTY_SHARING", "MINIMIZE_DATA_COLLECTION"],
      securityRequirements: ["VERIFIED_MERCHANT", "SECURE_PAYMENT_RAIL", "PROOF_OF_DELIVERY"],
      deliveryConstraints: [{ kind: "MAX_LATENCY_HOURS", value: "72" }], // speed, as a hard constraint
      requiredProofLevel: "P2",
      recourseRequired: true,
      groupBuyWillingness: "ACCEPTED",
      tradeWillingness: "REFUSED",
    },
    softPreferences: {
      speedPreference: "CHEAPEST",
      buyVsWaitTolerance: "BUY_NOW",
      financingPreference: "PREPAY",
    },
    statedAt: "2026-11-01T09:00:00.000Z",
  };
}

const COMPLIANT_CANDIDATE: IntentCandidate = {
  candidateRef: "candidate://shop-accra/deal-77",
  totalCost: money("GHS", "431000"),
  estimatedDeliveryAt: "2026-11-04T09:00:00.000Z",
  averageRating: 4.6,
  reviewCount: 118,
  condition: "NEW",
  sellerVerifiedTransactions: 512,
  sellerDisputeRateBps: 45,
  privacyGuarantees: ["NO_THIRD_PARTY_SHARING", "MINIMIZE_DATA_COLLECTION", "ANONYMIZED_COORDINATION"],
  securityGuarantees: ["VERIFIED_MERCHANT", "SECURE_PAYMENT_RAIL", "PROOF_OF_DELIVERY"],
  proofLevel: "P3",
  recourseAvailable: true,
};

describe("scenario 1 — buyer intent constraints", () => {
  it("carries deadline, max cost, quality, privacy, security and speed constraints as typed hard constraints", () => {
    const intent = buildIntent();
    const hard = intent.hardConstraints;
    expect(hard.deadline).toBe("2026-11-20T18:00:00.000Z");
    expect(hard.maxTotalCost).toEqual(money("GHS", "450000"));
    expect(hard.minQuality?.minAverageRating).toBe(4.2);
    expect(hard.minQuality?.minReviewCount).toBe(25);
    expect(hard.minQuality?.minCondition).toBe("LIKE_NEW");
    expect(hard.privacyRequirements).toHaveLength(2);
    expect(hard.securityRequirements).toHaveLength(3);
    expect(hard.deliveryConstraints?.[0]?.kind).toBe("MAX_LATENCY_HOURS");
    expect(hard.requiredProofLevel).toBe("P2");
  });

  it("keeps soft preferences structurally separate from hard constraints", () => {
    const intent = buildIntent();
    expect(intent.softPreferences?.speedPreference).toBe("CHEAPEST");
    expect(Object.hasOwn(intent.hardConstraints, "speedPreference")).toBe(false);
    expect(Object.hasOwn(intent.softPreferences ?? {}, "maxTotalCost")).toBe(false);
  });

  it("accepts a candidate that satisfies every hard constraint", () => {
    const check = checkHardConstraints(buildIntent(), COMPLIANT_CANDIDATE);
    expect(check).toEqual({ satisfied: true });
  });

  it("rejects candidates that exceed the maximum total cost", () => {
    const check = checkHardConstraints(buildIntent(), {
      ...COMPLIANT_CANDIDATE,
      totalCost: money("GHS", "501000"),
    });
    expect(check.satisfied).toBe(false);
    if (!check.satisfied) expect(check.violations).toContain("COST_EXCEEDED");
  });

  it("rejects candidates that arrive after the deadline", () => {
    const check = checkHardConstraints(buildIntent(), {
      ...COMPLIANT_CANDIDATE,
      estimatedDeliveryAt: "2026-11-22T09:00:00.000Z",
    });
    expect(check.satisfied).toBe(false);
    if (!check.satisfied) expect(check.violations).toContain("DEADLINE_EXCEEDED");
  });

  it("rejects candidates that violate the latency (speed) constraint", () => {
    const check = checkHardConstraints(buildIntent(), {
      ...COMPLIANT_CANDIDATE,
      estimatedDeliveryAt: "2026-11-10T09:00:00.000Z", // 216h > 72h after statedAt
    });
    expect(check.satisfied).toBe(false);
    if (!check.satisfied) expect(check.violations).toContain("DELIVERY_LATENCY_EXCEEDED");
  });

  it("fails closed when a hard constraint has no corresponding candidate data", () => {
    const check = checkHardConstraints(buildIntent(), { candidateRef: "candidate://opaque" });
    expect(check.satisfied).toBe(false);
    if (!check.satisfied) expect(check.violations).toContain("MISSING_REQUIRED_DATA");
  });

  it("checks hard constraints BEFORE soft optimization — a soft-optimal candidate that violates a hard constraint is excluded", () => {
    const intent = buildIntent();
    // Cheapest and fastest, but violates the deadline and the proof floor.
    const softOptimalButHardViolating: IntentCandidate = {
      candidateRef: "candidate://gray-importer/deal-1",
      totalCost: money("GHS", "120000"),
      estimatedDeliveryAt: "2026-12-15T09:00:00.000Z",
      averageRating: 4.9,
      reviewCount: 300,
      condition: "NEW",
      sellerVerifiedTransactions: 900,
      sellerDisputeRateBps: 10,
      privacyGuarantees: ["NO_THIRD_PARTY_SHARING", "MINIMIZE_DATA_COLLECTION"],
      securityGuarantees: ["VERIFIED_MERCHANT", "SECURE_PAYMENT_RAIL", "PROOF_OF_DELIVERY"],
      proofLevel: "P0",
      recourseAvailable: true,
    };
    const scored = evaluateIntentCandidates(intent, [softOptimalButHardViolating, COMPLIANT_CANDIDATE]);
    const excluded = scored.find((entry) => entry.candidateRef === softOptimalButHardViolating.candidateRef);
    const survivor = scored.find((entry) => entry.candidateRef === COMPLIANT_CANDIDATE.candidateRef);
    expect(excluded?.hardCheck.satisfied).toBe(false);
    expect(excluded?.softScore).toBeUndefined(); // never soft-scored
    expect(survivor?.hardCheck.satisfied).toBe(true);
    expect(typeof survivor?.softScore).toBe("number");
  });
});
