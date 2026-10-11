/**
 * W1-014 Stage 0 — Linking Law 3: Idempotency.
 *
 * BINDING LAW (decision packet §2.3): every linking command carries a
 * client-supplied idempotency key; retries return the ORIGINAL receipt/result
 * and never duplicate an effect (the kernel's existing DUPLICATE law).
 *
 * Stage 0 spec against the CURRENT command surface: the kernel's existing
 * idempotency contract (W1-001 §4.4, certified in W1-006) covers EVERY
 * command, including the linking-relevant downstream commands (PLACE_ORDER,
 * CREATE_PAYMENT_INTENT, COMPLETE_CHECKOUT, REFUND_PAYMENT, RESERVE_INVENTORY)
 * and the upstream formation/execution commands (FORM_GROUP_BUY,
 * EXECUTE_TRADE_CYCLE). This file specifies the law as it applies to LINKING:
 * when (at Stage 2) a linked order is placed by re-issuing PLACE_ORDER with a
 * group-buy's facts pre-filled, the duplicate-replay law must hold exactly —
 * the same envelope replayed returns the ORIGINAL receipt and produces zero
 * new effects; a different payload under the same key is a hard
 * IDEMPOTENCY_KEY_CONFLICT, never a silent overwrite.
 *
 * The existing certification (certification-idempotency.test.ts) fuzzes this
 * across the whole surface; this file focuses the law on the linking-critical
 * command paths with explicit envelope-replay assertions (no fuzzing).
 */
import { describe, expect, it } from "vitest";
import {
  CommerceKernel,
  commandEnvelope,
  countQuantity,
  currency,
  makeId,
  money,
  type AnyRuntimeCommand,
  type CommandExecution,
  type CommandReceipt,
  type PrincipalRef,
  type TradeCycleExecution,
  type TradeCycleExecutionLeg,
} from "../contract.js";
import { ScriptedPaymentDouble } from "./runtime/support/payment-double.js";
import { env, explicitEnv, mustExecute } from "./runtime/support/envelopes.js";

const usd = currency("USD");
const merchant = makeId<"MerchantId">("merchant-1");
const sku = makeId<"SkuId">("sku-tote");
const card = { methodKind: "CARD" as const, tokenRef: "tok-link-1" };

function newKernel() {
  return new CommerceKernel({ paymentBoundary: new ScriptedPaymentDouble() });
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

function cycleA(id: string): TradeCycleExecution {
  const harborLane: PrincipalRef = { kind: "CUSTOMER", customerId: makeId<"CustomerId">("harbor-lane") };
  const northlight: PrincipalRef = { kind: "CUSTOMER", customerId: makeId<"CustomerId">("northlight") };
  const twoHarbors: PrincipalRef = { kind: "CUSTOMER", customerId: makeId<"CustomerId">("two-harbors") };
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

/** Asserts the DUPLICATE outcome matches the original receipt and adds no effects. */
function assertDuplicate(replay: CommandExecution, original: CommandReceipt, journalBefore: number, receiptsBefore: number, kernel: CommerceKernel) {
  expect(replay.status).toBe("DUPLICATE");
  if (replay.status !== "DUPLICATE") throw new Error("unreachable");
  expect(replay.originalReceipt.receiptId).toBe(original.receiptId);
  expect(replay.originalReceipt.commandId).toBe(original.commandId);
  expect(replay.originalReceipt.idempotencyKey).toBe(original.idempotencyKey);
  expect(kernel.events().length, "no new events on duplicate replay").toBe(journalBefore);
  expect(kernel.receipts().length, "no new receipts on duplicate replay").toBe(receiptsBefore);
}

/** Asserts a conflict on the same key with a different command id is hard-rejected. */
async function assertConflict(kernel: CommerceKernel, originalEnvelope: AnyRuntimeCommand, journalBefore: number, receiptsBefore: number) {
  const conflict = commandEnvelope(
    makeId<"CommandId">(`${originalEnvelope.commandId}-conflict`),
    originalEnvelope.idempotencyKey,
    originalEnvelope.actor,
    "2026-10-05T00:00:00Z",
    originalEnvelope.payload,
  ) as AnyRuntimeCommand;
  const outcome = await kernel.execute(conflict);
  expect(outcome.status).toBe("REJECTED");
  if (outcome.status !== "REJECTED") throw new Error("unreachable");
  expect(outcome.reason.code).toBe("IDEMPOTENCY_KEY_CONFLICT");
  expect(kernel.events().length, "no new events on conflict").toBe(journalBefore);
  expect(kernel.receipts().length, "no new receipts on conflict").toBe(receiptsBefore);
}

describe("W1-014 linking law 3 — idempotency: every linking-relevant command replays to DUPLICATE (original receipt, zero effects)", () => {
  it("duplicate PLACE_ORDER returns the original receipt with zero new effects; a different command under the same key conflicts hard", async () => {
    const kernel = newKernel();
    // Seed a cart; the order's idempotency key is the linking-critical
    // identifier (Stage 2: a linked order would carry the same key when
    // re-issued from the group-buy draft).
    await mustExecute(kernel, env({
      type: "ADD_CART_LINE",
      cartId: makeId<"CartId">("cart-idem-1"),
      skuId: sku,
      quantity: countQuantity(2),
      unitPrice: money("1999", usd),
    }));
    const place = explicitEnv("cmd-place-1", "idem-place-1", {
      type: "PLACE_ORDER",
      cartId: makeId<"CartId">("cart-idem-1"),
      merchantId: merchant,
    });
    const first = await mustExecute(kernel, place);
    const journalBefore = kernel.events().length;
    const receiptsBefore = kernel.receipts().length;
    // Exact replay → DUPLICATE with the ORIGINAL receipt, zero new effects.
    assertDuplicate(await kernel.execute(place), first.receipt, journalBefore, receiptsBefore, kernel);
    // Different command id under the same key → hard conflict, zero new effects.
    await assertConflict(kernel, place, journalBefore, receiptsBefore);
    expect(kernel.view().allOrders()).toHaveLength(1);
  });

  it("duplicate CREATE_PAYMENT_INTENT returns the original receipt with zero new effects", async () => {
    const kernel = newKernel();
    // Place an order first so the payment reference resolves.
    await mustExecute(kernel, env({
      type: "ADD_CART_LINE",
      cartId: makeId<"CartId">("cart-idem-2"),
      skuId: sku,
      quantity: countQuantity(1),
      unitPrice: money("5000", usd),
    }));
    await mustExecute(kernel, env({
      type: "PLACE_ORDER",
      cartId: makeId<"CartId">("cart-idem-2"),
      merchantId: merchant,
    }));
    const order = kernel.view().allOrders()[0]!;
    const create = explicitEnv("cmd-create-intent-1", "idem-create-intent-1", {
      type: "CREATE_PAYMENT_INTENT",
      request: { amount: money("5000", usd), reference: { kind: "ORDER", orderId: order.orderId }, method: card },
    });
    const first = await mustExecute(kernel, create);
    const journalBefore = kernel.events().length;
    const receiptsBefore = kernel.receipts().length;
    assertDuplicate(await kernel.execute(create), first.receipt, journalBefore, receiptsBefore, kernel);
    await assertConflict(kernel, create, journalBefore, receiptsBefore);
    expect(kernel.view().allPaymentIntents()).toHaveLength(1);
  });

  it("duplicate COMPLETE_CHECKOUT returns the original receipt with zero new effects (no torn half-checkouts)", async () => {
    const kernel = newKernel();
    await mustExecute(kernel, env({
      type: "ADD_CART_LINE",
      cartId: makeId<"CartId">("cart-idem-3"),
      skuId: sku,
      quantity: countQuantity(1),
      unitPrice: money("1999", usd),
    }));
    await mustExecute(kernel, env({ type: "OPEN_CHECKOUT", cartId: makeId<"CartId">("cart-idem-3") }));
    const sessionId = kernel.view().allCheckoutSessions()[0]!.checkoutSessionId;
    const complete = explicitEnv("cmd-complete-1", "idem-complete-1", {
      type: "COMPLETE_CHECKOUT",
      checkoutSessionId: sessionId,
      merchantId: merchant,
      method: card,
    });
    const first = await mustExecute(kernel, complete);
    const journalBefore = kernel.events().length;
    const receiptsBefore = kernel.receipts().length;
    assertDuplicate(await kernel.execute(complete), first.receipt, journalBefore, receiptsBefore, kernel);
    await assertConflict(kernel, complete, journalBefore, receiptsBefore);
    // Exactly one order, one payment intent — no duplicate half-checkout.
    expect(kernel.view().allOrders()).toHaveLength(1);
    expect(kernel.view().allPaymentIntents()).toHaveLength(1);
  });

  it("duplicate REFUND_PAYMENT returns the original receipt with zero new effects (no double-refund via replay)", async () => {
    const kernel = newKernel();
    // Place + capture a payment so a refund is valid.
    await mustExecute(kernel, env({
      type: "ADD_CART_LINE",
      cartId: makeId<"CartId">("cart-idem-4"),
      skuId: sku,
      quantity: countQuantity(1),
      unitPrice: money("10000", usd),
    }));
    await mustExecute(kernel, env({ type: "PLACE_ORDER", cartId: makeId<"CartId">("cart-idem-4"), merchantId: merchant }));
    const order = kernel.view().allOrders()[0]!;
    await mustExecute(kernel, env({
      type: "CREATE_PAYMENT_INTENT",
      request: { amount: money("10000", usd), reference: { kind: "ORDER", orderId: order.orderId }, method: card },
    }));
    const intent = kernel.view().allPaymentIntents()[0]!;
    await mustExecute(kernel, env({ type: "CAPTURE_PAYMENT", paymentId: intent.paymentId }));
    const refund = explicitEnv("cmd-refund-1", "idem-refund-1", {
      type: "REFUND_PAYMENT",
      paymentId: intent.paymentId,
      amount: money("4000", usd),
    });
    const first = await mustExecute(kernel, refund);
    const journalBefore = kernel.events().length;
    const receiptsBefore = kernel.receipts().length;
    assertDuplicate(await kernel.execute(refund), first.receipt, journalBefore, receiptsBefore, kernel);
    await assertConflict(kernel, refund, journalBefore, receiptsBefore);
    // No double-refund: refunded total is exactly 4000 minor units.
    expect(kernel.view().refundedTotalFor(intent.paymentId)).toBe(4000n);
  });

  it("duplicate RESERVE_INVENTORY returns the original receipt with zero new effects (no double-reservation)", async () => {
    const kernel = newKernel();
    await mustExecute(kernel, env({
      type: "RECEIVE_STOCK",
      skuId: sku,
      locationId: makeId<"LocationId">("loc-idem-1"),
      units: 20,
      reason: "RECEIVING",
    }));
    const reserve = explicitEnv("cmd-reserve-1", "idem-reserve-1", {
      type: "RESERVE_INVENTORY",
      reservation: {
        reservationId: makeId<"ReservationId">("resv-idem-1"),
        skuId: sku,
        locationId: makeId<"LocationId">("loc-idem-1"),
        units: 5,
        status: "OPEN",
        revision: 1,
      },
    });
    const first = await mustExecute(kernel, reserve);
    const journalBefore = kernel.events().length;
    const receiptsBefore = kernel.receipts().length;
    assertDuplicate(await kernel.execute(reserve), first.receipt, journalBefore, receiptsBefore, kernel);
    await assertConflict(kernel, reserve, journalBefore, receiptsBefore);
    expect(kernel.view().allReservations()).toHaveLength(1);
  });

  it("duplicate FORM_GROUP_BUY returns the original receipt with zero new effects (formation is exactly-once)", async () => {
    const kernel = newKernel();
    const harborLane: PrincipalRef = { kind: "CUSTOMER", customerId: makeId<"CustomerId">("harbor-lane") };
    const northlight: PrincipalRef = { kind: "CUSTOMER", customerId: makeId<"CustomerId">("northlight") };
    const twoHarbors: PrincipalRef = { kind: "CUSTOMER", customerId: makeId<"CustomerId">("two-harbors") };
    const quayside: PrincipalRef = { kind: "CUSTOMER", customerId: makeId<"CustomerId">("quayside") };
    const organizer: PrincipalRef = { kind: "MERCHANT", merchantId: merchant };
    const proposal = {
      groupBuyId: makeId<"GroupBuyId">("w1gb-idem-1"),
      initiatorRef: harborLane,
      organizerRef: organizer,
      terms: {
        skuRef: sku,
        proposedUnitPrice: money("1080", usd),
        listUnitPrice: money("1200", usd),
        threshold: { minimumParticipants: 4, minimumUnits: 40 },
        windowClosesAt: "2026-10-20T18:00:00Z",
      },
      state: "PENDING" as const,
      openedAt: "2026-10-12T09:00:00Z",
      participants: [],
      revision: 1,
    };
    await mustExecute(kernel, env({ type: "OPEN_GROUP_BUY_PROPOSAL", groupBuy: proposal }, harborLane));
    for (const [p, u] of [[harborLane, 16], [twoHarbors, 12], [quayside, 12]] as const) {
      await mustExecute(kernel, env({
        type: "RECORD_GROUP_BUY_INTEREST",
        groupBuyId: proposal.groupBuyId,
        participantRef: p,
        quantity: countQuantity(u),
        consentTerms: "interest is not a commitment",
      }, p));
    }
    await mustExecute(kernel, env({
      type: "DECIDE_GROUP_BUY_PROPOSAL",
      groupBuyId: proposal.groupBuyId,
      trigger: "ACCEPT",
    }, organizer));
    await mustExecute(kernel, env({
      type: "RECORD_GROUP_BUY_INTEREST",
      groupBuyId: proposal.groupBuyId,
      participantRef: northlight,
      quantity: countQuantity(10),
      consentTerms: "interest is not a commitment",
    }, northlight));
    const form = explicitEnv("cmd-form-1", "idem-form-1", {
      type: "FORM_GROUP_BUY",
      groupBuyId: proposal.groupBuyId,
      groupPrice: money("1080", usd),
    }, organizer);
    const first = await mustExecute(kernel, form);
    const journalBefore = kernel.events().length;
    const receiptsBefore = kernel.receipts().length;
    assertDuplicate(await kernel.execute(form), first.receipt, journalBefore, receiptsBefore, kernel);
    await assertConflict(kernel, form, journalBefore, receiptsBefore);
    expect(kernel.view().executionOps().allGroupBuys()).toHaveLength(1);
  });

  it("duplicate EXECUTE_TRADE_CYCLE returns the original receipt with zero new effects (execution is exactly-once)", async () => {
    const kernel = newKernel();
    const harborLane: PrincipalRef = { kind: "CUSTOMER", customerId: makeId<"CustomerId">("harbor-lane") };
    const northlight: PrincipalRef = { kind: "CUSTOMER", customerId: makeId<"CustomerId">("northlight") };
    const twoHarbors: PrincipalRef = { kind: "CUSTOMER", customerId: makeId<"CustomerId">("two-harbors") };
    await mustExecute(kernel, env({ type: "OPEN_TRADE_CYCLE", cycle: cycleA("w1tc-idem-1") }, harborLane));
    await mustExecute(kernel, env({
      type: "AUTHORIZE_TRADE_CYCLE_LEG",
      cycleId: makeId<"TradeCycleId">("w1tc-idem-1"),
      legIndex: 0,
      authorizingRef: northlight,
      authorizationRef: "auth-n",
    }, northlight));
    await mustExecute(kernel, env({
      type: "AUTHORIZE_TRADE_CYCLE_LEG",
      cycleId: makeId<"TradeCycleId">("w1tc-idem-1"),
      legIndex: 1,
      authorizingRef: twoHarbors,
      authorizationRef: "auth-t",
    }, twoHarbors));
    await mustExecute(kernel, env({
      type: "AUTHORIZE_TRADE_CYCLE_LEG",
      cycleId: makeId<"TradeCycleId">("w1tc-idem-1"),
      legIndex: 2,
      authorizingRef: harborLane,
      authorizationRef: "auth-h",
    }, harborLane));
    const execute = explicitEnv("cmd-execute-1", "idem-execute-1", {
      type: "EXECUTE_TRADE_CYCLE",
      cycleId: makeId<"TradeCycleId">("w1tc-idem-1"),
    }, harborLane);
    const first = await mustExecute(kernel, execute);
    const journalBefore = kernel.events().length;
    const receiptsBefore = kernel.receipts().length;
    assertDuplicate(await kernel.execute(execute), first.receipt, journalBefore, receiptsBefore, kernel);
    await assertConflict(kernel, execute, journalBefore, receiptsBefore);
    const committed = kernel.view().executionOps().tradeCycle("w1tc-idem-1");
    expect(committed?.state).toBe("COMMITTED");
    expect(committed?.legs.every((one) => one.consentState === "COMMITTED")).toBe(true);
  });

  it("a downstream command replayed after subsequent upstream commands affects nothing upstream — the idempotency ledger is global", async () => {
    const kernel = newKernel();
    // Place an order; replaying the order's envelope after a SECOND order is
    // placed under a different key still returns the ORIGINAL receipt and
    // produces no new effect. The idempotency ledger is keyed by idempotency
    // key, not by sequence position.
    await mustExecute(kernel, env({
      type: "ADD_CART_LINE",
      cartId: makeId<"CartId">("cart-idem-5"),
      skuId: sku,
      quantity: countQuantity(1),
      unitPrice: money("1000", usd),
    }));
    const place1 = explicitEnv("cmd-place-5a", "idem-place-5a", {
      type: "PLACE_ORDER",
      cartId: makeId<"CartId">("cart-idem-5"),
      merchantId: merchant,
    });
    const first = await mustExecute(kernel, place1);
    // Place a SECOND order under a different key + different cart.
    await mustExecute(kernel, env({
      type: "ADD_CART_LINE",
      cartId: makeId<"CartId">("cart-idem-6"),
      skuId: sku,
      quantity: countQuantity(1),
      unitPrice: money("2000", usd),
    }));
    await mustExecute(kernel, env({
      type: "PLACE_ORDER",
      cartId: makeId<"CartId">("cart-idem-6"),
      merchantId: merchant,
    }));
    expect(kernel.view().allOrders()).toHaveLength(2);
    // Replay the FIRST order's envelope: DUPLICATE with the original receipt,
    // zero new effects (the second order is unaffected, the journal has the
    // same count as before the replay).
    const journalBefore = kernel.events().length;
    const receiptsBefore = kernel.receipts().length;
    assertDuplicate(await kernel.execute(place1), first.receipt, journalBefore, receiptsBefore, kernel);
    expect(kernel.view().allOrders()).toHaveLength(2);
  });
});
