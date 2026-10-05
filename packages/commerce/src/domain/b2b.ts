/**
 * B2B commerce contracts: company accounts, negotiated price lists, payment
 * terms and minimum-order policy. Company accounts are customer-side
 * principals; supplier-side purchase orders live in purchasing.ts.
 */
import type { CompanyAccountId, SkuId } from "./ids.js";
import { err, ok, type Result } from "./result.js";
import type { Money } from "./money.js";

export type PaymentTerms = "PREPAID" | "NET_15" | "NET_30" | "NET_60" | "NET_90";

export interface CompanyAccount {
  readonly companyAccountId: CompanyAccountId;
  readonly name: string;
  readonly paymentTerms: PaymentTerms;
  readonly creditLimit?: Money;
}

export interface B2BPriceListEntry {
  readonly skuId: SkuId;
  readonly negotiatedPrice: Money;
  /** Minimum quantity for the negotiated price to apply. */
  readonly minQuantity: number;
}

export interface B2BPriceList {
  readonly priceListId: string;
  readonly companyAccountId: CompanyAccountId;
  readonly currency: Money["currency"];
  readonly entries: readonly B2BPriceListEntry[];
}

export type B2BPriceError =
  | { code: "ENTRY_NOT_FOUND"; skuId: SkuId }
  | { code: "QUANTITY_BELOW_MINIMUM"; skuId: SkuId; minQuantity: number; requested: number }
  | { code: "CURRENCY_MISMATCH"; list: Money["currency"]; entry: Money["currency"] };

/**
 * Deterministic negotiated-price resolution: entry applies only when the
 * requested quantity meets its minimum.
 */
export function negotiatedPrice(
  list: B2BPriceList,
  skuId: SkuId,
  quantity: number,
): Result<Money, B2BPriceError> {
  const entry = list.entries.find((item) => item.skuId === skuId);
  if (!entry) return err({ code: "ENTRY_NOT_FOUND", skuId });
  if (entry.negotiatedPrice.currency !== list.currency) {
    return err({ code: "CURRENCY_MISMATCH", list: list.currency, entry: entry.negotiatedPrice.currency });
  }
  if (quantity < entry.minQuantity) {
    return err({ code: "QUANTITY_BELOW_MINIMUM", skuId, minQuantity: entry.minQuantity, requested: quantity });
  }
  return ok(entry.negotiatedPrice);
}

export interface MinimumOrderPolicy {
  readonly minimumOrderValue: Money;
}

export type MinimumOrderError =
  | { code: "BELOW_MINIMUM_ORDER"; minimum: Money; actual: Money }
  | { code: "CURRENCY_MISMATCH"; minimum: Money; actual: Money };

/** Deterministic minimum-order gate. */
export function enforceMinimumOrder(
  policy: MinimumOrderPolicy,
  orderValue: Money,
): Result<Money, MinimumOrderError> {
  if (orderValue.currency !== policy.minimumOrderValue.currency) {
    return err({ code: "CURRENCY_MISMATCH", minimum: policy.minimumOrderValue, actual: orderValue });
  }
  if (BigInt(orderValue.amountMinor) < BigInt(policy.minimumOrderValue.amountMinor)) {
    return err({ code: "BELOW_MINIMUM_ORDER", minimum: policy.minimumOrderValue, actual: orderValue });
  }
  return ok(orderValue);
}
