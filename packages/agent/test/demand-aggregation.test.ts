import { describe, expect, it } from "vitest";
import type { BuyerCommerceIntent, PrincipalRef } from "../src/index.js";
import {
  aggregateMerchantDemand,
  DEFAULT_MINIMUM_ANONYMITY_COUNT,
  findRawIntentLeaks,
  proposeDemandGeneratedGroupBuy,
} from "../src/index.js";

/**
 * W2-003 acceptance scenario 2 — merchant demand-generated GroupBuy:
 * aggregated demand produces the merchant-visible opportunity with ZERO raw
 * buyer-intent fields crossing the boundary. Asserted structurally by
 * `findRawIntentLeaks`, not by convention.
 */

const MERCHANT: PrincipalRef = { principalId: "merchant-makola", kind: "merchant" };
const COORDINATOR: PrincipalRef = { principalId: "agent:unicom:buyer-side", kind: "agent" };

function buyerIntent(index: number, overrides?: Partial<BuyerCommerceIntent>): BuyerCommerceIntent {
  const buyers: PrincipalRef[] = [
    { principalId: "user-amara", kind: "user" },
    { principalId: "user-kwesi", kind: "user" },
    { principalId: "user-abena", kind: "user" },
    { principalId: "user-nana", kind: "user" },
    { principalId: "user-afi", kind: "user" },
    { principalId: "user-yaw", kind: "user" },
    { principalId: "user-eshun", kind: "user" },
  ];
  return {
    intentId: `intent-30${index}`,
    buyerRef: buyers[index] ?? { principalId: `user-${index}`, kind: "user" },
    desired: index % 3 === 0 ? ["item://sewing-machine", "item://fabric-bundle"] : ["item://sewing-machine"],
    hardConstraints: {
      deadline: `2026-11-${String(10 + (index % 5)).padStart(2, "0")}T00:00:00.000Z`,
      maxTotalCost: { currency: "GHS", minorUnits: String(200_000 + index * 25_000) },
      privacyRequirements: index % 2 === 0 ? ["MINIMIZE_DATA_COLLECTION"] : ["ANONYMIZED_COORDINATION"],
      groupBuyWillingness: "ACCEPTED",
    },
    statedAt: `2026-11-0${1 + (index % 3)}T0${index % 10}:00:00.000Z`,
    ...overrides,
  };
}

const SEVEN_INTENTS: readonly BuyerCommerceIntent[] = [0, 1, 2, 3, 4, 5, 6].map((index) => buyerIntent(index));

describe("scenario 2 — aggregate demand into a merchant-visible opportunity", () => {
  it("aggregates >= k intents into an INFERENCE-grade demand opportunity", () => {
    const outcome = aggregateMerchantDemand(SEVEN_INTENTS, { minimumAnonymityCount: 3 });
    expect(outcome.status).toBe("AGGREGATED");
    if (outcome.status !== "AGGREGATED") return;
    const view = outcome.opportunity.merchantVisible;
    expect(view.aggregateParticipantCount).toBe(7);
    expect(view.opaqueItemRefs).toEqual(["item://fabric-bundle", "item://sewing-machine"]);
    expect(view.epistemics.kind).toBe("INFERENCE");
    expect(view.interestWindow.opensOn).toBe("2026-11-01");
  });

  it("suppresses the whole projection below the anonymity count — nothing crosses", () => {
    const outcome = aggregateMerchantDemand(SEVEN_INTENTS.slice(0, 2), { minimumAnonymityCount: 3 });
    expect(outcome).toEqual({ status: "SUPPRESSED", reason: "INSUFFICIENT_ANONYMITY", sourceIntentCount: 2 });
  });

  it("emits an order-statistic price band with k-support at both endpoints", () => {
    const outcome = aggregateMerchantDemand(SEVEN_INTENTS, { minimumAnonymityCount: 3 });
    expect(outcome.status).toBe("AGGREGATED");
    if (outcome.status !== "AGGREGATED") return;
    const priceBand = outcome.opportunity.merchantVisible.priceBand;
    expect("suppressed" in priceBand).toBe(false);
    if ("suppressed" in priceBand) return;
    // Budgets: 200k..350k minor units, k=3 → floor = 3rd smallest (250k),
    // ceiling = 3rd largest (300k). Each endpoint has >= 3 budgets at/beyond.
    expect(priceBand.currency).toBe("GHS");
    expect(priceBand.floorMinorUnits).toBe("250000");
    expect(priceBand.ceilingMinorUnits).toBe("300000");
  });

  it("suppresses the price band when priced support is below 2k-1", () => {
    const mixed = SEVEN_INTENTS.map((intent, index) =>
      index < 3 ? intent : { ...intent, hardConstraints: { ...intent.hardConstraints, maxTotalCost: undefined } },
    );
    const outcome = aggregateMerchantDemand(mixed, { minimumAnonymityCount: 3 });
    expect(outcome.status).toBe("AGGREGATED");
    if (outcome.status !== "AGGREGATED") return;
    expect(outcome.opportunity.merchantVisible.priceBand).toEqual({ suppressed: "INSUFFICIENT_SUPPORT" });
    expect(outcome.opportunity.disclosure.suppressedPaths).toContain("merchantVisible.priceBand");
  });
});

describe("scenario 2 — ZERO raw buyer-intent fields cross the boundary (asserted)", () => {
  it("the merchant view leaks no identity, no per-buyer constraints, no undisclosed paths", () => {
    const outcome = aggregateMerchantDemand(SEVEN_INTENTS, { minimumAnonymityCount: DEFAULT_MINIMUM_ANONYMITY_COUNT });
    expect(outcome.status).toBe("AGGREGATED");
    if (outcome.status !== "AGGREGATED") return;
    const leaks = findRawIntentLeaks(outcome.opportunity.merchantVisible, SEVEN_INTENTS, {
      minimumAnonymityCount: DEFAULT_MINIMUM_ANONYMITY_COUNT,
    });
    expect(leaks).toEqual([]);
  });

  it("no buyer principal id or intent id appears anywhere in the serialized view", () => {
    const outcome = aggregateMerchantDemand(SEVEN_INTENTS, { minimumAnonymityCount: 3 });
    expect(outcome.status).toBe("AGGREGATED");
    if (outcome.status !== "AGGREGATED") return;
    const serialized = JSON.stringify(outcome.opportunity.merchantVisible);
    for (const intent of SEVEN_INTENTS) {
      expect(serialized).not.toContain(intent.buyerRef.principalId);
      expect(serialized).not.toContain(intent.intentId);
      expect(serialized).not.toContain(intent.hardConstraints.deadline ?? "none");
      expect(serialized).not.toContain("MINIMIZE_DATA_COLLECTION");
      expect(serialized).not.toContain("ANONYMIZED_COORDINATION");
    }
  });

  it("the leak detector has teeth: a forged view carrying a buyer identity is flagged", () => {
    const outcome = aggregateMerchantDemand(SEVEN_INTENTS, { minimumAnonymityCount: 3 });
    expect(outcome.status).toBe("AGGREGATED");
    if (outcome.status !== "AGGREGATED") return;
    const forged = {
      ...outcome.opportunity.merchantVisible,
      buyerId: "user-amara", // raw identity smuggled across the boundary
      deadlineHint: "2026-11-12T00:00:00.000Z", // raw per-buyer constraint smuggled
    };
    const leaks = findRawIntentLeaks(forged, SEVEN_INTENTS, { minimumAnonymityCount: 3 });
    expect(leaks.some((leak) => leak.how === "IDENTITY_MATERIAL")).toBe(true);
    expect(leaks.some((leak) => leak.how === "UNDISCLOSED_PATH" && leak.path.includes("deadlineHint"))).toBe(true);
  });

  it("the leak detector flags a band endpoint without k-support", () => {
    const outcome = aggregateMerchantDemand(SEVEN_INTENTS, { minimumAnonymityCount: 3 });
    expect(outcome.status).toBe("AGGREGATED");
    if (outcome.status !== "AGGREGATED") return;
    const priceBand = outcome.opportunity.merchantVisible.priceBand;
    if ("suppressed" in priceBand) throw new Error("expected an emitted band");
    // 350000 is ONE buyer's exact budget — a hand-narrowed band endpoint.
    const narrowed = { ...outcome.opportunity.merchantVisible, priceBand: { ...priceBand, ceilingMinorUnits: "350000" } };
    const leaks = findRawIntentLeaks(narrowed, SEVEN_INTENTS, { minimumAnonymityCount: 3 });
    expect(leaks).toContainEqual({
      path: "$.merchantVisible.priceBand.ceilingMinorUnits",
      value: "350000",
      how: "AGGREGATE_SUPPORT_BELOW_ANONYMITY_COUNT",
    });
  });
});

describe("scenario 2 — demand becomes a merchant group-buy proposal", () => {
  it("proposes a group-buy referencing only the aggregate demand cluster", () => {
    const outcome = aggregateMerchantDemand(SEVEN_INTENTS, { minimumAnonymityCount: 3 });
    expect(outcome.status).toBe("AGGREGATED");
    if (outcome.status !== "AGGREGATED") return;
    const proposal = proposeDemandGeneratedGroupBuy({
      demand: outcome.opportunity,
      fromRef: COORDINATOR,
      merchantRef: MERCHANT,
      proposedTerms: {
        minimumParticipants: 5,
        windowOpensAt: "2026-11-06T00:00:00.000Z",
        windowClosesAt: "2026-11-16T00:00:00.000Z",
        discount: { kind: "PERCENTAGE", value: "1500" },
      },
      at: "2026-11-05T00:00:00.000Z",
    });
    expect(proposal.merchantRef.principalId).toBe(MERCHANT.principalId);
    expect(proposal.demandClusterId).toBe(outcome.opportunity.demandId);
    const serialized = JSON.stringify(proposal);
    for (const intent of SEVEN_INTENTS) {
      expect(serialized).not.toContain(intent.buyerRef.principalId);
      expect(serialized).not.toContain(intent.intentId);
    }
  });
});
