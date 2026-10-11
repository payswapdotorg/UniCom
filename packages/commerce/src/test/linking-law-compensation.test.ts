/**
 * W1-014 Stage 0 — Linking Law 5: Cancellation/compensation separation.
 *
 * BINDING LAW (decision packet §2.5): compensation (refund/unreserve) is its
 * own separately-authorized command, never automatic. Cancelling/refusing
 * upstream never auto-refunds or auto-unreserves; refund requires its own
 * authorized command.
 *
 * Stage 0 spec against the CURRENT command surface:
 * 1. Cancelling an order (CANCEL_ORDER) does NOT auto-refund the payment —
 *    REFUND_PAYMENT is a separate authorized command with its own idempotency
 *    key. The kernel's refundedTotalFor stays 0 until REFUND_PAYMENT executes.
 * 2. Closing or expiring a GroupBuy creates NO refund (no compensation
 *    command was issued).
 * 3. ATOMIC refusal of a TradeCycle creates NO rollback — compensation is
 *    not automatic; the legs' consent states are preserved (REFUSED,
 *    CONSENTED, PENDING) but NONE is ROLLED_BACK.
 * 4. STAGED_WITH_RECOURSE refusal OPENS RECOURSE but does NOT auto-rollback
 *    — ROLLBACK_TRADE_CYCLE_LEG is a separate authorized command (initiator-
 *    only, with an explicit reason). The committed leg stays COMMITTED until
 *    that separate command runs.
 * 5. Voiding a payment (VOID_PAYMENT) and refunding (REFUND_PAYMENT) are
 *    DISTINCT commands — voiding is not a refund; refunding is not a void.
 * 6. Releasing a reservation (RELEASE_RESERVATION) is a separate command
 *    from cancelling an order — even if an order is cancelled, the
 *    reservation stays OPEN until its own release/commit command.
 *
 * Where the future Stage 2 surface (linked-draft cancellation marking
 * downstream drafts cancelled-but-never-committed) is needed, a precisely-
 * documented `describe.skip` block records the gap.
 */
import { describe, expect, it } from "vitest";
import {
  CommerceKernel,
  countQuantity,
  currency,
  makeId,
  money,
  type GroupBuyAggregate,
  type PrincipalRef,
  type TradeCycleExecution,
  type TradeCycleExecutionLeg,
} from "../contract.js";
import { ScriptedPaymentDouble } from "./runtime/support/payment-double.js";
import { env, mustExecute } from "./runtime/support/envelopes.js";

const usd = currency("USD");
const NOW = "2026-10-12T09:00:00Z";
const merchant = makeId<"MerchantId">("merchant-1");
const organizer: PrincipalRef = { kind: "MERCHANT", merchantId: merchant };
const sku = makeId<"SkuId">("sku-tote");
const card = { methodKind: "CARD" as const, tokenRef: "tok-link-1" };

function customer(id: string): PrincipalRef {
  return { kind: "CUSTOMER", customerId: makeId<"CustomerId">(id) };
}

const ferryRoad = customer("ferry-road");
const twoHarbors = customer("two-harbors");
const quayside = customer("quayside");
const northlight = customer("northlight");
const harborLane = customer("harbor-lane");

function newKernel() {
  return new CommerceKernel({ paymentBoundary: new ScriptedPaymentDouble() });
}

function proposal(id: string): GroupBuyAggregate {
  return {
    groupBuyId: makeId<"GroupBuyId">(id),
    initiatorRef: ferryRoad,
    organizerRef: organizer,
    terms: {
      skuRef: sku,
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
      leg(0, northlight, twoHarbors, "Photography light kit"),
      leg(1, twoHarbors, harborLane, "Overlock sewing machine"),
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

/** Place an order + capture the payment — returns the paymentId. */
async function capturedPayment(kernel: CommerceKernel, tag: string, amountMinor: string) {
  await mustExecute(kernel, env({
    type: "ADD_CART_LINE",
    cartId: makeId<"CartId">(`cart-${tag}`),
    skuId: sku,
    quantity: countQuantity(1),
    unitPrice: money(amountMinor, usd),
  }));
  await mustExecute(kernel, env({ type: "PLACE_ORDER", cartId: makeId<"CartId">(`cart-${tag}`), merchantId: merchant }));
  const order = kernel.view().allOrders().find((item) => item.cartId === makeId<"CartId">(`cart-${tag}`))!;
  await mustExecute(kernel, env({
    type: "CREATE_PAYMENT_INTENT",
    request: { amount: money(amountMinor, usd), reference: { kind: "ORDER", orderId: order.orderId }, method: card },
  }));
  const intent = kernel.view().allPaymentIntents().find((item) => item.reference.kind === "ORDER" && item.reference.orderId === order.orderId)!;
  await mustExecute(kernel, env({ type: "CAPTURE_PAYMENT", paymentId: intent.paymentId }));
  return intent.paymentId;
}

describe("W1-014 linking law 5 — compensation is its own separately-authorized command, never automatic", () => {
  it("cancelling an order (CANCEL_ORDER) does NOT auto-refund the payment — REFUND_PAYMENT is a separate authorized command", async () => {
    const kernel = newKernel();
    const paymentId = await capturedPayment(kernel, "cancel", "12000");
    expect(kernel.view().refundedTotalFor(paymentId)).toBe(0n);
    // Cancel the order. The order transitions to CANCELLED but NO refund is
    // created — compensation requires its own REFUND_PAYMENT command.
    const order = kernel.view().allOrders()[0]!;
    await mustExecute(kernel, env({ type: "CANCEL_ORDER", orderId: order.orderId }));
    expect(kernel.view().order(order.orderId)?.state).toBe("CANCELLED");
    expect(kernel.view().refundedTotalFor(paymentId), "no auto-refund on cancel").toBe(0n);
    expect(kernel.view().allRefunds(), "no refund record created").toEqual([]);
    // The refund is a SEPARATE command with its own idempotency key.
    await mustExecute(kernel, env({ type: "REFUND_PAYMENT", paymentId, amount: money("12000", usd) }));
    expect(kernel.view().refundedTotalFor(paymentId)).toBe(12000n);
    expect(kernel.view().allRefunds()).toHaveLength(1);
  });

  it("closing a formed GroupBuy and expiring a held GroupBuy create NO refund (no compensation command was issued)", async () => {
    const kernel = newKernel();
    // CLOSE after FORMED — no refund appears.
    await mustExecute(kernel, env({ type: "OPEN_GROUP_BUY_PROPOSAL", groupBuy: proposal("w1gb-comp-1") }, ferryRoad));
    await mustExecute(kernel, env(interest("w1gb-comp-1", ferryRoad, 16), ferryRoad));
    await mustExecute(kernel, env(interest("w1gb-comp-1", twoHarbors, 12), twoHarbors));
    await mustExecute(kernel, env(interest("w1gb-comp-1", quayside, 12), quayside));
    await mustExecute(kernel, env({
      type: "DECIDE_GROUP_BUY_PROPOSAL",
      groupBuyId: makeId<"GroupBuyId">("w1gb-comp-1"),
      trigger: "ACCEPT",
    }, organizer));
    await mustExecute(kernel, env(interest("w1gb-comp-1", harborLane, 6), harborLane));
    await mustExecute(kernel, env({
      type: "FORM_GROUP_BUY",
      groupBuyId: makeId<"GroupBuyId">("w1gb-comp-1"),
      groupPrice: money("1080", usd),
    }, organizer));
    await mustExecute(kernel, env({
      type: "CLOSE_GROUP_BUY",
      groupBuyId: makeId<"GroupBuyId">("w1gb-comp-1"),
      reason: "Pool delivered",
    }, organizer));
    expect(kernel.view().allRefunds()).toEqual([]);
    expect(kernel.view().allChargebacks()).toEqual([]);
    // EXPIRE while HELD — no refund appears.
    await mustExecute(kernel, env({ type: "OPEN_GROUP_BUY_PROPOSAL", groupBuy: proposal("w1gb-comp-2") }, ferryRoad));
    await mustExecute(kernel, env(interest("w1gb-comp-2", ferryRoad, 16), ferryRoad));
    await mustExecute(kernel, env(interest("w1gb-comp-2", twoHarbors, 12), twoHarbors));
    await mustExecute(kernel, env(interest("w1gb-comp-2", quayside, 12), quayside));
    await mustExecute(kernel, env({
      type: "DECIDE_GROUP_BUY_PROPOSAL",
      groupBuyId: makeId<"GroupBuyId">("w1gb-comp-2"),
      trigger: "ACCEPT",
    }, organizer));
    await mustExecute(kernel, env(interest("w1gb-comp-2", harborLane, 6), harborLane));
    await mustExecute(kernel, env({
      type: "EXPIRE_GROUP_BUY",
      groupBuyId: makeId<"GroupBuyId">("w1gb-comp-2"),
    }, { kind: "SYSTEM", systemPrincipalId: makeId<"SystemPrincipalId">("system-1") }));
    expect(kernel.view().allRefunds()).toEqual([]);
    expect(kernel.view().allChargebacks()).toEqual([]);
  });

  it("ATOMIC refusal of a TradeCycle creates NO rollback — compensation is not automatic; legs are preserved (REFUSED/CONSENTED/PENDING), none ROLLED_BACK", async () => {
    const kernel = newKernel();
    await mustExecute(kernel, env({ type: "OPEN_TRADE_CYCLE", cycle: cycleA("w1tc-comp-1") }, harborLane));
    await mustExecute(kernel, env(authorize("w1tc-comp-1", 1, twoHarbors, "auth-t"), twoHarbors));
    await mustExecute(kernel, env({
      type: "REFUSE_TRADE_CYCLE_LEG",
      cycleId: makeId<"TradeCycleId">("w1tc-comp-1"),
      legIndex: 0,
      refusingRef: northlight,
      reason: "Cycle A does not serve my stated want",
    }, northlight));
    const stopped = kernel.view().executionOps().tradeCycle("w1tc-comp-1");
    expect(stopped?.state).toBe("STOPPED_REFUSAL");
    // Leg states are preserved honestly — REFUSED, CONSENTED, PENDING. NONE
    // is auto-rolled-back; rollback is not a side effect of refusal.
    expect(stopped?.legs.map((one) => one.consentState)).toEqual(["REFUSED", "CONSENTED", "PENDING"]);
    expect(stopped?.legs.every((one) => one.consentState !== "ROLLED_BACK")).toBe(true);
  });

  it("STAGED_WITH_RECOURSE refusal OPENS RECOURSE but does NOT auto-rollback — ROLLBACK_TRADE_CYCLE_LEG is a separate authorized command", async () => {
    const kernel = newKernel();
    await mustExecute(kernel, env({ type: "OPEN_TRADE_CYCLE", cycle: cycleA("w1tc-comp-2", "STAGED_WITH_RECOURSE") }, harborLane));
    await mustExecute(kernel, env(authorize("w1tc-comp-2", 0, northlight, "auth-n"), northlight));
    await mustExecute(kernel, env(authorize("w1tc-comp-2", 1, twoHarbors, "auth-t"), twoHarbors));
    // Commit leg 0; leg stays COMMITTED.
    await mustExecute(kernel, env({
      type: "EXECUTE_TRADE_CYCLE_LEG",
      cycleId: makeId<"TradeCycleId">("w1tc-comp-2"),
      legIndex: 0,
    }, harborLane));
    expect(kernel.view().executionOps().tradeCycle("w1tc-comp-2")?.legs[0]?.consentState).toBe("COMMITTED");
    // Refusal after a commit OPENS RECOURSE — but the committed leg stays
    // COMMITTED. Compensation is NOT automatic; rollback is its own command.
    await mustExecute(kernel, env({
      type: "REFUSE_TRADE_CYCLE_LEG",
      cycleId: makeId<"TradeCycleId">("w1tc-comp-2"),
      legIndex: 2,
      refusingRef: harborLane,
      reason: "Re-plan needed",
    }, harborLane));
    const recourse = kernel.view().executionOps().tradeCycle("w1tc-comp-2");
    expect(recourse?.state).toBe("RECOURSE_OPEN");
    expect(recourse?.legs[0]?.consentState, "leg 0 still COMMITTED — no auto-rollback").toBe("COMMITTED");
    expect(recourse?.legs[0]?.consentState).not.toBe("ROLLED_BACK");
    // The separate rollback command — initiator-only, with an explicit reason.
    await mustExecute(kernel, env({
      type: "ROLLBACK_TRADE_CYCLE_LEG",
      cycleId: makeId<"TradeCycleId">("w1tc-comp-2"),
      legIndex: 0,
      reason: "unwind the light-kit hop",
    }, harborLane));
    const rolled = kernel.view().executionOps().tradeCycle("w1tc-comp-2");
    expect(rolled?.state).toBe("ROLLED_BACK");
    expect(rolled?.legs[0]?.consentState).toBe("ROLLED_BACK");
  });

  it("voiding a payment (VOID_PAYMENT) and refunding (REFUND_PAYMENT) are DISTINCT commands — void is not a refund, refund is not a void", async () => {
    const kernel = newKernel();
    // Two payments: one we VOID (before capture — void is the pre-capture
    // compensation path), one we REFUND (after capture — refund is the
    // post-capture compensation path). The two paths produce different end
    // states (VOIDED vs REFUNDED) and require their own commands — neither
    // is a side effect of the other.
    // VOID path: create + void (no capture).
    await mustExecute(kernel, env({
      type: "ADD_CART_LINE",
      cartId: makeId<"CartId">("cart-void"),
      skuId: sku,
      quantity: countQuantity(1),
      unitPrice: money("8000", usd),
    }));
    await mustExecute(kernel, env({ type: "PLACE_ORDER", cartId: makeId<"CartId">("cart-void"), merchantId: merchant }));
    const voidOrder = kernel.view().allOrders()[0]!;
    await mustExecute(kernel, env({
      type: "CREATE_PAYMENT_INTENT",
      request: { amount: money("8000", usd), reference: { kind: "ORDER", orderId: voidOrder.orderId }, method: card },
    }));
    const voidPayment = kernel.view().allPaymentIntents().find((item) => item.reference.kind === "ORDER" && item.reference.orderId === voidOrder.orderId)!.paymentId;
    await mustExecute(kernel, env({ type: "VOID_PAYMENT", paymentId: voidPayment }));
    const voided = kernel.view().paymentIntent(voidPayment);
    expect(voided?.status).toBe("VOIDED");
    expect(kernel.view().refundedTotalFor(voidPayment), "voiding is not a refund").toBe(0n);
    expect(kernel.view().allRefunds(), "no refund record on void").toEqual([]);
    // REFUND path: create + capture + refund (separate authorized command).
    const refundPayment = await capturedPayment(kernel, "refund", "6000");
    await mustExecute(kernel, env({ type: "REFUND_PAYMENT", paymentId: refundPayment, amount: money("6000", usd) }));
    const refunded = kernel.view().paymentIntent(refundPayment);
    expect(refunded?.status).toBe("REFUNDED");
    expect(kernel.view().refundedTotalFor(refundPayment)).toBe(6000n);
    expect(kernel.view().allRefunds()).toHaveLength(1);
  });

  it("releasing a reservation (RELEASE_RESERVATION) is a separate command from cancelling an order — the reservation stays OPEN until its own release", async () => {
    const kernel = newKernel();
    // Reserve inventory; cancel the order that conceptually "owned" the
    // reservation. The reservation stays OPEN — cancellation does not auto-
    // release. RELEASE_RESERVATION is a separate authorized command.
    await mustExecute(kernel, env({
      type: "RECEIVE_STOCK",
      skuId: sku,
      locationId: makeId<"LocationId">("loc-comp-1"),
      units: 20,
      reason: "RECEIVING",
    }));
    await mustExecute(kernel, env({
      type: "RESERVE_INVENTORY",
      reservation: {
        reservationId: makeId<"ReservationId">("resv-comp-1"),
        skuId: sku,
        locationId: makeId<"LocationId">("loc-comp-1"),
        units: 5,
        status: "OPEN",
        revision: 1,
      },
    }));
    expect(kernel.view().reservation("resv-comp-1")?.status).toBe("OPEN");
    // Place + cancel an order — the reservation is unaffected.
    await mustExecute(kernel, env({
      type: "ADD_CART_LINE",
      cartId: makeId<"CartId">("cart-comp-1"),
      skuId: sku,
      quantity: countQuantity(1),
      unitPrice: money("1000", usd),
    }));
    await mustExecute(kernel, env({ type: "PLACE_ORDER", cartId: makeId<"CartId">("cart-comp-1"), merchantId: merchant }));
    const order = kernel.view().allOrders()[0]!;
    await mustExecute(kernel, env({ type: "CANCEL_ORDER", orderId: order.orderId }));
    expect(kernel.view().order(order.orderId)?.state).toBe("CANCELLED");
    expect(kernel.view().reservation("resv-comp-1")?.status, "reservation NOT auto-released on order cancel").toBe("OPEN");
    // The separate release command.
    await mustExecute(kernel, env({
      type: "RELEASE_RESERVATION",
      reservationId: makeId<"ReservationId">("resv-comp-1"),
    }));
    expect(kernel.view().reservation("resv-comp-1")?.status).toBe("RELEASED");
  });
});

// ============================================================================
// Stage 2+ future surface — precisely documented, NOT faked, kernel untouched.
// ============================================================================
//
// The decision packet §5 acceptance sketch includes "canceling the upstream
// aggregate marks downstream drafts cancelled-but-never-committed". At Stage 0
// there is no LINK command and no draft aggregate — so the
// "downstream-draft-marked-cancelled-on-upstream-cancel" sub-aspect cannot be
// executed against the current kernel. The compensation-separation law IS
// observable on the existing surface (above): cancelling an order does not
// auto-refund; refusing a leg does not auto-rollback; closing a GroupBuy does
// not auto-refund. The Stage-2-specific draft-cancellation cascade is
// recorded here as a skip with the exact future stage that introduces it.
describe.skip("W1-014 linking law 5 — Stage 2 linked-draft cancellation cascade (future surface)", () => {
  // FUTURE STAGE: Stage 2 (decision packet §4, §7) introduces
  //   LINK_GROUPBUY_TO_ORDER_DRAFT / LINK_TRADECYCLE_LEG_TO_SETTLEMENT_DRAFT
  //   as additive kernel commands. When they exist, this block will specify:
  //   - closing a formed GroupBuy marks its linked order DRAFTs cancelled —
  //     the draft is cancelled (never committed), and NO refund/unreserve
  //     happens (compensation is still its own separate command);
  //   - a TradeCycle stop (REFUSAL/WITHDRAWAL/EXPIRY) marks its linked
  //     settlement DRAFTs cancelled — never committed, never auto-compensated;
  //   - the draft's cancellation is honest (CANCELLED, never FAILED) and the
  //     downstream compensation paths (REFUND_PAYMENT, RELEASE_RESERVATION,
  //     ROLLBACK_TRADE_CYCLE_LEG) remain separately-authorized commands.
  // At Stage 0 the LINK command does not exist; running these specs would
  // require either faking a pass (forbidden) or modifying the kernel
  // (forbidden). The skip records the gap honestly; Stage 2 will replace it
  // with executable specs.
  it("FUTURE: closing a formed GroupBuy marks linked order drafts CANCELLED (never committed, never auto-refunded)", () => {
    expect(true).toBe(true);
  });
  it("FUTURE: a TradeCycle stop marks linked settlement drafts CANCELLED (never committed, never auto-compensated)", () => {
    expect(true).toBe(true);
  });
});
