/**
 * W2-010 SAFE FAULT-INJECTION ADAPTER #2 — programmable payment boundary
 * (controlled TEST DOUBLE, clearly marked; NOT PRODUCTION CODE — INVARIANT 39).
 *
 * The Commerce Kernel's ONLY payment mutation seam is the injected
 * `PaymentBoundary` port (W1-004 law: no provider integration in the
 * kernel). This double implements the port plus its additive settlement
 * observation extension, so every payment/settlement/refund fault in
 * families F02/F03/F06/F08/F09 is injected HERE and only here — the real
 * kernel, its receipt ledger and its journal are never mocked.
 *
 * Deterministic by construction: a scripted map of behaviors keyed by
 * operation + optional call ordinal; no clocks, no randomness, no network.
 */

import {
  err,
  makeId,
  ok,
  type Money,
  type PaymentBoundary,
  type PaymentBoundaryError,
  type PaymentId,
  type PaymentIntent,
  type PaymentIntentRequest,
  type Result,
  type SettlementObservation,
} from "@unicom/commerce";

/** Fault behaviors the double can be scripted to produce. */
export type PaymentFaultKind =
  | "ok"
  | "provider-unavailable"
  | "ambiguous-unknown"
  | "customer-action";

/** The script for one port operation. */
export interface PaymentOperationScript {
  /** Behaviors consumed in order per operation call; last repeats. Default ok. */
  readonly behaviors?: readonly PaymentFaultKind[];
  /** Provider-native status string reported for ambiguous outcomes. */
  readonly nativeStatus?: string;
}

export interface FaultPaymentBoundaryScript {
  readonly createIntent?: PaymentOperationScript;
  readonly capture?: PaymentOperationScript;
  readonly refund?: PaymentOperationScript;
  readonly void?: PaymentOperationScript;
  /** Settlement observations keyed by paymentId ("*" = default for all). */
  readonly settlements?: Readonly<Record<string, "settled" | "not-settled" | "unknown">>;
}

/** What the double recorded (side-effect accounting for tests). */
export interface FaultPaymentCallRecord {
  readonly createIntentCalls: readonly PaymentIntentRequest[];
  readonly captureCalls: readonly PaymentId[];
  readonly refundCalls: readonly { readonly paymentId: PaymentId; readonly amount: Money }[];
  readonly voidCalls: readonly PaymentId[];
  readonly settlementCalls: readonly PaymentId[];
}

let intentSeq = 0;

export class FaultInjectingPaymentBoundary implements PaymentBoundary {
  private readonly script: FaultPaymentBoundaryScript;
  private readonly createIntentCalls: PaymentIntentRequest[] = [];
  private readonly captureCalls: PaymentId[] = [];
  private readonly refundCalls: { paymentId: PaymentId; amount: Money }[] = [];
  private readonly voidCalls: PaymentId[] = [];
  private readonly settlementCalls: PaymentId[] = [];
  /** Intents this double created (capture/void/refund update THEM — the
   * reference and amount must survive, exactly like a real provider
   * returning its own record for the same payment). */
  private readonly intentsByPaymentId = new Map<string, PaymentIntent>();
  private cursors: Record<"createIntent" | "capture" | "refund" | "void", number> = {
    createIntent: 0,
    capture: 0,
    refund: 0,
    void: 0,
  };

  constructor(script: FaultPaymentBoundaryScript = {}) {
    this.script = script;
  }

  recordedCalls(): FaultPaymentCallRecord {
    return {
      createIntentCalls: [...this.createIntentCalls],
      captureCalls: [...this.captureCalls],
      refundCalls: [...this.refundCalls],
      voidCalls: [...this.voidCalls],
      settlementCalls: [...this.settlementCalls],
    };
  }

  /** Tests may rewrite the script between phases (provider recovery). */
  updateScript(patch: Partial<FaultPaymentBoundaryScript>): void {
    Object.assign(this.script as Record<string, unknown>, patch);
  }

  async createPaymentIntent(request: PaymentIntentRequest): Promise<Result<PaymentIntent, PaymentBoundaryError>> {
    this.createIntentCalls.push(request);
    const kind = this.pick("createIntent", this.script.createIntent);
    intentSeq += 1;
    const paymentId = makeId<"PaymentId">(`fault-pay-${intentSeq}`);
    const base: PaymentIntent = {
      paymentId,
      reference: request.reference,
      amount: request.amount,
      status: "AUTHORIZED",
      revision: 1,
    };
    if (kind === "provider-unavailable") {
      return err({ code: "PROVIDER_UNAVAILABLE", detail: "FAULT DOUBLE: provider timeout on intent creation" });
    }
    if (kind === "customer-action") {
      return ok({
        ...base,
        status: "REQUIRES_CUSTOMER_ACTION",
        customerAction: { actionKind: "OTP", instruction: "FAULT DOUBLE: confirm in your banking app" },
      });
    }
    if (kind === "ambiguous-unknown") {
      const unknown = { ...base, status: "UNKNOWN" as const, providerNativeStatus: this.script.createIntent?.nativeStatus ?? "FAULT_DOUBLE_PROCESSING_UNCLEAR" };
      this.intentsByPaymentId.set(String(paymentId), unknown);
      return ok(unknown);
    }
    this.intentsByPaymentId.set(String(paymentId), base);
    return ok(base);
  }

  async capturePayment(paymentId: PaymentId): Promise<Result<PaymentIntent, PaymentBoundaryError>> {
    this.captureCalls.push(paymentId);
    return this.intentResultFor(paymentId, "capture", "CAPTURED");
  }

  async voidPayment(paymentId: PaymentId): Promise<Result<PaymentIntent, PaymentBoundaryError>> {
    this.voidCalls.push(paymentId);
    return this.intentResultFor(paymentId, "void", "VOIDED");
  }

  async refundPayment(paymentId: PaymentId, amount: Money): Promise<Result<PaymentIntent, PaymentBoundaryError>> {
    this.refundCalls.push({ paymentId, amount });
    const kind = this.pick("refund", this.script.refund);
    const existing = this.intentsByPaymentId.get(String(paymentId));
    const base: PaymentIntent = existing ?? {
      paymentId,
      reference: { kind: "ORDER", orderId: makeId<"OrderId">(`fault-order-${paymentId}`) },
      amount,
      status: "AUTHORIZED",
      revision: 1,
    };
    if (kind === "provider-unavailable") {
      return err({ code: "PROVIDER_UNAVAILABLE", detail: "FAULT DOUBLE: refund rail unavailable" });
    }
    if (kind === "ambiguous-unknown") {
      return ok({ ...base, status: "UNKNOWN", providerNativeStatus: "FAULT_DOUBLE_REFUND_UNCLEAR", revision: base.revision + 1 });
    }
    return ok({ ...base, status: "PARTIALLY_REFUNDED", revision: base.revision + 1 });
  }

  /** SettlementObservationBoundary (additive port extension). */
  async observeSettlement(paymentId: PaymentId): Promise<Result<SettlementObservation, PaymentBoundaryError>> {
    this.settlementCalls.push(paymentId);
    const settlements = this.script.settlements ?? {};
    const behavior = settlements[String(paymentId)] ?? settlements["*"] ?? "settled";
    if (behavior === "unknown") {
      return ok({ resolved: "UNKNOWN", reason: "FAULT DOUBLE: rail state unclear", providerNativeStatus: "FAULT_DOUBLE_SETTLEMENT_UNCLEAR" });
    }
    if (behavior === "not-settled") {
      return ok({ resolved: "OBSERVED", status: "NOT_SETTLED" });
    }
    return ok({ resolved: "OBSERVED", status: "SETTLED" });
  }

  private intentResultFor(
    paymentId: PaymentId,
    operation: "capture" | "void",
    status: PaymentIntent["status"],
  ): Result<PaymentIntent, PaymentBoundaryError> {
    const kind = this.pick(operation, this.script[operation]);
    const existing = this.intentsByPaymentId.get(String(paymentId));
    if (existing === undefined) {
      return err({ code: "PAYMENT_NOT_FOUND", detail: `FAULT DOUBLE: unknown payment ${paymentId}` });
    }
    if (kind === "provider-unavailable") {
      return err({ code: "PROVIDER_UNAVAILABLE", detail: `FAULT DOUBLE: ${operation} rail unavailable` });
    }
    if (kind === "ambiguous-unknown") {
      return ok({
        ...existing,
        status: "UNKNOWN",
        providerNativeStatus: `FAULT_DOUBLE_${operation.toUpperCase()}_UNCLEAR`,
        revision: existing.revision + 1,
      });
    }
    return ok({ ...existing, status, revision: existing.revision + 1 });
  }

  private pick(operation: "createIntent" | "capture" | "refund" | "void", script: PaymentOperationScript | undefined): PaymentFaultKind {
    if (script?.behaviors === undefined || script.behaviors.length === 0) return "ok";
    const index = Math.min(this.cursors[operation], script.behaviors.length - 1);
    this.cursors = { ...this.cursors, [operation]: this.cursors[operation] + 1 };
    return script.behaviors[index] as PaymentFaultKind;
  }
}
