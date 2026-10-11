/**
 * W1-014 Stage 0 — Linking Law 1: Formation/execution truth is separate from
 * downstream commitments.
 *
 * BINDING LAW (decision packet §2.1): a formed GroupBuy is not an order; an
 * executed leg is not a payment. Linking must be a SEPARATE, individually
 * authorized command — never an automatic side effect of formation/execution.
 *
 * Stage 0 spec against the CURRENT command surface: every GroupBuy formation
 * command (OPEN / RECORD_INTEREST / WITHDRAW / DECIDE / FORM / CLOSE / EXPIRE)
 * and every TradeCycle execution command (OPEN / AUTHORIZE_LEG / REFUSE_LEG /
 * WITHDRAW_LEG / LAPSE_LEG / EXECUTE / EXECUTE_LEG / ROLLBACK_LEG) produces
 * the formation/execution truth ONLY. The kernel state after these commands
 * contains NO order, NO payment intent, NO reservation, NO dispute, NO
 * chargeback, NO refund — those objects live on their own separately-authorized
 * command paths (PLACE_ORDER / CREATE_PAYMENT_INTENT / RESERVE_INVENTORY /
 * OPEN_DISPUTE / RECORD_CHARGEBACK / REFUND_PAYMENT), each with its own actor
 * and idempotency key. Stage 2 may eventually introduce a LINK command; until
 * then the boundary is honestly observable as the absence of every downstream
 * object.
 *
 * Every assertion below is the negative form `expect(...).toHaveLength(0)` /
 * `toEqual([])` against the kernel's own snapshot accessors — never a stub.
 */
import { describe, expect, it } from "vitest";
import {
  CommerceKernel,
  countQuantity,
  currency,
  makeId,
  money,
  reconstructAuthoritativeState,
  type GroupBuyAggregate,
  type PrincipalRef,
  type TradeCycleExecution,
  type TradeCycleExecutionLeg,
} from "../contract.js";
import { ScriptedPaymentDouble } from "./runtime/support/payment-double.js";
import { env, mustExecute } from "./runtime/support/envelopes.js";

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
    consentTerms: `Explicitly agreed to appear with a ${units}-box share (interest is not a commitment).`,
  };
}

function leg(index: number, from: PrincipalRef, to: PrincipalRef, item: string): TradeCycleExecutionLeg {
  return {
    legIndex: index,
    fromRef: from,
    toRef: to,
    offeredItemRef: item,
    requiredProofLevel: "P2",
    consentState: "PENDING",
    revision: 1,
  };
}

function cycleA(id: string, mode: "ATOMIC" | "STAGED_WITH_RECOURSE" = "ATOMIC"): TradeCycleExecution {
  return {
    tradeCycleId: makeId<"TradeCycleId">(id),
    initiatingRef: harborLane,
    legs: [
      leg(0, northlight, twoHarbors, "Photography light kit (3 heads)"),
      leg(1, twoHarbors, harborLane, "Overlock sewing machine (4-thread)"),
      leg(2, harborLane, northlight, "Wide-format A1 printer"),
    ],
    executionMode: mode,
    bounds: { maxHops: 3, environment: "LAB" },
    recoursePlanRef: mode === "STAGED_WITH_RECOURSE" ? "rcp-cycle-a" : undefined,
    state: "OPEN",
    revision: 1,
  };
}

function authorize(cycleId: string, legIndex: number, giver: PrincipalRef, authorizationRef: string) {
  return {
    type: "AUTHORIZE_TRADE_CYCLE_LEG" as const,
    cycleId: makeId<"TradeCycleId">(cycleId),
    legIndex,
    authorizingRef: giver,
    authorizationRef,
  };
}

function newKernel() {
  return new CommerceKernel({ paymentBoundary: new ScriptedPaymentDouble() });
}

/** Asserts every downstream commitment collection is empty — the boundary law. */
function assertNoDownstreamCommitments(kernel: CommerceKernel, label: string) {
  const view = kernel.view();
  expect(view.allOrders(), `${label}: no orders`).toEqual([]);
  expect(view.allPaymentIntents(), `${label}: no payment intents`).toEqual([]);
  expect(view.allReservations(), `${label}: no reservations`).toEqual([]);
  expect(view.allDisputes(), `${label}: no disputes`).toEqual([]);
  expect(view.allChargebacks(), `${label}: no chargebacks`).toEqual([]);
  expect(view.allRefunds(), `${label}: no refunds`).toEqual([]);
  expect(view.allCaptures(), `${label}: no captures`).toEqual([]);
  expect(view.allReturns(), `${label}: no returns`).toEqual([]);
  expect(view.allFulfillments(), `${label}: no fulfillment orders`).toEqual([]);
}

/** Walk a GroupBuy proposal through to FORMED with five consenting participants.
 *  Interest recorded AFTER ACCEPT is what promotes MONITORING → HELD (the
 *  threshold check fires inside recordGroupBuyInterest while in MONITORING). */
async function formGroupBuy(kernel: CommerceKernel, id: string): Promise<void> {
  await mustExecute(kernel, env({ type: "OPEN_GROUP_BUY_PROPOSAL", groupBuy: proposal(id) }, ferryRoad));
  // Three participants express interest while PENDING.
  for (const [participant, units] of [
    [ferryRoad, 16],
    [twoHarbors, 12],
    [quayside, 12],
  ] as const) {
    await mustExecute(kernel, env(interest(id, participant, units), participant));
  }
  // Organizer accepts → MONITORING.
  await mustExecute(kernel, env({
    type: "DECIDE_GROUP_BUY_PROPOSAL",
    groupBuyId: makeId<"GroupBuyId">(id),
    trigger: "ACCEPT",
  }, organizer));
  // A 4th and 5th participant join WHILE MONITORING — the threshold check
  // fires on recordGroupBuyInterest and promotes to HELD when BOTH thresholds
  // (4+ participants, 40+ units) are met.
  await mustExecute(kernel, env(interest(id, harborLane, 6), harborLane));
  await mustExecute(kernel, env(interest(id, beaconHill, 8), beaconHill));
  expect(kernel.view().executionOps().groupBuy(id)?.state).toBe("HELD");
  // Formation is the organizer's explicit step.
  await mustExecute(kernel, env({
    type: "FORM_GROUP_BUY",
    groupBuyId: makeId<"GroupBuyId">(id),
    groupPrice: money("1080", usd),
  }, organizer));
}

describe("W1-014 linking law 1 — formation/execution truth ≠ downstream commitments", () => {
  it("forming a GroupBuy creates the formation truth only — no order, payment, reservation, dispute, chargeback, refund, capture, return or fulfillment is created", async () => {
    const kernel = newKernel();
    await formGroupBuy(kernel, "w1gb-sep-1");
    const formed = kernel.view().executionOps().groupBuy("w1gb-sep-1");
    expect(formed).toMatchObject({ state: "FORMED" });
    expect(formed?.formation).toBeDefined();
    expect(kernel.view().executionOps().allGroupBuys()).toHaveLength(1);
    // The boundary law: every downstream commitment collection stays empty.
    assertNoDownstreamCommitments(kernel, "after FORM_GROUP_BUY");
  });

  it("recording and withdrawing interest creates no downstream commitment (interest is never commitment)", async () => {
    const kernel = newKernel();
    await mustExecute(kernel, env({ type: "OPEN_GROUP_BUY_PROPOSAL", groupBuy: proposal("w1gb-sep-2") }, ferryRoad));
    await mustExecute(kernel, env(interest("w1gb-sep-2", ferryRoad, 16), ferryRoad));
    assertNoDownstreamCommitments(kernel, "after RECORD_GROUP_BUY_INTEREST");
    await mustExecute(kernel, env({
      type: "WITHDRAW_GROUP_BUY_INTEREST",
      groupBuyId: makeId<"GroupBuyId">("w1gb-sep-2"),
      participantRef: ferryRoad,
    }, ferryRoad));
    assertNoDownstreamCommitments(kernel, "after WITHDRAW_GROUP_BUY_INTEREST");
  });

  it("closing a formed GroupBuy and expiring a held GroupBuy create no downstream commitment (formation truth, not commerce commitment)", async () => {
    const kernel = newKernel();
    // CLOSE after FORMED.
    await formGroupBuy(kernel, "w1gb-sep-3");
    await mustExecute(kernel, env({
      type: "CLOSE_GROUP_BUY",
      groupBuyId: makeId<"GroupBuyId">("w1gb-sep-3"),
      reason: "Pool delivered",
    }, organizer));
    expect(kernel.view().executionOps().groupBuy("w1gb-sep-3")?.state).toBe("CLOSED");
    assertNoDownstreamCommitments(kernel, "after CLOSE_GROUP_BUY");
    // EXPIRE while HELD (SYSTEM records the Oct 20 window close).
    await mustExecute(kernel, env({ type: "OPEN_GROUP_BUY_PROPOSAL", groupBuy: proposal("w1gb-sep-4") }, ferryRoad));
    await mustExecute(kernel, env(interest("w1gb-sep-4", ferryRoad, 16), ferryRoad));
    await mustExecute(kernel, env(interest("w1gb-sep-4", twoHarbors, 12), twoHarbors));
    await mustExecute(kernel, env(interest("w1gb-sep-4", quayside, 12), quayside));
    await mustExecute(kernel, env({
      type: "DECIDE_GROUP_BUY_PROPOSAL",
      groupBuyId: makeId<"GroupBuyId">("w1gb-sep-4"),
      trigger: "ACCEPT",
    }, organizer));
    // A 4th participant joins WHILE MONITORING — the threshold check fires
    // inside recordGroupBuyInterest and promotes to HELD.
    await mustExecute(kernel, env(interest("w1gb-sep-4", harborLane, 6), harborLane));
    expect(kernel.view().executionOps().groupBuy("w1gb-sep-4")?.state).toBe("HELD");
    await mustExecute(kernel, env({
      type: "EXPIRE_GROUP_BUY",
      groupBuyId: makeId<"GroupBuyId">("w1gb-sep-4"),
    }, { kind: "SYSTEM", systemPrincipalId: makeId<"SystemPrincipalId">("system-1") }));
    expect(kernel.view().executionOps().groupBuy("w1gb-sep-4")?.state).toBe("EXPIRED");
    assertNoDownstreamCommitments(kernel, "after EXPIRE_GROUP_BUY");
  });

  it("executing a TradeCycle (ATOMIC COMMIT) creates the execution truth only — no order, payment, reservation or recourse object appears", async () => {
    const kernel = newKernel();
    await mustExecute(kernel, env({ type: "OPEN_TRADE_CYCLE", cycle: cycleA("w1tc-sep-1") }, harborLane));
    assertNoDownstreamCommitments(kernel, "after OPEN_TRADE_CYCLE");
    await mustExecute(kernel, env(authorize("w1tc-sep-1", 0, northlight, "auth-northlight-1"), northlight));
    await mustExecute(kernel, env(authorize("w1tc-sep-1", 1, twoHarbors, "auth-two-harbors-1"), twoHarbors));
    await mustExecute(kernel, env(authorize("w1tc-sep-1", 2, harborLane, "auth-harbor-lane-1"), harborLane));
    assertNoDownstreamCommitments(kernel, "after AUTHORIZE_TRADE_CYCLE_LEG (all legs)");
    await mustExecute(kernel, env({
      type: "EXECUTE_TRADE_CYCLE",
      cycleId: makeId<"TradeCycleId">("w1tc-sep-1"),
    }, harborLane));
    const committed = kernel.view().executionOps().tradeCycle("w1tc-sep-1");
    expect(committed).toMatchObject({ state: "COMMITTED" });
    expect(committed?.legs.every((one) => one.consentState === "COMMITTED")).toBe(true);
    // The execution truth is recorded; NOTHING downstream is created. The
    // offered items have no inventory reservation, no order, no payment —
    // linking those would require separately-authorized commands.
    assertNoDownstreamCommitments(kernel, "after EXECUTE_TRADE_CYCLE (COMMITTED)");
  });

  it("executing a STAGED_WITH_RECOURSE leg creates no downstream commitment; rolling back preserves the boundary", async () => {
    const kernel = newKernel();
    await mustExecute(kernel, env({ type: "OPEN_TRADE_CYCLE", cycle: cycleA("w1tc-sep-2", "STAGED_WITH_RECOURSE") }, harborLane));
    await mustExecute(kernel, env(authorize("w1tc-sep-2", 0, northlight, "auth-northlight-1"), northlight));
    await mustExecute(kernel, env(authorize("w1tc-sep-2", 1, twoHarbors, "auth-two-harbors-1"), twoHarbors));
    await mustExecute(kernel, env({
      type: "EXECUTE_TRADE_CYCLE_LEG",
      cycleId: makeId<"TradeCycleId">("w1tc-sep-2"),
      legIndex: 0,
    }, harborLane));
    expect(kernel.view().executionOps().tradeCycle("w1tc-sep-2")?.legs[0]?.consentState).toBe("COMMITTED");
    assertNoDownstreamCommitments(kernel, "after EXECUTE_TRADE_CYCLE_LEG (one leg committed)");
    // Refusal after a commit opens recourse; rollback completes it.
    await mustExecute(kernel, env({
      type: "REFUSE_TRADE_CYCLE_LEG",
      cycleId: makeId<"TradeCycleId">("w1tc-sep-2"),
      legIndex: 2,
      refusingRef: harborLane,
      reason: "Re-plan needed",
    }, harborLane));
    expect(kernel.view().executionOps().tradeCycle("w1tc-sep-2")?.state).toBe("RECOURSE_OPEN");
    assertNoDownstreamCommitments(kernel, "after REFUSE_TRADE_CYCLE_LEG (RECOURSE_OPEN)");
    await mustExecute(kernel, env({
      type: "ROLLBACK_TRADE_CYCLE_LEG",
      cycleId: makeId<"TradeCycleId">("w1tc-sep-2"),
      legIndex: 0,
      reason: "unwind the light-kit hop",
    }, harborLane));
    expect(kernel.view().executionOps().tradeCycle("w1tc-sep-2")?.state).toBe("ROLLED_BACK");
    assertNoDownstreamCommitments(kernel, "after ROLLBACK_TRADE_CYCLE_LEG (ROLLED_BACK)");
  });

  it("refusing or lapsing a TradeCycle leg creates no downstream commitment (no leg commits, no object appears)", async () => {
    const kernel = newKernel();
    // ATOMIC refusal: Northlight refuses leg 0 → cycle STOPPED_REFUSAL, nothing committed.
    await mustExecute(kernel, env({ type: "OPEN_TRADE_CYCLE", cycle: cycleA("w1tc-sep-3") }, harborLane));
    await mustExecute(kernel, env(authorize("w1tc-sep-3", 1, twoHarbors, "auth-two-harbors-1"), twoHarbors));
    await mustExecute(kernel, env({
      type: "REFUSE_TRADE_CYCLE_LEG",
      cycleId: makeId<"TradeCycleId">("w1tc-sep-3"),
      legIndex: 0,
      refusingRef: northlight,
      reason: "Cycle A does not serve my stated want",
    }, northlight));
    const stopped = kernel.view().executionOps().tradeCycle("w1tc-sep-3");
    expect(stopped).toMatchObject({ state: "STOPPED_REFUSAL" });
    expect(stopped?.legs.every((one) => one.consentState !== "COMMITTED")).toBe(true);
    assertNoDownstreamCommitments(kernel, "after REFUSE_TRADE_CYCLE_LEG (STOPPED_REFUSAL)");
    // Lapse: a consent window lapses on an unanswered leg → STOPPED_EXPIRY.
    await mustExecute(kernel, env({ type: "OPEN_TRADE_CYCLE", cycle: cycleA("w1tc-sep-4") }, harborLane));
    await mustExecute(kernel, env({
      type: "LAPSE_TRADE_CYCLE_LEG",
      cycleId: makeId<"TradeCycleId">("w1tc-sep-4"),
      legIndex: 1,
    }, twoHarbors));
    expect(kernel.view().executionOps().tradeCycle("w1tc-sep-4")?.state).toBe("STOPPED_EXPIRY");
    assertNoDownstreamCommitments(kernel, "after LAPSE_TRADE_CYCLE_LEG (STOPPED_EXPIRY)");
  });

  it("the boundary survives the full journal fold: reconstructing authoritative state from events alone yields the same empty downstream collections", async () => {
    const kernel = newKernel();
    await formGroupBuy(kernel, "w1gb-sep-5");
    await mustExecute(kernel, env({ type: "OPEN_TRADE_CYCLE", cycle: cycleA("w1tc-sep-5") }, harborLane));
    await mustExecute(kernel, env(authorize("w1tc-sep-5", 0, northlight, "auth-n"), northlight));
    await mustExecute(kernel, env(authorize("w1tc-sep-5", 1, twoHarbors, "auth-t"), twoHarbors));
    await mustExecute(kernel, env(authorize("w1tc-sep-5", 2, harborLane, "auth-h"), harborLane));
    await mustExecute(kernel, env({
      type: "EXECUTE_TRADE_CYCLE",
      cycleId: makeId<"TradeCycleId">("w1tc-sep-5"),
    }, harborLane));
    // The journal carries only GROUP_BUY_* and TRADE_CYCLE_* subject events —
    // formation/execution truth only. No ORDER/PAYMENT/INVENTORY/DISPUTE/
    // CHARGEBACK/REFUND/RETURN/FULFILLMENT event is ever appended by these
    // commands alone.
    const events = kernel.events();
    const downstreamSubjects = new Set(["ORDER", "PAYMENT", "INVENTORY", "DISPUTE", "CHARGEBACK", "REFUND", "RETURN", "FULFILLMENT"]);
    const downstreamKinds = events.filter((event) => downstreamSubjects.has(event.subject.subjectType));
    expect(downstreamKinds, "no downstream event kinds were journaled by formation/execution alone").toEqual([]);
    // Journal-only reconstruction (no receipts, no commands re-issued) yields
    // the SAME empty downstream state — the boundary is a fold invariant, not
    // a dispatch-time accident.
    const reconstructed = reconstructAuthoritativeState(events, { paymentBoundary: new ScriptedPaymentDouble() });
    const view = reconstructed.view();
    expect(view.allOrders()).toEqual([]);
    expect(view.allPaymentIntents()).toEqual([]);
    expect(view.allReservations()).toEqual([]);
    expect(view.allDisputes()).toEqual([]);
    expect(view.allChargebacks()).toEqual([]);
    expect(view.allRefunds()).toEqual([]);
    // The formation/execution truth IS reconstructed (the positive side of the boundary).
    expect(reconstructed.view().executionOps().allGroupBuys()).toHaveLength(1);
    expect(reconstructed.view().executionOps().allTradeCycles()).toHaveLength(1);
    expect(reconstructed.view().executionOps().allTradeCycles()[0]?.state).toBe("COMMITTED");
  });
});
