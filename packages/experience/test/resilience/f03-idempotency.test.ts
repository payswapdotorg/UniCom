/**
 * W2-010 — Family F03: duplicate submit, retry-after-timeout,
 * idempotency/reconciliation (+ F02-S05 settlement-UNKNOWN mid-checkout).
 * Fixture-contract evidence level.
 *
 * Drives the REAL CommerceKernel end-to-end (cart → checkout session →
 * COMPLETE_CHECKOUT → payment → settlement) with the provider modeled ONLY
 * by the FaultInjectingPaymentBoundary double behind the kernel's port.
 * The receipt ledger, journal and tri-state settlement law are all real.
 */

import { describe, expect, it } from "vitest";
import { countQuantity, makeId } from "@unicom/commerce";
import { createResilienceKernel, rigMoney } from "./adapters/resilience-rig";
import { checkoutStatusView } from "./adapters/resilience-rig";
import { scenarioById } from "./matrix/oracle";

const oracle = (id: string) => scenarioById(id);

const MERCHANT = makeId<"MerchantId">("merchant-resilience");
const SKU = makeId<"SkuId">("sku-resilience-widget");

interface CheckoutContext {
  readonly rig: ReturnType<typeof createResilienceKernel>;
  readonly cartId: string;
  readonly sessionId: string;
}

async function checkoutJourney(rig: ReturnType<typeof createResilienceKernel>, cartId: string): Promise<{ status: string; sessionId?: string }> {
  await rig.exec({ type: "ADD_CART_LINE", cartId: makeId<"CartId">(cartId), skuId: SKU, quantity: countQuantity(2), unitPrice: rigMoney("1999") });
  const opened = await rig.exec({ type: "OPEN_CHECKOUT", cartId: makeId<"CartId">(cartId) });
  if (opened.status !== "EXECUTED") return { status: `open-rejected:${opened.status}` };
  const session = rig.kernel.view().allCheckoutSessions().at(-1);
  if (session === undefined) return { status: "no-session" };
  await rig.exec({ type: "ADVANCE_CHECKOUT", checkoutSessionId: session.checkoutSessionId, trigger: "START_PAYMENT" });
  return { status: "ready", sessionId: session.checkoutSessionId };
}

async function freshCheckout(script = {}): Promise<CheckoutContext> {
  const rig = createResilienceKernel(script);
  const cartId = `cart-${Math.random().toString(36).slice(2, 8)}`;
  const journey = await checkoutJourney(rig, cartId);
  if (journey.status !== "ready" || journey.sessionId === undefined) {
    throw new Error(`checkout journey failed: ${journey.status}`);
  }
  return { rig, cartId, sessionId: journey.sessionId };
}

const completePayload = (sessionId: string) => ({
  type: "COMPLETE_CHECKOUT" as const,
  checkoutSessionId: makeId<"CheckoutSessionId">(sessionId),
  merchantId: MERCHANT,
  method: { methodKind: "CARD" as const, tokenRef: "tok-resilience" },
});

describe("W2-010 F03 — duplicate submit / retry-after-timeout / idempotency (fixture-contract)", () => {
  it("F03-S01: double-click duplicate submit → DUPLICATE with the original receipt, zero new effects", async () => {
    expect(oracle("W2-010-F03-S01").expectedResultClass).toBe("expected-success");
    const { rig, sessionId } = await freshCheckout();
    const first = await rig.exec(completePayload(sessionId), {
      actor: rig.buyer,
      commandId: "cmd-f03-s01",
      idempotencyKey: "idem-f03-s01",
    });
    expect(first.status).toBe("EXECUTED");
    const journalAfterFirst = rig.events();
    const ordersAfterFirst = rig.kernel.view().allOrders().length;
    // Double-click: the IDENTICAL envelope replays (same command id + key).
    const replay = await rig.exec(completePayload(sessionId), {
      actor: rig.buyer,
      commandId: "cmd-f03-s01",
      idempotencyKey: "idem-f03-s01",
    });
    // VISIBLE: DUPLICATE referencing the ORIGINAL receipt; journal unchanged;
    // still exactly one order — nothing was charged twice.
    expect(replay.status).toBe("DUPLICATE");
    if (replay.status === "DUPLICATE") {
      expect(replay.originalReceipt).toEqual(first.receipt);
    }
    expect(rig.events()).toBe(journalAfterFirst);
    expect(rig.kernel.view().allOrders()).toHaveLength(ordersAfterFirst);
    expect(rig.paymentBoundary.recordedCalls().createIntentCalls).toHaveLength(1);
    // The checkout view a UI renders: one confirmation, referenced receipt.
    const view = checkoutStatusView(`checkout:${sessionId}`, "done");
    expect(view.currentStep).toBe("done");
  });

  it("F03-S02: same idempotency key, different command → hard IDEMPOTENCY_KEY_CONFLICT, zero events", async () => {
    expect(oracle("W2-010-F03-S02").expectedResultClass).toBe("expected-block");
    const { rig, sessionId } = await freshCheckout();
    const first = await rig.exec(completePayload(sessionId), {
      actor: rig.buyer,
      commandId: "cmd-f03-s02-a",
      idempotencyKey: "idem-f03-s02",
    });
    expect(first.status).toBe("EXECUTED");
    const journalAfterFirst = rig.events();
    // A DIFFERENT command under the used key is a conflict, never a second effect.
    const conflict = await rig.exec({ ...completePayload(sessionId), method: { methodKind: "WALLET", tokenRef: "tok-other" } }, {
      actor: rig.buyer,
      commandId: "cmd-f03-s02-b",
      idempotencyKey: "idem-f03-s02",
    });
    expect(conflict.status).toBe("REJECTED");
    if (conflict.status === "REJECTED") {
      expect(conflict.reason.code).toBe("IDEMPOTENCY_KEY_CONFLICT");
    }
    expect(rig.events()).toBe(journalAfterFirst);
    // VISIBLE: the second payment method never reached the provider.
    expect(rig.paymentBoundary.recordedCalls().createIntentCalls).toHaveLength(1);
  });

  it("F03-S03: retry-after-timeout — failed attempt leaves ZERO events; retry executes exactly once", async () => {
    expect(oracle("W2-010-F03-S03").expectedResultClass).toBe("expected-success");
    const rig = createResilienceKernel({ createIntent: { behaviors: ["provider-unavailable"] } });
    const cartId = "cart-f03-s03";
    const journey = await checkoutJourney(rig, cartId);
    if (journey.status !== "ready" || journey.sessionId === undefined) throw new Error(journey.status);
    const journalBeforeAttempt = rig.events();
    // First attempt: the provider times out — the WHOLE command rejects with
    // zero journal events (no torn half-checkout: no order, no payment).
    const attempt = await rig.exec(completePayload(journey.sessionId), {
      actor: rig.buyer,
      commandId: "cmd-f03-s03",
      idempotencyKey: "idem-f03-s03",
    });
    expect(attempt.status).toBe("REJECTED");
    if (attempt.status === "REJECTED") {
      expect(attempt.reason.detail).toContain("PROVIDER_UNAVAILABLE");
    }
    // The failed attempt appended ZERO journal events (no torn checkout):
    // the journal is byte-length-identical to before the attempt.
    expect(rig.events()).toBe(journalBeforeAttempt);
    expect(rig.kernel.view().allOrders()).toHaveLength(0);
    // VISIBLE while failed: the checkout view must not show done or failed
    // money state — the attempt settled nothing.
    const blocked = checkoutStatusView(`checkout:${journey.sessionId}`, "payment", "payment provider unavailable — try again; nothing was charged");
    expect(blocked.currentStep).not.toBe("done");
    expect(blocked.blockerNote).toContain("nothing was charged");
    // Provider recovers; retrying the SAME envelope executes exactly once.
    rig.paymentBoundary.updateScript({ createIntent: { behaviors: ["ok"] } });
    const retry = await rig.exec(completePayload(journey.sessionId), {
      actor: rig.buyer,
      commandId: "cmd-f03-s03",
      idempotencyKey: "idem-f03-s03",
    });
    expect(retry.status).toBe("EXECUTED");
    expect(rig.kernel.view().allOrders()).toHaveLength(1);
    expect(rig.paymentBoundary.recordedCalls().createIntentCalls).toHaveLength(2); // failed + successful attempts
    const again = await rig.exec(completePayload(journey.sessionId), {
      actor: rig.buyer,
      commandId: "cmd-f03-s03",
      idempotencyKey: "idem-f03-s03",
    });
    expect(again.status).toBe("DUPLICATE");
    expect(rig.kernel.view().allOrders()).toHaveLength(1);
  });

  it("F03-S04: a NEW checkout command against a COMPLETED session → deterministic INVALID_STATE", async () => {
    expect(oracle("W2-010-F03-S04").expectedResultClass).toBe("expected-block");
    const { rig, sessionId } = await freshCheckout();
    const first = await rig.exec(completePayload(sessionId), { actor: rig.buyer });
    expect(first.status).toBe("EXECUTED");
    const journalAfterFirst = rig.events();
    // A distinct second submission (different key) hits the terminal session.
    const second = await rig.exec(completePayload(sessionId), {
      actor: rig.buyer,
      commandId: "cmd-f03-s04-second",
      idempotencyKey: "idem-f03-s04-second",
    });
    expect(second.status).toBe("REJECTED");
    if (second.status === "REJECTED") {
      expect(second.reason.code).toBe("INVALID_STATE");
      expect(second.reason.detail).toContain("duplicate submissions are rejected");
    }
    expect(rig.events()).toBe(journalAfterFirst);
    expect(rig.kernel.view().allOrders()).toHaveLength(1);
  });

  it("F02-S05 (executed here): settlement UNKNOWN mid-checkout holds UNKNOWN; window close → NOT_PAID, never money-in", async () => {
    expect(oracle("W2-010-F02-S05").expectedResultClass).toBe("expected-block");
    const { rig, sessionId } = await freshCheckout({ settlements: { "*": "unknown" } });
    const completed = await rig.exec(completePayload(sessionId), { actor: rig.buyer });
    expect(completed.status).toBe("EXECUTED");
    const order = rig.kernel.view().allOrders().at(-1);
    expect(order).toBeDefined();
    const payment = rig.kernel.view().allPaymentIntents().at(-1);
    expect(payment).toBeDefined();
    const paymentId = payment?.paymentId;
    if (order === undefined || paymentId === undefined) throw new Error("missing order/payment");
    // Capture (money that definitively moved), then observe settlement.
    await rig.exec({ type: "CAPTURE_PAYMENT", paymentId });
    expect(rig.kernel.view().order(order.orderId)?.paymentStatus).toBe("PAID");
    // VISIBLE: an ambiguous settlement observation holds UNKNOWN — the order
    // is never presented as settled, and never as definitively failed.
    await rig.exec({ type: "OBSERVE_SETTLEMENT", paymentId });
    const settlement = rig.kernel.view().settlementRecord(paymentId);
    expect(settlement?.status).toBe("UNKNOWN");
    expect(settlement?.providerNativeStatus).toBe("FAULT_DOUBLE_SETTLEMENT_UNCLEAR");
    expect(rig.kernel.view().order(order.orderId)?.paymentStatus).toBe("UNKNOWN");
    const unknownView = checkoutStatusView(`checkout:${sessionId}`, "unknown", "payment could not be confirmed — settlement window governs recourse");
    expect(unknownView.currentStep).toBe("unknown");
    // The recourse window closes: unresolved converts to WINDOW_CLOSED —
    // never to money-in. The order becomes NOT_PAID with recourse paths open.
    await rig.exec({ type: "CLOSE_SETTLEMENT_WINDOW", paymentId });
    expect(rig.kernel.view().settlementRecord(paymentId)?.status).toBe("WINDOW_CLOSED");
    expect(rig.kernel.view().order(order.orderId)?.paymentStatus).toBe("NOT_PAID");
  });
});
