/**
 * Contract tests — pricing: price lists, promotions, coupons.
 */
import { describe, expect, it } from "vitest";
import {
  applyPromotionRule,
  currency,
  lookupPrice,
  makeId,
  money,
  redeemCoupon,
  type Coupon,
  type PriceList,
} from "../contract.js";

const usd = currency("USD");
const eur = currency("EUR");
const skuA = makeId<"SkuId">("sku-a");
const skuB = makeId<"SkuId">("sku-b");

const list: PriceList = {
  currency: usd,
  entries: [
    { skuId: skuA, unitPrice: money("1999", usd) },
    { skuId: skuB, unitPrice: money("499", usd) },
  ],
};

describe("price lists", () => {
  it("looks up unit prices deterministically", () => {
    const found = lookupPrice(list, skuA);
    expect(found).toMatchObject({ ok: true, value: { unitPrice: { amountMinor: "1999" } } });
  });

  it("reports missing SKUs as a coded error", () => {
    expect(lookupPrice(list, makeId<"SkuId">("sku-z"))).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });
});

describe("promotion application (deterministic money)", () => {
  it("applies percentage discounts via basis points and declared rounding", () => {
    // 15% off 3998 minor = 599.7 → 600 (HALF_UP).
    const result = applyPromotionRule(money("3998", usd), { kind: "PERCENTAGE_OFF", basisPoints: 1500 }, "HALF_UP");
    expect(result).toMatchObject({
      ok: true,
      value: { gross: { amountMinor: "3998" }, discount: { amountMinor: "600" }, net: { amountMinor: "3398" } },
    });
  });

  it("applies fixed-amount discounts with a zero floor", () => {
    const result = applyPromotionRule(money("100", usd), { kind: "FIXED_AMOUNT_OFF", amount: money("250", usd) }, "HALF_UP");
    expect(result).toMatchObject({
      ok: true,
      value: { discount: { amountMinor: "100" }, net: { amountMinor: "0" } },
    });
  });

  it("rejects mixed-currency fixed discounts", () => {
    const result = applyPromotionRule(money("100", usd), { kind: "FIXED_AMOUNT_OFF", amount: money("100", eur) }, "HALF_UP");
    expect(result).toMatchObject({ ok: false, error: { code: "CURRENCY_MISMATCH" } });
  });

  it("rejects out-of-range basis points", () => {
    const result = applyPromotionRule(money("100", usd), { kind: "PERCENTAGE_OFF", basisPoints: 10_001 }, "HALF_UP");
    expect(result).toMatchObject({ ok: false, error: { code: "INVALID_BASIS_POINTS" } });
  });
});

describe("coupons (immutable redemption facts)", () => {
  const active: Coupon = { code: "SAVE5", status: "ACTIVE", maxRedemptions: 1, redemptionCount: 0 };

  it("redeems once and exhausts deterministically", () => {
    const first = redeemCoupon(active);
    expect(first).toMatchObject({ ok: true, value: { redemptionCount: 1, status: "REDEEMED" } });
    const second = redeemCoupon(first.ok ? first.value : active);
    expect(second).toMatchObject({ ok: false, error: { code: "COUPON_NOT_REDEEMABLE" } });
  });

  it("enforces the redemption limit across repeated redemptions", () => {
    const multi: Coupon = { code: "SAVE5", status: "ACTIVE", maxRedemptions: 2, redemptionCount: 0 };
    const first = redeemCoupon(multi);
    expect(first).toMatchObject({ ok: true, value: { redemptionCount: 1, status: "ACTIVE" } });
    const second = redeemCoupon(first.ok ? first.value : multi);
    expect(second).toMatchObject({ ok: true, value: { redemptionCount: 2, status: "REDEEMED" } });
    const exhausted = redeemCoupon(second.ok ? second.value : multi);
    expect(exhausted).toMatchObject({ ok: false, error: { code: "COUPON_NOT_REDEEMABLE" } });
    // A lagging imported value (count at limit, status not yet updated) is also rejected.
    const lagging: Coupon = { code: "SAVE5", status: "ACTIVE", maxRedemptions: 2, redemptionCount: 2 };
    expect(redeemCoupon(lagging)).toMatchObject({ ok: false, error: { code: "REDEMPTION_LIMIT_REACHED" } });
  });

  it("never mutates the original coupon (history is immutable)", () => {
    const before = { ...active };
    redeemCoupon(active);
    expect(active).toEqual(before);
  });

  it("rejects non-active coupons", () => {
    const expired: Coupon = { ...active, status: "EXPIRED" };
    expect(redeemCoupon(expired)).toMatchObject({ ok: false, error: { code: "COUPON_NOT_REDEEMABLE" } });
  });
});
