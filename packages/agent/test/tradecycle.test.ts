import { describe, expect, it } from "vitest";
import type { AuthorizationDecision, TradeCycle, TradeCycleLeg } from "../src/index.js";
import { validateTradeCycle } from "../src/index.js";

/**
 * Acceptance scenario 4 — bounded three-user TradeCycle.
 * User 1 has Y and wants X. User 2 has X and wants Z. User 3 has Z and wants Y.
 * Every participant independently authorizes its own leg; production search
 * is bounded in hop count (FROZEN-ARCHITECTURE §7, §22.2; invariants 19/20/44).
 */

const USER_1 = { principalId: "user-1", kind: "user" } as const;
const USER_2 = { principalId: "user-2", kind: "user" } as const;
const USER_3 = { principalId: "user-3", kind: "user" } as const;

function legAuthBy(ref: typeof USER_1): AuthorizationDecision {
  return { decision: "AUTHORIZED", decidedBy: ref, policyVersion: "policy-1", decidedAt: "2026-11-05T08:00:00.000Z" };
}

function buildLegs(): TradeCycleLeg[] {
  return [
    { legIndex: 0, fromRef: USER_1, toRef: USER_2, offeredItemRef: "owned://user-1/item-y", authorization: legAuthBy(USER_1), requiredProofLevel: "P2" },
    { legIndex: 1, fromRef: USER_2, toRef: USER_3, offeredItemRef: "owned://user-2/item-x", authorization: legAuthBy(USER_2), requiredProofLevel: "P2" },
    { legIndex: 2, fromRef: USER_3, toRef: USER_1, offeredItemRef: "owned://user-3/item-z", authorization: legAuthBy(USER_3), requiredProofLevel: "P2" },
  ];
}

function buildCycle(legs: TradeCycleLeg[], maxHops = 3): TradeCycle {
  return {
    tradeCycleId: "tradecycle-42",
    legs,
    executionMode: "ATOMIC",
    bounds: { maxHops, environment: "PRODUCTION" },
  };
}

describe("scenario 4 — bounded three-user trade cycle", () => {
  it("validates a fully authorized three-hop cycle within the production hop bound", () => {
    const result = validateTradeCycle(buildCycle(buildLegs()));
    expect(result).toEqual({ valid: true });
  });

  it("enforces the hop bound — a cycle longer than maxHops is rejected", () => {
    const result = validateTradeCycle(buildCycle(buildLegs(), 2));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.violations).toContain("HOP_BOUND_EXCEEDED");
  });

  it("rejects a cycle when any leg lacks independent authorization", () => {
    const legs = buildLegs();
    const withoutLegAuth = legs.map((leg, index) => (index === 1 ? { ...leg, authorization: undefined } : leg));
    const result = validateTradeCycle(buildCycle(withoutLegAuth));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.violations).toContain("LEG_UNAUTHORIZED");
  });

  it("rejects a leg authorized by someone other than the leg's own giving participant", () => {
    const legs = buildLegs();
    // Leg 2 belongs to USER_3, but USER_1 (a different participant) signed it.
    const forged = legs.map((leg, index) => (index === 2 ? { ...leg, authorization: legAuthBy(USER_1) } : leg));
    const result = validateTradeCycle(buildCycle(forged));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.violations).toContain("LEG_AUTHORIZATION_MISMATCH");
  });

  it("rejects a cycle that does not close", () => {
    const legs = buildLegs();
    const broken = legs.map((leg, index) => (index === 2 ? { ...leg, toRef: USER_2 } : leg));
    const result = validateTradeCycle(buildCycle(broken));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.violations).toContain("CYCLE_NOT_CLOSED");
  });

  it("rejects staged execution declared without an explicit recourse plan", () => {
    const staged = { ...buildCycle(buildLegs()), executionMode: "STAGED_WITH_RECOURSE" as const };
    const result = validateTradeCycle(staged);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.violations).toContain("STAGED_WITHOUT_RECOURSE");

    const stagedWithRecourse = { ...staged, recoursePlanRef: "recourse://tradecycle-42/plan" };
    expect(validateTradeCycle(stagedWithRecourse)).toEqual({ valid: true });
  });

  it("requires a proof level on every leg (proof-carrying cycle)", () => {
    const legs = buildLegs().map((leg, index) =>
      index === 0 ? { ...leg, requiredProofLevel: undefined } : leg,
    ) as TradeCycleLeg[];
    const result = validateTradeCycle(buildCycle(legs));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.violations).toContain("MISSING_PROOF_REQUIREMENT");
  });
});
