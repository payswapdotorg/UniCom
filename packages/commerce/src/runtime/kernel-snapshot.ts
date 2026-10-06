/**
 * Deterministic structural snapshot of the kernel's authoritative state.
 *
 * The snapshot is a deep-comparable value (used by replay/reconstruction
 * determinism proofs): every aggregate collection is emitted through the
 * state's sorted getters, so two kernels with identical journals produce
 * identical snapshots.
 */
import type { CanonicalInventoryLevel, InventoryReservation } from "../domain/inventory.js";
import type { Cart, CheckoutSession } from "../domain/cart.js";
import type { OrderSnapshot } from "../domain/orders.js";
import type { PaymentIntent } from "../domain/payments.js";
import type { StockTransfer } from "../domain/transfers.js";
import type { PurchaseOrder } from "../domain/purchasing.js";
import type { FulfillmentOrder, Shipment } from "../domain/fulfillment.js";
import type { ReturnAuthorization, RefundRecord } from "../domain/returns.js";
import type { Subscription } from "../domain/subscriptions.js";
import type { ConsignmentAgreement, RentalAgreement, ResaleListing } from "../domain/circular.js";
import type { AutonomousStorePolicy } from "../domain/policy.js";
import type { ReconciliationRecord } from "../domain/reconciliation.js";
import type { PaymentCaptureRecord, SettlementRecord } from "../domain/settlement.js";
import type { ChargebackRecord, DisputeRecord } from "../domain/recourse.js";
import type { CashVarianceRecord, StoreCashSession } from "../domain/store-ops.js";
import type { KernelState } from "./kernel-state.js";

/** Structural snapshot of the whole authoritative state (deterministic order). */
export interface KernelStateSnapshot {
  readonly levels: readonly CanonicalInventoryLevel[];
  readonly reservations: readonly InventoryReservation[];
  readonly carts: readonly Cart[];
  readonly checkoutSessions: readonly CheckoutSession[];
  readonly orders: readonly OrderSnapshot[];
  readonly payments: readonly PaymentIntent[];
  readonly transfers: readonly StockTransfer[];
  readonly purchaseOrders: readonly PurchaseOrder[];
  readonly fulfillments: readonly FulfillmentOrder[];
  readonly shipments: readonly Shipment[];
  readonly returns: readonly ReturnAuthorization[];
  readonly refunds: readonly RefundRecord[];
  readonly subscriptions: readonly Subscription[];
  readonly listings: readonly ResaleListing[];
  readonly rentals: readonly RentalAgreement[];
  readonly consignments: readonly ConsignmentAgreement[];
  readonly policies: readonly AutonomousStorePolicy[];
  readonly reconciliationRecords: readonly ReconciliationRecord[];
  readonly captures: readonly PaymentCaptureRecord[];
  readonly settlements: readonly SettlementRecord[];
  readonly disputes: readonly DisputeRecord[];
  readonly chargebacks: readonly ChargebackRecord[];
  readonly storeSessions: readonly StoreCashSession[];
  readonly cashVariances: readonly CashVarianceRecord[];
}

/** Build the snapshot from a kernel state's sorted getters. */
export function snapshotOf(state: KernelState): KernelStateSnapshot {
  return {
    levels: state.allLevels(),
    reservations: state.allReservations(),
    carts: state.allCarts(),
    checkoutSessions: state.allCheckoutSessions(),
    orders: state.allOrders(),
    payments: state.allPaymentIntents(),
    transfers: state.allTransfers(),
    purchaseOrders: state.allPurchaseOrders(),
    fulfillments: state.allFulfillments(),
    shipments: state.allShipments(),
    returns: state.allReturns(),
    refunds: state.allRefunds(),
    subscriptions: state.allSubscriptions(),
    listings: state.allListings(),
    rentals: state.allRentals(),
    consignments: state.allConsignments(),
    policies: state.allPolicies(),
    reconciliationRecords: state.allReconciliationRecords(),
    captures: state.allCaptures(),
    settlements: state.allSettlements(),
    disputes: state.allDisputes(),
    chargebacks: state.allChargebacks(),
    storeSessions: state.allStoreSessions(),
    cashVariances: state.allCashVariances(),
  };
}
