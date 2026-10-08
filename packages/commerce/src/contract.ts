/**
 * @unicom/commerce — public contract surface (W1-001..W1-007).
 * Worker 1 lane: Commerce Truth / Economic Execution.
 * The module's ONLY public entrypoint (architecture-policy.yaml). Contract-frozen.
 * Laws: three-state truth; no float money; immutable ids/revisions; idempotency keys;
 * UNKNOWN ≠ FAILED; provider-agnostic; typed commands are the only mutation path.
 */

// --- Identity, results, exact numerics ---

export {
  type Brand, type CommerceSubjectType, type MerchantId, type CustomerId, type AutonomousStoreId,
  type SystemPrincipalId, type SupplierId, type ProductId, type VariantId, type SkuId,
  type CollectionId, type Barcode, type PriceListId, type PromotionId, type CouponId,
  type LocationId, type ReservationId, type TransferId, type PurchaseOrderId, type ObservationId,
  type ReconciliationRecordId, type CartId, type CheckoutSessionId, type OrderId, type PaymentId,
  type FulfillmentOrderId, type ShipmentId, type TrackingRef, type ReturnId, type RefundId,
  type RefundRecourseId, type SubscriptionPlanId, type SubscriptionId, type CompanyAccountId,
  type ResaleListingId, type RentalAgreementId, type ConsignmentId, type OpportunityId,
  type GroupBuyId, type TradeCycleId, type CommerceEventId, type CommandId, type CommandReceiptId,
  type CorrelationId, type IdempotencyKey, type AutonomousStorePolicyId,
  type PolicyApplicationId, type StoreEscalationId, type StoreCycleId, type OverrideId,
  type PriceAdjustmentId, type RestockOrderId,
  isValidIdText, makeId, makeBarcode,
} from "./domain/ids.js";

export { type Result, type Ok, type Err, ok, err, unwrap } from "./domain/result.js";

export {
  type Decimal, type RoundingMode, type Rational, decimal, decimalToRational, decimalScale,
  decimalCompare, compareRationals, decimalAdd, decimalMultiply, decimalNegate, decimalIsZero,
  decimalIsIntegral, formatExact, roundRationalToBigInt,
} from "./domain/decimal.js";

export {
  type Money, type CurrencyCode, type MinorUnits, type MoneyError, currency, money,
  currencyMinorDigits, addMoney, subtractMoney, negateMoney, isZeroMoney, isNegativeMoney,
  moneyEquals, compareMoney, multiplyMoneyByInteger, multiplyMoneyByDecimal,
  percentageBpsOfMoney, sumMoney, formatMoney,
} from "./domain/money.js";

export {
  type Quantity, type CountQuantity, type MeasurementQuantity, type UnitOfMeasure, type UnitFamily,
  unitOfMeasure, unitFamily, countQuantity, measuredQuantity, countUnits, quantityEquals,
  isMeasurementQuantity, sumMeasurements,
} from "./domain/quantity.js";

// --- Principals, opaque opportunity references, catalog, pricing ---

export {
  type PrincipalRef, type Merchant, type Customer, type MerchantStatus, type CustomerStatus,
  type PrincipalStatus, principalRefKey, principalRefEquals,
} from "./domain/principals.js";

export {
  type OpportunityReference, type OpportunityReferenceKind, type OpportunityLinkRole,
  opportunityReferenceKey, opportunityReferenceEquals,
} from "./domain/opportunity.js";

export {
  type Product, type Variant, type Sku, type Collection, type ProductStatus, type PricingMode,
  type CatalogEntityType, isValidVariant, isValidProduct, isMeasuredVariant, findVariantBySku,
} from "./domain/catalog.js";

export {
  type PriceList, type PriceEntry, type Promotion, type PromotionRule, type PromotionStatus,
  type Coupon, type CouponStatus, type PriceLookupError, type PromotionApplication,
  type PromotionApplicationError, type CouponRedemptionError, lookupPrice, applyPromotionRule,
  redeemCoupon, isPromotionApplicableTo, priceEntryEquals,
} from "./domain/pricing.js";

// --- Observations, events, projections ---

export {
  type ObservationResolution, type ObservationSource, type ObservationSourceType,
  type ObservationEnvelope, type PredictiveEstimate, type UnknownReason, isObserved, isUnknown,
  isFailed, unknownResolution, failedResolution,
} from "./domain/observation.js";

export {
  type CommerceEvent, type AnyCommerceEvent, type CommerceSubjectRef, type Revisioned,
  type EventSequenceError, type CommerceProjection, nextRevision, validateEventSequence,
  projectEvents,
} from "./domain/events.js";

// --- Inventory, transfers, purchasing, reconciliation ---

export {
  type CanonicalInventoryLevel, type Location, type LocationKind, type InventoryError,
  type InventoryErrorCode, type InventoryAdjustmentReason, type InventoryReservation,
  type ReservationStatus, type InventoryEventPayload, type InventoryDomainEvent,
  type InventoryProjectionState, availableUnits, inventoryKey, reserveUnits, commitReservation,
  releaseReservation, adjustOnHand, inventorySubject, inventoryProjection,
} from "./domain/inventory.js";

export {
  type StockTransfer, type StockTransferLine, type TransferState, type TransferTrigger,
  type TransferTransitionError, transferTransition, advanceTransfer, transferUnitsFor,
  isValidTransfer,
} from "./domain/transfers.js";

export {
  type PurchaseOrder, type PurchaseOrderLine, type PurchaseOrderState, type PurchaseOrderTrigger,
  type PurchaseOrderTransitionError, type ReceivingLine, type ReceivingResult, type ReceivingError,
  type ReceivingErrorCode, purchaseOrderTransition, receiveAgainstPurchaseOrder, outstandingUnits,
  DEFAULT_OVER_RECEIPT_TOLERANCE_BPS,
} from "./domain/purchasing.js";

export {
  type InventoryCountObservation, type PosSyncObservation, type CountObservationKind,
  type PosSyncKind, type CountReconciliationPolicy, type ReconciliationOutcome,
  type ReconciliationDisposition, type ReconciliationRecord, reconcileCountObservation,
  reconcilePosSync, reconciliationRecord, AUTHORITATIVE_COUNT_KINDS,
  DEFAULT_COUNT_RECONCILIATION_POLICY,
} from "./domain/reconciliation.js";

// --- Cart / checkout boundary, orders, payment boundary, fulfillment ---

export {
  type Cart, type CartLine, type UnitCartLine, type MeasuredCartLine, type CartTotals,
  type TotalsOptions, type CartError, type CheckoutSession, type CheckoutSessionState,
  type CheckoutTrigger, type CheckoutTransitionError, lineSubtotal, computeCartTotals,
  checkoutTransition, cartLineSkuId, cartTotalsEquals,
} from "./domain/cart.js";

export {
  type OrderSnapshot, type OrderLine, type OrderLineUnit, type OrderLineMeasured, type OrderState,
  type OrderTrigger, type OrderTransitionError, type OrderPaymentStatus, type OrderFulfillmentStatus,
  type OrderEventPayload, type OrderDomainEvent, type OrderProjectionState, orderTransition,
  orderSubject, orderProjection, orderLineUnits,
} from "./domain/orders.js";

export {
  type PaymentIntent, type PaymentIntentRequest, type PaymentBoundary, type PaymentBoundaryError,
  type PaymentBoundaryErrorCode, type PaymentMethodKind, type PaymentMethodRef, type PaymentStatus,
  type PaymentReference, type CustomerAction, resolveAmbiguousPayment, validatePaymentIntentRequest,
  validateRefundAmount,
} from "./domain/payments.js";

export {
  type FulfillmentOrder, type FulfillmentLine, type Shipment, type ShipmentState,
  type ShipmentTrigger, type ShipmentTransitionError, type DeliveryObservation,
  type DeliveryObservationValue, shipmentTransition, advanceShipment, applyDeliveryObservation,
  isTerminalShipmentState,
} from "./domain/fulfillment.js";

// --- Returns, subscriptions, B2B, circular commerce ---

export {
  type ReturnAuthorization, type ReturnLine, type ReturnResolution, type ReturnReason,
  type ReturnState, type ReturnTrigger, type ReturnTransitionError, type RefundRecord,
  type RefundState, type RefundRecoursePolicy, type RecourseStatus, type RefundKind,
  returnTransition, advanceReturn, refundNeedsReview, refundTransition,
} from "./domain/returns.js";

// --- Settlement tri-state, recourse, autonomous-store operations (W1-004 additive) ---

export {
  type PaymentCaptureRecord, type CaptureKind, type SettlementRecord, type SettlementStatus,
  type SettlementTrigger, type SettlementTransitionError, type SettlementObservation,
  settlementTransition, capturedTotalOf, refundedTotalOf, validateRefundAgainstCaptures,
  type PartialCaptureBoundary, type SettlementObservationBoundary,
  isPartialCaptureBoundary, isSettlementObservingBoundary,
} from "./domain/settlement.js";

export {
  type DisputeRecord, type DisputeState, type DisputeTrigger, type DisputeTransitionError,
  type DisputeEvidence, type ChargebackRecord, type ChargebackState,
  disputeTransition, advanceDispute, chargebackForcedAmount,
} from "./domain/recourse.js";

export {
  type StoreCashSession, type StoreSessionState, type StoreSessionTrigger,
  type StoreSessionTransitionError, type TillOperation, type TillOperationKind,
  type CashVarianceRecord, type CashVarianceKind, type CashCountOccasion,
  storeSessionTransition, tillOperationDelta, applyTillOperation, cashVarianceOf,
} from "./domain/store-ops.js";

// --- Autonomous-store deterministic runtime (W1-005 additive) ---

export {
  type AutonomousActionKind, type AutonomousDenialReason, type StoreOperatingDenialReason,
  type PolicyApplication, type PolicyApplicationDecision, type AutonomousStoreControl,
  type StoreControlMode, type AutonomousOverrideRecord, type OverrideAction,
  type StoreCycle, type StoreCycleState, type StoreCycleTrigger, type StoreCycleSummary,
  type StoreCycleTransitionError, type StoreEscalation, type StoreEscalationKind,
  type StoreEscalationState, type StoreEscalationTrigger, type StoreEscalationEvidence,
  type StoreEscalationTransitionError, type SkuPriceRecord, type PriceAdjustmentRecord,
  type RestockOrderRecord, storeCycleTransition, storeEscalationTransition,
  dayKeyOf, epochDayOf, spendPeriodKeyOf, parseInstantUtc,
} from "./domain/autonomous-store.js";

export {
  type Subscription, type SubscriptionPlan, type SubscriptionState, type SubscriptionTrigger,
  type SubscriptionTransitionError, type BillingPeriod, subscriptionTransition, advanceSubscription,
  isValidSubscriptionPlan,
} from "./domain/subscriptions.js";

export {
  type CompanyAccount, type B2BPriceList, type B2BPriceListEntry, type PaymentTerms,
  type B2BPriceError, type MinimumOrderPolicy, type MinimumOrderError, negotiatedPrice,
  enforceMinimumOrder,
} from "./domain/b2b.js";

export {
  type ResaleListing, type ListingState, type ListingTrigger, type ListingTransitionError,
  type RentalAgreement, type RentalPeriod, type RentalState, type RentalTrigger,
  type RentalTransitionError, type ConsignmentAgreement, type ConsignmentState,
  type ConsignmentTrigger, type ConsignmentTransitionError, type ItemCondition, listingTransition,
  advanceListing, rentalTransition, advanceRental, depositReturn, consignmentTransition,
  advanceConsignment, consignmentPayout,
} from "./domain/circular.js";

// --- Autonomous store policy, commands (the only mutation path) ---

export {
  type AutonomousStorePrincipal, type AutonomousStorePolicy, type StopCondition,
  type StopConditionKind, type PolicyPeriod, type PolicyProposal, type PolicyDecision,
  type PolicyDenialReason, type StoreOperatingRules, type RestockRule,
  evaluateAutonomousPolicy, revisePolicy,
} from "./domain/policy.js";

export {
  type CommerceCommandEnvelope, type AnyCommerceCommand, type CommerceCommandPayload,
  type InventoryCommandPayload, type CartCommandPayload, type OrderCommandPayload,
  type PaymentCommandPayload, type ReturnCommandPayload, type CommandReceipt,
  type CommandRejection, type CommandRejectionCode, type CommandExecution, commandEnvelope,
  isSafeReplay,
} from "./domain/commands.js";

// --- Deterministic kernel runtime (W1-002) ---
// Event-sourced runtime: idempotent command dispatch, append-only journal,
// aggregate folds, autonomous policy gate, injected payment boundary PORT,
// deterministic reconstruction from replay. Additive only.

export {
  CommerceKernel, type KernelPersistentState,
  reconstructKernel, reconstructAuthoritativeState,
  type AnyRuntimeCommand, type RuntimeCommandPayload, type SupplyCommandPayload,
  type ReconciliationCommandPayload, type OrderFlowCommandPayload, type ReturnFlowCommandPayload,
  type CircularCommandPayload, type CheckoutCompletionCommandPayload, type SettlementCommandPayload,
  type RecourseCommandPayload, type StoreOpsCommandPayload, type AutonomousStoreCommandPayload,
  type CommerceKernelOptions, type ResolvedKernelOptions, DETERMINISTIC_EPOCH, resolveKernelOptions,
  type KernelStateSnapshot, type EmittedEventSpec, type CommandContext, gateAutonomousCommand,
  authorityTargetStore, gateAuthorityCommand, type KernelAutonomousStoreFold,
} from "./runtime/index.js";

// --- Commerce Twin + event projections (W1-003) ---
// Journal-derived read models + the Commerce Twin (twin ≡ kernel, kernel-free
// by layer order). Additive only.

export {
  type ProjectionDefinition, type EventMigration, type ProjectionCheckpoint,
  type SequenceLawError, migrateEventToCurrent, ProjectionEngine, SequenceLawViolation,
  COMMERCE_PROJECTION_SCHEMA_VERSION, LEGACY_PROJECTION_SCHEMA_VERSION,
  COMMERCE_EVENT_MIGRATIONS, migrateJournalToCurrent,
  canonicalJson, serializableClone, journalFingerprint,
  type CountObservationState, type InventoryReadModelState, countObservationStateOf, inventoryReadModel,
  type OrderReadModelState, orderReadModel, type TransferReadModelState, transferReadModel,
  type ReceivingReadModelState, outstandingUnitsFor, receivingReadModel,
  type ReturnsReadModelState, returnsReadModel,
  type ReconciliationReadModelState, reconciliationReadModel,
  type RecourseReadModelState, recourseReadModel, moneyInPaymentIds,
  type StoreOpsReadModelState, storeOpsReadModel, variancesForSession,
  type SkuFact, type CatalogReadModelState, catalogReadModel,
  type TwinState, type TwinStateSnapshot, snapshotOfTwin,
  type TwinCheckpoint, CommerceTwin, canonicalOfTwin, twinProjection,
  COMMERCE_FACTS_INTERFACE_ID, COMMERCE_FACTS_INTERFACE_VERSION,
  type CommerceFactsV1, type RecourseFactsV1, type StoreOpsFactsV1,
  type AutonomousStoreFactsV1, commerceFacts,
  type TwinDivergence, compareTwinToAuthoritative, assertTwinMatchesAuthoritative, assertCanonicalEquivalence,
} from "./projection/index.js";

// --- W1-007 (additive): merchant-parity completeness ---
// Marketing campaigns, CRM/loyalty ledger, inventory forecasting, analytics
// projections. Deterministic kernel state + journaled evidence; analytics are
// journal-derived (rebuild-from-journal); forecasting is advisory (never
// auto-mutation); loyalty follows W1-006 conservation (zero-sum tested).

export { type CampaignId, type CampaignEffectId, type CustomerRecordId, type LoyaltyAccountId, type LoyaltyLedgerEntryId, type DemandSignalId, type ReorderProposalId } from "./domain/ids.js";
export { type Campaign, type CampaignState, type CampaignTrigger, type CampaignTransitionError, type CampaignEffect, type CampaignStackingPolicy, type CampaignStackingMode, type CampaignEligibilityError, type CampaignApplicationError, type StackingResolution, campaignTransition, advanceCampaign, isCampaignEligible, applyCampaignEffect, resolveStacking } from "./domain/marketing.js";
export { type CustomerRecord, type CustomerRecordStatus, type LoyaltyAccount, type LoyaltyAccountStatus, type LoyaltyTier, type LoyaltyTierPolicy, type LoyaltyLedgerEntry, type LoyaltyEntryKind, type LoyaltyEntryReason, type LoyaltyLedgerError, type LoyaltyPoints, loyaltyPoints, pointsBigInt, addPoints, subtractPointsFloor, pointsEqual, signedDelta, applyLoyaltyAccrual, applyLoyaltyRedemption, applyLoyaltyExpiry, assertLoyaltyConservation, evaluateLoyaltyTier } from "./domain/crm.js";
export { type DemandSignal, type ReorderPointProposal, type ReorderProposalStatus, type ForecastResolution, type ForecastHorizon, type ForecastMethod, type ReorderProposalTransitionError, reorderProposalTransition, advanceReorderProposal, computeDemandForecast, computeReorderProposal } from "./domain/forecasting.js";
export { type MarketingCommandPayload, type CrmCommandPayload, type ForecastingCommandPayload } from "./runtime/index.js";
export { type AnalyticsReadModelState, ANALYTICS_PROJECTION_ID, analyticsReadModel, salesTotalOf, campaignDiscountOf, type LoyaltyReadModelState, LOYALTY_PROJECTION_ID, loyaltyReadModel, ledgerEntriesFor, type ForecastingReadModelState, FORECASTING_PROJECTION_ID, forecastingReadModel } from "./projection/index.js";
