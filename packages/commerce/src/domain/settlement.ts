/**
 * Settlement + capture facts on the payment plane (W1-004).
 *
 * Additive to the frozen W1-001 payment boundary: providers ADAPT to the
 * shapes here exactly as they adapt to PaymentBoundary. Two capabilities:
 * - amount-aware captures (partial capture support) via PartialCaptureBoundary;
 * - provider settlement observations with tri-state preservation via
 *   SettlementObservationBoundary.
 *
 * Truth laws enforced by this module:
 * - Money is integer minor units only (INVARIANT 14); captures/refunds are
 *   exact BigInt arithmetic against journaled facts, never floats.
 * - UNKNOWN is neither FAILED nor SUCCESS (INVARIANT 10): an UNKNOWN
 *   settlement observation resolves the settlement record to UNKNOWN and
 *   stays UNKNOWN through every fold. Only a LATER OBSERVED outcome (or a
 *   recourse-window close) can leave that state, and a window close NEVER
 *   converts to money-in. Money-in facts derive ONLY from OBSERVED SETTLED.
 * - Refund abuse guard: refund totals can never exceed captured totals
 *   (validateRefundAgainstCaptures — the kernel's authoritative refund bound).
 */
import type { CaptureId, PaymentId } from "./ids.js";
import type { Money } from "./money.js";
import type { PaymentBoundary, PaymentBoundaryError, PaymentIntent } from "./payments.js";
import { err, ok, type Result } from "./result.js";

// --- Capture facts (journaled per successful capture) ---

export type CaptureKind = "FULL" | "PARTIAL";

/** One immutable capture fact. Amounts are exact minor-unit strings. */
export interface PaymentCaptureRecord {
  readonly captureId: CaptureId;
  readonly paymentId: PaymentId;
  readonly amount: Money;
  readonly kind: CaptureKind;
  readonly revision: number;
}

/** Exact captured total for a payment (sum of capture facts; BigInt). */
export function capturedTotalOf(captures: readonly PaymentCaptureRecord[]): bigint {
  return captures.reduce((sum, capture) => sum + BigInt(capture.amount.amountMinor), 0n);
}

/**
 * Exact refunded total for a payment. CONSERVATIVE by design (refund-abuse
 * guard): refunds in PENDING or UNKNOWN state still count — an ambiguous
 * refund may have moved money, so the bound must hold for every interleaving.
 * Only FAILED refunds stop counting.
 */
export function refundedTotalOf(refunds: { readonly amount: Money; readonly state: string }[]): bigint {
  return refunds.reduce((sum, refund) => (refund.state === "FAILED" ? sum : sum + BigInt(refund.amount.amountMinor)), 0n);
}

/**
 * The kernel's authoritative refund validation: captured facts (not intent
 * status) bound every refund. Rejects zero/negative amounts, currency
 * mismatch and any refund that would push refundedTotal past capturedTotal.
 */
export function validateRefundAgainstCaptures(
  amount: Money,
  intentCurrency: Money["currency"],
  capturedTotal: bigint,
  refundedTotal: bigint,
): Result<true, { code: "INVALID_AMOUNT" | "CURRENCY_MISMATCH" | "EXCEEDS_CAPTURED"; detail: string }> {
  if (BigInt(amount.amountMinor) <= 0n) {
    return err({ code: "INVALID_AMOUNT", detail: `refund amount must be positive, got ${amount.amountMinor}` });
  }
  if (amount.currency !== intentCurrency) {
    return err({ code: "CURRENCY_MISMATCH", detail: `${amount.currency} vs ${intentCurrency}` });
  }
  if (capturedTotal <= 0n) {
    return err({ code: "EXCEEDS_CAPTURED", detail: `no captured funds to refund (captured ${capturedTotal})` });
  }
  if (refundedTotal + BigInt(amount.amountMinor) > capturedTotal) {
    return err({
      code: "EXCEEDS_CAPTURED",
      detail: `refund ${amount.amountMinor} on top of refunded ${refundedTotal} would exceed captured ${capturedTotal}`,
    });
  }
  return ok(true);
}

// --- Settlement tri-state ---

export type SettlementStatus = "PENDING" | "SETTLED" | "NOT_SETTLED" | "UNKNOWN" | "WINDOW_CLOSED";

/**
 * The settlement state law:
 * - PENDING (derived: captured, never observed) and UNKNOWN accept OBSERVED
 *   outcomes and the recourse-window close;
 * - an UNKNOWN observation leaves UNKNOWN exactly UNKNOWN (never FAILED,
 *   never money-in);
 * - SETTLED / NOT_SETTLED / WINDOW_CLOSED are terminal — a later observation
 *   or close is an INVALID transition rejected by the kernel (never silent).
 */
export type SettlementTrigger =
  | "OBSERVED_SETTLED"
  | "OBSERVED_NOT_SETTLED"
  | "OBSERVED_UNKNOWN"
  | "CLOSE_WINDOW";

export type SettlementTransitionError = {
  code: "INVALID_SETTLEMENT_TRANSITION";
  from: SettlementStatus;
  trigger: SettlementTrigger;
};

export function settlementTransition(
  state: SettlementStatus,
  trigger: SettlementTrigger,
): Result<SettlementStatus, SettlementTransitionError> {
  const table: Record<SettlementStatus, Partial<Record<SettlementTrigger, SettlementStatus>>> = {
    PENDING: { OBSERVED_SETTLED: "SETTLED", OBSERVED_NOT_SETTLED: "NOT_SETTLED", OBSERVED_UNKNOWN: "UNKNOWN", CLOSE_WINDOW: "WINDOW_CLOSED" },
    UNKNOWN: { OBSERVED_SETTLED: "SETTLED", OBSERVED_NOT_SETTLED: "NOT_SETTLED", OBSERVED_UNKNOWN: "UNKNOWN", CLOSE_WINDOW: "WINDOW_CLOSED" },
    SETTLED: {},
    NOT_SETTLED: {},
    WINDOW_CLOSED: {},
  };
  const next = table[state][trigger];
  if (next === undefined) return err({ code: "INVALID_SETTLEMENT_TRANSITION", from: state, trigger });
  return ok(next);
}

/**
 * The tri-state observation a provider rail reports. OBSERVED carries the
 * definitive outcome; UNKNOWN preserves the provider-native status verbatim
 * (INVARIANT 11) — it is DATA, never a failure.
 */
export type SettlementObservation =
  | { readonly resolved: "OBSERVED"; readonly status: "SETTLED" | "NOT_SETTLED"; readonly settledAmount?: Money }
  | { readonly resolved: "UNKNOWN"; readonly reason: string; readonly providerNativeStatus?: string };

/** The per-payment settlement fact folded from observations + window closes. */
export interface SettlementRecord {
  readonly paymentId: PaymentId;
  readonly status: SettlementStatus;
  /** The last OBSERVED settled amount (money-in evidence; SETTLED only). */
  readonly settledAmount?: Money;
  /** Provider-native status, preserved verbatim (UNKNOWN observations). */
  readonly providerNativeStatus?: string;
  readonly revision: number;
}

// --- Additive PORT extensions (providers adapt TO these) ---

/**
 * Amount-aware capture port. Injected boundaries MAY implement it; the
 * kernel probes support explicitly (isPartialCaptureBoundary) — there is no
 * silent fallback to full capture when an amount is requested.
 */
export interface PartialCaptureBoundary {
  capturePaymentAmount(paymentId: PaymentId, amount: Money): Promise<Result<PaymentIntent, PaymentBoundaryError>>;
}

/**
 * Settlement-observation port. The provider reports the tri-state outcome;
 * the kernel journals it verbatim. UNKNOWN outcomes are legitimate results.
 */
export interface SettlementObservationBoundary {
  observeSettlement(paymentId: PaymentId): Promise<Result<SettlementObservation, PaymentBoundaryError>>;
}

export function isPartialCaptureBoundary(port: PaymentBoundary): port is PaymentBoundary & PartialCaptureBoundary {
  return typeof (port as Partial<PartialCaptureBoundary>).capturePaymentAmount === "function";
}

export function isSettlementObservingBoundary(port: PaymentBoundary): port is PaymentBoundary & SettlementObservationBoundary {
  return typeof (port as Partial<SettlementObservationBoundary>).observeSettlement === "function";
}
