/**
 * Pricing contracts: price lists, promotions and coupons.
 *
 * Money is exact (integer minor units); percentage effects use integer
 * basis points and an explicit rounding mode — never floating point.
 */
import type { PromotionId, SkuId } from "./ids.js";
import { money, moneyEquals, percentageBpsOfMoney, type Money } from "./money.js";
import type { RoundingMode } from "./decimal.js";
import { err, ok, type Result } from "./result.js";

export type PriceLookupError =
  | { code: "NOT_FOUND"; skuId: SkuId }
  | { code: "CURRENCY_MISMATCH"; list: Money; entry: Money };

export interface PriceEntry {
  readonly skuId: SkuId;
  /**
   * UNIT pricing: price per unit.
   * MEASURED pricing: price per declared unit of measure (e.g. per KG).
   */
  readonly unitPrice: Money;
}

export interface PriceList {
  readonly entries: readonly PriceEntry[];
  /** All entries share this currency. */
  readonly currency: Money["currency"];
}

/** Deterministic lookup with currency-consistency guard. */
export function lookupPrice(list: PriceList, skuId: SkuId): Result<PriceEntry, PriceLookupError> {
  const entry = list.entries.find((item) => item.skuId === skuId);
  if (!entry) return err({ code: "NOT_FOUND", skuId });
  if (entry.unitPrice.currency !== list.currency) {
    return err({ code: "CURRENCY_MISMATCH", list: { currency: list.currency } as Money, entry: entry.unitPrice });
  }
  return ok(entry);
}

export type PromotionRule =
  | { readonly kind: "PERCENTAGE_OFF"; readonly basisPoints: number }
  | { readonly kind: "FIXED_AMOUNT_OFF"; readonly amount: Money };

export type PromotionStatus = "SCHEDULED" | "ACTIVE" | "PAUSED" | "ENDED";

export interface Promotion {
  readonly promotionId: PromotionId;
  readonly title: string;
  readonly rule: PromotionRule;
  readonly status: PromotionStatus;
  /** Restriction to SKUs; empty/undefined = catalog-wide. */
  readonly appliesToSkuIds?: readonly SkuId[];
  readonly stackable: boolean;
}

export type CouponStatus = "ACTIVE" | "REDEEMED" | "EXPIRED" | "DISABLED";

export interface Coupon {
  readonly code: string;
  readonly status: CouponStatus;
  readonly maxRedemptions: number;
  readonly redemptionCount: number;
}

export type PromotionApplicationError =
  | { code: "CURRENCY_MISMATCH"; amount: Money; rule: Money }
  | { code: "INACTIVE_PROMOTION"; status: PromotionStatus }
  | { code: "INVALID_BASIS_POINTS"; basisPoints: number };

export interface PromotionApplication {
  readonly gross: Money;
  readonly discount: Money;
  readonly net: Money;
}

/**
 * Deterministic promotion application to a line amount.
 * - PERCENTAGE_OFF: discount = round(gross × bps / 10000, mode).
 * - FIXED_AMOUNT_OFF: discount = min(amount, gross) — net never goes below zero.
 */
export function applyPromotionRule(
  amount: Money,
  rule: PromotionRule,
  mode: RoundingMode,
): Result<PromotionApplication, PromotionApplicationError> {
  let discount: Money;
  if (rule.kind === "PERCENTAGE_OFF") {
    if (!Number.isSafeInteger(rule.basisPoints) || rule.basisPoints < 0 || rule.basisPoints > 10_000) {
      return err({ code: "INVALID_BASIS_POINTS", basisPoints: rule.basisPoints });
    }
    discount = percentageBpsOfMoney(amount, rule.basisPoints, mode);
  } else {
    if (rule.amount.currency !== amount.currency) {
      return err({ code: "CURRENCY_MISMATCH", amount, rule: rule.amount });
    }
    // FIXED_AMOUNT_OFF clamps to the line amount — net never goes below zero.
    discount =
      BigInt(rule.amount.amountMinor) > BigInt(amount.amountMinor) ? amount : rule.amount;
  }
  const netMinor = BigInt(amount.amountMinor) - BigInt(discount.amountMinor);
  return ok({
    gross: amount,
    discount,
    net: money(netMinor.toString(), amount.currency),
  });
}

export type CouponRedemptionError =
  | { code: "COUPON_NOT_REDEEMABLE"; status: CouponStatus }
  | { code: "REDEMPTION_LIMIT_REACHED"; maxRedemptions: number };

/**
 * Single-use / bounded coupon redemption. Coupons are immutable facts:
 * redemption returns a NEW coupon value with redemptionCount+1.
 */
export function redeemCoupon(coupon: Coupon): Result<Coupon, CouponRedemptionError> {
  if (coupon.status !== "ACTIVE") return err({ code: "COUPON_NOT_REDEEMABLE", status: coupon.status });
  if (coupon.redemptionCount >= coupon.maxRedemptions) {
    return err({ code: "REDEMPTION_LIMIT_REACHED", maxRedemptions: coupon.maxRedemptions });
  }
  const nextCount = coupon.redemptionCount + 1;
  const exhausted = nextCount >= coupon.maxRedemptions;
  return ok({ ...coupon, redemptionCount: nextCount, status: exhausted ? "REDEEMED" : coupon.status });
}

export function isPromotionApplicableTo(promotion: Promotion, skuId: SkuId): boolean {
  if (promotion.status !== "ACTIVE") return false;
  if (!promotion.appliesToSkuIds || promotion.appliesToSkuIds.length === 0) return true;
  return promotion.appliesToSkuIds.includes(skuId);
}

export function priceEntryEquals(a: PriceEntry, b: PriceEntry): boolean {
  return a.skuId === b.skuId && moneyEquals(a.unitPrice, b.unitPrice);
}
