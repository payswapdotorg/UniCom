/**
 * W1-007 analytics projection: merchant analytics as journal-derived projections.
 *
 * THE PROJECTION LAW (W1-007 §scope 2, W3-006 DR law): analytics are disposable,
 * rebuildable projections folded from the immutable evidence journal — NEVER a
 * second source of truth. The same journal always produces the same projection
 * (deterministic fold). Rebuild-from-journal is verified by the round-trip test.
 *
 * Sales/orders/campaign-performance/inventory-turns are all derived from
 * journaled facts (ORDER_PLACED, PAYMENT_CAPTURE_RECORDED,
 * CAMPAIGN_EFFECT_APPLIED, INVENTORY_* events). No analytics-specific state is
 * ever written back to the kernel — the journal is the sole truth.
 */
import type { Money } from "../domain/money.js";
import { money } from "../domain/money.js";
import type { ProjectionDefinition } from "./engine.js";

/** Analytics read-model state — all derived from the journal. */
export interface AnalyticsReadModelState {
  readonly salesByCurrency: ReadonlyMap<string, string>; // currency → total minor units
  readonly orderCount: number;
  readonly ordersByState: ReadonlyMap<string, number>;
  readonly campaignEffectsTotal: number;
  readonly campaignDiscountByCurrency: ReadonlyMap<string, string>;
  readonly inventoryAdjustmentsTotal: number;
  readonly loyaltyAccrualsTotal: number;
  readonly loyaltyRedemptionsTotal: number;
}

export const ANALYTICS_PROJECTION_ID = "analytics/v1";

interface PayloadShape {
  readonly kind?: unknown;
  readonly snapshot?: unknown;
  readonly to?: unknown;
  readonly capture?: unknown;
  readonly effect?: unknown;
  readonly entry?: unknown;
  readonly resultingLevel?: unknown;
  readonly [key: string]: unknown;
}

function moneyOf(value: unknown): Money | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const obj = value as { currency?: unknown; amountMinor?: unknown };
  if (typeof obj.currency !== "string" || typeof obj.amountMinor !== "string") return undefined;
  return { currency: obj.currency as Money["currency"], amountMinor: obj.amountMinor as Money["amountMinor"] };
}

function addMinor(map: Map<string, string>, currency: string, delta: bigint): void {
  const current = BigInt(map.get(currency) ?? "0");
  map.set(currency, (current + delta).toString());
}

export const analyticsReadModel: ProjectionDefinition<AnalyticsReadModelState> = {
  projectionId: ANALYTICS_PROJECTION_ID,
  schemaVersion: 1,
  initialState: (): AnalyticsReadModelState => ({
    salesByCurrency: new Map<string, string>(),
    orderCount: 0,
    ordersByState: new Map<string, number>(),
    campaignEffectsTotal: 0,
    campaignDiscountByCurrency: new Map<string, string>(),
    inventoryAdjustmentsTotal: 0,
    loyaltyAccrualsTotal: 0,
    loyaltyRedemptionsTotal: 0,
  }),
  apply(state, event): AnalyticsReadModelState {
    const payload = event.payload as PayloadShape;
    const kind = typeof payload.kind === "string" ? payload.kind : "";
    // Sales: ORDER_PLACED contributes grandTotal to salesByCurrency.
    if (event.subject.subjectType === "ORDER" && kind === "ORDER_PLACED") {
      const snapshot = payload.snapshot as { totals?: { grandTotal?: unknown } } | undefined;
      const grandTotal = moneyOf(snapshot?.totals?.grandTotal);
      if (grandTotal) {
        const salesByCurrency = new Map(state.salesByCurrency);
        addMinor(salesByCurrency, grandTotal.currency, BigInt(grandTotal.amountMinor));
        return { ...state, salesByCurrency, orderCount: state.orderCount + 1 };
      }
    }
    // Order state distribution.
    if (event.subject.subjectType === "ORDER" && kind === "ORDER_STATE_CHANGED" && typeof payload.to === "string") {
      const ordersByState = new Map(state.ordersByState);
      ordersByState.set(payload.to, (ordersByState.get(payload.to) ?? 0) + 1);
      return { ...state, ordersByState };
    }
    // Campaign performance: each CAMPAIGN_EFFECT_APPLIED contributes the discount.
    if (event.subject.subjectType === "CAMPAIGN_EFFECT" && kind === "CAMPAIGN_EFFECT_APPLIED") {
      const effect = payload.effect as { discount?: unknown } | undefined;
      const discount = moneyOf(effect?.discount);
      const campaignDiscountByCurrency = new Map(state.campaignDiscountByCurrency);
      if (discount) addMinor(campaignDiscountByCurrency, discount.currency, BigInt(discount.amountMinor));
      return { ...state, campaignEffectsTotal: state.campaignEffectsTotal + 1, campaignDiscountByCurrency };
    }
    // Loyalty accruals/redemptions counts (advisory metric).
    if (event.subject.subjectType === "LOYALTY_LEDGER_ENTRY" && kind === "LOYALTY_ENTRY_RECORDED") {
      const entry = payload.entry as { kind?: string } | undefined;
      const entryKind = entry?.kind;
      if (entryKind === "ACCRUE") return { ...state, loyaltyAccrualsTotal: state.loyaltyAccrualsTotal + 1 };
      if (entryKind === "REDEEM" || entryKind === "EXPIRE") return { ...state, loyaltyRedemptionsTotal: state.loyaltyRedemptionsTotal + 1 };
    }
    // Inventory adjustments count (advisory metric).
    if (event.subject.subjectType === "INVENTORY_LEVEL" && kind === "INVENTORY_ADJUSTED") {
      return { ...state, inventoryAdjustmentsTotal: state.inventoryAdjustmentsTotal + 1 };
    }
    return state;
  },
};

/** Convenience: total sales for a currency (0 if no sales in that currency). */
export function salesTotalOf(state: AnalyticsReadModelState, currencyCode: string): Money {
  return money(state.salesByCurrency.get(currencyCode) ?? "0", currencyCode as Money["currency"]);
}

/** Convenience: total campaign discount for a currency. */
export function campaignDiscountOf(state: AnalyticsReadModelState, currencyCode: string): Money {
  return money(state.campaignDiscountByCurrency.get(currencyCode) ?? "0", currencyCode as Money["currency"]);
}
