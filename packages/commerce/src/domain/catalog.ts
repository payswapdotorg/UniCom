/**
 * Catalog contracts: Product / Variant / SKU / Collection, including
 * weighted/measurement-priced goods (unit pricing by weight or measure).
 */
import type { Barcode, CollectionId, ProductId, SkuId, VariantId } from "./ids.js";
import type { UnitOfMeasure } from "./quantity.js";

export type ProductStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

/**
 * UNIT: sold as whole units (countable).
 * MEASURED: sold by weight/volume/length/… (e.g. $4.99 per KG) — the
 * supermarket weighted-goods path. Scanner/scale integration belongs to the
 * physical edge (Worker 3); the catalog only declares the pricing mode.
 */
export type PricingMode = "UNIT" | "MEASURED";

export interface Sku {
  readonly skuId: SkuId;
  readonly variantId: VariantId;
  /** GTIN/EAN/UPC barcode used by POS, scanners and receiving. */
  readonly barcode?: Barcode;
}

export interface Variant {
  readonly variantId: VariantId;
  readonly productId: ProductId;
  readonly skuId: SkuId;
  readonly title: string;
  readonly pricingMode: PricingMode;
  /** Required when pricingMode is MEASURED (the unit the unit-price refers to). */
  readonly measuredIn?: UnitOfMeasure;
  readonly barcode?: Barcode;
}

export interface Product {
  readonly productId: ProductId;
  readonly title: string;
  readonly status: ProductStatus;
  readonly variantIds: readonly VariantId[];
}

export interface Collection {
  readonly collectionId: CollectionId;
  readonly title: string;
  readonly productIds: readonly ProductId[];
}

export type CatalogEntityType = "PRODUCT" | "VARIANT" | "SKU" | "COLLECTION";

/** Deterministic catalog-shape validation used by contract tests. */
export function isValidVariant(variant: Variant): boolean {
  if (variant.pricingMode === "MEASURED" && variant.measuredIn === undefined) return false;
  if (variant.pricingMode === "UNIT" && variant.measuredIn !== undefined) return false;
  return variant.variantId.length > 0 && variant.title.length > 0;
}

export function isValidProduct(product: Product): boolean {
  return product.productId.length > 0 && product.title.length > 0 && product.variantIds.length > 0;
}

export function isMeasuredVariant(variant: Variant): boolean {
  return variant.pricingMode === "MEASURED";
}

export function findVariantBySku(
  variants: readonly Variant[],
  skuId: SkuId,
): Variant | undefined {
  return variants.find((variant) => variant.skuId === skuId);
}
