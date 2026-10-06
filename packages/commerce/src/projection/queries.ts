/**
 * Demand-side query interface: typed, versioned commerce FACTS over the twin.
 *
 * Law: FACTS ONLY. This interface exposes what the journal makes true —
 * levels, orders, payments, transfers, receipts, returns, reconciliation
 * dispositions, referenced-SKU facts. Opportunity semantics (scoring,
 * ranking, recommendations) belong to Worker 2's lane and are deliberately
 * absent; opportunity references on aggregates are passed through as OPAQUE
 * branded values only. UNKNOWN tri-states surface as UNKNOWN — never
 * promoted, never dropped.
 *
 * Versioning: `commerce-facts` v1. Consumers pin the version they compiled
 * against; breaking changes require a v2 interface alongside v1.
 */
import { availableUnits, inventoryKey, type CanonicalInventoryLevel, type InventoryReservation } from "../domain/inventory.js";
import type { OrderSnapshot } from "../domain/orders.js";
import type { FulfillmentOrder } from "../domain/fulfillment.js";
import type { PaymentIntent } from "../domain/payments.js";
import type { RefundRecord, ReturnAuthorization } from "../domain/returns.js";
import type { StockTransfer } from "../domain/transfers.js";
import type { PurchaseOrder } from "../domain/purchasing.js";
import type { ReconciliationRecord } from "../domain/reconciliation.js";
import type { Subscription } from "../domain/subscriptions.js";
import type { ConsignmentAgreement, RentalAgreement, ResaleListing } from "../domain/circular.js";
import type { CountObservationState } from "./inventory-projection.js";
import type { CatalogReadModelState, SkuFact } from "./catalog-projection.js";
import type { TwinState } from "./twin-state.js";
import { capturedTotalOf, refundedTotalOf, type PaymentCaptureRecord, type SettlementRecord } from "../domain/settlement.js";
import type { ChargebackRecord, DisputeRecord } from "../domain/recourse.js";
import type { CashVarianceRecord, StoreCashSession } from "../domain/store-ops.js";
import type {
  AutonomousOverrideRecord,
  AutonomousStoreControl,
  PolicyApplication,
  PriceAdjustmentRecord,
  RestockOrderRecord,
  SkuPriceRecord,
  StoreCycle,
  StoreEscalation,
} from "../domain/autonomous-store.js";

export const COMMERCE_FACTS_INTERFACE_ID = "commerce-facts";
export const COMMERCE_FACTS_INTERFACE_VERSION = 1;

/** The versioned commerce-facts query interface (facts only, no opportunity semantics). */
export interface CommerceFactsV1 {
  readonly interfaceId: typeof COMMERCE_FACTS_INTERFACE_ID;
  readonly version: typeof COMMERCE_FACTS_INTERFACE_VERSION;
  readonly inventory: InventoryFactsV1;
  readonly orders: OrderFactsV1;
  readonly payments: PaymentFactsV1;
  readonly supply: SupplyFactsV1;
  readonly returnsAndRefunds: ReturnFactsV1;
  readonly reconciliation: ReconciliationFactsV1;
  readonly catalog: CatalogFactsV1;
  readonly circular: CircularFactsV1;
  /** W1-004 (additive): dispute/chargeback/settlement/capture/refund-provenance facts. */
  readonly recourse: RecourseFactsV1;
  /** W1-004 (additive): autonomous-store cash-session + variance facts. */
  readonly storeOperations: StoreOpsFactsV1;
  /** W1-005 (additive): autonomous-store runtime facts (control, cycles, applications, escalations, price book, restocks). */
  readonly autonomousStore: AutonomousStoreFactsV1;
}

export interface InventoryFactsV1 {
  level(skuId: string, locationId: string): CanonicalInventoryLevel | undefined;
  levels(): readonly CanonicalInventoryLevel[];
  availableUnits(skuId: string, locationId: string): number | undefined;
  reservation(reservationId: string): InventoryReservation | undefined;
  openReservations(): readonly InventoryReservation[];
  /** Latest count-observation tri-state for a level (UNKNOWN survives as UNKNOWN). */
  countObservation(skuId: string, locationId: string): CountObservationState | undefined;
}

export interface OrderFactsV1 {
  order(orderId: string): OrderSnapshot | undefined;
  orders(): readonly OrderSnapshot[];
  ordersInState(state: OrderSnapshot["state"]): readonly OrderSnapshot[];
  fulfillmentForOrder(orderId: string): FulfillmentOrder | undefined;
}

export interface PaymentFactsV1 {
  intent(paymentId: string): PaymentIntent | undefined;
  intents(): readonly PaymentIntent[];
  /** Payment intents currently in the UNKNOWN (ambiguous) status. */
  unknownIntents(): readonly PaymentIntent[];
  refund(refundId: string): RefundRecord | undefined;
  refunds(): readonly RefundRecord[];
}

export interface SupplyFactsV1 {
  transfer(transferId: string): StockTransfer | undefined;
  transfers(): readonly StockTransfer[];
  purchaseOrder(purchaseOrderId: string): PurchaseOrder | undefined;
  purchaseOrders(): readonly PurchaseOrder[];
}

export interface ReturnFactsV1 {
  returnAuthorization(returnId: string): ReturnAuthorization | undefined;
  returns(): readonly ReturnAuthorization[];
  refunds(): readonly RefundRecord[];
}

export interface ReconciliationFactsV1 {
  record(reconciliationRecordId: string): ReconciliationRecord | undefined;
  records(): readonly ReconciliationRecord[];
  recordsForLevel(skuId: string, locationId: string): readonly ReconciliationRecord[];
}

export interface CatalogFactsV1 {
  skuFact(skuId: string): SkuFact | undefined;
  skuFacts(): readonly SkuFact[];
}

export interface CircularFactsV1 {
  subscription(subscriptionId: string): Subscription | undefined;
  subscriptions(): readonly Subscription[];
  listing(listingId: string): ResaleListing | undefined;
  listings(): readonly ResaleListing[];
  rental(rentalAgreementId: string): RentalAgreement | undefined;
  rentals(): readonly RentalAgreement[];
  consignment(consignmentId: string): ConsignmentAgreement | undefined;
  consignments(): readonly ConsignmentAgreement[];
}

/** W1-004 recourse facts: disputes, chargebacks, settlement tri-state, captures, refund provenance. */
export interface RecourseFactsV1 {
  dispute(disputeId: string): DisputeRecord | undefined;
  disputes(): readonly DisputeRecord[];
  disputesInState(state: DisputeRecord["state"]): readonly DisputeRecord[];
  chargeback(chargebackId: string): ChargebackRecord | undefined;
  chargebacks(): readonly ChargebackRecord[];
  settlement(paymentId: string): SettlementRecord | undefined;
  settlements(): readonly SettlementRecord[];
  capturesFor(paymentId: string): readonly PaymentCaptureRecord[];
  capturedTotal(paymentId: string): bigint;
  refundedTotal(paymentId: string): bigint;
  refundsOfKind(kind: RefundRecord["refundKind"]): readonly RefundRecord[];
  /** Money-in view: payment ids whose settlement is OBSERVED SETTLED only (UNKNOWN never enters). */
  moneyInPaymentIds(): readonly string[];
}

/** W1-004 autonomous-store operational facts: sessions, custody, variances. */
export interface StoreOpsFactsV1 {
  storeSession(sessionId: string): StoreCashSession | undefined;
  storeSessions(): readonly StoreCashSession[];
  openSessionFor(autonomousStoreId: string, tillId: string): StoreCashSession | undefined;
  cashVariance(varianceId: string): CashVarianceRecord | undefined;
  cashVariances(): readonly CashVarianceRecord[];
  variancesForSession(sessionId: string): readonly CashVarianceRecord[];
}

/** W1-005 autonomous-store runtime facts (facts only, no opportunity semantics). */
export interface AutonomousStoreFactsV1 {
  control(autonomousStoreId: string): AutonomousStoreControl | undefined;
  controls(): readonly AutonomousStoreControl[];
  cycle(cycleId: string): StoreCycle | undefined;
  cycles(): readonly StoreCycle[];
  cyclesForStore(autonomousStoreId: string): readonly StoreCycle[];
  policyApplication(applicationId: string): PolicyApplication | undefined;
  policyApplications(): readonly PolicyApplication[];
  applicationsForStore(autonomousStoreId: string): readonly PolicyApplication[];
  escalation(escalationId: string): StoreEscalation | undefined;
  escalations(): readonly StoreEscalation[];
  openEscalations(): readonly StoreEscalation[];
  override(overrideId: string): AutonomousOverrideRecord | undefined;
  overrides(): readonly AutonomousOverrideRecord[];
  skuPrice(autonomousStoreId: string, skuId: string): SkuPriceRecord | undefined;
  skuPrices(): readonly SkuPriceRecord[];
  priceAdjustment(adjustmentId: string): PriceAdjustmentRecord | undefined;
  priceAdjustments(): readonly PriceAdjustmentRecord[];
  adjustmentsForSku(autonomousStoreId: string, skuId: string): readonly PriceAdjustmentRecord[];
  restockOrder(restockId: string): RestockOrderRecord | undefined;
  restockOrders(): readonly RestockOrderRecord[];
  restockOrdersForStore(autonomousStoreId: string): readonly RestockOrderRecord[];
}

/** Build the versioned facts interface over a twin mirror state (pure queries). */
export function commerceFacts(state: TwinState, catalog: CatalogReadModelState): CommerceFactsV1 {
  const collections = state.collections();
  const sortedLevels = [...collections.levels.values()].sort(byRevision);
  const sortedSkuFacts = [...catalog.skus.values()].sort((a, b) => a.skuId.localeCompare(b.skuId));
  return {
    interfaceId: COMMERCE_FACTS_INTERFACE_ID,
    version: COMMERCE_FACTS_INTERFACE_VERSION,
    inventory: {
      level: (skuId, locationId) => collections.levels.get(inventoryKey(skuId as CanonicalInventoryLevel["skuId"], locationId as CanonicalInventoryLevel["locationId"])),
      levels: () => sortedLevels,
      availableUnits: (skuId, locationId) => {
        const level = collections.levels.get(inventoryKey(skuId as CanonicalInventoryLevel["skuId"], locationId as CanonicalInventoryLevel["locationId"]));
        return level === undefined ? undefined : availableUnits(level);
      },
      reservation: (reservationId) => collections.reservations.get(reservationId),
      openReservations: () => [...collections.reservations.values()].filter((item) => item.status === "OPEN").sort(byRevision),
      countObservation: (skuId, locationId) =>
        collections.countObservations.get(inventoryKey(skuId as CanonicalInventoryLevel["skuId"], locationId as CanonicalInventoryLevel["locationId"])),
    },
    orders: {
      order: (orderId) => collections.orders.get(orderId),
      orders: () => [...collections.orders.values()].sort(byRevision),
      ordersInState: (orderState) => [...collections.orders.values()].filter((item) => item.state === orderState).sort(byRevision),
      fulfillmentForOrder: (orderId) => {
        const fulfillmentId = collections.fulfillmentByOrder.get(orderId);
        return fulfillmentId === undefined ? undefined : collections.fulfillments.get(fulfillmentId);
      },
    },
    payments: {
      intent: (paymentId) => collections.payments.get(paymentId),
      intents: () => [...collections.payments.values()].sort(byRevision),
      unknownIntents: () => [...collections.payments.values()].filter((item) => item.status === "UNKNOWN").sort(byRevision),
      refund: (refundId) => collections.refunds.get(refundId),
      refunds: () => [...collections.refunds.values()].sort(byRevision),
    },
    supply: {
      transfer: (transferId) => collections.transfers.get(transferId),
      transfers: () => [...collections.transfers.values()].sort(byRevision),
      purchaseOrder: (purchaseOrderId) => collections.purchaseOrders.get(purchaseOrderId),
      purchaseOrders: () => [...collections.purchaseOrders.values()].sort(byRevision),
    },
    returnsAndRefunds: {
      returnAuthorization: (returnId) => collections.returns.get(returnId),
      returns: () => [...collections.returns.values()].sort(byRevision),
      refunds: () => [...collections.refunds.values()].sort(byRevision),
    },
    reconciliation: {
      record: (recordId) => collections.reconciliationRecords.get(recordId),
      records: () => [...collections.reconciliationRecords.values()].sort(byRevision),
      recordsForLevel: (skuId, locationId) => {
        const key = inventoryKey(skuId as CanonicalInventoryLevel["skuId"], locationId as CanonicalInventoryLevel["locationId"]);
        return [...collections.reconciliationRecords.values()].filter((record) => inventoryKey(record.skuId, record.locationId) === key).sort(byRevision);
      },
    },
    catalog: {
      skuFact: (skuId) => catalog.skus.get(skuId),
      skuFacts: () => sortedSkuFacts,
    },
    circular: {
      subscription: (subscriptionId) => collections.subscriptions.get(subscriptionId),
      subscriptions: () => [...collections.subscriptions.values()].sort(byRevision),
      listing: (listingId) => collections.listings.get(listingId),
      listings: () => [...collections.listings.values()].sort(byRevision),
      rental: (rentalAgreementId) => collections.rentals.get(rentalAgreementId),
      rentals: () => [...collections.rentals.values()].sort(byRevision),
      consignment: (consignmentId) => collections.consignments.get(consignmentId),
      consignments: () => [...collections.consignments.values()].sort(byRevision),
    },
    recourse: {
      dispute: (disputeId) => collections.disputes.get(disputeId),
      disputes: () => [...collections.disputes.values()].sort(byRevision),
      disputesInState: (state) => [...collections.disputes.values()].filter((item) => item.state === state).sort(byRevision),
      chargeback: (chargebackId) => collections.chargebacks.get(chargebackId),
      chargebacks: () => [...collections.chargebacks.values()].sort(byRevision),
      settlement: (paymentId) => collections.settlements.get(paymentId),
      settlements: () => [...collections.settlements.values()].sort(byRevision),
      capturesFor: (paymentId) => [...collections.captures.values()].filter((capture) => capture.paymentId === paymentId),
      capturedTotal: (paymentId) => capturedTotalOf([...collections.captures.values()].filter((capture) => capture.paymentId === paymentId)),
      refundedTotal: (paymentId) => refundedTotalOf([...collections.refunds.values()].filter((refund) => refund.paymentId === paymentId)),
      refundsOfKind: (kind) => [...collections.refunds.values()].filter((refund) => (refund.refundKind ?? "POLICY_REFUND") === kind).sort(byRevision),
      moneyInPaymentIds: () => [...collections.settlements.values()].filter((record) => record.status === "SETTLED").map((record) => record.paymentId).sort(),
    },
    storeOperations: {
      storeSession: (sessionId) => collections.storeSessions.get(sessionId),
      storeSessions: () => [...collections.storeSessions.values()].sort(byRevision),
      openSessionFor: (autonomousStoreId, tillId) =>
        [...collections.storeSessions.values()]
          .filter((session) => session.state === "OPEN" && session.autonomousStoreId === autonomousStoreId && session.tillId === tillId)
          .sort(byRevision)[0],
      cashVariance: (varianceId) => collections.cashVariances.get(varianceId),
      cashVariances: () => [...collections.cashVariances.values()].sort(byRevision),
      variancesForSession: (sessionId) => [...collections.cashVariances.values()].filter((variance) => variance.sessionId === sessionId).sort(byRevision),
    },
    autonomousStore: autonomousStoreFacts(state),
  };
}

/** Build the W1-005 autonomous-store facts view over the twin's bag (pure queries). */
export function autonomousStoreFacts(state: TwinState): AutonomousStoreFactsV1 {
  const collections = state.autonomousCollections();
  return {
    control: (storeId) => collections.stores.get(storeId),
    controls: () => [...collections.stores.values()].sort(byRevision),
    cycle: (cycleId) => collections.cycles.get(cycleId),
    cycles: () => [...collections.cycles.values()].sort(byRevision),
    cyclesForStore: (storeId) => [...collections.cycles.values()].filter((cycle) => cycle.autonomousStoreId === storeId).sort(byRevision),
    policyApplication: (applicationId) => collections.policyApplications.get(applicationId),
    policyApplications: () => [...collections.policyApplications.values()].sort(byRevision),
    applicationsForStore: (storeId) => [...collections.policyApplications.values()].filter((application) => application.autonomousStoreId === storeId).sort(byRevision),
    escalation: (escalationId) => collections.escalations.get(escalationId),
    escalations: () => [...collections.escalations.values()].sort(byRevision),
    openEscalations: () => [...collections.escalations.values()].filter((escalation) => escalation.state === "OPEN").sort(byRevision),
    override: (overrideId) => collections.overrides.get(overrideId),
    overrides: () => [...collections.overrides.values()].sort(byRevision),
    skuPrice: (storeId, skuId) => collections.skuPrices.get(`${storeId}|${skuId}`),
    skuPrices: () => [...collections.skuPrices.values()].sort(byRevision),
    priceAdjustment: (adjustmentId) => collections.priceAdjustments.get(adjustmentId),
    priceAdjustments: () => [...collections.priceAdjustments.values()].sort(byRevision),
    adjustmentsForSku: (storeId, skuId) =>
      [...collections.priceAdjustments.values()].filter((adjustment) => adjustment.autonomousStoreId === storeId && adjustment.skuId === skuId).sort(byRevision),
    restockOrder: (restockId) => collections.restockOrders.get(restockId),
    restockOrders: () => [...collections.restockOrders.values()].sort(byRevision),
    restockOrdersForStore: (storeId) => [...collections.restockOrders.values()].filter((order) => order.autonomousStoreId === storeId).sort(byRevision),
  };
}

function byRevision(a: { readonly revision: number }, b: { readonly revision: number }): number {
  return a.revision - b.revision;
}
