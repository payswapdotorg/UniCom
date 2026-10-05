/**
 * Deterministic structural snapshot of the Commerce Twin's mirror state.
 *
 * `TwinStateSnapshot` is field-for-field the SAME shape as the kernel's
 * `KernelStateSnapshot` (structural typing — no kernel import needed): that
 * equality is exactly what the twin-verification harness proves. Collection
 * arrays are emitted through the same discipline the kernel snapshot uses —
 * stable sort by aggregate revision over journal insertion order — so two
 * folds of the same journal produce identical snapshots, and canonical JSON
 * over them is byte-identical.
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
import type { TwinCollections, TwinState } from "./twin-state.js";

/** Structural snapshot of the whole twin mirror (deterministic order). */
export interface TwinStateSnapshot {
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
}

function byRevision(a: { readonly revision: number }, b: { readonly revision: number }): number {
  return a.revision - b.revision;
}

function sorted<V extends { readonly revision: number }>(collection: ReadonlyMap<string, V>): readonly V[] {
  return [...collection.values()].sort(byRevision);
}

/** Build the twin snapshot from the mirror's collections (deterministic order). */
export function snapshotOfTwin(state: TwinState): TwinStateSnapshot {
  const collections: TwinCollections = state.collections();
  return {
    levels: sorted(collections.levels),
    reservations: sorted(collections.reservations),
    carts: sorted(collections.carts),
    checkoutSessions: sorted(collections.checkoutSessions),
    orders: sorted(collections.orders),
    payments: sorted(collections.payments),
    transfers: sorted(collections.transfers),
    purchaseOrders: sorted(collections.purchaseOrders),
    fulfillments: sorted(collections.fulfillments),
    shipments: sorted(collections.shipments),
    returns: sorted(collections.returns),
    refunds: sorted(collections.refunds),
    subscriptions: sorted(collections.subscriptions),
    listings: sorted(collections.listings),
    rentals: sorted(collections.rentals),
    consignments: sorted(collections.consignments),
    policies: sorted(collections.policies),
    reconciliationRecords: sorted(collections.reconciliationRecords),
  };
}
