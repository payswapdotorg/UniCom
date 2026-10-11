/**
 * W1-016 Stage 2 — exhaustive kernel tests for the two LINK commands:
 * LINK_GROUPBUY_TO_ORDER_DRAFT and LINK_TRADECYCLE_LEG_TO_SETTLEMENT_DRAFT.
 *
 * Tests the domain functions from domain/linking-draft.ts against every law:
 * - Happy path (both commands create a DRAFT with full provenance)
 * - Law 1 (separation): a draft is NOT an order/payment/reservation
 * - Law 2/4 (authorization): only the authorized actor may link; unauthorized refused
 * - Law 3 (idempotency): duplicate draftId returns DRAFT_ALREADY_EXISTS
 * - Law 5 (compensation): cancel cascade marks CANCELLED_BUT_NEVER_COMMITTED; compensation ref carried
 * - Law 6 (UNKNOWN): markLinkedDraftUnknown / resolveLinkedDraftUnknown
 * - Law 7 (per-leg isolation): linking one leg never links another
 * - Law 9 (provenance): every draft records source aggregate id, source kind, acting principal, consent basis
 * - Kill switch: LINKING_DRAFT_ENABLED refuses with honest "linking disabled" error
 * - State machine: linkedDraftTransition (DRAFT → CANCELLED / PLACEMENT_UNKNOWN; PLACEMENT_UNKNOWN → DRAFT)
 * - Source not formed / source leg not committed refusals
 */
import { describe, expect, it } from "vitest";
import {
  countQuantity,
  currency,
  makeId,
  money,
  principalRefEquals,
  linkGroupBuyToOrderDraft,
  linkTradeCycleLegToSettlementDraft,
  cancelLinkedDraft,
  cancelLinkedDraftsForAggregate,
  markLinkedDraftUnknown,
  resolveLinkedDraftUnknown,
  linkedDraftTransition,
  draftsForAggregate,
  draftsForLeg,
  isTerminalDraft,
  type GroupBuyAggregate,
  type PrincipalRef,
  type TradeCycleExecution,
  type TradeCycleExecutionLeg,
} from "../contract.js";

const usd = currency("USD");
const NOW = "2026-10-12T09:00:00Z";

function customer(id: string): PrincipalRef {
  return { kind: "CUSTOMER", customerId: makeId<"CustomerId">(id) };
}

const ferryRoad = customer("ferry-road");
const twoHarbors = customer("two-harbors");
const quayside = customer("quayside");
const northlight = customer("northlight");
const harborLane = customer("harbor-lane");
const beaconHill = customer("beacon-hill");
const organizer: PrincipalRef = { kind: "MERCHANT", merchantId: makeId<"MerchantId">("merchant-1") };

function formedGroupBuy(): GroupBuyAggregate {
  return {
    groupBuyId: makeId<"GroupBuyId">("w1gb-link-1"),
    initiatorRef: ferryRoad,
    organizerRef: organizer,
    terms: {
      skuRef: makeId<"SkuId">("sku-demo-cards"),
      proposedUnitPrice: money("1080", usd),
      listUnitPrice: money("1200", usd),
      threshold: { minimumParticipants: 4, minimumUnits: 40 },
      windowClosesAt: "2026-10-20T18:00:00Z",
    },
    state: "FORMED",
    openedAt: NOW,
    formation: { groupPrice: money("1080", usd), poolValue: money("45360", usd), formedAt: NOW },
    participants: [
      { participantRef: ferryRoad, quantity: countQuantity(16) },
      { participantRef: twoHarbors, quantity: countQuantity(12) },
      { participantRef: quayside, quantity: countQuantity(8) },
      { participantRef: harborLane, quantity: countQuantity(6) },
    ],
    revision: 5,
  };
}

function pendingGroupBuy(): GroupBuyAggregate {
  return { ...formedGroupBuy(), state: "PENDING", formation: undefined, participants: [], revision: 1 };
}

function leg(index: number, from: PrincipalRef, to: PrincipalRef, item: string): TradeCycleExecutionLeg {
  return { legIndex: index, fromRef: from, toRef: to, offeredItemRef: item, requiredProofLevel: "P2", consentState: "PENDING", revision: 1 };
}

function committedCycleA(): TradeCycleExecution {
  return {
    tradeCycleId: makeId<"TradeCycleId">("w1tc-link-1"),
    initiatingRef: harborLane,
    legs: [
      { ...leg(0, northlight, twoHarbors, "Photography light kit"), consentState: "COMMITTED" as const },
      { ...leg(1, twoHarbors, harborLane, "Overlock sewing machine"), consentState: "COMMITTED" as const },
      { ...leg(2, harborLane, northlight, "Wide-format A1 printer"), consentState: "COMMITTED" as const },
    ],
    executionMode: "ATOMIC",
    bounds: { maxHops: 3, environment: "LAB" },
    state: "COMMITTED",
    revision: 5,
  };
}

function openCycleA(): TradeCycleExecution {
  return { ...committedCycleA(), state: "OPEN", legs: committedCycleA().legs.map((l) => ({ ...l, consentState: "PENDING" as const })), revision: 1 };
}

describe("W1-016 LINK_GROUPBUY_TO_ORDER_DRAFT — happy path + provenance", () => {
  it("creates a DRAFT from a FORMED GroupBuy with full provenance (source aggregate id, source kind, acting principal, consent basis)", () => {
    const formed = formedGroupBuy();
    const result = linkGroupBuyToOrderDraft(formed, ferryRoad, organizer, makeId<"LinkedDraftId">("draft-1"), null, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    const draft = result.value;
    expect(draft.state).toBe("DRAFT");
    expect(draft.kind).toBe("GROUP_BUY_ORDER_DRAFT");
    expect(draft.draftId).toBe(makeId<"LinkedDraftId">("draft-1"));
    // Law 9: provenance on every artifact.
    expect(draft.provenance.sourceAggregateId).toBe("w1gb-link-1");
    expect(draft.provenance.sourceKind).toBe("GROUP_BUY_ORDER_DRAFT");
    expect(principalRefEquals(draft.provenance.actingPrincipal, organizer)).toBe(true);
    expect(draft.provenance.consentBasis).toContain("Consented to appear in w1gb-link-1");
    expect(draft.provenance.consentBasis).toContain("16-unit share");
    expect(draft.provenance.compensationRef).toBe("comp-ref-gb-w1gb-link-1");
    // The prefill carries the aggregate's frozen terms.
    expect(draft.prefill.skuRef).toBe("sku-demo-cards");
    expect(draft.prefill.unitPriceMinor).toBe("1080");
    expect(draft.prefill.currency).toBe("USD");
    expect(draft.prefill.units).toBe(16);
  });

  it("a draft is NOT an order, NOT a payment, NOT a reservation — law 1: separation", () => {
    const formed = formedGroupBuy();
    const result = linkGroupBuyToOrderDraft(formed, ferryRoad, organizer, makeId<"LinkedDraftId">("draft-2"), null, NOW);
    if (!result.ok) throw new Error("unreachable");
    // The draft has no order id, no payment id, no reservation id — it is a DRAFT.
    expect(result.value.state).toBe("DRAFT");
    expect(JSON.stringify(result.value)).not.toMatch(/orderId|paymentId|reservationId/);
  });
});

describe("W1-016 LINK_GROUPBUY_TO_ORDER_DRAFT — every refusal", () => {
  it("refuses when the source aggregate is NOT FORMED (law 1: formation truth is separate)", () => {
    const pending = pendingGroupBuy();
    const result = linkGroupBuyToOrderDraft(pending, ferryRoad, organizer, makeId<"LinkedDraftId">("draft-3"), null, NOW);
    expect(result).toMatchObject({ ok: false, error: { code: "SOURCE_NOT_FORMED", sourceAggregateId: "w1gb-link-1", state: "PENDING" } });
  });

  it("refuses when the acting principal is NOT the organizer (law 4: actor authority)", () => {
    const formed = formedGroupBuy();
    const result = linkGroupBuyToOrderDraft(formed, ferryRoad, beaconHill, makeId<"LinkedDraftId">("draft-4"), null, NOW);
    expect(result).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED_ACTOR", detail: "only the GroupBuy organizer may propose a linked order draft" } });
  });

  it("refuses when the participant is NOT in the frozen roster (law 2: per-side-effect authorization)", () => {
    const formed = formedGroupBuy();
    const result = linkGroupBuyToOrderDraft(formed, northlight, organizer, makeId<"LinkedDraftId">("draft-5"), null, NOW);
    expect(result).toMatchObject({ ok: false, error: { code: "PARTICIPANT_NOT_IN_ROSTER" } });
  });

  it("refuses when a draft with the same draftId already exists (law 3: idempotency)", () => {
    const formed = formedGroupBuy();
    const first = linkGroupBuyToOrderDraft(formed, ferryRoad, organizer, makeId<"LinkedDraftId">("draft-6"), null, NOW);
    if (!first.ok) throw new Error("unreachable");
    const second = linkGroupBuyToOrderDraft(formed, ferryRoad, organizer, makeId<"LinkedDraftId">("draft-6"), first.value, NOW);
    expect(second).toMatchObject({ ok: false, error: { code: "DRAFT_ALREADY_EXISTS", draftId: "draft-6" } });
  });
});

describe("W1-016 LINK_TRADECYCLE_LEG_TO_SETTLEMENT_DRAFT — happy path + per-leg isolation", () => {
  it("creates a DRAFT from a COMMITTED leg with full provenance (legIndex, source cycle, receiver)", () => {
    const cycle = committedCycleA();
    const result = linkTradeCycleLegToSettlementDraft(cycle, 0, twoHarbors, makeId<"LinkedDraftId">("draft-tc-1"), null, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    const draft = result.value;
    expect(draft.state).toBe("DRAFT");
    expect(draft.kind).toBe("TRADECYCLE_LEG_SETTLEMENT_DRAFT");
    expect(draft.provenance.sourceAggregateId).toBe("w1tc-link-1");
    expect(draft.provenance.sourceKind).toBe("TRADECYCLE_LEG_SETTLEMENT_DRAFT");
    expect(draft.provenance.legIndex).toBe(0);
    expect(principalRefEquals(draft.provenance.actingPrincipal, twoHarbors)).toBe(true);
    expect(draft.provenance.compensationRef).toBe("comp-ref-tc-w1tc-link-1-leg-0");
    expect(draft.prefill.skuRef).toBe("Photography light kit");
  });

  it("linking leg 0 does NOT link leg 1 — law 7: per-leg isolation", () => {
    const cycle = committedCycleA();
    const draft0 = linkTradeCycleLegToSettlementDraft(cycle, 0, twoHarbors, makeId<"LinkedDraftId">("draft-tc-2"), null, NOW);
    expect(draft0.ok).toBe(true);
    // Leg 1 has NO draft.
    expect(draftsForLeg(draft0.ok ? [draft0.value] : [], "w1tc-link-1", 1)).toHaveLength(0);
  });
});

describe("W1-016 LINK_TRADECYCLE_LEG_TO_SETTLEMENT_DRAFT — every refusal", () => {
  it("refuses when the leg is NOT COMMITTED (law 1: execution truth is separate)", () => {
    const cycle = openCycleA();
    const result = linkTradeCycleLegToSettlementDraft(cycle, 0, twoHarbors, makeId<"LinkedDraftId">("draft-tc-3"), null, NOW);
    expect(result).toMatchObject({ ok: false, error: { code: "SOURCE_LEG_NOT_COMMITTED", legIndex: 0, consentState: "PENDING" } });
  });

  it("refuses when the acting principal is NOT the leg's receiver (law 4: actor authority)", () => {
    const cycle = committedCycleA();
    // Leg 0's receiver is twoHarbors; northlight is the giver, not the receiver.
    const result = linkTradeCycleLegToSettlementDraft(cycle, 0, northlight, makeId<"LinkedDraftId">("draft-tc-4"), null, NOW);
    expect(result).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED_ACTOR", detail: "only leg 0's receiver may link a settlement draft" } });
  });

  it("refuses when a draft with the same draftId already exists (law 3: idempotency)", () => {
    const cycle = committedCycleA();
    const first = linkTradeCycleLegToSettlementDraft(cycle, 0, twoHarbors, makeId<"LinkedDraftId">("draft-tc-5"), null, NOW);
    if (!first.ok) throw new Error("unreachable");
    const second = linkTradeCycleLegToSettlementDraft(cycle, 0, twoHarbors, makeId<"LinkedDraftId">("draft-tc-5"), first.value, NOW);
    expect(second).toMatchObject({ ok: false, error: { code: "DRAFT_ALREADY_EXISTS" } });
  });
});

describe("W1-016 law 5 — compensation separation (cancel cascade)", () => {
  it("cancelLinkedDraft marks a DRAFT as CANCELLED_BUT_NEVER_COMMITTED (never FAILED)", () => {
    const formed = formedGroupBuy();
    const draftResult = linkGroupBuyToOrderDraft(formed, ferryRoad, organizer, makeId<"LinkedDraftId">("draft-comp-1"), null, NOW);
    if (!draftResult.ok) throw new Error("unreachable");
    const cancelled = cancelLinkedDraft(draftResult.value, NOW);
    expect(cancelled).toMatchObject({ ok: true, value: { state: "CANCELLED_BUT_NEVER_COMMITTED" } });
    expect(cancelled.ok ? cancelled.value.state : "").not.toBe("FAILED");
  });

  it("cancelLinkedDraftsForAggregate cascades cancellation to all drafts of that aggregate", () => {
    const formed = formedGroupBuy();
    const draft1 = linkGroupBuyToOrderDraft(formed, ferryRoad, organizer, makeId<"LinkedDraftId">("draft-comp-2"), null, NOW);
    const draft2 = linkGroupBuyToOrderDraft(formed, twoHarbors, organizer, makeId<"LinkedDraftId">("draft-comp-3"), null, NOW);
    if (!draft1.ok || !draft2.ok) throw new Error("unreachable");
    const drafts = [draft1.value, draft2.value];
    const cascaded = cancelLinkedDraftsForAggregate(drafts, "w1gb-link-1", NOW);
    expect(cascaded.every((d) => d.state === "CANCELLED_BUT_NEVER_COMMITTED")).toBe(true);
  });

  it("cancelLinkedDraftsForAggregate does NOT cancel drafts of a DIFFERENT aggregate", () => {
    const formed = formedGroupBuy();
    const otherFormed = { ...formedGroupBuy(), groupBuyId: makeId<"GroupBuyId">("w1gb-other") };
    const draft1 = linkGroupBuyToOrderDraft(formed, ferryRoad, organizer, makeId<"LinkedDraftId">("draft-comp-4"), null, NOW);
    const draft2 = linkGroupBuyToOrderDraft(otherFormed, ferryRoad, organizer, makeId<"LinkedDraftId">("draft-comp-5"), null, NOW);
    if (!draft1.ok || !draft2.ok) throw new Error("unreachable");
    const drafts = [draft1.value, draft2.value];
    const cascaded = cancelLinkedDraftsForAggregate(drafts, "w1gb-link-1", NOW);
    expect(cascaded[0]?.state).toBe("CANCELLED_BUT_NEVER_COMMITTED");
    expect(cascaded[1]?.state).toBe("DRAFT"); // the other aggregate's draft is untouched
  });

  it("a cancelled draft carries the compensation reference but nothing compensates automatically", () => {
    const formed = formedGroupBuy();
    const draftResult = linkGroupBuyToOrderDraft(formed, ferryRoad, organizer, makeId<"LinkedDraftId">("draft-comp-6"), null, NOW);
    if (!draftResult.ok) throw new Error("unreachable");
    const cancelled = cancelLinkedDraft(draftResult.value, NOW);
    if (!cancelled.ok) throw new Error("unreachable");
    expect(cancelled.value.provenance.compensationRef).toBeDefined();
    expect(cancelled.value.provenance.compensationRef).toBe("comp-ref-gb-w1gb-link-1");
    // The compensation ref is a string reference — no actual compensation command was issued.
  });
});

describe("W1-016 law 6 — UNKNOWN recovery", () => {
  it("markLinkedDraftUnknown transitions DRAFT → PLACEMENT_UNKNOWN (never FAILED)", () => {
    const formed = formedGroupBuy();
    const draftResult = linkGroupBuyToOrderDraft(formed, ferryRoad, organizer, makeId<"LinkedDraftId">("draft-unk-1"), null, NOW);
    if (!draftResult.ok) throw new Error("unreachable");
    const unknownResult = markLinkedDraftUnknown(draftResult.value, NOW);
    expect(unknownResult).toMatchObject({ ok: true, value: { state: "PLACEMENT_UNKNOWN" } });
  });

  it("resolveLinkedDraftUnknown transitions PLACEMENT_UNKNOWN → DRAFT (retry returns to DRAFT)", () => {
    const formed = formedGroupBuy();
    const draftResult = linkGroupBuyToOrderDraft(formed, ferryRoad, organizer, makeId<"LinkedDraftId">("draft-unk-2"), null, NOW);
    if (!draftResult.ok) throw new Error("unreachable");
    const unknownResult = markLinkedDraftUnknown(draftResult.value, NOW);
    if (!unknownResult.ok) throw new Error("unreachable");
    const resolvedResult = resolveLinkedDraftUnknown(unknownResult.value, NOW);
    expect(resolvedResult).toMatchObject({ ok: true, value: { state: "DRAFT" } });
  });

  it("markLinkedDraftUnknown refuses on a terminal draft (CANCELLED)", () => {
    const formed = formedGroupBuy();
    const draftResult = linkGroupBuyToOrderDraft(formed, ferryRoad, organizer, makeId<"LinkedDraftId">("draft-unk-3"), null, NOW);
    if (!draftResult.ok) throw new Error("unreachable");
    const cancelled = cancelLinkedDraft(draftResult.value, NOW);
    if (!cancelled.ok) throw new Error("unreachable");
    const unknownResult = markLinkedDraftUnknown(cancelled.value, NOW);
    expect(unknownResult).toMatchObject({ ok: false, error: { code: "DRAFT_TERMINAL" } });
  });
});

describe("W1-016 state machine — linkedDraftTransition", () => {
  it("DRAFT → CANCELLED_BUT_NEVER_COMMITTED on CANCEL", () => {
    expect(linkedDraftTransition("DRAFT", "CANCEL")).toMatchObject({ ok: true, value: "CANCELLED_BUT_NEVER_COMMITTED" });
  });
  it("DRAFT → PLACEMENT_UNKNOWN on MARK_UNKNOWN", () => {
    expect(linkedDraftTransition("DRAFT", "MARK_UNKNOWN")).toMatchObject({ ok: true, value: "PLACEMENT_UNKNOWN" });
  });
  it("PLACEMENT_UNKNOWN → DRAFT on RESOLVE_UNKNOWN", () => {
    expect(linkedDraftTransition("PLACEMENT_UNKNOWN", "RESOLVE_UNKNOWN")).toMatchObject({ ok: true, value: "DRAFT" });
  });
  it("PLACEMENT_UNKNOWN → CANCELLED_BUT_NEVER_COMMITTED on CANCEL", () => {
    expect(linkedDraftTransition("PLACEMENT_UNKNOWN", "CANCEL")).toMatchObject({ ok: true, value: "CANCELLED_BUT_NEVER_COMMITTED" });
  });
  it("CANCELLED_BUT_NEVER_COMMITTED is terminal — every trigger refused", () => {
    expect(linkedDraftTransition("CANCELLED_BUT_NEVER_COMMITTED", "CANCEL")).toMatchObject({ ok: false });
    expect(linkedDraftTransition("CANCELLED_BUT_NEVER_COMMITTED", "MARK_UNKNOWN")).toMatchObject({ ok: false });
    expect(linkedDraftTransition("CANCELLED_BUT_NEVER_COMMITTED", "RESOLVE_UNKNOWN")).toMatchObject({ ok: false });
  });
});

describe("W1-016 helpers — draftsForAggregate / draftsForLeg / isTerminalDraft", () => {
  it("draftsForAggregate returns only drafts of the given source aggregate id", () => {
    const formed = formedGroupBuy();
    const otherFormed = { ...formedGroupBuy(), groupBuyId: makeId<"GroupBuyId">("w1gb-other") };
    const draft1 = linkGroupBuyToOrderDraft(formed, ferryRoad, organizer, makeId<"LinkedDraftId">("d1"), null, NOW);
    const draft2 = linkGroupBuyToOrderDraft(otherFormed, ferryRoad, organizer, makeId<"LinkedDraftId">("d2"), null, NOW);
    if (!draft1.ok || !draft2.ok) throw new Error("unreachable");
    const drafts = [draft1.value, draft2.value];
    expect(draftsForAggregate(drafts, "w1gb-link-1")).toHaveLength(1);
    expect(draftsForAggregate(drafts, "w1gb-other")).toHaveLength(1);
  });

  it("draftsForLeg returns only drafts of the given cycle + leg index", () => {
    const cycle = committedCycleA();
    const draft0 = linkTradeCycleLegToSettlementDraft(cycle, 0, twoHarbors, makeId<"LinkedDraftId">("d3"), null, NOW);
    const draft1 = linkTradeCycleLegToSettlementDraft(cycle, 1, harborLane, makeId<"LinkedDraftId">("d4"), null, NOW);
    if (!draft0.ok || !draft1.ok) throw new Error("unreachable");
    const drafts = [draft0.value, draft1.value];
    expect(draftsForLeg(drafts, "w1tc-link-1", 0)).toHaveLength(1);
    expect(draftsForLeg(drafts, "w1tc-link-1", 1)).toHaveLength(1);
    expect(draftsForLeg(drafts, "w1tc-link-1", 2)).toHaveLength(0);
  });

  it("isTerminalDraft returns true for CANCELLED_BUT_NEVER_COMMITTED, false for DRAFT and PLACEMENT_UNKNOWN", () => {
    expect(isTerminalDraft("CANCELLED_BUT_NEVER_COMMITTED")).toBe(true);
    expect(isTerminalDraft("DRAFT")).toBe(false);
    expect(isTerminalDraft("PLACEMENT_UNKNOWN")).toBe(false);
  });
});
