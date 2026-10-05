/**
 * Cart and the checkout BOUNDARY.
 *
 * Checkout is the handoff point to the payment boundary — it is NOT payment
 * processing. Cart math is exact: measured lines declare a rounding mode;
 * discounts and tax use integer basis points. A cart is single-currency.
 */
import type { CartId, CheckoutSessionId, ReservationId, SkuId } from "./ids.js";
import type { RoundingMode } from "./decimal.js";
import {
  addMoney,
  money,
  moneyEquals,
  multiplyMoneyByDecimal,
  multiplyMoneyByInteger,
  percentageBpsOfMoney,
  subtractMoney,
  sumMoney,
  type Money,
} from "./money.js";
import type { CountQuantity, MeasurementQuantity } from "./quantity.js";
import type { Promotion } from "./pricing.js";
import { applyPromotionRule, isPromotionApplicableTo } from "./pricing.js";
import type { OpportunityReference } from "./opportunity.js";
import { err, ok, type Result } from "./result.js";

export interface UnitCartLine {
  readonly kind: "UNIT_LINE";
  readonly lineId: string;
  readonly skuId: SkuId;
  readonly quantity: CountQuantity;
  readonly unitPrice: Money;
}

export interface MeasuredCartLine {
  readonly kind: "MEASURED_LINE";
  readonly lineId: string;
  readonly skuId: SkuId;
  readonly quantity: MeasurementQuantity;
  /** Price per declared unit of measure (e.g. per KG). */
  readonly unitPrice: Money;
  readonly rounding: RoundingMode;
}

export type CartLine = UnitCartLine | MeasuredCartLine;

export interface Cart {
  readonly cartId: CartId;
  readonly currency: Money["currency"];
  readonly lines: readonly CartLine[];
  readonly revision: number;
  readonly opportunityRef?: OpportunityReference;
}

export interface CartTotals {
  readonly subtotal: Money;
  readonly discountTotal: Money;
  readonly taxTotal: Money;
  readonly grandTotal: Money;
}

export type CartError =
  | { code: "MIXED_CURRENCY"; cartCurrency: Money["currency"]; lineCurrency: Money["currency"] }
  | { code: "EMPTY_CART" }
  | { code: "INVALID_TAX_RATE_BPS"; taxRateBps: number }
  | { code: "INVALID_PROMOTION"; detail: string };

/** Exact line subtotal: unit lines multiply integers, measured lines round once. */
export function lineSubtotal(line: CartLine): Money {
  if (line.kind === "UNIT_LINE") {
    return multiplyMoneyByInteger(line.unitPrice, line.quantity.units);
  }
  return multiplyMoneyByDecimal(line.unitPrice, line.quantity.magnitude, line.rounding);
}

export interface TotalsOptions {
  readonly rounding: RoundingMode;
  /** Tax in integer basis points of the discounted subtotal (0 = no tax). */
  readonly taxRateBps?: number;
  /** Applied in order; non-stackable promotions stop further promotion stacking. */
  readonly promotions?: readonly Promotion[];
}

/**
 * Deterministic cart totals. Order of operations is FIXED:
 * subtotal → discounts (sequential) → tax on (subtotal − discount) → grand total.
 */
export function computeCartTotals(cart: Cart, options: TotalsOptions): Result<CartTotals, CartError> {
  if (cart.lines.length === 0) return err({ code: "EMPTY_CART" });
  for (const line of cart.lines) {
    if (line.unitPrice.currency !== cart.currency) {
      return err({ code: "MIXED_CURRENCY", cartCurrency: cart.currency, lineCurrency: line.unitPrice.currency });
    }
  }
  const subtotals = cart.lines.map((line) => lineSubtotal(line));
  const subtotal = sumMoney(subtotals);
  if (!subtotal.ok) return err({ code: "MIXED_CURRENCY", cartCurrency: cart.currency, lineCurrency: subtotals[0]!.currency });

  let discountTotal = zeroOf(subtotal.value);
  let stackingStopped = false;
  for (const promotion of options.promotions ?? []) {
    const applicable = cart.lines.some((line) => isPromotionApplicableTo(promotion, line.skuId));
    if (!applicable) continue;
    if (stackingStopped && !promotion.stackable) continue;
    const base = subtractMoney(subtotal.value, discountTotal);
    if (!base.ok) return err({ code: "INVALID_PROMOTION", detail: base.error.code });
    const application = applyPromotionRule(base.value, promotion.rule, options.rounding);
    if (!application.ok) return err({ code: "INVALID_PROMOTION", detail: application.error.code });
    const added = addMoney(discountTotal, application.value.discount);
    if (!added.ok) return err({ code: "INVALID_PROMOTION", detail: added.error.code });
    discountTotal = added.value;
    if (!promotion.stackable) stackingStopped = true;
  }
  const taxRateBps = options.taxRateBps ?? 0;
  if (!Number.isSafeInteger(taxRateBps) || taxRateBps < 0) {
    return err({ code: "INVALID_TAX_RATE_BPS", taxRateBps });
  }
  const discounted = subtractMoney(subtotal.value, discountTotal);
  if (!discounted.ok) return err({ code: "INVALID_PROMOTION", detail: discounted.error.code });
  const taxTotal = percentageBpsOfMoney(discounted.value, taxRateBps, options.rounding);
  const grandTotal = addMoney(discounted.value, taxTotal);
  if (!grandTotal.ok) return err({ code: "INVALID_PROMOTION", detail: grandTotal.error.code });
  return ok({ subtotal: subtotal.value, discountTotal, taxTotal, grandTotal: grandTotal.value });
}

function zeroOf(reference: Money): Money {
  return money("0", reference.currency);
}

// --- Checkout boundary (handoff to payment, NOT payment processing) ---

export type CheckoutSessionState = "OPEN" | "PAYMENT_PENDING" | "COMPLETED" | "ABANDONED" | "EXPIRED";

export type CheckoutTrigger =
  | "START_PAYMENT"
  | "COMPLETE"
  | "ABANDON"
  | "EXPIRE";

export interface CheckoutSession {
  readonly checkoutSessionId: CheckoutSessionId;
  readonly cartId: CartId;
  readonly state: CheckoutSessionState;
  readonly revision: number;
  readonly inventoryReservations?: readonly ReservationId[];
  readonly opportunityRef?: OpportunityReference;
}

export type CheckoutTransitionError = {
  code: "INVALID_CHECKOUT_TRANSITION";
  from: CheckoutSessionState;
  trigger: CheckoutTrigger;
};

export function checkoutTransition(
  state: CheckoutSessionState,
  trigger: CheckoutTrigger,
): Result<CheckoutSessionState, CheckoutTransitionError> {
  const table: Record<CheckoutSessionState, Partial<Record<CheckoutTrigger, CheckoutSessionState>>> = {
    OPEN: { START_PAYMENT: "PAYMENT_PENDING", ABANDON: "ABANDONED", EXPIRE: "EXPIRED" },
    PAYMENT_PENDING: { COMPLETE: "COMPLETED", ABANDON: "ABANDONED", EXPIRE: "EXPIRED" },
    COMPLETED: {},
    ABANDONED: {},
    EXPIRED: {},
  };
  const next = table[state][trigger];
  if (next === undefined) return err({ code: "INVALID_CHECKOUT_TRANSITION", from: state, trigger });
  return ok(next);
}

export function cartLineSkuId(line: CartLine): SkuId {
  return line.skuId;
}

export function cartTotalsEquals(a: CartTotals, b: CartTotals): boolean {
  return (
    moneyEquals(a.subtotal, b.subtotal) &&
    moneyEquals(a.discountTotal, b.discountTotal) &&
    moneyEquals(a.taxTotal, b.taxTotal) &&
    moneyEquals(a.grandTotal, b.grandTotal)
  );
}
