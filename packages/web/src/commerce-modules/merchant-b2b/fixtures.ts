/**
 * merchant-b2b deterministic DEMO fixtures (J12).
 *
 * Committed, synthetic, single-currency (USD). The opening stock, the
 * warehouse→storefront transfer and every transfer action are driven through
 * the REAL kernel by the component. The channels, wholesale price breaks,
 * B2B quote queue and net-terms invoices are committed FIXTURES (no kernel
 * aggregate exists for them) — DEMO-labelled on the surface, never presented
 * as kernel truth.
 */

import { makeId } from "@unicom/commerce";
import type { StockTransfer } from "@unicom/commerce";

/** Fixture identity (shown on the surface; bumps when fixtures change). */
export const B2B_FIXTURES_ID = "w3-015-b2b-fixtures@1";

/** The two demo locations (multi-location kernel truth). */
export const WAREHOUSE_LOCATION = makeId<"LocationId">("loc-demo-b2b-warehouse");
export const STOREFRONT_LOCATION = makeId<"LocationId">("loc-demo-b2b-storefront");

/** The two demo SKUs. */
export const B2B_SKUS = [
  { skuId: "sku-b2b-syrup", title: "Cold-brew concentrate, 750ml", priceMinor: "650" },
  { skuId: "sku-b2b-greens", title: "Salad greens, case", priceMinor: "590" },
] as const;

/** Opening warehouse stock (received through the kernel by the seed). */
export const OPENING_STOCK: readonly { readonly skuId: string; readonly units: number }[] = [
  { skuId: "sku-b2b-syrup", units: 40 },
  { skuId: "sku-b2b-greens", units: 30 },
];

/** The seeded transfer: 12 syrup concentrates requested warehouse → storefront. */
export const SEEDED_TRANSFER: StockTransfer = {
  transferId: makeId<"TransferId">("trf-demo-b2b-1"),
  fromLocationId: WAREHOUSE_LOCATION,
  toLocationId: STOREFRONT_LOCATION,
  lines: [{ skuId: makeId<"SkuId">("sku-b2b-syrup"), units: 12 }],
  state: "REQUESTED",
  revision: 1,
};

/** One sales channel (fixture — no kernel channel aggregate). */
export interface ChannelFixture {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

export const CHANNELS: readonly ChannelFixture[] = [
  {
    id: "channel-retail",
    name: "Retail storefront",
    description: "The Harbor Lane storefront (J10) — unit prices, walk-in and online orders.",
  },
  {
    id: "channel-wholesale",
    name: "Wholesale portal",
    description: "Logged-in B2B accounts ordering by the case at wholesale price breaks.",
  },
  {
    id: "channel-field-sales",
    name: "Field sales",
    description: "Route salespeople taking orders on site (offline-capable, J16 flows).",
  },
];

/** Wholesale price breaks per SKU (fixture — the price book is per-channel demo data). */
export interface PriceBreakFixture {
  readonly skuId: string;
  readonly tier: string;
  readonly unitPriceMinor: string;
}

export const PRICE_BREAKS: readonly PriceBreakFixture[] = [
  { skuId: "sku-b2b-syrup", tier: "retail unit", unitPriceMinor: "650" },
  { skuId: "sku-b2b-syrup", tier: "wholesale 5+ units", unitPriceMinor: "520" },
  { skuId: "sku-b2b-syrup", tier: "case of 24", unitPriceMinor: "480" },
  { skuId: "sku-b2b-greens", tier: "retail unit", unitPriceMinor: "590" },
  { skuId: "sku-b2b-greens", tier: "wholesale 10+ cases", unitPriceMinor: "470" },
];

/** One B2B quote request (fixture + LOCAL demo review state). */
export interface B2bQuoteFixture {
  readonly quoteId: string;
  readonly account: string;
  readonly skuId: string;
  readonly units: number;
  readonly note: string;
  /** The LOCAL demo review state (never kernel truth; resettable). */
  readonly status: "PENDING" | "OFFERED" | "DECLINED";
}

export const B2B_QUOTES: readonly B2bQuoteFixture[] = [
  {
    quoteId: "quote-b2b-1",
    account: "Café Luna",
    skuId: "sku-b2b-syrup",
    units: 24,
    note: "Weekly cold-brew service — asks for the case-of-24 break on a standing order.",
    status: "PENDING",
  },
  {
    quoteId: "quote-b2b-2",
    account: "Green Grocer Co-op",
    skuId: "sku-b2b-greens",
    units: 10,
    note: "Opening order pending the co-op board's sign-off.",
    status: "OFFERED",
  },
];

/** One net-terms invoice (fixture — AR is demo data; collection is unavailable). */
export interface NetTermsInvoiceFixture {
  readonly invoiceId: string;
  readonly account: string;
  readonly amountMinor: string;
  readonly terms: string;
  readonly status: "PENDING" | "OVERDUE";
  readonly detail: string;
}

export const NET_TERMS_INVOICES: readonly NetTermsInvoiceFixture[] = [
  {
    invoiceId: "inv-b2b-1",
    account: "Café Luna",
    amountMinor: "31200",
    terms: "net 30",
    status: "OVERDUE",
    detail: "Issued 2026-09-05, due 2026-10-05 — 12 days past due at the demo date. Fixture fact, not a live AR feed.",
  },
  {
    invoiceId: "inv-b2b-2",
    account: "Green Grocer Co-op",
    amountMinor: "5900",
    terms: "net 30",
    status: "PENDING",
    detail: "Issued 2026-10-04, due 2026-11-03 — not yet due.",
  },
];

/** The honest unavailable-capability note (fixture text shown on the surface). */
export const B2B_UNAVAILABLE_NOTE =
  "Live credit checks, AR collection and real wholesale-portal accounts do not exist in this environment — they are shown as unavailable, never simulated. The quote review below records merchant decisions in LOCAL DEMO STATE only (resettable, DEMO-labelled); nothing binds an account or moves money.";
