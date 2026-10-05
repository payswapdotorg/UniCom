/**
 * W1-002 acceptance scenario 6: the payment boundary port is
 * provider-agnostic; a TEST DOUBLE proves the port contract without any
 * production mock masquerading as a provider.
 *
 * - The kernel performs NO provider implementation: without an injected
 *   port, payment commands are deterministic rejections.
 * - Two DIFFERENT doubles (different id schemes / native behaviors) drive
 *   the kernel through the same command surface — the kernel records
 *   canonical facts only, no provider shapes leak.
 * - Ambiguous provider outcomes resolve to UNKNOWN with the native status
 *   preserved (INVARIANT 10/11) — never FAILED.
 * - PaymentMethodRef stays an opaque token; credentials are not expressible.
 */
import { describe, expect, it } from "vitest";
import {
  CommerceKernel,
  countQuantity,
  currency,
  makeId,
  money,
  validatePaymentIntentRequest,
  type PaymentBoundary,
  type PaymentIntent,
  type PaymentStatus,
  type Result,
} from "../../contract.js";
import { ScriptedPaymentDouble } from "./support/payment-double.js";
import { env, mustExecute } from "./support/envelopes.js";

const usd = currency("USD");

async function orderFor(kernel: CommerceKernel, cartId: string): Promise<string> {
  await mustExecute(kernel, env({
    type: "ADD_CART_LINE",
    cartId: makeId<"CartId">(cartId),
    skuId: makeId<"SkuId">("sku-widget"),
    quantity: countQuantity(1),
    unitPrice: money("4200", usd),
  }));
  await mustExecute(kernel, env({ type: "PLACE_ORDER", cartId: makeId<"CartId">(cartId), merchantId: makeId<"MerchantId">("merchant-1") }));
  return "order-1";
}

describe("W1-002 acceptance scenario 6 — payment boundary port (provider-agnostic)", () => {
  it("without a port, payment commands are deterministic rejections (no default provider)", async () => {
    const kernel = new CommerceKernel();
    const orderId = await orderFor(kernel, "cart-noport");
    const outcome = await kernel.execute(env({
      type: "CREATE_PAYMENT_INTENT",
      request: {
        amount: money("4200", usd),
        reference: { kind: "ORDER", orderId: makeId<"OrderId">(orderId) },
        method: { methodKind: "CARD", tokenRef: "tok_1" },
      },
    }));
    expect(outcome.status).toBe("REJECTED");
    if (outcome.status === "REJECTED") {
      expect(outcome.reason.code).toBe("INVALID_STATE");
      expect(outcome.reason.detail).toContain("payment boundary port not bound");
    }
    expect(kernel.events().length).toBe(2); // cart + order only
  });

  it("a second, DIFFERENT double drives the same kernel surface (port, not provider)", async () => {
    // Double B: BANK_TRANSFER-flavored, AUTHORIZED→CAPTURED with its own id scheme.
    const doubleB: PaymentBoundary = {
      async createPaymentIntent(request) {
        const validation = validatePaymentIntentRequest(request);
        if (!validation.ok) return validation;
        return {
          ok: true,
          value: {
            paymentId: makeId<"PaymentId">("bt-double-1"),
            reference: request.reference,
            amount: request.amount,
            status: "REQUIRES_CUSTOMER_ACTION",
            customerAction: { actionKind: "REDIRECT", instruction: "Approve in your banking app" },
            revision: 1,
          },
        };
      },
      async capturePayment(paymentId) {
        return {
          ok: true,
          value: { paymentId, reference: { kind: "ORDER", orderId: makeId<"OrderId">("order-1") }, amount: money("4200", usd), status: "CAPTURED", revision: 2 },
        };
      },
      async voidPayment(paymentId) {
        return { ok: true, value: { paymentId, reference: { kind: "ORDER", orderId: makeId<"OrderId">("order-1") }, amount: money("4200", usd), status: "VOIDED", revision: 2 } };
      },
      async refundPayment(paymentId, _amount) {
        return {
          ok: true,
          value: { paymentId, reference: { kind: "ORDER", orderId: makeId<"OrderId">("order-1") }, amount: money("4200", usd), status: "PARTIALLY_REFUNDED", revision: 3 },
        };
      },
    };
    const kernel = new CommerceKernel({ paymentBoundary: doubleB });
    const orderId = await orderFor(kernel, "cart-b");
    await mustExecute(kernel, env({
      type: "CREATE_PAYMENT_INTENT",
      request: {
        amount: money("4200", usd),
        reference: { kind: "ORDER", orderId: makeId<"OrderId">(orderId) },
        method: { methodKind: "BANK_TRANSFER", tokenRef: "mandate-17" },
      },
    }));
    const intent = kernel.view().allPaymentIntents()[0];
    expect(intent?.status).toBe("REQUIRES_CUSTOMER_ACTION");
    expect(intent?.customerAction?.actionKind).toBe("REDIRECT");
    await mustExecute(kernel, env({ type: "CAPTURE_PAYMENT", paymentId: makeId<"PaymentId">("bt-double-1") }));
    expect(kernel.view().order(orderId)?.paymentStatus).toBe("PAID");
  });

  it("ambiguous provider outcomes become UNKNOWN with the native status preserved", async () => {
    const paymentBoundary = new ScriptedPaymentDouble();
    const kernel = new CommerceKernel({ paymentBoundary });
    const orderId = await orderFor(kernel, "cart-ambiguous");
    await mustExecute(kernel, env({
      type: "CREATE_PAYMENT_INTENT",
      request: {
        amount: money("4200", usd),
        reference: { kind: "ORDER", orderId: makeId<"OrderId">(orderId) },
        method: { methodKind: "CARD", tokenRef: "tok_1" },
      },
    }));
    paymentBoundary.makeNextOutcomeAmbiguous("ISSUER_TIMEOUT");
    await mustExecute(kernel, env({ type: "CAPTURE_PAYMENT", paymentId: makeId<"PaymentId">("pay-double-1") }));
    const intent = kernel.view().paymentIntent("pay-double-1");
    expect(intent?.status).toBe("UNKNOWN");
    expect(intent?.providerNativeStatus).toBe("ISSUER_TIMEOUT");
    // The ORDER preserves UNKNOWN — never flattened to FAILED (INVARIANT 10).
    expect(kernel.view().order(orderId)?.paymentStatus).toBe("UNKNOWN");
    expect(kernel.view().order(orderId)?.state).toBe("PENDING");
    // UNKNOWN resolves through deterministic confirmation, never by guessing.
    await mustExecute(kernel, env({ type: "CAPTURE_PAYMENT", paymentId: makeId<"PaymentId">("pay-double-1") }));
    expect(kernel.view().paymentIntent("pay-double-1")?.status).toBe("CAPTURED");
    expect(kernel.view().order(orderId)?.state).toBe("PAID");
  });

  it("the double proves the port contract exactly (typed Result shapes)", async () => {
    const paymentBoundary = new ScriptedPaymentDouble();
    const created: Result<PaymentIntent, { code: string }> = await paymentBoundary.createPaymentIntent({
      amount: money("4200", usd),
      reference: { kind: "CHECKOUT", checkoutSessionId: makeId<"CheckoutSessionId">("cs-9") },
      method: { methodKind: "WALLET", tokenRef: "wallet-1" },
    });
    expect(created.ok).toBe(true);
    if (created.ok) {
      const status: PaymentStatus = created.value.status;
      expect(status).toBe("AUTHORIZED");
      expect(created.value.paymentId).toBe("pay-double-1");
    }
    // Port errors are typed values, not exceptions.
    const missing: Result<PaymentIntent, { code: string }> = await paymentBoundary.capturePayment(makeId<"PaymentId">("pay-missing"));
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.code).toBe("PAYMENT_NOT_FOUND");
  });

  it("canonical types cannot express provider isms (compile time)", () => {
    // @ts-expect-error — "succeeded" is a provider-ism, not a canonical PaymentStatus
    const stripeIsm: PaymentStatus = "succeeded";
    void stripeIsm;
    // @ts-expect-error — provider-native statuses are never canonical positions
    const nativeAsCanonical: PaymentStatus = "requires_capture";
    void nativeAsCanonical;
    expect(true).toBe(true);
  });
});
