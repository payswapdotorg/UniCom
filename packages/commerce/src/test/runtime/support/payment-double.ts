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
 *
 * W1-004: also implements the two additive PORT extensions —
 * PartialCaptureBoundary (amount-aware capture) and
 * SettlementObservationBoundary (tri-state settlement reporting) — with
 * exact captured/refunded bookkeeping so the kernel's capture-fact guards
 * and the double's rail agree on the payment state machine. Unscripted
 * settlement observations deterministically resolve to UNKNOWN.
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
  type SettlementObservation,
  type SettlementObservationBoundary,
  type PartialCaptureBoundary,
} from "../../../contract.js";

interface DoubleIntent extends PaymentIntent {
  refundedMinor: bigint;
  capturedMinor: bigint;
}

const CAPTURABLE = new Set(["AUTHORIZED", "PARTIALLY_CAPTURED", "REQUIRES_CUSTOMER_ACTION", "UNKNOWN"]);
const REFUNDABLE = new Set(["CAPTURED", "PARTIALLY_CAPTURED", "PARTIALLY_REFUNDED"]);

function boundaryError(code: PaymentBoundaryError["code"], detail: string): PaymentBoundaryError {
  return { code, detail };
}

export class ScriptedPaymentDouble implements PaymentBoundary, PartialCaptureBoundary, SettlementObservationBoundary {
  private readonly intents = new Map<string, DoubleIntent>();
  private counter = 0;
  private ambiguousMode = false;
  private ambiguousNativeStatus = "PROCESSING_STATE_UNCLEAR";
  private readonly callLog: string[] = [];
  private readonly settlementOutcomes = new Map<string, SettlementObservation>();
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
    const stored: DoubleIntent = { ...intent, refundedMinor: 0n, capturedMinor: 0n };
    this.intents.set(paymentId, this.ambiguate(stored));
    return { ok: true, value: this.present(paymentId) };
  }

  /** Presentable port value: the internal bookkeeping field NEVER leaks into
   *  domain objects (a real adapter returns clean PaymentIntents — W1-003's
   *  canonical twin fold treats stray bigints as corruption). */
  private present(paymentId: string): PaymentIntent {
    const { refundedMinor: _r, capturedMinor: _c, ...intent } = this.intents.get(paymentId) as DoubleIntent;
    return intent;
  }

  async capturePayment(paymentId: PaymentIntent["paymentId"]): Promise<Result<PaymentIntent, PaymentBoundaryError>> {
    this.callLog.push(`capture:${paymentId}`);
    const existing = this.intents.get(paymentId);
    if (!existing) {
      return { ok: false, error: boundaryError("PAYMENT_NOT_FOUND", `unknown payment ${paymentId}`) };
    }
    // UNKNOWN is retriable: an adapter may re-query an ambiguous rail for a
    // definitive outcome (UNKNOWN ≠ FAILED — INVARIANT 10). Full capture =
    // everything still authorized (intent amount minus captured bookkeeping).
    if (!CAPTURABLE.has(existing.status)) {
      return { ok: false, error: boundaryError("AMBIGUOUS_PROVIDER_RESPONSE", `cannot capture from ${existing.status}`) };
    }
    const capturedMinor = BigInt(existing.amount.amountMinor);
    const captured: DoubleIntent = { ...existing, status: "CAPTURED", capturedMinor, revision: existing.revision + 1 };
    this.intents.set(paymentId, this.ambiguate(captured));
    return { ok: true, value: this.present(paymentId) };
  }

  /** W1-004 PORT extension: amount-aware (partial) capture. */
  async capturePaymentAmount(paymentId: PaymentIntent["paymentId"], amount: PaymentIntent["amount"]): Promise<Result<PaymentIntent, PaymentBoundaryError>> {
    this.callLog.push(`captureAmount:${paymentId}:${amount.amountMinor}`);
    const existing = this.intents.get(paymentId);
    if (!existing) {
      return { ok: false, error: boundaryError("PAYMENT_NOT_FOUND", `unknown payment ${paymentId}`) };
    }
    if (!CAPTURABLE.has(existing.status)) {
      return { ok: false, error: boundaryError("AMBIGUOUS_PROVIDER_RESPONSE", `cannot capture from ${existing.status}`) };
    }
    if (amount.currency !== existing.amount.currency) {
      return { ok: false, error: boundaryError("CURRENCY_MISMATCH", `${amount.currency} vs ${existing.amount.currency}`) };
    }
    const total = BigInt(existing.amount.amountMinor);
    const requested = BigInt(amount.amountMinor);
    if (requested <= 0n || existing.capturedMinor + requested > total) {
      return { ok: false, error: boundaryError("INVALID_AMOUNT", `capture ${amount.amountMinor} out of bounds: captured ${existing.capturedMinor} of ${total}`) };
    }
    const capturedMinor = existing.capturedMinor + requested;
    const status = capturedMinor === total ? "CAPTURED" : "PARTIALLY_CAPTURED";
    const captured: DoubleIntent = { ...existing, status, capturedMinor, revision: existing.revision + 1 };
    this.intents.set(paymentId, this.ambiguate(captured));
    return { ok: true, value: this.present(paymentId) };
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
    if (existing.capturedMinor > 0n) {
      return { ok: false, error: boundaryError("AMBIGUOUS_PROVIDER_RESPONSE", `cannot void after capture (captured ${existing.capturedMinor})`) };
    }
    const voided: DoubleIntent = { ...existing, status: "VOIDED", revision: existing.revision + 1 };
    this.intents.set(paymentId, this.ambiguate(voided));
    return { ok: true, value: this.present(paymentId) };
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
    const status = refundedMinor >= existing.capturedMinor ? "REFUNDED" : "PARTIALLY_REFUNDED";
    const refunded: DoubleIntent = { ...existing, status, refundedMinor, revision: existing.revision + 1 };
    this.intents.set(paymentId, this.ambiguate(refunded));
    return { ok: true, value: this.present(paymentId) };
  }

  /** W1-004 PORT extension: tri-state settlement observation. Unscripted
   *  observations deterministically report UNKNOWN (the provider has no
   *  definitive clearing outcome yet — never FAILED, never SETTLED). */
  async observeSettlement(paymentId: PaymentIntent["paymentId"]): Promise<Result<SettlementObservation, PaymentBoundaryError>> {
    this.callLog.push(`settlement:${paymentId}`);
    const existing = this.intents.get(paymentId);
    if (!existing) {
      return { ok: false, error: boundaryError("PAYMENT_NOT_FOUND", `unknown payment ${paymentId}`) };
    }
    const scripted = this.settlementOutcomes.get(paymentId);
    if (scripted) return { ok: true, value: scripted };
    return {
      ok: true,
      value: { resolved: "UNKNOWN", reason: "SETTLEMENT_UNOBSERVED", providerNativeStatus: "SETTLEMENT_PENDING" },
    };
  }

  /** Script a payment's settlement outcome (OBSERVED SETTLED/NOT_SETTLED or UNKNOWN). */
  scriptSettlementOutcome(paymentId: string, outcome: SettlementObservation): void {
    this.settlementOutcomes.set(paymentId, outcome);
  }

  /** Script the NEXT port outcome as AMBIGUOUS → UNKNOWN (law 5). */
  makeNextOutcomeAmbiguous(nativeStatus = "PROCESSING_STATE_UNCLEAR"): void {
    this.ambiguousMode = true;
    this.ambiguousNativeStatus = nativeStatus;
  }

  /** Direct read access for test assertions (internal bookkeeping stripped). */
  intent(paymentId: string): PaymentIntent | undefined {
    const existing = this.intents.get(paymentId);
    return existing === undefined ? undefined : this.present(paymentId);
  }

  private ambiguate(intent: DoubleIntent): DoubleIntent {
    if (!this.ambiguousMode) return intent;
    this.ambiguousMode = false;
    return { ...resolveAmbiguousPayment(intent, this.ambiguousNativeStatus), refundedMinor: intent.refundedMinor, capturedMinor: intent.capturedMinor };
  }
}

function validateRefundAmountOnDouble(intent: PaymentIntent & { capturedMinor: bigint }, amount: PaymentIntent["amount"]): Result<true, PaymentBoundaryError> {
  if (!REFUNDABLE.has(intent.status)) {
    return { ok: false, error: boundaryError("PAYMENT_NOT_FOUND", `refund requires a captured intent, got ${intent.status}`) };
  }
  if (amount.currency !== intent.amount.currency) {
    return { ok: false, error: boundaryError("CURRENCY_MISMATCH", `${amount.currency} vs ${intent.amount.currency}`) };
  }
  if (BigInt(amount.amountMinor) <= 0n || BigInt(amount.amountMinor) > intent.capturedMinor) {
    return { ok: false, error: boundaryError("INVALID_AMOUNT", `refund ${amount.amountMinor} out of bounds for captured ${intent.capturedMinor}`) };
  }
  return { ok: true, value: true };
}

/** Convenience: zero money in a currency (test assertions). */
export function zeroOf(currencyCode: Parameters<typeof money>[1]) {
  return money("0", currencyCode);
}
