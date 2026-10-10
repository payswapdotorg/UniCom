/**
 * merchant-storefront deterministic DEMO fixtures (J10).
 *
 * Committed, synthetic, single-currency (USD), single-merchant (Harbor Lane
 * Print Studio — the host demo firm). Everything here is DEMO data the
 * module renders with a visible DEMO marker; the seed script drives the REAL
 * deterministic commerce kernel through typed commands, so every state the
 * screen shows (order snapshots, payment intents, shipments, returns,
 * refunds, settlements) is actual kernel state, never invented markup.
 */

import { makeBarcode, makeId, unitOfMeasure } from "@unicom/commerce";
import type {
  Promotion,
  PriceList,
  Product,
  Variant,
  Collection,
  Coupon,
  RefundRecoursePolicy,
} from "@unicom/commerce";
import { DEMO_CURRENCY, demoMoney } from "../merchant-shared/demo-runtime.js";

/** Fixture identity (shown on the surface; bumps when fixtures change). */
export const STOREFRONT_FIXTURES_ID = "w3-015-storefront-fixtures@1";

/** The demo storefront location (studio back room). */
export const STORE_LOCATION = makeId<"LocationId">("loc-demo-studio");

/** Catalog fixtures — synthetic products of the print studio. */
export const DEMO_PRODUCTS: readonly Product[] = [
  {
    productId: makeId<"ProductId">("prod-demo-prints-a3"),
    title: "A3 Recycled Print — Unframed",
    status: "ACTIVE",
    variantIds: [makeId<"VariantId">("var-demo-a3-matte")],
  },
  {
    productId: makeId<"ProductId">("prod-demo-cards"),
    title: "Studio Greeting Card Set (8 cards)",
    status: "ACTIVE",
    variantIds: [makeId<"VariantId">("var-demo-cards-standard")],
  },
  {
    productId: makeId<"ProductId">("prod-demo-poster"),
    title: "Large-Format Poster Print",
    status: "ACTIVE",
    variantIds: [makeId<"VariantId">("var-demo-poster-matte")],
  },
  {
    productId: makeId<"ProductId">("prod-demo-banner"),
    title: "Custom Fabric Banner (per metre)",
    status: "DRAFT",
    variantIds: [makeId<"VariantId">("var-demo-banner-roll")],
  },
];

/** Demo SKUs — the storefront's sellable units (barcode path is no-RFID). */
export const DEMO_SKUS: readonly {
  readonly skuId: string;
  readonly variantId: string;
  readonly productId: string;
  readonly title: string;
  readonly barcode: string;
  readonly pricingMode: "UNIT" | "MEASURED";
}[] = [
  {
    skuId: "sku-demo-a3print",
    variantId: "var-demo-a3-matte",
    productId: "prod-demo-prints-a3",
    title: "A3 Recycled Print — matte",
    barcode: makeBarcode("1234567890123"),
    pricingMode: "UNIT",
  },
  {
    skuId: "sku-demo-cards",
    variantId: "var-demo-cards-standard",
    productId: "prod-demo-cards",
    title: "Greeting card set — assorted",
    barcode: makeBarcode("1234567890124"),
    pricingMode: "UNIT",
  },
  {
    skuId: "sku-demo-poster",
    variantId: "var-demo-poster-matte",
    productId: "prod-demo-poster",
    title: "Poster print — matte",
    barcode: makeBarcode("1234567890125"),
    pricingMode: "UNIT",
  },
  {
    skuId: "sku-demo-banner",
    variantId: "var-demo-banner-roll",
    productId: "prod-demo-banner",
    title: "Fabric banner — cut per metre",
    barcode: makeBarcode("1234567890126"),
    pricingMode: "MEASURED",
  },
];

/** Demo variants (UNIT and the MEASURED weighted-goods path). */
export const DEMO_VARIANTS: readonly Variant[] = DEMO_SKUS.map((sku) => ({
  variantId: makeId<"VariantId">(sku.variantId),
  productId: makeId<"ProductId">(sku.productId),
  skuId: makeId<"SkuId">(sku.skuId),
  title: sku.title,
  pricingMode: sku.pricingMode,
  ...(sku.pricingMode === "MEASURED" ? { measuredIn: unitOfMeasure("M") } : {}),
}));

/** The storefront collection shown on the demo storefront. */
export const DEMO_COLLECTION: Collection = {
  collectionId: makeId<"CollectionId">("col-demo-studio-picks"),
  title: "Studio Picks",
  productIds: [
    makeId<"ProductId">("prod-demo-prints-a3"),
    makeId<"ProductId">("prod-demo-cards"),
    makeId<"ProductId">("prod-demo-poster"),
  ],
};

/** The demo price list (single currency; exact minor units). */
export const DEMO_PRICE_LIST: PriceList = {
  currency: DEMO_CURRENCY,
  entries: [
    { skuId: makeId<"SkuId">("sku-demo-a3print"), unitPrice: demoMoney("1850") },
    { skuId: makeId<"SkuId">("sku-demo-cards"), unitPrice: demoMoney("1200") },
    { skuId: makeId<"SkuId">("sku-demo-poster"), unitPrice: demoMoney("3400") },
    { skuId: makeId<"SkuId">("sku-demo-banner"), unitPrice: demoMoney("900") },
  ],
};

/** Active promotion applied by the kernel at order placement (10% off prints). */
export const DEMO_PROMOTIONS: readonly Promotion[] = [
  {
    promotionId: makeId<"PromotionId">("promo-demo-autumn-prints"),
    title: "Autumn studio sale — 10% off prints",
    rule: { kind: "PERCENTAGE_OFF", basisPoints: 1000 },
    status: "ACTIVE",
    appliesToSkuIds: [makeId<"SkuId">("sku-demo-a3print"), makeId<"SkuId">("sku-demo-poster")],
    stackable: false,
  },
];

/** A paused promotion — visible, but not applied (honest inactive state). */
export const DEMO_PAUSED_PROMOTION: Promotion = {
  promotionId: makeId<"PromotionId">("promo-demo-winter-preview"),
  title: "Winter preview — USD 5 off card sets",
  rule: { kind: "FIXED_AMOUNT_OFF", amount: demoMoney("500") },
  status: "PAUSED",
  appliesToSkuIds: [makeId<"SkuId">("sku-demo-cards")],
  stackable: false,
};

/** Demo coupon (redemption state is deterministic fixture data). */
export const DEMO_COUPON: Coupon = {
  code: "WELCOME10",
  status: "ACTIVE",
  maxRedemptions: 100,
  redemptionCount: 37,
};

/**
 * Refund recourse policy fixture: refunds at/above USD 25.00 need review by
 * finance before any money moves (the support band demo).
 */
export const DEMO_REFUND_POLICY: RefundRecoursePolicy = {
  autoRefundMax: demoMoney("2500"),
};

/** Opening stock the seed script receives into the studio location. */
export const DEMO_OPENING_STOCK: readonly { readonly skuId: string; readonly units: number }[] = [
  { skuId: "sku-demo-a3print", units: 120 },
  { skuId: "sku-demo-cards", units: 80 },
  { skuId: "sku-demo-poster", units: 40 },
];

/** Demo card payment method tokens (synthetic; never a real rail). */
export const DEMO_CARD = { methodKind: "CARD" as const, tokenRef: "tok-demo-card-1" };

/** Demo gift card payment method (the ambiguous-rail scripted path). */
export const DEMO_AMBIGUOUS_CARD = { methodKind: "CARD" as const, tokenRef: "tok-demo-ambiguous-1" };
