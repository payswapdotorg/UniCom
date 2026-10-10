/**
 * W3-015 lane-internal demo runtime harness.
 *
 * NOT a discoverable commerce module: this directory deliberately carries no
 * `module.ts`, so the W1-011 registry glob (star-slash-module.{ts,tsx})
 * never sees it. It exists so the W3-015 feature modules (merchant-*,
 * procurement-*, physical-*, trust-*) share ONE thin, honest way to drive
 * the deterministic commerce kernel through its PUBLIC entrypoint
 * (`@unicom/commerce`):
 *
 * - every mutation the screens offer travels as a TYPED command envelope
 *   (`commandEnvelope` + `CommerceKernel.execute`) — the UI never mutates
 *   canonical truth directly;
 * - the payment rail is a DEMO port adapter (deterministic, in-memory,
 *   scripted ambiguity for UNKNOWN outcomes) — it is NOT the W1 test double
 *   (which must never ship outside packages/commerce/src/test) and NOT a
 *   provider; no live payment is ever attempted;
 * - time is a stepped deterministic clock (fixed epoch + one minute per
 *   step), so identical fixture scripts produce identical journals;
 * - duplicate submission, policy denial and authority denial surface as the
 *   kernel's own `DUPLICATE` / `REJECTED` outcomes — preserved, never
 *   collapsed into errors (J18 law).
 */

import {
  CommerceKernel,
  commandEnvelope,
  currency,
  currencyMinorDigits,
  makeId,
  money,
  resolveAmbiguousPayment,
  validatePaymentIntentRequest,
} from "@unicom/commerce";
import type {
  AnyRuntimeCommand,
  CommandExecution,
  CommerceKernelOptions,
  Money,
  PartialCaptureBoundary,
  PaymentBoundary,
  PaymentBoundaryError,
  PaymentIntent,
  PaymentIntentRequest,
  PrincipalRef,
  Result,
  RuntimeCommandPayload,
  SettlementObservation,
  SettlementObservationBoundary,
} from "@unicom/commerce";

/** The fixed demo epoch every W3-015 fixture script starts from. */
export const DEMO_EPOCH = "2026-10-05T09:00:00Z";

/** Deterministic stepped clock: every tick advances one minute. */
export class SteppedClock {
  private minutes = 0;

  tick(): string {
    this.minutes += 1;
    return this.at();
  }

  at(): string {
    return new Date(Date.parse(DEMO_EPOCH) + this.minutes * 60_000).toISOString();
  }
}

function boundaryError(code: PaymentBoundaryError["code"], detail: string): PaymentBoundaryError {
  return { code, detail };
}

const CAPTURABLE = new Set(["AUTHORIZED", "PARTIALLY_CAPTURED", "REQUIRES_CUSTOMER_ACTION", "UNKNOWN"]);
const REFUNDABLE = new Set(["CAPTURED", "PARTIALLY_CAPTURED", "PARTIALLY_REFUNDED"]);

interface DemoIntent extends PaymentIntent {
  capturedMinor: bigint;
  refundedMinor: bigint;
}

/**
 * DEMO payment rail — a deterministic in-memory adapter over the typed
 * PaymentBoundary PORT. Scriptable for the J18 states the screens must show
 * honestly (ambiguous authorization → UNKNOWN; settlement tri-state). Never
 * a provider, never live, never a copy of the W1 test double.
 */
export class DemoPaymentBoundary
  implements PaymentBoundary, PartialCaptureBoundary, SettlementObservationBoundary
{
  private readonly intents = new Map<string, DemoIntent>();
  private counter = 0;
  private ambiguousNext = false;
  private ambiguousNativeStatus = "PROCESSING_STATE_UNCLEAR";
  private readonly settlementOutcomes = new Map<string, SettlementObservation>();

  /** Script the NEXT authorization as ambiguous → resolves UNKNOWN (J18). */
  makeNextOutcomeAmbiguous(nativeStatus = "PROCESSING_STATE_UNCLEAR"): void {
    this.ambiguousNext = true;
    this.ambiguousNativeStatus = nativeStatus;
  }

  /** Script a payment's settlement observation (SETTLED / NOT_SETTLED / UNKNOWN). */
  scriptSettlementOutcome(paymentId: string, outcome: SettlementObservation): void {
    this.settlementOutcomes.set(paymentId, outcome);
  }

  async createPaymentIntent(
    request: PaymentIntentRequest,
  ): Promise<Result<PaymentIntent, PaymentBoundaryError>> {
    const validation = validatePaymentIntentRequest(request);
    if (!validation.ok) return validation;
    this.counter += 1;
    const paymentId = makeId<"PaymentId">(`pay-demo-${this.counter}`);
    const intent: PaymentIntent = {
      paymentId,
      reference: request.reference,
      amount: request.amount,
      status: "AUTHORIZED",
      revision: 1,
    };
    const stored: DemoIntent = { ...intent, capturedMinor: 0n, refundedMinor: 0n };
    this.intents.set(paymentId, this.ambiguate(stored));
    return { ok: true, value: this.present(paymentId) };
  }

  async capturePayment(paymentId: PaymentIntent["paymentId"]): Promise<Result<PaymentIntent, PaymentBoundaryError>> {
    const existing = this.intents.get(paymentId);
    if (!existing) return { ok: false, error: boundaryError("PAYMENT_NOT_FOUND", `unknown payment ${paymentId}`) };
    if (!CAPTURABLE.has(existing.status)) {
      return {
        ok: false,
        error: boundaryError("AMBIGUOUS_PROVIDER_RESPONSE", `cannot capture from ${existing.status}`),
      };
    }
    const captured: DemoIntent = {
      ...existing,
      status: "CAPTURED",
      capturedMinor: BigInt(existing.amount.amountMinor),
      revision: existing.revision + 1,
    };
    this.intents.set(paymentId, this.ambiguate(captured));
    return { ok: true, value: this.present(paymentId) };
  }

  async capturePaymentAmount(
    paymentId: PaymentIntent["paymentId"],
    amount: PaymentIntent["amount"],
  ): Promise<Result<PaymentIntent, PaymentBoundaryError>> {
    const existing = this.intents.get(paymentId);
    if (!existing) return { ok: false, error: boundaryError("PAYMENT_NOT_FOUND", `unknown payment ${paymentId}`) };
    if (!CAPTURABLE.has(existing.status)) {
      return {
        ok: false,
        error: boundaryError("AMBIGUOUS_PROVIDER_RESPONSE", `cannot capture from ${existing.status}`),
      };
    }
    if (amount.currency !== existing.amount.currency) {
      return { ok: false, error: boundaryError("CURRENCY_MISMATCH", `${amount.currency} vs ${existing.amount.currency}`) };
    }
    const total = BigInt(existing.amount.amountMinor);
    const requested = BigInt(amount.amountMinor);
    if (requested <= 0n || existing.capturedMinor + requested > total) {
      return {
        ok: false,
        error: boundaryError(
          "INVALID_AMOUNT",
          `capture ${amount.amountMinor} out of bounds: captured ${existing.capturedMinor} of ${total}`,
        ),
      };
    }
    const capturedMinor = existing.capturedMinor + requested;
    const captured: DemoIntent = {
      ...existing,
      status: capturedMinor === total ? "CAPTURED" : "PARTIALLY_CAPTURED",
      capturedMinor,
      revision: existing.revision + 1,
    };
    this.intents.set(paymentId, this.ambiguate(captured));
    return { ok: true, value: this.present(paymentId) };
  }

  async voidPayment(paymentId: PaymentIntent["paymentId"]): Promise<Result<PaymentIntent, PaymentBoundaryError>> {
    const existing = this.intents.get(paymentId);
    if (!existing) return { ok: false, error: boundaryError("PAYMENT_NOT_FOUND", `unknown payment ${paymentId}`) };
    if (existing.status !== "AUTHORIZED") {
      return {
        ok: false,
        error: boundaryError("AMBIGUOUS_PROVIDER_RESPONSE", `cannot void from ${existing.status}`),
      };
    }
    const voided: DemoIntent = { ...existing, status: "VOIDED", revision: existing.revision + 1 };
    this.intents.set(paymentId, this.ambiguate(voided));
    return { ok: true, value: this.present(paymentId) };
  }

  async refundPayment(
    paymentId: PaymentIntent["paymentId"],
    amount: PaymentIntent["amount"],
  ): Promise<Result<PaymentIntent, PaymentBoundaryError>> {
    const existing = this.intents.get(paymentId);
    if (!existing) return { ok: false, error: boundaryError("PAYMENT_NOT_FOUND", `unknown payment ${paymentId}`) };
    if (!REFUNDABLE.has(existing.status)) {
      return {
        ok: false,
        error: boundaryError("PAYMENT_NOT_FOUND", `refund requires a captured intent, got ${existing.status}`),
      };
    }
    if (amount.currency !== existing.amount.currency) {
      return { ok: false, error: boundaryError("CURRENCY_MISMATCH", `${amount.currency} vs ${existing.amount.currency}`) };
    }
    // Refunds are bounded by what was actually CAPTURED (exact bookkeeping,
    // same law as the port contract: never above, never negative).
    if (BigInt(amount.amountMinor) <= 0n || existing.refundedMinor + BigInt(amount.amountMinor) > existing.capturedMinor) {
      return {
        ok: false,
        error: boundaryError(
          "INVALID_AMOUNT",
          `refund ${amount.amountMinor} out of bounds: captured ${existing.capturedMinor}, already refunded ${existing.refundedMinor}`,
        ),
      };
    }
    const refundedMinor = existing.refundedMinor + BigInt(amount.amountMinor);
    const refunded: DemoIntent = {
      ...existing,
      status: refundedMinor >= existing.capturedMinor ? "REFUNDED" : "PARTIALLY_REFUNDED",
      refundedMinor,
      revision: existing.revision + 1,
    };
    this.intents.set(paymentId, this.ambiguate(refunded));
    return { ok: true, value: this.present(paymentId) };
  }

  async observeSettlement(
    paymentId: PaymentIntent["paymentId"],
  ): Promise<Result<SettlementObservation, PaymentBoundaryError>> {
    const existing = this.intents.get(paymentId);
    if (!existing) return { ok: false, error: boundaryError("PAYMENT_NOT_FOUND", `unknown payment ${paymentId}`) };
    const scripted = this.settlementOutcomes.get(paymentId);
    if (scripted) return { ok: true, value: scripted };
    // Unscripted observations are honestly UNKNOWN — never SETTLED, never FAILED.
    return {
      ok: true,
      value: { resolved: "UNKNOWN", reason: "SETTLEMENT_UNOBSERVED", providerNativeStatus: "SETTLEMENT_PENDING" },
    };
  }

  private ambiguate(intent: DemoIntent): DemoIntent {
    if (!this.ambiguousNext) return intent;
    this.ambiguousNext = false;
    const resolved = resolveAmbiguousPayment(intent, this.ambiguousNativeStatus);
    return { ...resolved, capturedMinor: intent.capturedMinor, refundedMinor: intent.refundedMinor };
  }

  private present(paymentId: string): PaymentIntent {
    const { capturedMinor: _c, refundedMinor: _r, ...intent } = this.intents.get(paymentId) as DemoIntent;
    return intent;
  }
}

/** Read-only typed view over the kernel's authoritative state. */
export type KernelView = ReturnType<CommerceKernel["view"]>;

/** The typed actors of the W3-015 demo fixtures (evidence names them). */
export const DEMO_MERCHANT_ACTOR: Extract<PrincipalRef, { readonly kind: "MERCHANT" }> = {
  kind: "MERCHANT",
  merchantId: makeId<"MerchantId">("demo-merchant-harbor-lane"),
};
export const DEMO_CUSTOMER_ACTOR: Extract<PrincipalRef, { readonly kind: "CUSTOMER" }> = {
  kind: "CUSTOMER",
  customerId: makeId<"CustomerId">("demo-customer-114"),
};
export const DEMO_SYSTEM_ACTOR: Extract<PrincipalRef, { readonly kind: "SYSTEM" }> = {
  kind: "SYSTEM",
  systemPrincipalId: makeId<"SystemPrincipalId">("demo-system-ops"),
};

/** The store principal of the J13 autonomous-store fixtures. */
export function autonomousStoreActor(storeId: string): PrincipalRef {
  return { kind: "AUTONOMOUS_STORE", autonomousStoreId: makeId<"AutonomousStoreId">(storeId) };
}

/** How a module seeds and then drives its demo kernel. */
export class DemoCommerceRuntime {
  readonly kernel: CommerceKernel;
  readonly payments: DemoPaymentBoundary;
  private readonly clock = new SteppedClock();
  private counter = 0;

  constructor(options: CommerceKernelOptions = {}) {
    this.payments = new DemoPaymentBoundary();
    this.kernel = new CommerceKernel({
      ...options,
      paymentBoundary: this.payments,
      timeSource: () => this.clock.tick(),
    });
  }

  /** Deterministic timestamp for fixture data minted outside the kernel. */
  get now(): string {
    return this.clock.at();
  }

  nextId(prefix: string): string {
    this.counter += 1;
    return `${prefix}-${this.counter}`;
  }

  /**
   * Hand one typed command envelope to the kernel. Explicit `commandId` +
   * `idempotencyKey` support the duplicate-submission cases (exact replay →
   * the kernel answers DUPLICATE with the original receipt).
   */
  async run(
    actor: PrincipalRef,
    payload: RuntimeCommandPayload,
    opts: { readonly commandId?: string; readonly idempotencyKey?: string } = {},
  ): Promise<CommandExecution> {
    const commandId = makeId<"CommandId">(opts.commandId ?? this.nextId("cmd"));
    const idempotencyKey = makeId<"IdempotencyKey">(opts.idempotencyKey ?? this.nextId("idem"));
    const envelope: AnyRuntimeCommand = commandEnvelope(
      commandId,
      idempotencyKey,
      actor,
      this.clock.tick(),
      payload,
    );
    return this.kernel.execute(envelope);
  }

  view(): KernelView {
    return this.kernel.view();
  }

  events() {
    return this.kernel.events();
  }

  receipts() {
    return this.kernel.receipts();
  }
}

/** The one currency every W3-015 demo fixture uses (single-currency law). */
export const DEMO_CURRENCY = currency("USD");

/** Demo money helper (minor units → Money). */
export function demoMoney(amountMinor: string): Money {
  return money(amountMinor, DEMO_CURRENCY);
}

/** Honest money display: exact minor units → decimal with the right digits. */
export function fmtMoney(value: Money): string {
  const digits = currencyMinorDigits(value.currency);
  const minor = BigInt(value.amountMinor);
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const base = abs.toString().padStart(digits + 1, "0");
  const text =
    digits === 0
      ? base
      : `${base.slice(0, base.length - digits)}.${base.slice(base.length - digits)}`;
  return `${negative ? "-" : ""}${value.currency} ${text}`;
}
