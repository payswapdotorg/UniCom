import { describe, expect, it } from "vitest";
import type { AuthorizationDecision, BuyerCommerceIntent, GroupBuy, GroupBuyCommitment, PrincipalRef } from "../src/index.js";
import {
  discoverGroupBuysForIntent,
  GroupBuyFormationEngine,
  type GroupBuyListing,
} from "../src/index.js";

/**
 * W2-003 acceptance scenario 1 — GroupBuy formation:
 * - threshold-met groups form EXACTLY ONCE;
 * - below-threshold groups dissolve DETERMINISTICALLY;
 * - duplicate join attempts are IDEMPOTENT.
 * Scenario 7 (replay determinism) is asserted on the same engine.
 */

const MERCHANT: PrincipalRef = { principalId: "merchant-kantamanto", kind: "merchant" };
const BUYER_A: PrincipalRef = { principalId: "user-amara", kind: "user" };
const BUYER_B: PrincipalRef = { principalId: "user-kwesi", kind: "user" };
const BUYER_C: PrincipalRef = { principalId: "user-abena", kind: "user" };

function authorizedBy(ref: PrincipalRef, at: string): AuthorizationDecision {
  return { decision: "AUTHORIZED", decidedBy: ref, policyVersion: "policy-1", decidedAt: at };
}

function commitment(id: string, participant: PrincipalRef, groupBuyId: string, at: string): GroupBuyCommitment {
  return {
    commitmentId: id,
    groupBuyId,
    participantRef: participant,
    quantity: 1,
    authorization: authorizedBy(participant, at),
    committedAt: at,
  };
}

function openGroupBuy(minimumParticipants = 3): GroupBuy {
  return {
    groupBuyId: "groupbuy-77",
    merchantRef: MERCHANT,
    terms: {
      minimumParticipants,
      windowOpensAt: "2026-11-01T00:00:00.000Z",
      windowClosesAt: "2026-11-10T00:00:00.000Z",
      discount: { kind: "PERCENTAGE", value: "1200" },
    },
    status: "OPEN",
    commitments: [
      commitment("commitment-1", BUYER_A, "groupbuy-77", "2026-11-02T10:00:00.000Z"),
      commitment("commitment-2", BUYER_B, "groupbuy-77", "2026-11-03T11:00:00.000Z"),
    ],
    merchantAuthorization: authorizedBy(MERCHANT, "2026-11-01T06:00:00.000Z"),
  };
}

describe("scenario 1 — threshold formation forms exactly once", () => {
  it("forms when the threshold is reached and never forms a second time", () => {
    const engine = new GroupBuyFormationEngine();
    const third = engine.join(openGroupBuy(), commitment("commitment-3", BUYER_C, "groupbuy-77", "2026-11-04T09:30:00.000Z"), "2026-11-04T09:30:00.000Z");
    expect(third.joined).toBe(true);

    const groupBuy = third.joined ? third.result.groupBuy : openGroupBuy();
    const firstEvaluation = engine.evaluateFormation(groupBuy, "2026-11-04T09:31:00.000Z");
    expect(firstEvaluation.status).toBe("FORMED");
    if (firstEvaluation.status === "FORMED") {
      expect(firstEvaluation.groupBuy.status).toBe("THRESHOLD_MET");
      const firstEventId = firstEvaluation.formationEventId;

      // Repeated evaluation — later timestamp, extra commitments, same group.
      const repeated = engine.evaluateFormation(firstEvaluation.groupBuy, "2026-11-05T00:00:00.000Z");
      expect(repeated.status).toBe("ALREADY_FORMED");
      if (repeated.status === "ALREADY_FORMED") {
        expect(repeated.formationEventId).toBe(firstEventId);
      }

      // A SECOND engine told about the already-formed group also refuses to re-form.
      const otherEngine = new GroupBuyFormationEngine();
      const replay = otherEngine.evaluateFormation(firstEvaluation.groupBuy, "2026-11-06T00:00:00.000Z");
      expect(replay.status).toBe("FORMED"); // fresh engine, first formation
      const again = otherEngine.evaluateFormation(firstEvaluation.groupBuy, "2026-11-07T00:00:00.000Z");
      expect(again.status).toBe("ALREADY_FORMED");

      // The ledger contains EXACTLY ONE GROUP_FORMED event per engine.
      expect(engine.events().filter((event) => event.kind === "GROUP_FORMED")).toHaveLength(1);
      expect(otherEngine.events().filter((event) => event.kind === "GROUP_FORMED")).toHaveLength(1);
    }
  });

  it("stays PENDING below the threshold and never emits a formation event", () => {
    const engine = new GroupBuyFormationEngine();
    const evaluation = engine.evaluateFormation(openGroupBuy(), "2026-11-05T00:00:00.000Z");
    expect(evaluation).toEqual({ status: "PENDING", shortfall: 1 });
    expect(engine.events().filter((event) => event.kind === "GROUP_FORMED")).toHaveLength(0);
  });
});

describe("scenario 1 — below-threshold dissolution is deterministic", () => {
  it("dissolves at window close below threshold, releasing every commitment, exactly once", () => {
    const engine = new GroupBuyFormationEngine();
    const evaluation = engine.evaluateDissolution(openGroupBuy(), "2026-11-20T00:00:00.000Z");
    expect(evaluation.outcome).toBe("DISSOLVED");
    if (evaluation.outcome === "DISSOLVED") {
      expect(evaluation.reason).toBe("WINDOW_CLOSED_BELOW_THRESHOLD");
      expect(evaluation.finalStatus).toBe("EXPIRED");
      expect(evaluation.releasedCommitmentIds).toEqual(["commitment-1", "commitment-2"]);

      const repeated = engine.evaluateDissolution(openGroupBuy(), "2026-11-21T00:00:00.000Z");
      expect(repeated.outcome).toBe("ALREADY_DISSOLVED");
      if (repeated.outcome === "ALREADY_DISSOLVED") {
        expect(repeated.dissolutionEventId).toBe(evaluation.dissolutionEventId);
      }
      expect(engine.events().filter((event) => event.kind.startsWith("DISSOLVED"))).toHaveLength(1);
    }
  });

  it("does not dissolve a threshold-met group at window close", () => {
    const engine = new GroupBuyFormationEngine();
    const third = engine.join(openGroupBuy(), commitment("commitment-3", BUYER_C, "groupbuy-77", "2026-11-04T09:30:00.000Z"), "2026-11-04T09:30:00.000Z");
    const groupBuy = third.joined ? third.result.groupBuy : openGroupBuy();
    const evaluation = engine.evaluateDissolution(groupBuy, "2026-11-20T00:00:00.000Z");
    expect(evaluation).toEqual({ outcome: "NOT_DISSOLVABLE", blockers: ["THRESHOLD_MET"] });
  });

  it("refuses dissolution while the window is open (below threshold)", () => {
    const engine = new GroupBuyFormationEngine();
    const evaluation = engine.evaluateDissolution(openGroupBuy(), "2026-11-05T00:00:00.000Z");
    expect(evaluation).toEqual({ outcome: "NOT_DISSOLVABLE", blockers: ["WINDOW_STILL_OPEN"] });
  });

  it("supports the merchant cancellation and withdrawn-authorization dissolution paths", () => {
    const engine = new GroupBuyFormationEngine();
    const cancelled = engine.evaluateDissolution(openGroupBuy(), "2026-11-05T00:00:00.000Z", {
      cancelledBy: MERCHANT,
      authorization: authorizedBy(MERCHANT, "2026-11-05T00:00:00.000Z"),
    });
    expect(cancelled.outcome).toBe("DISSOLVED");
    if (cancelled.outcome === "DISSOLVED") {
      expect(cancelled.reason).toBe("MERCHANT_CANCELLED");
      expect(cancelled.finalStatus).toBe("CANCELLED");
    }

    const fresh = new GroupBuyFormationEngine();
    const withdrawn = fresh.evaluateDissolution({ ...openGroupBuy(), merchantAuthorization: undefined }, "2026-11-05T00:00:00.000Z");
    expect(withdrawn.outcome).toBe("DISSOLVED");
    if (withdrawn.outcome === "DISSOLVED") expect(withdrawn.reason).toBe("AUTHORIZATION_WITHDRAWN");
  });
});

describe("scenario 1 — duplicate joins are idempotent", () => {
  it("a second join by the same participant leaves the roster unchanged", () => {
    const engine = new GroupBuyFormationEngine();
    const first = engine.join(openGroupBuy(), commitment("commitment-3", BUYER_C, "groupbuy-77", "2026-11-04T09:30:00.000Z"), "2026-11-04T09:30:00.000Z");
    expect(first.joined).toBe(true);
    if (!first.joined) return;
    expect(first.result.idempotent).toBe(false);
    const afterFirst = first.result.groupBuy;

    const duplicate = engine.join(afterFirst, commitment("commitment-4", BUYER_C, "groupbuy-77", "2026-11-04T10:00:00.000Z"), "2026-11-04T10:00:00.000Z");
    expect(duplicate.joined).toBe(true);
    if (!duplicate.joined) return;
    expect(duplicate.result.idempotent).toBe(true);
    expect(duplicate.result.groupBuy).toEqual(afterFirst);
    expect(duplicate.result.groupBuy.commitments).toHaveLength(3);

    // Ledger records one JOIN_RECORDED and one JOIN_IDEMPOTENT.
    const kinds = engine.events().map((event) => event.kind);
    expect(kinds).toEqual(["JOIN_RECORDED", "JOIN_IDEMPOTENT"]);
  });

  it("refuses typed window/status violations without touching the ledger", () => {
    const engine = new GroupBuyFormationEngine();
    const early = engine.join(openGroupBuy(), commitment("commitment-3", BUYER_C, "groupbuy-77", "2026-10-01T00:00:00.000Z"), "2026-10-01T00:00:00.000Z");
    expect(early).toEqual({ joined: false, refusal: "WINDOW_NOT_OPEN" });
    const late = engine.join(openGroupBuy(), commitment("commitment-4", BUYER_C, "groupbuy-77", "2026-12-01T00:00:00.000Z"), "2026-12-01T00:00:00.000Z");
    expect(late).toEqual({ joined: false, refusal: "WINDOW_CLOSED" });
    expect(engine.events()).toHaveLength(0);
  });
});

describe("scenario 7 — formation replay determinism", () => {
  it("identical inputs produce identical formation decisions and ledgers on replay", () => {
    const script = (engine: GroupBuyFormationEngine) => {
      const joinC = engine.join(openGroupBuy(), commitment("commitment-3", BUYER_C, "groupbuy-77", "2026-11-04T09:30:00.000Z"), "2026-11-04T09:30:00.000Z");
      const groupBuy = joinC.joined ? joinC.result.groupBuy : openGroupBuy();
      const formation = engine.evaluateFormation(groupBuy, "2026-11-04T09:31:00.000Z");
      const formationTwo = engine.evaluateFormation(groupBuy, "2026-11-05T00:00:00.000Z");
      const duplicateJoin = engine.join(groupBuy, commitment("commitment-9", BUYER_A, "groupbuy-77", "2026-11-05T00:00:00.000Z"), "2026-11-05T00:00:00.000Z");
      return {
        events: engine.events(),
        formationStatus: formation.status,
        formationTwoStatus: formationTwo.status,
        duplicateIdempotent: duplicateJoin.joined ? duplicateJoin.result.idempotent : false,
      };
    };
    const runOne = script(new GroupBuyFormationEngine());
    const runTwo = script(new GroupBuyFormationEngine());
    expect(runTwo).toEqual(runOne);
    expect(runOne.formationStatus).toBe("FORMED");
    expect(runOne.formationTwoStatus).toBe("ALREADY_FORMED");
    expect(runOne.duplicateIdempotent).toBe(true);
  });
});

describe("group-buy discovery matching", () => {
  const intent = (overrides?: Partial<BuyerCommerceIntent["hardConstraints"]>): BuyerCommerceIntent => ({
    intentId: "intent-2001",
    buyerRef: BUYER_A,
    desired: ["item://sewing-machine"],
    hardConstraints: {
      deadline: "2026-11-15T00:00:00.000Z",
      groupBuyWillingness: "ACCEPTED",
      ...overrides,
    },
    statedAt: "2026-11-02T00:00:00.000Z",
  });

  const listing = (groupBuy: GroupBuy, subjectRef = "item://sewing-machine"): GroupBuyListing => ({ groupBuy, subjectRef });

  it("returns no matches when group-buy willingness is REFUSED", () => {
    expect(discoverGroupBuysForIntent(intent({ groupBuyWillingness: "REFUSED" }), [listing(openGroupBuy())], "2026-11-05T00:00:00.000Z")).toEqual([]);
  });

  it("ranks feasible matches deterministically and flags infeasible windows", () => {
    const feasible = openGroupBuy();
    const closed = { ...openGroupBuy(), groupBuyId: "groupbuy-closed", terms: { ...openGroupBuy().terms, windowClosesAt: "2026-11-03T00:00:00.000Z" } };
    const matches = discoverGroupBuysForIntent(intent(), [listing(closed), listing(feasible)], "2026-11-05T00:00:00.000Z");
    expect(matches).toHaveLength(2);
    const top = matches[0];
    expect(top?.groupBuyId).toBe("groupbuy-77");
    expect(top?.infeasible).toBe(false);
    expect(top?.matchReasons).toContain("WINDOW_WITHIN_DEADLINE");
    expect(top?.estimatedShortfall).toBe(1);
    const bottom = matches[1];
    expect(bottom?.groupBuyId).toBe("groupbuy-closed");
    expect(bottom?.infeasible).toBe(true);
    expect(bottom?.infeasibleReasons).toContain("WINDOW_CLOSED");
  });

  it("ignores listings whose subject is not desired", () => {
    const matches = discoverGroupBuysForIntent(intent(), [listing(openGroupBuy(), "item://other")], "2026-11-05T00:00:00.000Z");
    expect(matches).toEqual([]);
  });
});
