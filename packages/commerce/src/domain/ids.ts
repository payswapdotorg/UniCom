/**
 * Nominal identifiers for the Commerce Kernel.
 *
 * Contract laws (W1-001 §4):
 * - IDs are opaque branded strings; they are never structural.
 * - Historical facts are immutable: an ID, once bound to a fact, is never reused.
 * - Idempotency keys are typed so a consequential command cannot be modeled without one.
 */

/**
 * Nominal brand: makes `Brand<string, "OrderId">` incompatible with `Brand<string, "CartId">`
 * even though both are strings at runtime. No runtime footprint.
 */
export type Brand<T, B extends string> = T & { readonly __commerceBrand: B };

const MAX_ID_LENGTH = 128;
const ID_TEXT_PATTERN = /^[\w:._-]+$/u;

/** Validate the canonical id text form (non-empty, bounded, printable charset). */
export function isValidIdText(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= MAX_ID_LENGTH &&
    ID_TEXT_PATTERN.test(value) &&
    !value.startsWith("__")
  );
}

/**
 * Deterministic id constructor. Throws on invalid text — an invalid id is a
 * programming error, not a domain rejection.
 */
export function makeId<B extends string>(value: string): Brand<string, B> {
  if (!isValidIdText(value)) {
    throw new TypeError(`invalid commerce id text: ${JSON.stringify(value)}`);
  }
  return value as Brand<string, B>;
}

/** Entity types that can appear as the subject of a commerce event. */
export type CommerceSubjectType =
  | "MERCHANT"
  | "CUSTOMER"
  | "PRODUCT"
  | "VARIANT"
  | "SKU"
  | "COLLECTION"
  | "PRICE_LIST"
  | "PROMOTION"
  | "COUPON"
  | "INVENTORY_LEVEL"
  | "STOCK_TRANSFER"
  | "PURCHASE_ORDER"
  | "CART"
  | "CHECKOUT_SESSION"
  | "ORDER"
  | "PAYMENT"
  | "FULFILLMENT_ORDER"
  | "SHIPMENT"
  | "RETURN"
  | "SUBSCRIPTION"
  | "COMPANY_ACCOUNT"
  | "RESALE_LISTING"
  | "RENTAL_AGREEMENT"
  | "CONSIGNMENT"
  | "AUTONOMOUS_STORE_POLICY"
  | "RECONCILIATION_RECORD"
  // --- W1-004 (additive): recourse + autonomous-store operational subjects ---
  | "DISPUTE"
  | "CHARGEBACK"
  | "STORE_CASH_SESSION"
  | "CASH_VARIANCE_RECORD"
  // --- W1-005 (additive): autonomous-store runtime subjects ---
  | "AUTONOMOUS_STORE"
  | "POLICY_APPLICATION"
  | "STORE_ESCALATION"
  | "STORE_CYCLE"
  | "SKU_PRICE"
  | "PRICE_ADJUSTMENT"
  | "RESTOCK_ORDER"
  // --- W1-007 (additive): merchant-parity completeness subjects ---
  | "CAMPAIGN"
  | "CAMPAIGN_EFFECT"
  | "CUSTOMER_RECORD"
  | "LOYALTY_ACCOUNT"
  | "LOYALTY_LEDGER_ENTRY"
  | "DEMAND_SIGNAL"
  | "REORDER_PROPOSAL";

// --- Principals ---
export type MerchantId = Brand<string, "MerchantId">;
export type CustomerId = Brand<string, "CustomerId">;
export type AutonomousStoreId = Brand<string, "AutonomousStoreId">;
export type SystemPrincipalId = Brand<string, "SystemPrincipalId">;
export type SupplierId = Brand<string, "SupplierId">;

// --- Catalog ---
export type ProductId = Brand<string, "ProductId">;
export type VariantId = Brand<string, "VariantId">;
export type SkuId = Brand<string, "SkuId">;
export type CollectionId = Brand<string, "CollectionId">;
/** GTIN/EAN/UPC-style numeric barcode (8–14 digits). */
export type Barcode = Brand<string, "Barcode">;

// --- Pricing ---
export type PriceListId = Brand<string, "PriceListId">;
export type PromotionId = Brand<string, "PromotionId">;
export type CouponId = Brand<string, "CouponId">;

// --- Inventory ---
export type LocationId = Brand<string, "LocationId">;
export type ReservationId = Brand<string, "ReservationId">;
export type TransferId = Brand<string, "TransferId">;
export type PurchaseOrderId = Brand<string, "PurchaseOrderId">;
export type ObservationId = Brand<string, "ObservationId">;
export type ReconciliationRecordId = Brand<string, "ReconciliationRecordId">;

// --- Commerce flow ---
export type CartId = Brand<string, "CartId">;
export type CheckoutSessionId = Brand<string, "CheckoutSessionId">;
export type OrderId = Brand<string, "OrderId">;
export type PaymentId = Brand<string, "PaymentId">;
export type FulfillmentOrderId = Brand<string, "FulfillmentOrderId">;
export type ShipmentId = Brand<string, "ShipmentId">;
/** Opaque carrier tracking reference. No carrier-specific semantics. */
export type TrackingRef = Brand<string, "TrackingRef">;

// --- Returns / recourse ---
export type ReturnId = Brand<string, "ReturnId">;
export type RefundId = Brand<string, "RefundId">;
export type RefundRecourseId = Brand<string, "RefundRecourseId">;
// --- W1-004 payment-plane + recourse + store-operation ids (additive) ---
export type CaptureId = Brand<string, "CaptureId">;
export type DisputeId = Brand<string, "DisputeId">;
export type ChargebackId = Brand<string, "ChargebackId">;
export type StoreCashSessionId = Brand<string, "StoreCashSessionId">;
export type CashVarianceRecordId = Brand<string, "CashVarianceRecordId">;
export type TillId = Brand<string, "TillId">;
// --- W1-005 (additive): autonomous-store runtime ids ---
export type PolicyApplicationId = Brand<string, "PolicyApplicationId">;
export type StoreEscalationId = Brand<string, "StoreEscalationId">;
export type StoreCycleId = Brand<string, "StoreCycleId">;
export type OverrideId = Brand<string, "OverrideId">;
export type PriceAdjustmentId = Brand<string, "PriceAdjustmentId">;
export type RestockOrderId = Brand<string, "RestockOrderId">;

// --- Subscriptions / B2B / circular commerce ---
export type SubscriptionPlanId = Brand<string, "SubscriptionPlanId">;
export type SubscriptionId = Brand<string, "SubscriptionId">;
export type CompanyAccountId = Brand<string, "CompanyAccountId">;
export type ResaleListingId = Brand<string, "ResaleListingId">;
export type RentalAgreementId = Brand<string, "RentalAgreementId">;
export type ConsignmentId = Brand<string, "ConsignmentId">;

// --- Opaque cross-plane references (Worker 2 owns the objects themselves) ---
export type OpportunityId = Brand<string, "OpportunityId">;
export type GroupBuyId = Brand<string, "GroupBuyId">;
export type TradeCycleId = Brand<string, "TradeCycleId">;

// --- Events / commands ---
export type CommerceEventId = Brand<string, "CommerceEventId">;
export type CommandId = Brand<string, "CommandId">;
export type CommandReceiptId = Brand<string, "CommandReceiptId">;
export type CorrelationId = Brand<string, "CorrelationId">;
/** Every consequential command carries one; replays with the same key are safe. */
export type IdempotencyKey = Brand<string, "IdempotencyKey">;

// --- Autonomous store ---
export type AutonomousStorePolicyId = Brand<string, "AutonomousStorePolicyId">;

// --- W1-007 (additive): merchant-parity completeness ids ---
export type CampaignId = Brand<string, "CampaignId">;
export type CampaignEffectId = Brand<string, "CampaignEffectId">;
export type CustomerRecordId = Brand<string, "CustomerRecordId">;
export type LoyaltyAccountId = Brand<string, "LoyaltyAccountId">;
export type LoyaltyLedgerEntryId = Brand<string, "LoyaltyLedgerEntryId">;
export type DemandSignalId = Brand<string, "DemandSignalId">;
export type ReorderProposalId = Brand<string, "ReorderProposalId">;

/** Construct a barcode value (GTIN-8/12/13/14 numeric form). */
export function makeBarcode(value: string): Barcode {
  const validLength = value.length === 8 || value.length === 12 || value.length === 13 || value.length === 14;
  if (!validLength || !/^\d+$/.test(value)) {
    throw new TypeError(`invalid barcode (expected GTIN-8/12/13/14 digits): ${JSON.stringify(value)}`);
  }
  return value as Barcode;
}
