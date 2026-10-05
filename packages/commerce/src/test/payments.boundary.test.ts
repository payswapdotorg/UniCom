/**
 * Contract tests — the payment boundary (provider-agnostic seam).
 *
 * - Ambiguous provider outcomes resolve to UNKNOWN with the provider-native
 *   status preserved — never flattened to FAILED (INVARIANT 10/11).
 * - Customer-action-required is a first-class preserved state.
 * - No provider-specific semantics are expressible in the canonical types
 *   (compile-time negatives).
 */
import { describe, expect, it } from "vitest";
import {
  currency,
  makeId,
  money,
  resolveAmbiguousPayment,
  validatePaymentIntentRequest,
  validateRefundAmount,
  type PaymentBoundary,
  type PaymentIntent,
  type PaymentStatus,
} from "../contract.js";

const usd = currency("USD");
const orderId = makeId<"OrderId">("order-77");

function intent(status: PaymentStatus): PaymentIntent {
  return {
    paymentId: makeId<"PaymentId">("pay-77"),
    reference: { kind: "ORDER", orderId },
    amount: money("3998", usd),
    status,
    revision: 1,
  };
}

describe("payment boundary statuses", () => {
  it("preserves customer-action-required as a first-class state", () => {
    const actionIntent: PaymentIntent = {
      ...intent("REQUIRES_CUSTOMER_ACTION"),
      customerAction: { actionKind: "OTP", instruction: "Verify in your banking app", expiresAt: "2026-10-05T01:00:00Z" },
    };
    expect(actionIntent.status).toBe("REQUIRES_CUSTOMER_ACTION");
    expect(actionIntent.customerAction?.actionKind).toBe("OTP");
  });

  it("an ambiguous provider outcome resolves to UNKNOWN, never FAILED", () => {
    const captured = intent("CAPTURED");
    const resolved = resolveAmbiguousPayment(captured, "PROCESSING_STATE_UNCLEAR");
    expect(resolved.status).toBe("UNKNOWN");
    expect(resolved.providerNativeStatus).toBe("PROCESSING_STATE_UNCLEAR");
    expect(resolved.revision).toBe(2);
  });

  it("UNKNOWN and FAILED are distinct canonical statuses", () => {
    const statuses: readonly PaymentStatus[] = ["UNKNOWN", "FAILED", "CAPTURED"];
    expect(statuses.includes("UNKNOWN")).toBe(true);
    expect(statuses[0]).not.toBe(statuses[1]);
  });

  it("forbids provider-native status strings in canonical positions (compile time)", () => {
    // @ts-expect-error — "succeeded" is a provider-ism, not a canonical PaymentStatus
    const stripeIsm: PaymentStatus = "succeeded";
    void stripeIsm;
    // @ts-expect-error — "requires_capture" is a provider-ism, not a canonical PaymentStatus
    const anotherIsm: PaymentStatus = "requires_capture";
    void anotherIsm;
    expect(true).toBe(true);
  });
});

describe("payment intent request validation (deterministic pre-conditions)", () => {
  it("accepts a well-formed request", () => {
    const request = {
      amount: money("3998", usd),
      reference: { kind: "ORDER" as const, orderId },
      method: { methodKind: "CARD" as const, tokenRef: "tok_1" },
    };
    expect(validatePaymentIntentRequest(request)).toMatchObject({ ok: true, value: request });
  });

  it("rejects zero/negative amounts and empty tokens", () => {
    const base = {
      reference: { kind: "ORDER" as const, orderId },
      method: { methodKind: "CARD" as const, tokenRef: "tok_1" },
    };
    expect(validatePaymentIntentRequest({ ...base, amount: money("0", usd) })).toMatchObject({
      ok: false,
      error: { code: "INVALID_AMOUNT" },
    });
    expect(validatePaymentIntentRequest({ ...base, amount: money("-5", usd) })).toMatchObject({
      ok: false,
      error: { code: "INVALID_AMOUNT" },
    });
    expect(validatePaymentIntentRequest({ ...base, amount: money("10", usd), method: { methodKind: "CARD", tokenRef: "" } })).toMatchObject({
      ok: false,
      error: { code: "PROVIDER_UNAVAILABLE" },
    });
  });
});

describe("refund validation against the captured intent", () => {
  it("allows partial and full refunds of a captured intent", () => {
    const result = validateRefundAmount(intent("CAPTURED"), money("1500", usd));
    expect(result).toMatchObject({ ok: true, value: { amountMinor: "1500" } });
    expect(validateRefundAmount(intent("CAPTURED"), money("3998", usd))).toMatchObject({ ok: true });
  });

  it("rejects refunds of non-captured intents, wrong currency, out-of-bounds amounts", () => {
    expect(validateRefundAmount(intent("AUTHORIZED"), money("100", usd))).toMatchObject({
      ok: false,
      error: { code: "PAYMENT_NOT_FOUND" },
    });
    expect(validateRefundAmount(intent("CAPTURED"), money("100", currency("EUR")))).toMatchObject({
      ok: false,
      error: { code: "CURRENCY_MISMATCH" },
    });
    expect(validateRefundAmount(intent("CAPTURED"), money("0", usd))).toMatchObject({
      ok: false,
      error: { code: "INVALID_AMOUNT" },
    });
    expect(validateRefundAmount(intent("CAPTURED"), money("4000", usd))).toMatchObject({
      ok: false,
      error: { code: "INVALID_AMOUNT" },
    });
  });
});

describe("the boundary interface is provider-agnostic by construction", () => {
  it("a test double implementing the interface adapts TO the contract", async () => {
    const deterministicBoundary: PaymentBoundary = {
      async createPaymentIntent(request) {
        const validation = validatePaymentIntentRequest(request);
        if (!validation.ok) return validation;
        return {
          ok: true,
          value: {
            paymentId: makeId<"PaymentId">("pay-test"),
            reference: request.reference,
            amount: request.amount,
            status: "AUTHORIZED",
            revision: 1,
          },
        };
      },
      async capturePayment(paymentId) {
        return {
          ok: true,
          value: { ...intent("CAPTURED"), paymentId },
        };
      },
      async voidPayment(paymentId) {
        return { ok: true, value: { ...intent("VOIDED"), paymentId } };
      },
      async refundPayment(paymentId, amount) {
        const validation = validateRefundAmount(intent("CAPTURED"), amount);
        if (!validation.ok) return validation;
        return { ok: true, value: { ...intent("PARTIALLY_REFUNDED"), paymentId } };
      },
    };
    const created = await deterministicBoundary.createPaymentIntent({
      amount: money("3998", usd),
      reference: { kind: "ORDER", orderId },
      method: { methodKind: "CARD", tokenRef: "tok_1" },
    });
    expect(created).toMatchObject({ ok: true, value: { status: "AUTHORIZED" } });
    const captured = await deterministicBoundary.capturePayment(makeId<"PaymentId">("pay-test"));
    expect(captured).toMatchObject({ ok: true, value: { status: "CAPTURED" } });
  });
});
