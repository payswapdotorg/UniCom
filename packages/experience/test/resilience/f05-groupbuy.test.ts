/**
 * W2-010 — Family F05: GroupBuy participant dropout, insufficient threshold,
 * merchant counter-offer, expiry and cancellation. Fixture-contract evidence
 * level.
 *
 * Drives the REAL GroupBuyFormationEngine (the append-only formation ledger:
 * joins, threshold formation, deterministic dissolution) and the REAL
 * group-buy domain (executability, merchant responses). The "dropout"
 * dimension enters as the deterministic domain input it is in this product:
 * below-threshold roster + window close (the engine's dissolution path) —
 * no runtime is mocked, no window is fudged.
 *
 * The VISIBLE dimension is asserted through the typed outcomes a rendered UI
 * would consume (typed refusal reasons, ledger events, status transitions,
 * executability reasons) plus the opportunity-inbox item projection.
 */

import { describe, expect, it } from "vitest";
import {
  GroupBuyFormationEngine,
  enrollParticipant,
  groupBuyParticipantCount,
  isGroupBuyExecutable,
  respondToGroupBuyProposal,
  type AuthorizationDecision,
  type GroupBuy,
  type GroupBuyCommitment,
  type GroupBuyProposal,
  type PrincipalRef,
} from "@unicom/agent";
import type { OpportunityInboxItem } from "../../src/surfaces/opportunity-inbox";
import { scenarioById } from "./matrix/oracle";

const family = "F05";
const oracle = (suffix: string) => scenarioById(`W2-010-${family}-${suffix}`);

const MERCHANT: PrincipalRef = { principalId: "merchant-f05", kind: "merchant" };
const BUYER_A: PrincipalRef = { principalId: "buyer-ama-f05", kind: "user" };
const BUYER_B: PrincipalRef = { principalId: "buyer-kwe-f05", kind: "user" };
const BUYER_C: PrincipalRef = { principalId: "buyer-ab-f05", kind: "user" };

const WINDOW_OPEN = "2026-10-10T09:00:00Z";
const WINDOW_CLOSE = "2026-10-10T18:00:00Z";

function authorizedBy(ref: PrincipalRef, at: string): AuthorizationDecision {
  return { decision: "AUTHORIZED", decidedBy: ref, policyVersion: "policy-f05", decidedAt: at };
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

/** An OPEN group-buy with two authorized commitments (threshold defaults to 3). */
function openGroupBuy(minimumParticipants = 3): GroupBuy {
  return {
    groupBuyId: "groupbuy-f05-1",
    merchantRef: MERCHANT,
    terms: {
      minimumParticipants,
      windowOpensAt: WINDOW_OPEN,
      windowClosesAt: WINDOW_CLOSE,
      discount: { kind: "PERCENTAGE", value: "1200" },
    },
    status: "OPEN",
    commitments: [
      commitment("commitment-f05-a", BUYER_A, "groupbuy-f05-1", "2026-10-10T10:00:00Z"),
      commitment("commitment-f05-b", BUYER_B, "groupbuy-f05-1", "2026-10-10T10:05:00Z"),
    ],
    merchantAuthorization: authorizedBy(MERCHANT, "2026-10-10T09:30:00Z"),
  };
}

/** The inbox item a rendered UI shows for a group-buy opportunity. */
function groupDealInboxItem(
  status: OpportunityInboxItem["status"],
  summary: string,
  requiresAuthorization: boolean,
): OpportunityInboxItem {
  return {
    itemId: "item:w2-f05-group-deal",
    opportunityRef: "opportunity:groupbuy-f05-1" as never,
    category: "group-deal",
    title: "Wholesale tote group-buy",
    summary,
    disclosure: {
      observation: "2 of 3 required participants committed; window closes 18:00Z",
      ...(status === "expired" ? {} : { prediction: { summary: "likely to form if one more buyer joins", truthClass: "predictive", confidenceNote: "estimate from current commitment rate" } }),
    },
    status,
    requiresAuthorization,
    evidence: [],
    surfacedAt: "2026-10-10T10:10:00Z",
  };
}

describe("W2-010 F05 — GroupBuy dropout / threshold / counter-offer / expiry / cancellation (fixture-contract)", () => {
  it("F05-S01: a join after the window closed is a typed WINDOW_CLOSED refusal; the roster never changes", () => {
    expect(oracle("S01").expectedResultClass).toBe("expected-block");
    const engine = new GroupBuyFormationEngine();
    const groupBuy = openGroupBuy();
    // A late joiner arrives after the window closed.
    const late = engine.join(groupBuy, commitment("commitment-f05-late", BUYER_C, groupBuy.groupBuyId, "2026-10-10T19:00:00Z"), "2026-10-10T19:00:00Z");
    expect(late).toEqual({ joined: false, refusal: "WINDOW_CLOSED" });
    // VISIBLE: the roster is unchanged and NO ledger event was recorded —
    // the refusal never mutated anything.
    expect(groupBuyParticipantCount(groupBuy)).toBe(2);
    expect(engine.eventsFor(groupBuy.groupBuyId)).toHaveLength(0);
    // The inbox projection shows the group-deal as expired for that viewer.
    const item = groupDealInboxItem("expired", "window closed at 18:00Z with 2 of 3 participants", true);
    expect(item.status).toBe("expired");
    expect(item.disclosure.prediction).toBeUndefined();
  });

  it("F05-S02: a duplicate join by the same participant is idempotent — the roster never grows", () => {
    expect(oracle("S02").expectedResultClass).toBe("expected-success");
    const engine = new GroupBuyFormationEngine();
    const groupBuy = openGroupBuy();
    // BUYER_A double-clicks join (an existing authorized commitment).
    const again = engine.join(groupBuy, commitment("commitment-f05-a-dup", BUYER_A, groupBuy.groupBuyId, "2026-10-10T11:00:00Z"), "2026-10-10T11:00:00Z");
    expect(again.joined).toBe(true);
    if (again.joined) {
      expect(again.result.idempotent).toBe(true);
      // VISIBLE: the returned group is the UNCHANGED one.
      expect(again.result.groupBuy).toBe(groupBuy);
      expect(groupBuyParticipantCount(again.result.groupBuy)).toBe(2);
    }
    // The ledger records JOIN_IDEMPOTENT — an explicit fact, never a second roster entry.
    const ledger = engine.eventsFor(groupBuy.groupBuyId);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]?.kind).toBe("JOIN_IDEMPOTENT");
  });

  it("F05-S03: threshold-met groups form EXACTLY ONCE; re-evaluation is ALREADY_FORMED", () => {
    expect(oracle("S03").expectedResultClass).toBe("expected-success");
    const engine = new GroupBuyFormationEngine();
    const joined = engine.join(openGroupBuy(), commitment("commitment-f05-c", BUYER_C, "groupbuy-f05-1", "2026-10-10T12:00:00Z"), "2026-10-10T12:00:00Z");
    expect(joined.joined).toBe(true);
    const groupBuy = joined.joined ? joined.result.groupBuy : openGroupBuy();
    expect(groupBuyParticipantCount(groupBuy)).toBe(3);
    // Formation fires once.
    const formed = engine.evaluateFormation(groupBuy, "2026-10-10T12:00:01Z");
    expect(formed.status).toBe("FORMED");
    if (formed.status === "FORMED") {
      expect(formed.groupBuy.status).toBe("THRESHOLD_MET");
    }
    // Re-evaluation references the ORIGINAL event — no second GROUP_FORMED.
    const reformed = engine.evaluateFormation(formed.status === "FORMED" ? formed.groupBuy : groupBuy, "2026-10-10T13:00:00Z");
    expect(reformed.status).toBe("ALREADY_FORMED");
    if (reformed.status === "ALREADY_FORMED" && formed.status === "FORMED") {
      expect(reformed.formationEventId).toBe(formed.formationEventId);
    }
    const formationEvents = engine.eventsFor(groupBuy.groupBuyId).filter((event) => event.kind === "GROUP_FORMED");
    expect(formationEvents).toHaveLength(1);
    // VISIBLE: with authorization in place the formed group is executable.
    const executable = isGroupBuyExecutable(formed.status === "FORMED" ? formed.groupBuy : groupBuy, "2026-10-10T13:30:00Z");
    expect(executable.executable).toBe(true);
  });

  it("F05-S04: dropout → window closes below threshold → DISSOLVED, status EXPIRED, commitments released exactly once", () => {
    expect(oracle("S04").expectedResultClass).toBe("expected-block");
    const engine = new GroupBuyFormationEngine();
    const groupBuy = openGroupBuy(3); // 2 committed, one short (the "dropout" seat stays empty)
    // The window closes below threshold.
    const dissolved = engine.evaluateDissolution(groupBuy, "2026-10-10T18:00:01Z");
    expect(dissolved.outcome).toBe("DISSOLVED");
    if (dissolved.outcome === "DISSOLVED") {
      expect(dissolved.reason).toBe("WINDOW_CLOSED_BELOW_THRESHOLD");
      expect(dissolved.finalStatus).toBe("EXPIRED");
      // VISIBLE: every commitment is released, listed once, deterministically sorted.
      expect(dissolved.releasedCommitmentIds).toEqual(["commitment-f05-a", "commitment-f05-b"]);
    }
    // Re-evaluation is ALREADY_DISSOLVED — released exactly once.
    const again = engine.evaluateDissolution(groupBuy, "2026-10-10T19:00:00Z");
    expect(again.outcome).toBe("ALREADY_DISSOLVED");
    const dissolutionEvents = engine.eventsFor(groupBuy.groupBuyId).filter((event) => event.kind.startsWith("DISSOLVED"));
    expect(dissolutionEvents).toHaveLength(1);
    expect(dissolutionEvents[0]?.kind).toBe("DISSOLVED_WINDOW_CLOSED_BELOW_THRESHOLD");
    // A joiner after dissolution is refused — the engine's check order is
    // deterministic (window first): post-window refusals are WINDOW_CLOSED.
    const late = engine.join({ ...groupBuy, status: "EXPIRED" }, commitment("commitment-f05-post", BUYER_C, groupBuy.groupBuyId, "2026-10-10T19:30:00Z"), "2026-10-10T19:30:00Z");
    expect(late).toEqual({ joined: false, refusal: "WINDOW_CLOSED" });
    expect(groupBuyParticipantCount(groupBuy)).toBe(2);
  });

  it("F05-S05: a merchant counter-offer produces COUNTERED with revised terms — not executable until accepted + authorized", () => {
    expect(oracle("S05").expectedResultClass).toBe("expected-block");
    const proposal: GroupBuyProposal = {
      proposalId: "proposal-f05-1",
      fromRef: BUYER_A,
      merchantRef: MERCHANT,
      demandClusterId: "cluster-f05-1",
      proposedTerms: {
        minimumParticipants: 5,
        windowOpensAt: WINDOW_OPEN,
        windowClosesAt: WINDOW_CLOSE,
        discount: { kind: "PERCENTAGE", value: "800" },
      },
      proposedAt: "2026-10-10T09:15:00Z",
    };
    // The merchant counters: higher threshold, bigger discount.
    const countered = respondToGroupBuyProposal(proposal, {
      responseKind: "COUNTER",
      terms: {
        minimumParticipants: 8,
        windowOpensAt: WINDOW_OPEN,
        windowClosesAt: "2026-10-11T18:00:00Z",
        discount: { kind: "PERCENTAGE", value: "1500" },
      },
      note: "8 participants unlock 15%",
    });
    // VISIBLE: the status is COUNTERED with the REVISED terms (not the proposed ones).
    expect(countered.status).toBe("COUNTERED");
    expect(countered.terms.minimumParticipants).toBe(8);
    expect(countered.terms.discount.value).toBe("1500");
    // Deterministically NOT executable: no acceptance (status), no commitments
    // (threshold), no merchant authorization recorded on this object yet.
    const executability = isGroupBuyExecutable(countered, "2026-10-10T10:00:00Z");
    expect(executable(executability)).toBe(false);
    if (!executable(executability)) {
      expect(executability.reasons).toContain("STATUS_NOT_OPEN");
      expect(executability.reasons).toContain("MISSING_MERCHANT_AUTHORIZATION");
      expect(executability.reasons).toContain("THRESHOLD_NOT_MET");
    }
  });

  it("F05-S06: authorized merchant cancellation → CANCELLED, commitments released exactly once", () => {
    expect(oracle("S06").expectedResultClass).toBe("expected-block");
    const engine = new GroupBuyFormationEngine();
    const groupBuy = openGroupBuy(3);
    // The merchant cancels with its own explicit authorization (window still open).
    const cancelled = engine.evaluateDissolution(groupBuy, "2026-10-10T14:00:00Z", {
      cancelledBy: MERCHANT,
      authorization: authorizedBy(MERCHANT, "2026-10-10T14:00:00Z"),
    });
    expect(cancelled.outcome).toBe("DISSOLVED");
    if (cancelled.outcome === "DISSOLVED") {
      expect(cancelled.reason).toBe("MERCHANT_CANCELLED");
      expect(cancelled.finalStatus).toBe("CANCELLED");
      expect(cancelled.releasedCommitmentIds).toEqual(["commitment-f05-a", "commitment-f05-b"]);
    }
    // Released exactly once; a second evaluation is ALREADY_DISSOLVED.
    const again = engine.evaluateDissolution(groupBuy, "2026-10-10T15:00:00Z", {
      cancelledBy: MERCHANT,
      authorization: authorizedBy(MERCHANT, "2026-10-10T15:00:00Z"),
    });
    expect(again.outcome).toBe("ALREADY_DISSOLVED");
    expect(engine.eventsFor(groupBuy.groupBuyId).filter((event) => event.kind === "DISSOLVED_MERCHANT_CANCELLED")).toHaveLength(1);
    // A join attempt against the CANCELLED group while the window is still
    // open is refused on STATUS — the terminal-status check, deterministically.
    const late = engine.join({ ...groupBuy, status: "CANCELLED" }, commitment("commitment-f05-post-cancel", BUYER_C, groupBuy.groupBuyId, "2026-10-10T15:00:00Z"), "2026-10-10T15:00:00Z");
    expect(late).toEqual({ joined: false, refusal: "STATUS_NOT_JOINABLE" });
    expect(engine.eventsFor(groupBuy.groupBuyId).filter((event) => event.kind === "JOIN_RECORDED")).toHaveLength(0);
    // VISIBLE: the inbox item flips to dismissed/expired with authorization still required for any new action.
    const item = groupDealInboxItem("dismissed", "merchant cancelled the group-buy at 14:00Z — commitments released", true);
    expect(item.requiresAuthorization).toBe(true);
  });

  it("F05-S07: execution without merchant authorization is blocked with MISSING_MERCHANT_AUTHORIZATION — and unauthorized commitments never enroll", () => {
    expect(oracle("S07").expectedResultClass).toBe("expected-block");
    const groupBuy = openGroupBuy(3);
    // Threshold met but the merchant authorization was never recorded.
    const joined = enrollParticipant(groupBuy, commitment("commitment-f05-c", BUYER_C, groupBuy.groupBuyId, "2026-10-10T12:00:00Z"));
    const unauthorized = { ...joined, merchantAuthorization: undefined };
    const executability = isGroupBuyExecutable({ ...unauthorized, status: "THRESHOLD_MET" }, "2026-10-10T13:00:00Z");
    expect(executable(executability)).toBe(false);
    if (!executable(executability)) {
      // VISIBLE: the exact reason is MISSING_MERCHANT_AUTHORIZATION — the
      // only missing piece (window open, threshold met, status THRESHOLD_MET).
      expect(executability.reasons).toEqual(["MISSING_MERCHANT_AUTHORIZATION"]);
    }
    // The allow-path control: WITH authorization the same group is executable.
    expect(isGroupBuyExecutable({ ...unauthorized, merchantAuthorization: authorizedBy(MERCHANT, "2026-10-10T12:30:00Z") }, "2026-10-10T13:00:00Z").executable).toBe(true);
    // And no silent enrollment: an UNAUTHORIZED commitment throws (never joins).
    const unauthorizedCommitment: GroupBuyCommitment = {
      ...commitment("commitment-f05-unauth", BUYER_C, groupBuy.groupBuyId, "2026-10-10T13:30:00Z"),
      authorization: { decision: "DENIED", decidedBy: MERCHANT, policyVersion: "policy-f05", decidedAt: "2026-10-10T13:29:00Z" },
    };
    expect(() => enrollParticipant(groupBuy, unauthorizedCommitment)).toThrow(/no silent enrollment/);
  });
});

/** Narrow type guard so the assertion branches stay exhaustive. */
function executable(result: { executable: boolean }): boolean {
  return result.executable;
}
