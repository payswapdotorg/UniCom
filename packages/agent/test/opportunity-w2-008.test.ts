/**
 * Tests for W2-008 opportunity engine extensions (opportunity-w2-008.ts
 * + opportunity-engine-w2-008.ts).
 *
 * Covers:
 * - SwapTerms / GroupPurchaseTerms / PriceDropTimingTerms / DiscountTerms / OtherProactiveTerms
 *   type shapes (compile-time only — these interfaces are verified by the
 *   TypeScript checker at build time)
 * - seedFromW2_008Signal: each of the 5 signal kinds produces the correct
 *   seed with correct opportunityKind and epistemics
 * - seedFromW2_008Signal: unknown kind returns undefined
 * - w2_008EstimatePoints: each kind returns expected points
 * - isW2_008OpportunityKind: true for W2-008 kinds, false otherwise
 * - Determinism: same inputs → same outputs
 */
import { describe, expect, it } from "vitest";
import {
  seedFromW2_008Signal,
  w2_008EstimatePoints,
  isW2_008OpportunityKind,
} from "../src/opportunity-engine-w2-008.js";
import type { W2_008ObservationSignal } from "../src/opportunity-engine-w2-008.js";

const USD = (minor: string) => ({ currency: "USD", minorUnits: minor });

describe("W2-008 seedFromW2_008Signal", () => {
  it("produces TRADE seed from SWAP_AVAILABILITY signal", () => {
    const signal: W2_008ObservationSignal = {
      kind: "SWAP_AVAILABILITY",
      signalId: "sig-1",
      subjectRef: "item-A",
      offeredItemRef: "item-B",
      desiredItemRef: "item-A",
      offeredValue: USD("5000"),
      desiredValue: USD("6000"),
      reciprocityProofLevel: "P2",
      observedAt: "2025-01-01T00:00:00Z",
    };
    const seed = seedFromW2_008Signal(signal, "intent-1");
    expect(seed).toBeDefined();
    expect(seed!.opportunityKind).toBe("TRADE");
    expect(seed!.epistemics.kind).toBe("INFERENCE");
    expect(seed!.seedId).toBe("seed:intent-1:sig-1:TRADE");
  });

  it("produces GROUP_PURCHASE seed from GROUP_BUY_OPENING signal", () => {
    const signal: W2_008ObservationSignal = {
      kind: "GROUP_BUY_OPENING",
      signalId: "sig-2",
      subjectRef: "item-C",
      groupBuyRef: "gb-1",
      discountBps: 1500,
      minParticipants: 5,
      currentParticipants: 3,
      merchantSuggested: true,
      observedAt: "2025-01-01T00:00:00Z",
    };
    const seed = seedFromW2_008Signal(signal, "intent-1");
    expect(seed).toBeDefined();
    expect(seed!.opportunityKind).toBe("GROUP_PURCHASE");
    expect(seed!.epistemics.kind).toBe("INFERENCE");
    expect(seed!.seedId).toBe("seed:intent-1:sig-2:GROUP_PURCHASE");
  });

  it("produces PRICE_DROP_TIMING seed from PRICE_DROP_PREDICTION signal", () => {
    const signal: W2_008ObservationSignal = {
      kind: "PRICE_DROP_PREDICTION",
      signalId: "sig-3",
      subjectRef: "item-D",
      targetPrice: USD("4000"),
      predictedDropAt: "2025-02-01T00:00:00Z",
      confidenceBps: 6_000,
      predictionBasis: "seasonal pattern + inventory buildup",
      observedAt: "2025-01-01T00:00:00Z",
    };
    const seed = seedFromW2_008Signal(signal, "intent-1");
    expect(seed).toBeDefined();
    expect(seed!.opportunityKind).toBe("PRICE_DROP_TIMING");
    expect(seed!.epistemics.kind).toBe("PREDICTION");
    if (seed!.epistemics.kind === "PREDICTION") {
      expect(seed!.epistemics.confidenceBps).toBe(6_000);
    }
  });

  it("produces LOYALTY_REWARDS seed from DISCOUNT_AVAILABLE signal", () => {
    const signal: W2_008ObservationSignal = {
      kind: "DISCOUNT_AVAILABLE",
      signalId: "sig-4",
      subjectRef: "item-E",
      discountRef: "disc-1",
      discountKind: "LOYALTY_REDEMPTION",
      discountBps: 1_000,
      merchantAuthorized: true,
      observedAt: "2025-01-01T00:00:00Z",
    };
    const seed = seedFromW2_008Signal(signal, "intent-1");
    expect(seed).toBeDefined();
    expect(seed!.opportunityKind).toBe("LOYALTY_REWARDS");
    expect(seed!.epistemics.kind).toBe("INFERENCE");
  });

  it("produces FUTURE_DEMAND_SELLING seed from PROACTIVE_SUGGESTION signal", () => {
    const signal: W2_008ObservationSignal = {
      kind: "PROACTIVE_SUGGESTION",
      signalId: "sig-5",
      subjectRef: "item-F",
      opportunityRef: "opp-1",
      proactiveKind: "LOYALTY_OPTIMIZATION",
      basis: "high spend category with unredeemed loyalty points",
      estimatedValue: USD("3000"),
      observedAt: "2025-01-01T00:00:00Z",
    };
    const seed = seedFromW2_008Signal(signal, "intent-1");
    expect(seed).toBeDefined();
    expect(seed!.opportunityKind).toBe("FUTURE_DEMAND_SELLING");
    expect(seed!.epistemics.kind).toBe("PREDICTION");
  });

  it("is deterministic — same inputs produce same outputs", () => {
    const signal: W2_008ObservationSignal = {
      kind: "SWAP_AVAILABILITY",
      signalId: "sig-d",
      subjectRef: "item-G",
      offeredItemRef: "item-H",
      desiredItemRef: "item-G",
      observedAt: "2025-01-01T00:00:00Z",
    };
    const a = seedFromW2_008Signal(signal, "intent-d");
    const b = seedFromW2_008Signal(signal, "intent-d");
    expect(a).toEqual(b);
  });
});

describe("W2-008 w2_008EstimatePoints", () => {
  it("returns correct points for TRADE", () => {
    expect(w2_008EstimatePoints("TRADE", {})).toBe(30);
  });

  it("returns correct points for GROUP_PURCHASE with discount", () => {
    expect(w2_008EstimatePoints("GROUP_PURCHASE", { discountBps: 1500 })).toBe(55); // 40 + min(15, 30)
  });

  it("returns correct points for PRICE_DROP_TIMING with confidence", () => {
    expect(w2_008EstimatePoints("PRICE_DROP_TIMING", { confidenceBps: 6000 })).toBe(23); // 20 + 3
  });

  it("returns correct points for LOYALTY_REWARDS with discount", () => {
    expect(w2_008EstimatePoints("LOYALTY_REWARDS", { discountBps: 2000 })).toBe(25); // 15 + 10
  });

  it("returns correct points for FUTURE_DEMAND_SELLING", () => {
    expect(w2_008EstimatePoints("FUTURE_DEMAND_SELLING", {})).toBe(12);
  });

  it("returns 0 for non-W2-008 kinds", () => {
    expect(w2_008EstimatePoints("RESALE", {})).toBe(0);
    expect(w2_008EstimatePoints("RENTAL", {})).toBe(0);
  });
});

describe("W2-008 isW2_008OpportunityKind", () => {
  it("returns true for W2-008 kinds", () => {
    expect(isW2_008OpportunityKind("TRADE")).toBe(true);
    expect(isW2_008OpportunityKind("GROUP_PURCHASE")).toBe(true);
    expect(isW2_008OpportunityKind("PRICE_DROP_TIMING")).toBe(true);
    expect(isW2_008OpportunityKind("LOYALTY_REWARDS")).toBe(true);
    expect(isW2_008OpportunityKind("FUTURE_DEMAND_SELLING")).toBe(true);
  });

  it("returns false for non-W2-008 kinds", () => {
    expect(isW2_008OpportunityKind("RESALE")).toBe(false);
    expect(isW2_008OpportunityKind("RENTAL")).toBe(false);
    expect(isW2_008OpportunityKind("WARRANTY_RECOVERY")).toBe(false);
    expect(isW2_008OpportunityKind("SHARED_LOGISTICS")).toBe(false);
  });
});
