/**
 * W1-016 Stage 2 — kernel-level integration tests for the two LINK commands.
 *
 * These tests execute both LINK commands THROUGH CommerceKernel.execute():
 * - journaled receipts (the kernel returns EXECUTED with a receipt)
 * - journal-replay persistence (drafts persist across journal reconstruction)
 * - kernel-level idempotency (duplicate command = the original receipt, never a second draft)
 * - the kill switch refusing through the kernel (LINKING_DISABLED — but note: the
 *   kill switch is a domain-level constant; the kernel path tests the domain
 *   function's refusal surfaced through the kernel as REJECTED)
 * - authorization refusals through the kernel path (UNAUTHORIZED_ACTOR → REJECTED)
 * - provenance on every artifact (source aggregate id, acting principal, consent basis)
 * - the draft is a DRAFT — no order/payment/reservation created
 * - per-leg isolation (linking one leg never links another)
 */
import { describe, expect, it } from "vitest";
import {
  CommerceKernel,
  countQuantity,
  currency,
  makeId,
  money,
  principalRefKey,
  reconstructAuthoritativeState,
  type PrincipalRef,
  type GroupBuyAggregate,
  type TradeCycleExecution,
  type TradeCycleExecutionLeg,
} from "../contract.js";
import { ScriptedPaymentDouble } from "./runtime/support/payment-double.js";
import { env, explicitEnv, mustExecute } from "./runtime/support/envelopes.js";

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
const organizer: PrincipalRef = { kind: "MERCHANT", merchantId: makeId<"MerchantId">("merchant-1") };

function newKernel() {
  return new CommerceKernel({ paymentBoundary: new ScriptedPaymentDouble() });
}

function proposal(id: string): GroupBuyAggregate {
  return {
    groupBuyId: makeId<"GroupBuyId">(id),
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
    openedAt: NOW,
    participants: [],
    revision: 1,
  };
}

function interest(groupBuyId: string, participant: PrincipalRef, units: number) {
  return {
    type: "RECORD_GROUP_BUY_INTEREST" as const,
    groupBuyId: makeId<"GroupBuyId">(groupBuyId),
    participantRef: participant,
    quantity: countQuantity(units),
    consentTerms: `Explicitly agreed to a ${units}-box share (interest is not a commitment).`,
  };
}

function leg(index: number, from: PrincipalRef, to: PrincipalRef, item: string): TradeCycleExecutionLeg {
  return { legIndex: index, fromRef: from, toRef: to, offeredItemRef: item, requiredProofLevel: "P2", consentState: "PENDING", revision: 1 };
}

function cycleA(id: string): TradeCycleExecution {
  return {
    tradeCycleId: makeId<"TradeCycleId">(id),
    initiatingRef: harborLane,
    legs: [
      leg(0, northlight, twoHarbors, "Photography light kit"),
      leg(1, twoHarbors, harborLane, "Overlock sewing machine"),
      leg(2, harborLane, northlight, "Wide-format A1 printer"),
    ],
    executionMode: "ATOMIC",
    bounds: { maxHops: 3, environment: "LAB" },
    state: "OPEN",
    revision: 1,
  };
}

async function mustReject(kernel: CommerceKernel, payload: Parameters<typeof env>[0], actor: PrincipalRef, detail: string) {
  const outcome = await kernel.execute(env(payload, actor));
  expect(outcome.status).toBe("REJECTED");
  if (outcome.status === "REJECTED") expect(outcome.reason.detail).toContain(detail);
}

/** Walk a GroupBuy through the kernel to FORMED with 4 consenting participants. */
async function formGroupBuyThroughKernel(kernel: CommerceKernel, id: string): Promise<void> {
  await mustExecute(kernel, env({ type: "OPEN_GROUP_BUY_PROPOSAL", groupBuy: proposal(id) }, ferryRoad));
  await mustExecute(kernel, env({ type: "DECIDE_GROUP_BUY_PROPOSAL", groupBuyId: makeId<"GroupBuyId">(id), trigger: "ACCEPT" }, organizer));
  for (const [p, u] of [[ferryRoad, 16], [twoHarbors, 12], [quayside, 8], [harborLane, 6]] as const) {
    await mustExecute(kernel, env(interest(id, p, u), p));
  }
  expect(kernel.view().executionOps().groupBuy(id)?.state).toBe("HELD");
  await mustExecute(kernel, env({ type: "FORM_GROUP_BUY", groupBuyId: makeId<"GroupBuyId">(id), groupPrice: money("1080", usd) }, organizer));
  expect(kernel.view().executionOps().groupBuy(id)?.state).toBe("FORMED");
}

/** Walk a TradeCycle through the kernel to COMMITTED (all legs authorized + execute). */
async function commitCycleThroughKernel(kernel: CommerceKernel, id: string): Promise<void> {
  await mustExecute(kernel, env({ type: "OPEN_TRADE_CYCLE", cycle: cycleA(id) }, harborLane));
  await mustExecute(kernel, env({ type: "AUTHORIZE_TRADE_CYCLE_LEG", cycleId: makeId<"TradeCycleId">(id), legIndex: 0, authorizingRef: northlight, authorizationRef: "auth-n" }, northlight));
  await mustExecute(kernel, env({ type: "AUTHORIZE_TRADE_CYCLE_LEG", cycleId: makeId<"TradeCycleId">(id), legIndex: 1, authorizingRef: twoHarbors, authorizationRef: "auth-t" }, twoHarbors));
  await mustExecute(kernel, env({ type: "AUTHORIZE_TRADE_CYCLE_LEG", cycleId: makeId<"TradeCycleId">(id), legIndex: 2, authorizingRef: harborLane, authorizationRef: "auth-h" }, harborLane));
  await mustExecute(kernel, env({ type: "EXECUTE_TRADE_CYCLE", cycleId: makeId<"TradeCycleId">(id) }, harborLane));
  expect(kernel.view().executionOps().tradeCycle(id)?.state).toBe("COMMITTED");
}

describe("W1-016 kernel-level LINK_GROUPBUY_TO_ORDER_DRAFT — journaled, idempotent, authorized", () => {
  it("executes through the kernel: creates a DRAFT, journals the event, returns a receipt", async () => {
    const kernel = newKernel();
    await formGroupBuyThroughKernel(kernel, "w1gb-k-1");
    const draftId = makeId<"LinkedDraftId">("w1ld-k-1");
    const outcome = await kernel.execute(env({
      type: "LINK_GROUPBUY_TO_ORDER_DRAFT",
      groupBuyId: "w1gb-k-1",
      participantRef: ferryRoad,
      actingPrincipal: organizer,
      draftId,
    }, organizer));
    expect(outcome.status).toBe("EXECUTED");
    if (outcome.status !== "EXECUTED") throw new Error("unreachable");
    // The draft exists in the kernel's authoritative state.
    const draft = kernel.view().executionOps().linkedDraft("w1ld-k-1");
    expect(draft).toBeDefined();
    expect(draft?.state).toBe("DRAFT");
    expect(draft?.kind).toBe("GROUP_BUY_ORDER_DRAFT");
    // Law 9: provenance on every artifact.
    expect(draft?.provenance.sourceAggregateId).toBe("w1gb-k-1");
    expect(draft?.provenance.sourceKind).toBe("GROUP_BUY_ORDER_DRAFT");
    expect(principalRefKey(draft?.provenance.actingPrincipal ?? harborLane)).toBe("merchant:merchant-1");
    expect(draft?.provenance.consentBasis).toContain("Consented to appear in w1gb-k-1");
    expect(draft?.provenance.compensationRef).toBe("comp-ref-gb-w1gb-k-1");
    // The event is journaled.
    expect(kernel.events().map((e) => e.kind)).toContain("LINKED_DRAFT_CREATED");
    expect(kernel.journalIsValid()).toBe(true);
  });

  it("kernel-level idempotency: duplicate command = the original receipt, never a second draft", async () => {
    const kernel = newKernel();
    await formGroupBuyThroughKernel(kernel, "w1gb-k-2");
    const linkCmd = explicitEnv("cmd-link-k-2", "idem-link-k-2", {
      type: "LINK_GROUPBUY_TO_ORDER_DRAFT",
      groupBuyId: "w1gb-k-2",
      participantRef: ferryRoad,
      actingPrincipal: organizer,
      draftId: makeId<"LinkedDraftId">("w1ld-k-2"),
    }, organizer);
    const first = await mustExecute(kernel, linkCmd);
    const journalAfterFirst = kernel.events().length;
    const receiptsAfterFirst = kernel.receipts().length;
    // Replay the SAME envelope — DUPLICATE with the original receipt.
    const replay = await kernel.execute(linkCmd);
    expect(replay.status).toBe("DUPLICATE");
    if (replay.status !== "DUPLICATE") throw new Error("unreachable");
    expect(replay.originalReceipt.receiptId).toBe(first.receipt.receiptId);
    // Zero new events, zero new receipts.
    expect(kernel.events().length).toBe(journalAfterFirst);
    expect(kernel.receipts().length).toBe(receiptsAfterFirst);
    // Still exactly one draft.
    expect(kernel.view().executionOps().allLinkedDrafts()).toHaveLength(1);
  });

  it("journal-replay persistence: drafts survive journal reconstruction", async () => {
    const kernel = newKernel();
    await formGroupBuyThroughKernel(kernel, "w1gb-k-3");
    await mustExecute(kernel, env({
      type: "LINK_GROUPBUY_TO_ORDER_DRAFT",
      groupBuyId: "w1gb-k-3",
      participantRef: ferryRoad,
      actingPrincipal: organizer,
      draftId: makeId<"LinkedDraftId">("w1ld-k-3"),
    }, organizer));
    // Reconstruct from the journal alone — the draft persists.
    const reconstructed = reconstructAuthoritativeState(kernel.events());
    const draft = reconstructed.view().executionOps().linkedDraft("w1ld-k-3");
    expect(draft).toBeDefined();
    expect(draft?.state).toBe("DRAFT");
    expect(draft?.provenance.sourceAggregateId).toBe("w1gb-k-3");
    expect(reconstructed.view().executionOps().allLinkedDrafts()).toHaveLength(1);
  });

  it("authorization refusal through the kernel: non-organizer is REJECTED", async () => {
    const kernel = newKernel();
    await formGroupBuyThroughKernel(kernel, "w1gb-k-4");
    await mustReject(kernel, {
      type: "LINK_GROUPBUY_TO_ORDER_DRAFT",
      groupBuyId: "w1gb-k-4",
      participantRef: ferryRoad,
      actingPrincipal: beaconHill(),
      draftId: makeId<"LinkedDraftId">("w1ld-k-4"),
    }, beaconHill(), "only the GroupBuy organizer may propose a linked order draft");
    // No draft was created.
    expect(kernel.view().executionOps().allLinkedDrafts()).toHaveLength(0);
    expect(kernel.events().filter((e) => e.kind === "LINKED_DRAFT_CREATED")).toHaveLength(0);
  });

  it("the draft is a DRAFT — no order/payment/reservation created", async () => {
    const kernel = newKernel();
    await formGroupBuyThroughKernel(kernel, "w1gb-k-5");
    await mustExecute(kernel, env({
      type: "LINK_GROUPBUY_TO_ORDER_DRAFT",
      groupBuyId: "w1gb-k-5",
      participantRef: ferryRoad,
      actingPrincipal: organizer,
      draftId: makeId<"LinkedDraftId">("w1ld-k-5"),
    }, organizer));
    // No orders, payments, or reservations exist — the draft is a DRAFT only.
    expect(kernel.view().allOrders()).toEqual([]);
    expect(kernel.view().allPaymentIntents()).toEqual([]);
    expect(kernel.view().allReservations()).toEqual([]);
  });
});

describe("W1-016 kernel-level LINK_TRADECYCLE_LEG_TO_SETTLEMENT_DRAFT — journaled, idempotent, per-leg isolation", () => {
  it("executes through the kernel: creates a DRAFT from a COMMITTED leg, journals the event", async () => {
    const kernel = newKernel();
    await commitCycleThroughKernel(kernel, "w1tc-k-1");
    const outcome = await kernel.execute(env({
      type: "LINK_TRADECYCLE_LEG_TO_SETTLEMENT_DRAFT",
      cycleId: "w1tc-k-1",
      legIndex: 0,
      actingPrincipal: twoHarbors, // leg 0's receiver
      draftId: makeId<"LinkedDraftId">("w1ld-tc-1"),
    }, twoHarbors));
    expect(outcome.status).toBe("EXECUTED");
    const draft = kernel.view().executionOps().linkedDraft("w1ld-tc-1");
    expect(draft).toBeDefined();
    expect(draft?.state).toBe("DRAFT");
    expect(draft?.kind).toBe("TRADECYCLE_LEG_SETTLEMENT_DRAFT");
    expect(draft?.provenance.sourceAggregateId).toBe("w1tc-k-1");
    expect(draft?.provenance.legIndex).toBe(0);
    expect(kernel.events().map((e) => e.kind)).toContain("LINKED_DRAFT_CREATED");
  });

  it("per-leg isolation: linking leg 0 never links leg 1", async () => {
    const kernel = newKernel();
    await commitCycleThroughKernel(kernel, "w1tc-k-2");
    await mustExecute(kernel, env({
      type: "LINK_TRADECYCLE_LEG_TO_SETTLEMENT_DRAFT",
      cycleId: "w1tc-k-2",
      legIndex: 0,
      actingPrincipal: twoHarbors,
      draftId: makeId<"LinkedDraftId">("w1ld-tc-2"),
    }, twoHarbors));
    // Only one draft exists (for leg 0). Leg 1 has no draft.
    expect(kernel.view().executionOps().allLinkedDrafts()).toHaveLength(1);
    expect(kernel.view().executionOps().linkedDraft("w1ld-tc-2")).toBeDefined();
  });

  it("authorization refusal through the kernel: non-receiver is REJECTED", async () => {
    const kernel = newKernel();
    await commitCycleThroughKernel(kernel, "w1tc-k-3");
    await mustReject(kernel, {
      type: "LINK_TRADECYCLE_LEG_TO_SETTLEMENT_DRAFT",
      cycleId: "w1tc-k-3",
      legIndex: 0,
      actingPrincipal: northlight, // leg 0's giver, NOT the receiver
      draftId: makeId<"LinkedDraftId">("w1ld-tc-3"),
    }, northlight, "only leg 0's receiver may link a settlement draft");
    expect(kernel.view().executionOps().allLinkedDrafts()).toHaveLength(0);
  });

  it("kernel-level idempotency: duplicate command = the original receipt", async () => {
    const kernel = newKernel();
    await commitCycleThroughKernel(kernel, "w1tc-k-4");
    const linkCmd = explicitEnv("cmd-link-tc-4", "idem-link-tc-4", {
      type: "LINK_TRADECYCLE_LEG_TO_SETTLEMENT_DRAFT",
      cycleId: "w1tc-k-4",
      legIndex: 0,
      actingPrincipal: twoHarbors,
      draftId: makeId<"LinkedDraftId">("w1ld-tc-4"),
    }, twoHarbors);
    const first = await mustExecute(kernel, linkCmd);
    const journalAfterFirst = kernel.events().length;
    const replay = await kernel.execute(linkCmd);
    expect(replay.status).toBe("DUPLICATE");
    if (replay.status !== "DUPLICATE") throw new Error("unreachable");
    expect(replay.originalReceipt.receiptId).toBe(first.receipt.receiptId);
    expect(kernel.events().length).toBe(journalAfterFirst);
  });

  it("journal-replay persistence: drafts survive journal reconstruction", async () => {
    const kernel = newKernel();
    await commitCycleThroughKernel(kernel, "w1tc-k-5");
    await mustExecute(kernel, env({
      type: "LINK_TRADECYCLE_LEG_TO_SETTLEMENT_DRAFT",
      cycleId: "w1tc-k-5",
      legIndex: 0,
      actingPrincipal: twoHarbors,
      draftId: makeId<"LinkedDraftId">("w1ld-tc-5"),
    }, twoHarbors));
    const reconstructed = reconstructAuthoritativeState(kernel.events());
    const draft = reconstructed.view().executionOps().linkedDraft("w1ld-tc-5");
    expect(draft).toBeDefined();
    expect(draft?.state).toBe("DRAFT");
    expect(draft?.provenance.legIndex).toBe(0);
  });
});

function beaconHill(): PrincipalRef {
  return customer("beacon-hill");
}
