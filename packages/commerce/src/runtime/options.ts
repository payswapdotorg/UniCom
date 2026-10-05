/**
 * Commerce kernel construction options (W1-002 runtime).
 *
 * The kernel is DETERMINISTIC: every nondeterminism source is an explicit
 * injected input. The default time source is a fixed epoch — identical
 * command sequences produce identical journals. Production hosts inject a
 * real clock; the kernel never reads ambient time, randomness or IO.
 *
 * The payment boundary is a typed PORT (domain/payments.ts): providers
 * ADAPT to it. The kernel performs no provider implementation and ships
 * none; a port must be injected for payment commands to execute.
 */
import { DEFAULT_OVER_RECEIPT_TOLERANCE_BPS } from "../domain/purchasing.js";
import type { MinimumOrderPolicy } from "../domain/b2b.js";
import type { Promotion } from "../domain/pricing.js";
import type { PaymentBoundary } from "../domain/payments.js";
import type { RoundingMode } from "../domain/decimal.js";

/** Default deterministic epoch (tests and offline folds). */
export const DETERMINISTIC_EPOCH = "2026-01-01T00:00:00Z";

export interface CommerceKernelOptions {
  /**
   * Time source for event timestamps. Default: the fixed deterministic
   * epoch (identical sequences → identical journals).
   */
  readonly timeSource?: () => string;
  /** The typed payment boundary port. No default: providers are injected. */
  readonly paymentBoundary?: PaymentBoundary;
  /** Rounding for measured cart lines and totals (default HALF_UP). */
  readonly defaultRounding?: RoundingMode;
  /** Tax in integer basis points of the discounted subtotal (default 0). */
  readonly taxRateBps?: number;
  /** Catalog promotions applied in order at order placement (default none). */
  readonly promotions?: readonly Promotion[];
  /** B2B minimum-order gate enforced at PLACE_ORDER (optional). */
  readonly minimumOrderPolicy?: MinimumOrderPolicy;
  /** Supplier over-receipt tolerance in bps (default 500 = 5%). */
  readonly overReceiptToleranceBps?: number;
}

/** Fully resolved options (every default materialized). */
export interface ResolvedKernelOptions {
  readonly timeSource: () => string;
  readonly paymentBoundary: PaymentBoundary | undefined;
  readonly defaultRounding: RoundingMode;
  readonly taxRateBps: number;
  readonly promotions: readonly Promotion[];
  readonly minimumOrderPolicy: MinimumOrderPolicy | undefined;
  readonly overReceiptToleranceBps: number;
}

export function resolveKernelOptions(options: CommerceKernelOptions = {}): ResolvedKernelOptions {
  return {
    timeSource: options.timeSource ?? (() => DETERMINISTIC_EPOCH),
    paymentBoundary: options.paymentBoundary,
    defaultRounding: options.defaultRounding ?? "HALF_UP",
    taxRateBps: options.taxRateBps ?? 0,
    promotions: options.promotions ?? [],
    minimumOrderPolicy: options.minimumOrderPolicy,
    overReceiptToleranceBps:
      options.overReceiptToleranceBps ?? DEFAULT_OVER_RECEIPT_TOLERANCE_BPS,
  };
}
