/**
 * merchant-b2b deterministic DEMO fixtures (J12).
 *
 * Committed, synthetic, single-currency (USD). The opening stock, the
 * warehouse→storefront transfer and every transfer action are driven through
 * the REAL kernel by the component. The company accounts, per-account
 * negotiated price lists and the wholesale minimum are committed fixtures that
 * conform to the PUBLIC B2B contract shapes (`CompanyAccount`, `B2BPriceList`,
 * `MinimumOrderPolicy`) — the order pad resolves them with the real
 * `negotiatedPrice` / `enforceMinimumOrder` contracts and places orders through
 * the kernel's own minimum-order gate. The channel tier ladder, the B2B quote
 * queue and the net-terms invoice sheets remain committed FIXTURES (no kernel
 * aggregate exists for the quote queue or AR) — DEMO-labelled on the surface,
 * never presented as kernel truth or live AR.
 */

import { makeId } from "@unicom/commerce";
import type {
  B2BPriceList,
  B2BPriceListEntry,
  CompanyAccount,
  CompanyAccountId,
  MinimumOrderPolicy,
  PaymentTerms,
  StockTransfer,
} from "@unicom/commerce";
import { DEMO_CURRENCY, demoMoney } from "../merchant-shared/demo-runtime.js";

/** Fixture identity (shown on the surface; bumps when fixtures change). */
export const B2B_FIXTURES_ID = "w3-015-b2b-fixtures@2";

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

/** Wholesale price breaks per SKU (fixture — the channel tier ladder). */
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

/**
 * The B2B company accounts (committed fixtures typed by the PUBLIC contract:
 * payment terms + optional credit limit). Live credit checks do not exist —
 * the credit limit is a fixture fact, never a live credit decision.
 */
const CAFE_LUNA_ACCOUNT: CompanyAccount = {
  companyAccountId: makeId<"CompanyAccountId">("co-cafe-luna"),
  name: "Café Luna",
  paymentTerms: "NET_30",
  creditLimit: demoMoney("40000"),
};
const GREEN_GROCER_ACCOUNT: CompanyAccount = {
  companyAccountId: makeId<"CompanyAccountId">("co-green-grocer"),
  name: "Green Grocer Co-op",
  paymentTerms: "NET_30",
  creditLimit: demoMoney("25000"),
};
export const COMPANY_ACCOUNTS: readonly CompanyAccount[] = [
  CAFE_LUNA_ACCOUNT,
  GREEN_GROCER_ACCOUNT,
];
/** The account the order pad opens on (committed fixture). */
export const DEFAULT_COMPANY_ACCOUNT: CompanyAccount = CAFE_LUNA_ACCOUNT;

/**
 * Per-account negotiated price lists (committed fixtures shaped exactly as the
 * contract's `negotiatedPrice` resolves them: one negotiated entry per SKU,
 * each with its own minimum quantity). Each account negotiates the SKUs it
 * actually buys — asking for anything else is an honest ENTRY_NOT_FOUND.
 */
export const B2B_PRICE_LISTS: Readonly<Record<string, B2BPriceList>> = {
  [CAFE_LUNA_ACCOUNT.companyAccountId]: {
    priceListId: "b2b-pl-cafe-luna",
    companyAccountId: CAFE_LUNA_ACCOUNT.companyAccountId,
    currency: DEMO_CURRENCY,
    entries: [
      {
        skuId: makeId<"SkuId">("sku-b2b-syrup"),
        negotiatedPrice: demoMoney("520"),
        minQuantity: 5,
      },
    ],
  },
  [GREEN_GROCER_ACCOUNT.companyAccountId]: {
    priceListId: "b2b-pl-green-grocer",
    companyAccountId: GREEN_GROCER_ACCOUNT.companyAccountId,
    currency: DEMO_CURRENCY,
    entries: [
      {
        skuId: makeId<"SkuId">("sku-b2b-greens"),
        negotiatedPrice: demoMoney("470"),
        minQuantity: 10,
      },
    ],
  },
};

/** Fresh local copies of the committed price lists (the resettable base). */
export function initialPriceLists(): Record<string, B2BPriceList> {
  return Object.fromEntries(
    Object.entries(B2B_PRICE_LISTS).map(([accountId, list]) => [
      accountId,
      { ...list, entries: [...list.entries] },
    ]),
  );
}

/** Replace one SKU's negotiated entry (the quote desk's local demo update). */
export function withNegotiatedEntry(list: B2BPriceList, entry: B2BPriceListEntry): B2BPriceList {
  return {
    ...list,
    entries: [...list.entries.filter((candidate) => candidate.skuId !== entry.skuId), entry],
  };
}

/**
 * The wholesale minimum the KERNEL enforces at PLACE_ORDER (the contract's
 * `minimumOrderPolicy` kernel option; the seed passes it to the demo kernel so
 * the gate is real kernel truth, not a UI-side check).
 */
export const B2B_MINIMUM_ORDER_POLICY: MinimumOrderPolicy = {
  minimumOrderValue: demoMoney("15000"),
};

/** Payment-terms day offsets (presentation of the contract's terms vocabulary). */
export const PAYMENT_TERMS_DAYS: Readonly<Record<PaymentTerms, number>> = {
  PREPAID: 0,
  NET_15: 15,
  NET_30: 30,
  NET_60: 60,
  NET_90: 90,
};

/** Display label for a terms value ("NET_30" → "net 30"). */
export function paymentTermsLabel(terms: PaymentTerms): string {
  return terms === "PREPAID" ? "prepaid" : `net ${PAYMENT_TERMS_DAYS[terms]}`;
}

/** Deterministic instant + N days (pure parse/arithmetic, no ambient clock). */
export function addDaysIso(instant: string, days: number): string {
  return new Date(Date.parse(instant) + days * 86_400_000).toISOString();
}

/**
 * The fixed AR "as of" date the committed invoice fixtures were aged against
 * (inv-b2b-1, due 2026-10-05, is 12 days past due at the demo date). The aging
 * roll-up computes at exactly this instant — deterministic, resettable.
 */
export const B2B_AR_AS_OF = "2026-10-17T09:00:00Z";

/** One B2B quote request (fixture + LOCAL demo review state). */
export interface B2bQuoteFixture {
  readonly quoteId: string;
  readonly account: string;
  readonly companyAccountId: CompanyAccountId;
  readonly skuId: string;
  readonly units: number;
  readonly note: string;
  /** The tier the account asks for (applied to the LOCAL DEMO list on accept). */
  readonly requestedTier: B2BPriceListEntry;
  /** The fixture seed status (reset restores it; decisions overlay it). */
  readonly status: "PENDING" | "OFFERED" | "DECLINED";
}

export const B2B_QUOTES: readonly B2bQuoteFixture[] = [
  {
    quoteId: "quote-b2b-1",
    account: "Café Luna",
    companyAccountId: CAFE_LUNA_ACCOUNT.companyAccountId,
    skuId: "sku-b2b-syrup",
    units: 24,
    note: "Weekly cold-brew service — asks for the case-of-24 break on a standing order.",
    requestedTier: {
      skuId: makeId<"SkuId">("sku-b2b-syrup"),
      negotiatedPrice: demoMoney("480"),
      minQuantity: 24,
    },
    status: "PENDING",
  },
  {
    quoteId: "quote-b2b-2",
    account: "Green Grocer Co-op",
    companyAccountId: GREEN_GROCER_ACCOUNT.companyAccountId,
    skuId: "sku-b2b-greens",
    units: 10,
    note: "Opening order pending the co-op board's sign-off.",
    requestedTier: {
      skuId: makeId<"SkuId">("sku-b2b-greens"),
      negotiatedPrice: demoMoney("470"),
      minQuantity: 10,
    },
    status: "OFFERED",
  },
];

/** Committed rejection reasons (the desk records one on every rejection). */
export const QUOTE_REJECT_REASONS: readonly string[] = [
  "Seasonal capacity is committed",
  "Margin below floor for this tier",
  "Account terms need review first",
];

/** A recorded quote decision (LOCAL DEMO STATE — never kernel truth). */
export interface B2bQuoteDecision {
  readonly kind: "ACCEPTED" | "COUNTERED" | "REJECTED";
  /** The committed rejection reason (rejections only). */
  readonly reason?: string;
  /** The contract-computed decision summary shown on the surface. */
  readonly note: string;
}

/** One net-terms invoice (fixture — AR is demo data; collection is unavailable). */
export interface NetTermsInvoiceFixture {
  readonly invoiceId: string;
  readonly account: string;
  readonly companyAccountId: CompanyAccountId;
  readonly amountMinor: string;
  readonly terms: string;
  readonly issuedAt: string;
  readonly dueAt: string;
  readonly status: "PENDING" | "OVERDUE";
  readonly detail: string;
}

export const NET_TERMS_INVOICES: readonly NetTermsInvoiceFixture[] = [
  {
    invoiceId: "inv-b2b-1",
    account: "Café Luna",
    companyAccountId: CAFE_LUNA_ACCOUNT.companyAccountId,
    amountMinor: "31200",
    terms: "net 30",
    issuedAt: "2026-09-05T09:00:00Z",
    dueAt: "2026-10-05T09:00:00Z",
    status: "OVERDUE",
    detail: "Issued 2026-09-05, due 2026-10-05 — 12 days past due at the demo date. Fixture fact, not a live AR feed.",
  },
  {
    invoiceId: "inv-b2b-2",
    account: "Green Grocer Co-op",
    companyAccountId: GREEN_GROCER_ACCOUNT.companyAccountId,
    amountMinor: "5900",
    terms: "net 30",
    issuedAt: "2026-10-04T09:00:00Z",
    dueAt: "2026-11-03T09:00:00Z",
    status: "PENDING",
    detail: "Issued 2026-10-04, due 2026-11-03 — not yet due.",
  },
];

/** The honest unavailable-capability note (fixture text shown on the surface). */
export const B2B_UNAVAILABLE_NOTE =
  "Live credit checks, AR collection and real wholesale-portal accounts do not exist in this environment — they are shown as unavailable, never simulated. The quote review below records merchant decisions in LOCAL DEMO STATE only (resettable, DEMO-labelled); nothing binds an account or moves money.";
