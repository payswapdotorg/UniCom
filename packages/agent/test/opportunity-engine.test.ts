import { describe, expect, it } from "vitest";
import type { BuyerCommerceIntent, OpportunityObservationSignal, PrincipalRef } from "../src/index.js";
import {
  checkUnknownPreservation,
  generateOpportunityCandidates,
  scoreOpportunityCandidates,
  transitionOpportunityLifecycle,
} from "../src/index.js";

/**
 * W2-003 — Opportunity Engine truth distinctions:
 * - scores/candidates are ESTIMATES, never commerce truth;
 * - UNKNOWN intent fields stay UNKNOWN (no inference-based promotion);
 * - lifecycle transitions are deterministic.
 */

const BUYER: PrincipalRef = { principalId: "user-amara", kind: "user" };

function intent(overrides?: Partial<BuyerCommerceIntent>): BuyerCommerceIntent {
  return {
    intentId: "intent-4001",
    buyerRef: BUYER,
    desired: ["item://sewing-machine"],
    hardConstraints: {
      deadline: "2026-11-20T00:00:00.000Z",
      groupBuyWillingness: "ACCEPTED",
      tradeWillingness: "ACCEPTED",
    },
    softPreferences: { buyVsWaitTolerance: "PREFER_WAIT" },
    statedAt: "2026-11-02T00:00:00.000Z",
    ...overrides,
  };
}

const OPEN_GROUP_BUY: OpportunityObservationSignal = {
  kind: "OPEN_GROUP_BUY",
  signalId: "signal-gb-1",
  subjectRef: "item://sewing-machine",
  groupBuyId: "groupbuy-77",
  terms: {
    minimumParticipants: 3,
    windowOpensAt: "2026-11-01T00:00:00.000Z",
    windowClosesAt: "2026-11-10T00:00:00.000Z",
    discount: { kind: "PERCENTAGE", value: "1500" },
  },
  observedAt: "2026-11-02T00:00:00.000Z",
};

const DEMAND_CLUSTER: OpportunityObservationSignal = {
  kind: "DEMAND_CLUSTER",
  signalId: "signal-dc-1",
  subjectRef: "item://sewing-machine",
  clusterId: "demand-cluster-9",
  estimatedParticipants: 4,
  observedAt: "2026-11-02T00:00:00.000Z",
};

const PRICE_OBSERVATION: OpportunityObservationSignal = {
  kind: "PRICE_OBSERVATION",
  signalId: "signal-po-1",
  subjectRef: "item://sewing-machine",
  currentPrice: { currency: "GHS", minorUnits: "185000" },
  observedAt: "2026-11-02T00:00:00.000Z",
};

describe("candidate generation — estimates with lineage, deterministically ordered", () => {
  it("generates candidates for matching signals with explicit epistemics", () => {
    const generation = generateOpportunityCandidates(intent(), [OPEN_GROUP_BUY, DEMAND_CLUSTER, PRICE_OBSERVATION]);
    expect(generation.candidates.map((seed) => seed.opportunityKind)).toEqual([
      "TRADE",
      "GROUP_PURCHASE",
      "PRICE_DROP_TIMING",
    ]);
    const groupPurchase = generation.candidates[1];
    expect(groupPurchase?.epistemics.kind).toBe("INFERENCE");
    expect(groupPurchase?.matchedSignalIds).toEqual(["signal-gb-1"]);
    expect(groupPurchase?.context?.groupBuyTerms?.minimumParticipants).toBe(3);
    const prediction = generation.candidates[2];
    expect(prediction?.epistemics.kind).toBe("PREDICTION");
    if (prediction?.epistemics.kind === "PREDICTION") {
      expect(prediction.epistemics.confidenceBps).toBe(5_000);
    }
  });

  it("is deterministic on replay — identical inputs, identical output, any signal order", () => {
    const signals = [PRICE_OBSERVATION, DEMAND_CLUSTER, OPEN_GROUP_BUY];
    const runOne = generateOpportunityCandidates(intent(), signals);
    const runTwo = generateOpportunityCandidates(intent(), [OPEN_GROUP_BUY, PRICE_OBSERVATION, DEMAND_CLUSTER]);
    expect(runTwo).toEqual(runOne);
  });

  it("ignores signals whose subject is not desired", () => {
    const offSubject: OpportunityObservationSignal = { ...OPEN_GROUP_BUY, signalId: "signal-other", subjectRef: "item://other" };
    const generation = generateOpportunityCandidates(intent(), [offSubject]);
    expect(generation.candidates).toEqual([]);
    expect(generation.dropped).toEqual([]);
  });
});

describe("UNKNOWN intent fields stay UNKNOWN — no inference-based promotion", () => {
  it("an unstated group-buy willingness yields NO group-buy candidate (and the refusal is auditable)", () => {
    const unstated = intent({ hardConstraints: { deadline: "2026-11-20T00:00:00.000Z" } });
    const generation = generateOpportunityCandidates(unstated, [OPEN_GROUP_BUY]);
    expect(generation.candidates).toEqual([]);
    expect(generation.dropped).toEqual([
      { seedId: "seed:intent-4001:signal-gb-1:GROUP_PURCHASE", promotedFields: ["groupBuyWillingness"] },
    ]);
  });

  it("a REFUSED group-buy willingness yields no candidate and no drop noise", () => {
    const refused = intent({ hardConstraints: { deadline: "2026-11-20T00:00:00.000Z", groupBuyWillingness: "REFUSED" } });
    const generation = generateOpportunityCandidates(refused, [OPEN_GROUP_BUY]);
    expect(generation.candidates).toEqual([]);
    expect(generation.dropped).toEqual([
      { seedId: "seed:intent-4001:signal-gb-1:GROUP_PURCHASE", promotedFields: ["groupBuyWillingness"] },
    ]);
  });

  it("an unstated trade willingness yields no TRADE candidate", () => {
    const unstatedTrade = intent({ hardConstraints: { deadline: "2026-11-20T00:00:00.000Z", groupBuyWillingness: "ACCEPTED" } });
    const generation = generateOpportunityCandidates(unstatedTrade, [DEMAND_CLUSTER]);
    expect(generation.candidates).toEqual([]);
    expect(generation.dropped).toEqual([
      { seedId: "seed:intent-4001:signal-dc-1:TRADE", promotedFields: ["tradeWillingness"] },
    ]);
  });

  it("checkUnknownPreservation is the direct law: KNOWN may only derive from KNOWN", () => {
    expect(
      checkUnknownPreservation({ source: { deadline: "UNKNOWN" }, asserted: { deadline: "KNOWN" } }),
    ).toEqual({ preserved: false, promotedFields: ["deadline"] });
    expect(
      checkUnknownPreservation({ source: { deadline: "UNKNOWN", budget: "KNOWN" }, asserted: { budget: "KNOWN" } }),
    ).toEqual({ preserved: true, promotedFields: [] });
    // Absent assertions never count as promotion:
    expect(
      checkUnknownPreservation({ source: { deadline: "UNKNOWN" }, asserted: {} }),
    ).toEqual({ preserved: true, promotedFields: [] });
  });
});

describe("scoring — integer ESTIMATES, never commerce truth", () => {
  it("scores are estimate-marked with confidence and lineage", () => {
    const generation = generateOpportunityCandidates(intent(), [OPEN_GROUP_BUY, PRICE_OBSERVATION]);
    const scores = scoreOpportunityCandidates(generation.candidates);
    for (const score of scores) {
      expect(score.estimate).toBe(true);
      expect(Number.isInteger(score.estimatePoints)).toBe(true);
      expect(score.confidenceBps).toBeGreaterThanOrEqual(0);
      expect(score.confidenceBps).toBeLessThanOrEqual(10_000);
    }
    // Group purchase with a 15% discount outranks the price-drop prediction.
    expect(scores[0]?.seedId).toContain("GROUP_PURCHASE");
    expect(scores[0]?.estimatePoints).toBeGreaterThan(scores[1]?.estimatePoints ?? 0);
  });

  it("scoring is deterministic on replay", () => {
    const generation = generateOpportunityCandidates(intent(), [OPEN_GROUP_BUY, PRICE_OBSERVATION]);
    expect(scoreOpportunityCandidates(generation.candidates)).toEqual(scoreOpportunityCandidates(generation.candidates));
  });
});

describe("lifecycle — deterministic transition table", () => {
  it("walks the happy path CANDIDATE → … → REALIZED", () => {
    let state = transitionOpportunityLifecycle("CANDIDATE", { type: "SCORE" });
    expect(state).toEqual({ ok: true, next: "SCORED" });
    state = transitionOpportunityLifecycle("SCORED", { type: "PRESENT" });
    expect(state).toEqual({ ok: true, next: "PRESENTED" });
    state = transitionOpportunityLifecycle("PRESENTED", { type: "ACCEPT" });
    expect(state).toEqual({ ok: true, next: "ACCEPTED" });
    state = transitionOpportunityLifecycle("ACCEPTED", { type: "COMMIT" });
    expect(state).toEqual({ ok: true, next: "COMMITTED" });
    state = transitionOpportunityLifecycle("COMMITTED", { type: "REALIZE" });
    expect(state).toEqual({ ok: true, next: "REALIZED" });
    // Terminal:
    expect(transitionOpportunityLifecycle("REALIZED", { type: "RETIRE" })).toEqual({
      ok: false,
      violation: "INVALID_TRANSITION",
    });
  });

  it("refuses commitment without acceptance and realization without commitment", () => {
    expect(transitionOpportunityLifecycle("CANDIDATE", { type: "COMMIT" })).toEqual({
      ok: false,
      violation: "COMMIT_WITHOUT_ACCEPTANCE",
    });
    expect(transitionOpportunityLifecycle("ACCEPTED", { type: "REALIZE" })).toEqual({
      ok: false,
      violation: "REALIZE_WITHOUT_COMMITMENT",
    });
  });

  it("supports the expiry/retirement dissolution paths from any live state", () => {
    for (const state of ["CANDIDATE", "SCORED", "PRESENTED", "ACCEPTED", "COMMITTED"] as const) {
      expect(transitionOpportunityLifecycle(state, { type: "EXPIRE" })).toEqual({ ok: true, next: "EXPIRED" });
      expect(transitionOpportunityLifecycle(state, { type: "RETIRE" })).toEqual({ ok: true, next: "RETIRED" });
    }
  });
});
