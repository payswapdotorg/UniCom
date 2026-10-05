import { describe, expect, it } from "vitest";
import type { AuthorizationDecision, PrincipalRef, TradeOffer } from "../src/index.js";
import {
  authorizeTradeCycleCandidate,
  discoverTradeCycles,
  validateTradeCycle,
} from "../src/index.js";

/**
 * W2-003 acceptance scenario 3 — bounded TradeCycle discovery:
 * - discovery TERMINATES within the hop/work bound on adversarial graph
 *   shapes (rings, cliques, chain floods) — `expansions` is the witness;
 * - NO cycle executes without authorization: candidates carry none, and
 *   validation refuses unauthorized or forged legs.
 * Scenario 7 (replay determinism) is asserted on the same discovery input.
 */

const USER_1: PrincipalRef = { principalId: "user-1", kind: "user" };
const USER_2: PrincipalRef = { principalId: "user-2", kind: "user" };
const USER_3: PrincipalRef = { principalId: "user-3", kind: "user" };

function legAuthBy(ref: PrincipalRef): AuthorizationDecision {
  return { decision: "AUTHORIZED", decidedBy: ref, policyVersion: "policy-1", decidedAt: "2026-11-05T08:00:00.000Z" };
}

function offer(offerId: string, holder: PrincipalRef, offered: string, wanted: string): TradeOffer {
  return { offerId, holderRef: holder, offeredItemRef: offered, wantedItemRef: wanted };
}

const ARCHETYPAL_RING: readonly TradeOffer[] = [
  offer("offer-1", USER_1, "item://y", "item://x"), // User 1 has Y and wants X
  offer("offer-2", USER_2, "item://x", "item://z"), // User 2 has X and wants Z
  offer("offer-3", USER_3, "item://z", "item://y"), // User 3 has Z and wants Y
];

describe("scenario 3 — discovery finds the archetypal three-user cycle", () => {
  it("discovers the cycle, and every leg gives an item to the participant who wants it", () => {
    const result = discoverTradeCycles(ARCHETYPAL_RING, { maxHops: 3, maxExpansions: 10_000, environment: "PRODUCTION" });
    expect(result.truncated).toBe(false);
    expect(result.candidates).toHaveLength(1);
    const candidate = result.candidates[0];
    expect(candidate).toBeDefined();
    if (!candidate) return;
    expect(candidate.hopCount).toBe(3);

    // Legs: U2 gives X to U1 (U1 wants X), U3 gives Z to U2, U1 gives Y to U3.
    const gives = candidate.legs.map((leg) => `${leg.fromRef.principalId}->${leg.toRef.principalId}:${leg.offeredItemRef}`).sort();
    expect(gives).toEqual(["user-1->user-3:item://y", "user-2->user-1:item://x", "user-3->user-2:item://z"]);
    // Canonical rotation: the smallest from-principal leg comes first.
    expect(candidate.legs[0]?.fromRef.principalId).toBe("user-1");
    // Candidates propose only — no authorization is present on any leg.
    expect(candidate.legs.every((leg) => leg.authorization === undefined)).toBe(true);
  });

  it("respects the hop bound — a 3-cycle is not discovered under maxHops 2", () => {
    const result = discoverTradeCycles(ARCHETYPAL_RING, { maxHops: 2, maxExpansions: 10_000, environment: "PRODUCTION" });
    expect(result.candidates).toHaveLength(0);
  });

  it("deduplicates rotations — the same cycle found from every start collapses to one candidate", () => {
    const result = discoverTradeCycles(ARCHETYPAL_RING, { maxHops: 3, maxExpansions: 10_000, environment: "PRODUCTION" });
    const ids = new Set(result.candidates.map((candidate) => candidate.cycleId));
    expect(ids.size).toBe(result.candidates.length);
  });
});

describe("scenario 3 — termination on adversarial graph shapes", () => {
  it("RING: a 60-offer ring terminates, finds exactly one cycle", () => {
    const ring: TradeOffer[] = [];
    for (let index = 0; index < 60; index += 1) {
      ring.push(
        offer(
          `ring-${String(index).padStart(2, "0")}`,
          { principalId: `user-ring-${index}`, kind: "user" },
          `item://ring-${index}`,
          `item://ring-${(index + 1) % 60}`,
        ),
      );
    }
    // Adversarial ordering: reversed input.
    const result = discoverTradeCycles([...ring].reverse(), { maxHops: 60, maxExpansions: 20_000, environment: "PRODUCTION" });
    expect(result.truncated).toBe(false);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.hopCount).toBe(60);
    expect(result.expansions).toBeLessThanOrEqual(20_000);
  });

  it("CLIQUE: a complete 12-item offer graph terminates at the work budget", () => {
    const clique: TradeOffer[] = [];
    for (let from = 0; from < 12; from += 1) {
      for (let to = 0; to < 12; to += 1) {
        if (from === to) continue;
        clique.push(
          offer(
            `clique-${from}-${to}`,
            { principalId: `user-clique-${from}`, kind: "user" },
            `item://c-${from}`,
            `item://c-${to}`,
          ),
        );
      }
    }
    const budget = 5_000;
    const result = discoverTradeCycles(clique, { maxHops: 5, maxExpansions: budget, environment: "PRODUCTION" });
    expect(result.expansions).toBeLessThanOrEqual(budget);
    expect(result.truncated).toBe(true); // hard stop reached — and it DID stop
    // Every candidate found before the stop is still a well-formed cycle.
    for (const candidate of result.candidates) {
      expect(candidate.hopCount).toBeGreaterThanOrEqual(2);
      expect(candidate.hopCount).toBeLessThanOrEqual(5);
    }
    // A generous budget completes the search without truncation.
    const complete = discoverTradeCycles(clique, { maxHops: 3, maxExpansions: 2_000_000, environment: "PRODUCTION" });
    expect(complete.truncated).toBe(false);
    expect(complete.candidates.length).toBeGreaterThan(0);
  });

  it("CHAIN FLOOD: a 4_000-offer acyclic chain terminates quickly", () => {
    const chain: TradeOffer[] = [];
    for (let index = 0; index < 4_000; index += 1) {
      chain.push(
        offer(
          `chain-${index}`,
          { principalId: `user-chain-${index}`, kind: "user" },
          `item://chain-${index}`,
          `item://chain-${index + 1}`,
        ),
      );
    }
    const result = discoverTradeCycles(chain, { maxHops: 8, maxExpansions: 60_000, environment: "PRODUCTION" });
    expect(result.truncated).toBe(false);
    expect(result.candidates).toHaveLength(0); // no cycle exists
    expect(result.expansions).toBeLessThanOrEqual(60_000);
  });

  it("terminates on an empty offer set", () => {
    const result = discoverTradeCycles([], { maxHops: 4, maxExpansions: 100, environment: "PRODUCTION" });
    expect(result).toEqual({ candidates: [], expansions: 0, truncated: false });
  });
});

describe("scenario 3 — no cycle executes without authorization", () => {
  const discovery = () =>
    discoverTradeCycles(ARCHETYPAL_RING, { maxHops: 3, maxExpansions: 10_000, environment: "PRODUCTION" });

  it("a raw discovered candidate is not a valid executable cycle (legs unauthorized)", () => {
    const candidate = discovery().candidates[0];
    expect(candidate).toBeDefined();
    if (!candidate) return;
    const cycle = authorizeTradeCycleCandidate({
      candidate,
      authorizationsByHolder: {}, // nobody authorized
      requiredProofLevel: "P2",
    });
    const validation = validateTradeCycle(cycle);
    expect(validation.valid).toBe(false);
    if (!validation.valid) expect(validation.violations).toContain("LEG_UNAUTHORIZED");
  });

  it("partial authorization is still refused", () => {
    const candidate = discovery().candidates[0];
    if (!candidate) return;
    const cycle = authorizeTradeCycleCandidate({
      candidate,
      authorizationsByHolder: { "user-1": legAuthBy(USER_1), "user-2": legAuthBy(USER_2) },
      requiredProofLevel: "P2",
    });
    const validation = validateTradeCycle(cycle);
    expect(validation.valid).toBe(false);
    if (!validation.valid) expect(validation.violations).toContain("LEG_UNAUTHORIZED");
  });

  it("foreign authorization is refused as a mismatch (no forgery)", () => {
    const candidate = discovery().candidates[0];
    if (!candidate) return;
    const cycle = authorizeTradeCycleCandidate({
      candidate,
      authorizationsByHolder: {
        "user-1": legAuthBy(USER_1),
        "user-2": legAuthBy(USER_2),
        // USER_1 cannot authorize USER_3's leg.
        "user-3": legAuthBy(USER_1),
      },
      requiredProofLevel: "P2",
    });
    const validation = validateTradeCycle(cycle);
    expect(validation.valid).toBe(false);
    if (!validation.valid) {
      expect(validation.violations).toContain("LEG_AUTHORIZATION_MISMATCH");
    }
  });

  it("full per-leg authorization by each giving participant yields a valid cycle", () => {
    const candidate = discovery().candidates[0];
    if (!candidate) return;
    const cycle = authorizeTradeCycleCandidate({
      candidate,
      authorizationsByHolder: {
        "user-1": legAuthBy(USER_1),
        "user-2": legAuthBy(USER_2),
        "user-3": legAuthBy(USER_3),
      },
      requiredProofLevel: "P2",
    });
    expect(validateTradeCycle(cycle)).toEqual({ valid: true });
  });
});

describe("scenario 7 — discovery replay determinism", () => {
  it("identical inputs produce identical candidates, expansions and truncation on replay", () => {
    const run = () =>
      discoverTradeCycles([...ARCHETYPAL_RING].reverse(), { maxHops: 3, maxExpansions: 10_000, environment: "PRODUCTION" });
    expect(run()).toEqual(run());
  });

  it("adversarial clique replay is deterministic under the same budget", () => {
    const clique: TradeOffer[] = [];
    for (let from = 0; from < 8; from += 1) {
      for (let to = 0; to < 8; to += 1) {
        if (from === to) continue;
        clique.push(offer(`q-${from}-${to}`, { principalId: `user-q-${from}`, kind: "user" }, `item://q-${from}`, `item://q-${to}`));
      }
    }
    const run = () => discoverTradeCycles(clique, { maxHops: 4, maxExpansions: 3_000, environment: "PRODUCTION" });
    expect(run()).toEqual(run());
  });
});
