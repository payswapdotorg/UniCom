/**
 * ██████████████████████████████████████████████████████████████████████
 * █ TEST DOUBLE — NOT A PROVIDER. NEVER SHIPS OUTSIDE src/test. █
 * █ NO PRODUCTION CODE MAY IMPORT THIS FILE.                     █
 * ██████████████████████████████████████████████████████████████████████
 *
 * Deterministic PaymentBoundary double used to prove the port contract
 * (W1-002 acceptance scenario 6): the kernel is provider-agnostic and the
 * payment boundary is a typed PORT — providers ADAPT to it. This double
 * implements the port exactly like a real adapter would, with scripted
 * deterministic outcomes (including an AMBIGUOUS mode that resolves to
 * UNKNOWN with the provider-native status preserved — INVARIANT 10/11).
 */
import {
  makeId,
  money,
  resolveAmbiguousPayment,
  validatePaymentIntentRequest,
  type PaymentBoundary,
  type PaymentBoundaryError,
  type PaymentIntent,
  type PaymentIntentRequest,
  type Result,
} from "../../../contract.js";

interface DoubleIntent extends PaymentIntent {
  refundedMinor: bigint;
}

function boundaryError(code: PaymentBoundaryError["code"], detail: string): PaymentBoundaryError {
  return { code, detail };
}

export class ScriptedPaymentDouble implements PaymentBoundary {
  private readonly intents = new Map<string, DoubleIntent>();
  private counter = 0;
  private ambiguousMode = false;
  private ambiguousNativeStatus = "PROCESSING_STATE_UNCLEAR";
  private readonly callLog: string[] = [];
  /** Recorded calls (assertion surface for the port contract tests). */
  get calls(): readonly string[] {
    return this.callLog;
  }

  async createPaymentIntent(request: PaymentIntentRequest): Promise<Result<PaymentIntent, PaymentBoundaryError>> {
    this.callLog.push(`create:${request.reference.kind}:${request.amount.amountMinor}`);
    const validation = validatePaymentIntentRequest(request);
    if (!validation.ok) return validation;
    const paymentId = makeId<"PaymentId">(`pay-double-${(this.counter += 1)}`);
    const intent: PaymentIntent = {
      paymentId,
      reference: request.reference,
      amount: request.amount,
      status: "AUTHORIZED",
      revision: 1,
    };
    this.intents.set(paymentId, { ...intent, refundedMinor: 0n });
    return { ok: true, value: intent };
  }

  async capturePayment(paymentId: PaymentIntent["paymentId"]): Promise<Result<PaymentIntent, PaymentBoundaryError>> {
    this.callLog.push(`capture:${paymentId}`);
    const existing = this.intents.get(paymentId);
    if (!existing) {
      return { ok: false, error: boundaryError("PAYMENT_NOT_FOUND", `unknown payment ${paymentId}`) };
    }
    // UNKNOWN is retriable: an adapter may re-query an ambiguous rail for a
    // definitive outcome (UNKNOWN ≠ FAILED — INVARIANT 10).
    if (existing.status !== "AUTHORIZED" && existing.status !== "REQUIRES_CUSTOMER_ACTION" && existing.status !== "UNKNOWN") {
      return { ok: false, error: boundaryError("AMBIGUOUS_PROVIDER_RESPONSE", `cannot capture from ${existing.status}`) };
    }
    const captured: DoubleIntent = { ...existing, status: "CAPTURED", revision: existing.revision + 1 };
    this.intents.set(paymentId, this.ambiguate(captured));
    return { ok: true, value: this.intents.get(paymentId) as PaymentIntent };
  }

  async voidPayment(paymentId: PaymentIntent["paymentId"]): Promise<Result<PaymentIntent, PaymentBoundaryError>> {
    this.callLog.push(`void:${paymentId}`);
    const existing = this.intents.get(paymentId);
    if (!existing) {
      return { ok: false, error: boundaryError("PAYMENT_NOT_FOUND", `unknown payment ${paymentId}`) };
    }
    if (existing.status !== "AUTHORIZED") {
      return { ok: false, error: boundaryError("AMBIGUOUS_PROVIDER_RESPONSE", `cannot void from ${existing.status}`) };
    }
    const voided: DoubleIntent = { ...existing, status: "VOIDED", revision: existing.revision + 1 };
    this.intents.set(paymentId, this.ambiguate(voided));
    return { ok: true, value: this.intents.get(paymentId) as PaymentIntent };
  }

  async refundPayment(
    paymentId: PaymentIntent["paymentId"],
    amount: PaymentIntent["amount"],
  ): Promise<Result<PaymentIntent, PaymentBoundaryError>> {
    this.callLog.push(`refund:${paymentId}:${amount.amountMinor}`);
    const existing = this.intents.get(paymentId);
    if (!existing) {
      return { ok: false, error: boundaryError("PAYMENT_NOT_FOUND", `unknown payment ${paymentId}`) };
    }
    const validation = validateRefundAmountOnDouble(existing, amount);
    if (!validation.ok) return validation;
    const refundedMinor = existing.refundedMinor + BigInt(amount.amountMinor);
    const total = BigInt(existing.amount.amountMinor);
    const status = refundedMinor >= total ? "REFUNDED" : "PARTIALLY_REFUNDED";
    const refunded: DoubleIntent = { ...existing, status, refundedMinor, revision: existing.revision + 1 };
    this.intents.set(paymentId, this.ambiguate(refunded));
    return { ok: true, value: this.intents.get(paymentId) as PaymentIntent };
  }

  /** Script the NEXT port outcome as AMBIGUOUS → UNKNOWN (law 5). */
  makeNextOutcomeAmbiguous(nativeStatus = "PROCESSING_STATE_UNCLEAR"): void {
    this.ambiguousMode = true;
    this.ambiguousNativeStatus = nativeStatus;
  }

  /** Direct read access for test assertions. */
  intent(paymentId: string): PaymentIntent | undefined {
    return this.intents.get(paymentId);
  }

  private ambiguate(intent: DoubleIntent): DoubleIntent {
    if (!this.ambiguousMode) return intent;
    this.ambiguousMode = false;
    return { ...resolveAmbiguousPayment(intent, this.ambiguousNativeStatus), refundedMinor: intent.refundedMinor };
  }
}

function validateRefundAmountOnDouble(intent: PaymentIntent, amount: PaymentIntent["amount"]): Result<true, PaymentBoundaryError> {
  if (intent.status !== "CAPTURED" && intent.status !== "PARTIALLY_REFUNDED") {
    return { ok: false, error: boundaryError("PAYMENT_NOT_FOUND", `refund requires a captured intent, got ${intent.status}`) };
  }
  if (amount.currency !== intent.amount.currency) {
    return { ok: false, error: boundaryError("CURRENCY_MISMATCH", `${amount.currency} vs ${intent.amount.currency}`) };
  }
  if (BigInt(amount.amountMinor) <= 0n || BigInt(amount.amountMinor) > BigInt(intent.amount.amountMinor)) {
    return { ok: false, error: boundaryError("INVALID_AMOUNT", `refund ${amount.amountMinor} out of bounds for ${intent.amount.amountMinor}`) };
  }
  return { ok: true, value: true };
}

/** Convenience: zero money in a currency (test assertions). */
export function zeroOf(currencyCode: Parameters<typeof money>[1]) {
  return money("0", currencyCode);
}
