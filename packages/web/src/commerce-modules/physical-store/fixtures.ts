/**
 * physical-store deterministic DEMO fixtures (J16).
 *
 * Committed, synthetic, single-currency (USD). The corner-shop demo (Harbor
 * Lane Market) runs WITHOUT RFID by construction: every count path below is
 * barcode, manual, weigh-station or CSV. Opening stock, the seeded offline
 * queue item and supplier delivery-note quantities are fixtures; every
 * promotion to canonical stock happens through the deterministic kernel.
 */

import { makeId } from "@unicom/commerce";
import type { CountReconciliationPolicy, InventoryCountObservation } from "@unicom/commerce";
import { DEMO_MERCHANT_ACTOR } from "../merchant-shared/demo-runtime.js";

/** Fixture identity (shown on the surface; bumps when fixtures change). */
export const PHYSICAL_FIXTURES_ID = "w3-015-physical-fixtures@1";

/** The demo corner-shop location. */
export const MARKET_LOCATION = makeId<"LocationId">("loc-demo-market");

/** One sellable demo SKU (all no-RFID paths). */
export interface PhysicalSku {
  readonly skuId: string;
  readonly title: string;
  readonly pricingMode: "UNIT" | "MEASURED";
  readonly priceMinor: string;
  readonly unit?: "KG";
}

export const PHYSICAL_SKUS: readonly PhysicalSku[] = [
  { skuId: "sku-phys-bread", title: "Sourdough loaf (sliced)", pricingMode: "UNIT", priceMinor: "640" },
  { skuId: "sku-phys-coffee", title: "House blend coffee, 500g", pricingMode: "UNIT", priceMinor: "1150" },
  { skuId: "sku-phys-apples", title: "Apples, loose (weighed at POS)", pricingMode: "MEASURED", priceMinor: "455", unit: "KG" },
  { skuId: "sku-phys-oatmilk", title: "Oat milk, 1L", pricingMode: "UNIT", priceMinor: "289" },
];

/** Opening stock at the market (received through the kernel by the seed). */
export const OPENING_STOCK: readonly { readonly skuId: string; readonly units: number }[] = [
  { skuId: "sku-phys-bread", units: 30 },
  { skuId: "sku-phys-coffee", units: 18 },
  { skuId: "sku-phys-apples", units: 50 },
  { skuId: "sku-phys-oatmilk", units: 24 },
];

/** Supplier delivery-note quantities (the supplier-receipt truth — fixture). */
export const SUPPLIER_DELIVERY_NOTES: readonly { readonly skuId: string; readonly units: number }[] = [
  { skuId: "sku-phys-bread", units: 30 },
  { skuId: "sku-phys-coffee", units: 18 },
  { skuId: "sku-phys-apples", units: 50 },
  { skuId: "sku-phys-oatmilk", units: 24 },
];

/**
 * The demo count-reconciliation policy: counts within ±2 units promote;
 * anything beyond holds as a discrepancy.
 */
export const DEMO_COUNT_POLICY: CountReconciliationPolicy = {
  toleranceUnits: 2,
  promoteWithinTolerance: true,
};

/**
 * The seeded OFFLINE observation (captured while the scanner was offline):
 * sits in the local queue, NOT promoted, may be superseded. Built against the
 * seeded canonical level (bread 30 → counted 27; beyond ±2, so its replay
 * will hold as a discrepancy — deterministic).
 */
export function seededOfflineObservation(): InventoryCountObservation {
  return {
    observationId: makeId<"ObservationId">("obs-seeded-offline-bread"),
    kind: "BARCODE_COUNT",
    skuId: makeId<"SkuId">("sku-phys-bread"),
    locationId: MARKET_LOCATION,
    observedAt: "2026-10-05T08:40:00Z",
    source: { sourceType: "SCANNER", sourceRef: "scanner-demo-offline-1" },
    resolution: { resolved: "OBSERVED", value: 27 },
  };
}

/** The actor that performs store counting (demo store staff). */
export const STORE_STAFF_ACTOR = DEMO_MERCHANT_ACTOR;
