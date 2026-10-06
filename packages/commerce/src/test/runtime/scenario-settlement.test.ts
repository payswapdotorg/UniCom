/**
 * W1-004 acceptance scenario 3 — settlement tri-state preservation.
 *
 * An UNKNOWN provider settlement outcome never promotes or drops money:
 * the order/payment projections HOLD UNKNOWN until an OBSERVED outcome
 * arrives or the recourse window closes. Money-in facts derive ONLY from
 * OBSERVED SETTLED (an UNKNOWN settlement NEVER becomes money-in); the
 * window close converts unresolved (UNKNOWN) to WINDOW_CLOSED — also never
 * money-in. Provider-native statuses are preserved verbatim through every
 * fold. Terminal settlement states reject further observations/close.
 */
import { describe, expect, it } from "vitest";
import {
  CommerceKernel,
  CommerceTwin,
  assertCanonicalEquivalence,
  assertTwinMatchesAuthoritative,
  countQuantity,
  currency,
  makeId,
  money,
  type CommandExecution,
  type PaymentIntent,
  type SettlementObservation,
} from "../../contract.js";
import { ScriptedPaymentDouble } from "./support/payment-double.js";
import { env, mustExecute } from "./support/envelopes.js";

const usd = currency("USD");
const sku = makeId<"SkuId">("sku-jacket");
const merchant = makeId<"MerchantId">("merchant-1");
const card = { methodKind: "CARD" as const, tokenRef: "tok-settlement" };

function newKernel() {
  const paymentBoundary = new ScriptedPaymentDouble();
  const kernel = new CommerceKernel({ paymentBoundary });
  return { kernel, paymentBoundary };
}

function twinOf(kernel: CommerceKernel) {
  const twin = CommerceTwin.fromEvents(kernel.events());
  assertTwinMatchesAuthoritative(twin.snapshot(), kernel.snapshot());
  assertCanonicalEquivalence(twin.snapshot(), kernel.snapshot());
  return twin;
}

/** Captured payment of 10000 minor units against a fresh order. */
async function capturedPayment(kernel: CommerceKernel, tag: string): Promise<PaymentIntent["paymentId"]> {
  await mustExecute(kernel, env({
    type: "ADD_CART_LINE",
    cartId: makeId<"CartId">(`cart-${tag}`),
    skuId: sku,
    quantity: countQuantity(1),
    unitPrice: money("10000", usd),
  }));
  await mustExecute(kernel, env({ type: "PLACE_ORDER", cartId: makeId<"CartId">(`cart-${tag}`), merchantId: merchant }));
  const order = kernel.view().allOrders().find((item) => item.cartId === makeId<"CartId">(`cart-${tag}`))!;
  await mustExecute(kernel, env({
    type: "CREATE_PAYMENT_INTENT",
    request: { amount: money("10000", usd), reference: { kind: "ORDER", orderId: order.orderId }, method: card },
  }));
  const intent = kernel.view().allPaymentIntents().find((item) => item.reference.kind === "ORDER" && item.reference.orderId === order.orderId);
  const paymentId = intent!.paymentId;
  await mustExecute(kernel, env({ type: "CAPTURE_PAYMENT", paymentId }));
  return paymentId;
}

async function rejected(kernel: CommerceKernel, payload: Parameters<typeof env>[0]): Promise<void> {
  const outcome: CommandExecution = await kernel.execute(env(payload));
  expect(outcome.status).toBe("REJECTED");
}

describe("W1-004 acceptance scenario 3 — settlement tri-state (UNKNOWN never becomes money-in)", () => {
  it("an UNKNOWN observation holds UNKNOWN everywhere (order payment status, settlement record, twin) and never enters money-in; a later OBSERVED SETTLED resolves it", async () => {
    const { kernel, paymentBoundary } = newKernel();
    const paymentId = await capturedPayment(kernel, "hold");
    const orderId = kernel.view().allOrders().at(-1)!.orderId;
    expect(kernel.view().order(orderId)?.paymentStatus).toBe("PAID");

    // UNKNOWN observation: the provider-native status is preserved verbatim.
    paymentBoundary.scriptSettlementOutcome(paymentId, {
      resolved: "UNKNOWN",
      reason: "CLEARING_IN_PROGRESS",
      providerNativeStatus: "SETTLEMENT_PENDING",
    });
    await mustExecute(kernel, env({ type: "OBSERVE_SETTLEMENT", paymentId }));
    expect(kernel.view().settlementRecord(paymentId)?.status).toBe("UNKNOWN");
    expect(kernel.view().settlementRecord(paymentId)?.providerNativeStatus).toBe("SETTLEMENT_PENDING");
    // The ORDER projection holds UNKNOWN — it refuses to claim money while clearing is ambiguous.
    expect(kernel.view().order(orderId)?.paymentStatus).toBe("UNKNOWN");
    // Money-in view stays EMPTY (UNKNOWN is never money-in).
    const twin = twinOf(kernel);
    expect(twin.facts().recourse.moneyInPaymentIds()).toEqual([]);
    expect(twin.facts().recourse.settlement(paymentId)?.status).toBe("UNKNOWN");

    // A second UNKNOWN observation stays UNKNOWN (never promoted, never dropped).
    await mustExecute(kernel, env({ type: "OBSERVE_SETTLEMENT", paymentId }));
    expect(kernel.view().settlementRecord(paymentId)?.status).toBe("UNKNOWN");

    // The OBSERVED outcome arrives → SETTLED, order resolves to PAID, money-in includes it.
    paymentBoundary.scriptSettlementOutcome(paymentId, {
      resolved: "OBSERVED",
      status: "SETTLED",
      settledAmount: money("10000", usd),
    });
    await mustExecute(kernel, env({ type: "OBSERVE_SETTLEMENT", paymentId }));
    expect(kernel.view().settlementRecord(paymentId)?.status).toBe("SETTLED");
    expect(kernel.view().order(orderId)?.paymentStatus).toBe("PAID");
    const resolvedTwin = twinOf(kernel);
    expect(resolvedTwin.facts().recourse.moneyInPaymentIds()).toEqual([paymentId]);
    expect(resolvedTwin.facts().recourse.settlement(paymentId)?.settledAmount?.amountMinor).toBe("10000");
    // Terminal: SETTLED accepts no further observation or window close.
    await rejected(kernel, { type: "OBSERVE_SETTLEMENT", paymentId });
    await rejected(kernel, { type: "CLOSE_SETTLEMENT_WINDOW", paymentId });
  });

  it("the recourse window closes an UNKNOWN settlement to WINDOW_CLOSED — never money-in; the order resolves to NOT_PAID", async () => {
    const { kernel, paymentBoundary } = newKernel();
    const paymentId = await capturedPayment(kernel, "window");
    const orderId = kernel.view().allOrders().at(-1)!.orderId;
    const unknown: SettlementObservation = { resolved: "UNKNOWN", reason: "AMBIGUOUS", providerNativeStatus: "NO_RESPONSE" };
    paymentBoundary.scriptSettlementOutcome(paymentId, unknown);
    await mustExecute(kernel, env({ type: "OBSERVE_SETTLEMENT", paymentId }));
    expect(kernel.view().order(orderId)?.paymentStatus).toBe("UNKNOWN");

    await mustExecute(kernel, env({ type: "CLOSE_SETTLEMENT_WINDOW", paymentId }));
    expect(kernel.view().settlementRecord(paymentId)?.status).toBe("WINDOW_CLOSED");
    // The window close NEVER becomes money-in and resolves the held UNKNOWN.
    expect(kernel.view().order(orderId)?.paymentStatus).toBe("NOT_PAID");
    const twin = twinOf(kernel);
    expect(twin.facts().recourse.moneyInPaymentIds()).toEqual([]);
    // Terminal: closed windows accept no further observations.
    await rejected(kernel, { type: "OBSERVE_SETTLEMENT", paymentId });
    await rejected(kernel, { type: "CLOSE_SETTLEMENT_WINDOW", paymentId });
  });

  it("an OBSERVED NOT_SETTLED outcome records failed clearing (money never arrived) and resolves the order to NOT_PAID", async () => {
    const { kernel, paymentBoundary } = newKernel();
    const paymentId = await capturedPayment(kernel, "not-settled");
    const orderId = kernel.view().allOrders().find((item) => item.cartId === makeId<"CartId">("cart-not-settled"))!.orderId;
    // First HOLD UNKNOWN (the projection refuses to claim money while clearing is ambiguous)...
    paymentBoundary.scriptSettlementOutcome(paymentId, { resolved: "UNKNOWN", reason: "PENDING", providerNativeStatus: "CLEARING_PENDING" });
    await mustExecute(kernel, env({ type: "OBSERVE_SETTLEMENT", paymentId }));
    expect(kernel.view().order(orderId)?.paymentStatus).toBe("UNKNOWN");
    // ...then the definitive NOT_SETTLED observation resolves it: money never arrived.
    paymentBoundary.scriptSettlementOutcome(paymentId, { resolved: "OBSERVED", status: "NOT_SETTLED" });
    await mustExecute(kernel, env({ type: "OBSERVE_SETTLEMENT", paymentId }));
    expect(kernel.view().settlementRecord(paymentId)?.status).toBe("NOT_SETTLED");
    expect(kernel.view().order(orderId)?.paymentStatus).toBe("NOT_PAID");
    const twin = twinOf(kernel);
    expect(twin.facts().recourse.moneyInPaymentIds()).toEqual([]);
    await rejected(kernel, { type: "OBSERVE_SETTLEMENT", paymentId });
  });

  it("window close requires captured funds and an unresolved settlement; the unscripted port default is UNKNOWN (never a guessed outcome)", async () => {
    const { kernel } = newKernel();
    const paymentId = await capturedPayment(kernel, "guards");
    // Fresh: settlement PENDING (unobserved) — the window can close.
    await mustExecute(kernel, env({ type: "CLOSE_SETTLEMENT_WINDOW", paymentId }));
    expect(kernel.view().settlementRecord(paymentId)?.status).toBe("WINDOW_CLOSED");
    // Uncaptured payments have no settlement recourse window.
    await mustExecute(kernel, env({
      type: "ADD_CART_LINE",
      cartId: makeId<"CartId">("cart-uncaptured"),
      skuId: sku,
      quantity: countQuantity(1),
      unitPrice: money("5000", usd),
    }));
    await mustExecute(kernel, env({ type: "PLACE_ORDER", cartId: makeId<"CartId">("cart-uncaptured"), merchantId: merchant }));
    const uncapturedOrder = kernel.view().allOrders().find((item) => item.cartId === makeId<"CartId">("cart-uncaptured"))!;
    await mustExecute(kernel, env({
      type: "CREATE_PAYMENT_INTENT",
      request: { amount: money("5000", usd), reference: { kind: "ORDER", orderId: uncapturedOrder.orderId }, method: card },
    }));
    const uncaptured = kernel.view().allPaymentIntents().find((item) => item.reference.kind === "ORDER" && item.reference.orderId === uncapturedOrder.orderId)!.paymentId;
    await rejected(kernel, { type: "CLOSE_SETTLEMENT_WINDOW", paymentId: uncaptured });
    // Unknown payment: deterministic rejection, zero events.
    await rejected(kernel, { type: "OBSERVE_SETTLEMENT", paymentId: makeId<"PaymentId">("pay-missing") });
    twinOf(kernel);
  });

  it("settlement observations journaled before any capture fold deterministically (provider may report non-settlement for uncaptured rails)", async () => {
    const { kernel, paymentBoundary } = newKernel();
    await mustExecute(kernel, env({
      type: "ADD_CART_LINE",
      cartId: makeId<"CartId">("cart-pre"),
      skuId: sku,
      quantity: countQuantity(1),
      unitPrice: money("7000", usd),
    }));
    await mustExecute(kernel, env({ type: "PLACE_ORDER", cartId: makeId<"CartId">("cart-pre"), merchantId: merchant }));
    const preOrder = kernel.view().allOrders().find((item) => item.cartId === makeId<"CartId">("cart-pre"))!;
    await mustExecute(kernel, env({
      type: "CREATE_PAYMENT_INTENT",
      request: { amount: money("7000", usd), reference: { kind: "ORDER", orderId: preOrder.orderId }, method: card },
    }));
    const paymentId = kernel.view().allPaymentIntents().find((item) => item.reference.kind === "ORDER" && item.reference.orderId === preOrder.orderId)!.paymentId;
    paymentBoundary.scriptSettlementOutcome(paymentId, { resolved: "OBSERVED", status: "NOT_SETTLED" });
    await mustExecute(kernel, env({ type: "OBSERVE_SETTLEMENT", paymentId }));
    expect(kernel.view().settlementRecord(paymentId)?.status).toBe("NOT_SETTLED");
    // Terminal before any capture: later captures are still allowed on the rail,
    // but the settlement record stays terminal (deterministic state machine).
    await rejected(kernel, { type: "OBSERVE_SETTLEMENT", paymentId });
    twinOf(kernel);
  });
});
