/**
 * @unicom/commerce — public contract surface (Stage 0, W1-001).
 *
 * Worker 1 lane: Commerce Truth / Economic Execution.
 * This file is the module's ONLY public entrypoint (see architecture-policy.yaml).
 * Everything re-exported here is contract-frozen: types/interfaces plus the
 * minimal deterministic validation needed to exercise them.
 *
 * Contract laws enforced across this surface:
 * 1. Three-state truth: operational state / observation / estimate are distinct types.
 * 2. No floating-point money: integer minor units or exact decimal strings only.
 * 3. Immutable ids/revisions: history is append-only; facts are never mutated.
 * 4. Idempotency: consequential commands carry typed idempotency keys.
 * 5. UNKNOWN ≠ FAILED: ambiguous external observations resolve to UNKNOWN.
 * 6. Provider-agnostic: no provider shapes leak into domain contracts.
 * 7. No model/runtime authority: typed commands are the only mutation path.
 */
export type { Brand, CommerceSubjectType } from "./domain/ids.js";
export {
  isValidIdText,
  makeId,
  makeBarcode,
} from "./domain/ids.js";
export type {
  MerchantId,
  CustomerId,
  AutonomousStoreId,
  SystemPrincipalId,
  SupplierId,
  ProductId,
  VariantId,
  SkuId,
  CollectionId,
  Barcode,
  PriceListId,
  PromotionId,
  CouponId,
  LocationId,
  ReservationId,
  TransferId,
  PurchaseOrderId,
  ObservationId,
  ReconciliationRecordId,
  CartId,
  CheckoutSessionId,
  OrderId,
  PaymentId,
  FulfillmentOrderId,
  ShipmentId,
  TrackingRef,
  ReturnId,
  RefundId,
  RefundRecourseId,
  SubscriptionPlanId,
  SubscriptionId,
  CompanyAccountId,
  ResaleListingId,
  RentalAgreementId,
  ConsignmentId,
  OpportunityId,
  GroupBuyId,
  TradeCycleId,
  CommerceEventId,
  CommandId,
  CommandReceiptId,
  CorrelationId,
  IdempotencyKey,
  AutonomousStorePolicyId,
} from "./domain/ids.js";

export type { Result, Ok, Err } from "./domain/result.js";
export { ok, err, unwrap } from "./domain/result.js";

export type { Decimal, RoundingMode, Rational } from "./domain/decimal.js";
export {
  decimal,
  decimalToRational,
  decimalScale,
  decimalCompare,
  compareRationals,
  decimalAdd,
  decimalMultiply,
  decimalNegate,
  decimalIsZero,
  decimalIsIntegral,
  formatExact,
  roundRationalToBigInt,
} from "./domain/decimal.js";

export type { Money, CurrencyCode, MinorUnits, MoneyError } from "./domain/money.js";
export {
  currency,
  money,
  currencyMinorDigits,
  addMoney,
  subtractMoney,
  negateMoney,
  isZeroMoney,
  isNegativeMoney,
  moneyEquals,
  compareMoney,
  multiplyMoneyByInteger,
  multiplyMoneyByDecimal,
  percentageBpsOfMoney,
  sumMoney,
  formatMoney,
} from "./domain/money.js";

export type {
  Quantity,
  CountQuantity,
  MeasurementQuantity,
  UnitOfMeasure,
  UnitFamily,
} from "./domain/quantity.js";
export {
  unitOfMeasure,
  unitFamily,
  countQuantity,
  measuredQuantity,
  countUnits,
  quantityEquals,
  isMeasurementQuantity,
  sumMeasurements,
} from "./domain/quantity.js";
