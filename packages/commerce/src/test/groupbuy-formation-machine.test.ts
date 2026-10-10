/**
 * W1-012 contract tests — the GroupBuy formation state machine: proposal
 * PENDING → ACCEPTED (threshold MONITORING) / COUNTERED / REJECTED (reason) /
 * EXPIRED (window closed); per-participant interest with consent terms
 * (interest is NEVER commitment); withdraw any time before the second
 * confirmation; threshold-met pools HELD awaiting the organizer's explicit
 * formation; FORMED only with final terms + a consenting-only roster.
 * Imported through the public contract seam.
 */
import { describe, expect, it } from "vitest";
import {
  closeOrExpireGroupBuy,
  countQuantity,
  currency,
  decideGroupBuyProposal,
  formGroupBuy,
  groupBuyPoolValue,
  groupBuyThresholdMet,
  groupBuyTransition,
  makeId,
  money,
  poolParticipantCountOf,
  poolUnitsOf,
  principalRefEquals,
  principalRefKey,
  recordGroupBuyInterest,
  withdrawGroupBuyInterest,
  type GroupBuyAggregate,
  type GroupBuyInterestRecord,
  type PrincipalRef,
} from "../contract.js";

const usd = currency("USD");
const NOW = "2026-10-12T09:00:00Z";

function customer(id: string): PrincipalRef {
  return { kind: "CUSTOMER", customerId: makeId<"CustomerId">(id) };
}

function merchant(id: string): PrincipalRef {
  return { kind: "MERCHANT", merchantId: makeId<"MerchantId">(id) };
}

const ferryRoad = customer("ferry-road");
const twoHarbors = customer("two-harbors");
const quayside = customer("quayside");
const northlight = customer("northlight");
const harborLane = customer("harbor-lane");
const organizer = merchant("merchant-1");

function proposal(overrides?: Partial<GroupBuyAggregate>): GroupBuyAggregate {
  return {
    groupBuyId: makeId<"GroupBuyId">("w1gb-prop-1"),
    initiatorRef: ferryRoad,
    organizerRef: organizer,
    terms: {
      skuRef: makeId<"SkuId">("sku-demo-cards"),
      proposedUnitPrice: money("1080", usd),
      listUnitPrice: money("1200", usd),
      threshold: { minimumParticipants: 4, minimumUnits: 40 },
      windowClosesAt: "2026-10-20T18:00:00Z",
    },
    state: "PENDING",
    openedAt: "2026-10-10T08:20:00Z",
    participants: [],
    revision: 1,
    ...overrides,
  };
}

function interestOf(
  groupBuyId: string,
  participant: PrincipalRef,
  units: number,
  state: "EXPRESSED" | "WITHDRAWN" = "EXPRESSED",
): GroupBuyInterestRecord {
  return {
    groupBuyId: makeId<"GroupBuyId">(groupBuyId),
    participantRef: participant,
    quantity: countQuantity(units),
    consentTerms: `Explicitly agreed to appear with a ${units}-box share (interest is not a commitment).`,
    state,
    recordedAt: NOW,
    revision: 1,
  };
}

describe("group buy formation state machine", () => {
  it("walks proposal → MONITORING → HELD → FORMED → CLOSED deterministically", () => {
    expect(groupBuyTransition("PENDING", "ACCEPT")).toMatchObject({ ok: true, value: "MONITORING" });
    expect(groupBuyTransition("MONITORING", "THRESHOLD_MET")).toMatchObject({ ok: true, value: "HELD" });
    expect(groupBuyTransition("HELD", "THRESHOLD_LOST")).toMatchObject({ ok: true, value: "MONITORING" });
    expect(groupBuyTransition("HELD", "FORM")).toMatchObject({ ok: true, value: "FORMED" });
    expect(groupBuyTransition("FORMED", "CLOSE")).toMatchObject({ ok: true, value: "CLOSED" });
    expect(groupBuyTransition("PENDING", "COUNTER")).toMatchObject({ ok: true, value: "COUNTERED" });
    expect(groupBuyTransition("COUNTERED", "ACCEPT_COUNTER")).toMatchObject({ ok: true, value: "MONITORING" });
    expect(groupBuyTransition("PENDING", "REJECT")).toMatchObject({ ok: true, value: "REJECTED" });
    expect(groupBuyTransition("HELD", "EXPIRE")).toMatchObject({ ok: true, value: "EXPIRED" });
  });

  it("rejects impossible transitions (terminal states never revive)", () => {
    expect(groupBuyTransition("FORMED", "FORM")).toMatchObject({ ok: false });
    expect(groupBuyTransition("REJECTED", "ACCEPT")).toMatchObject({ ok: false });
    expect(groupBuyTransition("CLOSED", "CLOSE")).toMatchObject({ ok: false });
    expect(groupBuyTransition("EXPIRED", "FORM")).toMatchObject({ ok: false });
    expect(groupBuyTransition("PENDING", "THRESHOLD_MET")).toMatchObject({ ok: false });
    expect(groupBuyTransition("MONITORING", "FORM")).toMatchObject({ ok: false });
  });

  it("counts the live pool exactly (withdrawn interest never counts)", () => {
    const interests = [
      interestOf("w1gb-prop-1", ferryRoad, 16),
      interestOf("w1gb-prop-1", twoHarbors, 12),
      interestOf("w1gb-prop-1", quayside, 8),
      interestOf("w1gb-prop-1", northlight, 10, "WITHDRAWN"),
    ];
    expect(poolUnitsOf(interests)).toBe(36);
    expect(poolParticipantCountOf(interests)).toBe(3);
    const threshold = { minimumParticipants: 4, minimumUnits: 40 };
    expect(groupBuyThresholdMet(threshold, interests)).toBe(false);
    expect(groupBuyThresholdMet(threshold, [...interests, interestOf("w1gb-prop-1", harborLane, 6)])).toBe(true);
    expect(groupBuyPoolValue(money("1080", usd), interests)).toMatchObject({ amountMinor: "38880" });
  });

  it("records interest in PENDING (latent-demand pool grows) and promotes MONITORING → HELD only when BOTH thresholds are met", () => {
    let pool = proposal();
    const interests: GroupBuyInterestRecord[] = [];
    for (const [participant, units] of [[ferryRoad, 16], [twoHarbors, 12], [quayside, 8]] as const) {
      const next = recordGroupBuyInterest(pool, interests, {
        participantRef: participant,
        quantity: countQuantity(units),
        consentTerms: "Demo consent terms: interest is never a commitment.",
        recordedAt: NOW,
      });
      expect(next.ok).toBe(true);
      if (!next.ok) throw new Error("unreachable");
      pool = next.value.groupBuy;
      interests.push(next.value.interest);
    }
    expect(pool.state).toBe("PENDING");
    const accepted = decideGroupBuyProposal(pool, "ACCEPT");
    expect(accepted).toMatchObject({ ok: true, value: { state: "MONITORING" } });
    if (!accepted.ok) throw new Error("unreachable");
    let monitoring = accepted.value;
    expect(groupBuyThresholdMet(monitoring.terms.threshold, interests)).toBe(false);
    // Participant threshold met (4 studios) but units still short (38 < 40): still MONITORING.
    const fourthStudio = recordGroupBuyInterest(monitoring, interests, {
      participantRef: harborLane,
      quantity: countQuantity(2),
      consentTerms: "Two boxes of interest — not a commitment.",
      recordedAt: NOW,
    });
    if (!fourthStudio.ok) throw new Error("unreachable");
    expect(fourthStudio.value.groupBuy.state).toBe("MONITORING");
    interests.push(fourthStudio.value.interest);
    // Both thresholds met (5 studios / 42 boxes): HELD.
    const fifth = recordGroupBuyInterest(monitoring, interests, {
      participantRef: customer("beacon-hill"),
      quantity: countQuantity(4),
      consentTerms: "Fifth studio joining — interest is not a commitment.",
      recordedAt: NOW,
    });
    if (!fifth.ok) throw new Error("unreachable");
    expect(fifth.value.groupBuy.state).toBe("HELD");
    monitoring = fifth.value.groupBuy;
    interests.push(fifth.value.interest);
    void monitoring;
  });

  it("duplicate live interest is rejected; a withdrawn participant may re-express; withdrawal demotes HELD honestly", () => {
    const held = proposal({ state: "HELD" });
    const interests = [
      interestOf("w1gb-prop-1", ferryRoad, 16),
      interestOf("w1gb-prop-1", twoHarbors, 12),
      interestOf("w1gb-prop-1", quayside, 12),
    ];
    expect(recordGroupBuyInterest(held, interests, {
      participantRef: ferryRoad,
      quantity: countQuantity(2),
      consentTerms: "duplicate",
      recordedAt: NOW,
    })).toMatchObject({ ok: false, error: { code: "INTEREST_ALREADY_EXPRESSED" } });
    expect(recordGroupBuyInterest(held, interests, {
      participantRef: customer("no-one"),
      quantity: countQuantity(0),
      consentTerms: "zero units",
      recordedAt: NOW,
    })).toMatchObject({ ok: false, error: { code: "INVALID_INTEREST_UNITS" } });
    const withdrawn = withdrawGroupBuyInterest(held, interests, quayside, NOW);
    expect(withdrawn).toMatchObject({ ok: true, value: { interest: { state: "WITHDRAWN" } } });
    if (!withdrawn.ok) throw new Error("unreachable");
    // 2 studios / 28 boxes < 4 / 40: the pool honestly returns to MONITORING.
    expect(withdrawn.value.groupBuy.state).toBe("MONITORING");
    const nextInterests = interests.map((record) => (principalRefEquals(record.participantRef, quayside) ? withdrawn.value.interest : record));
    const reExpressed = recordGroupBuyInterest(withdrawn.value.groupBuy, nextInterests, {
      participantRef: quayside,
      quantity: countQuantity(12),
      consentTerms: "Re-joined after withdrawing.",
      recordedAt: NOW,
    });
    expect(reExpressed).toMatchObject({ ok: true, value: { interest: { state: "EXPRESSED", revision: 3 } } });
    expect(withdrawGroupBuyInterest(held, nextInterests, customer("stranger"), NOW)).toMatchObject({ ok: false, error: { code: "NO_LIVE_INTEREST" } });
    expect(withdrawGroupBuyInterest(proposal({ state: "FORMED" }), nextInterests, ferryRoad, NOW)).toMatchObject({
      ok: false,
      error: { code: "GROUP_BUY_NOT_OPEN_FOR_INTEREST", state: "FORMED" },
    });
  });

  it("forms only from HELD, with exact final terms and a consenting-only roster", () => {
    const held = proposal({ state: "HELD" });
    const interests = [
      interestOf("w1gb-prop-1", ferryRoad, 16),
      interestOf("w1gb-prop-1", twoHarbors, 12),
      interestOf("w1gb-prop-1", quayside, 8),
      interestOf("w1gb-prop-1", northlight, 10, "WITHDRAWN"), // excluded — never enrolled
      interestOf("w1gb-prop-1", harborLane, 6),
    ];
    expect(formGroupBuy(proposal({ state: "MONITORING" }), interests, money("1080", usd), NOW)).toMatchObject({
      ok: false,
      error: { code: "NOT_HELD" },
    });
    expect(formGroupBuy(held, [interestOf("w1gb-prop-1", ferryRoad, 16)], money("1080", usd), NOW)).toMatchObject({
      ok: false,
      error: { code: "POOL_BELOW_THRESHOLD" },
    });
    expect(formGroupBuy(held, interests, money("1080", currency("EUR")), NOW)).toMatchObject({
      ok: false,
      error: { code: "CURRENCY_MISMATCH" },
    });
    const formed = formGroupBuy(held, interests, money("1080", usd), NOW);
    expect(formed).toMatchObject({ ok: true, value: { state: "FORMED" } });
    if (!formed.ok) throw new Error("unreachable");
    expect(formed.value.formation).toMatchObject({ groupPrice: { amountMinor: "1080" }, poolValue: { amountMinor: "45360" } });
    expect(formed.value.participants.map((share) => principalRefKey(share.participantRef))).toEqual([
      "customer:ferry-road",
      "customer:two-harbors",
      "customer:quayside",
      "customer:harbor-lane",
    ]);
    expect(closeOrExpireGroupBuy(formed.value, "CLOSE")).toMatchObject({ ok: true, value: { state: "CLOSED" } });
    expect(closeOrExpireGroupBuy(held, "EXPIRE")).toMatchObject({ ok: true, value: { state: "EXPIRED" } });
  });

  it("merchant decisions record their evidence (counter terms, rejection reason)", () => {
    const counter = decideGroupBuyProposal(proposal(), "COUNTER", {
      counterTerms: { unitPrice: money("1160", usd), minimumUnits: 36, note: "USD 11.60 at 36 boxes" },
    });
    expect(counter).toMatchObject({ ok: true, value: { state: "COUNTERED", counterTerms: { unitPrice: { amountMinor: "1160" } } } });
    expect(decideGroupBuyProposal(proposal(), "COUNTER")).toMatchObject({ ok: false, error: { code: "COUNTER_TERMS_REQUIRED" } });
    expect(decideGroupBuyProposal(proposal(), "REJECT")).toMatchObject({ ok: false, error: { code: "REJECTION_REASON_REQUIRED" } });
    const rejected = decideGroupBuyProposal(proposal(), "REJECT", { rejectionReason: "Terms outside our group-buy policy" });
    expect(rejected).toMatchObject({ ok: true, value: { state: "REJECTED", rejectionReason: "Terms outside our group-buy policy" } });
    if (!counter.ok) throw new Error("unreachable");
    const accepted = decideGroupBuyProposal(counter.value, "ACCEPT_COUNTER");
    expect(accepted).toMatchObject({ ok: true, value: { state: "MONITORING", counterTerms: { minimumUnits: 36 } } });
  });
});
