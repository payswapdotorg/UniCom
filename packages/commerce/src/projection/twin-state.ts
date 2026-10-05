/**
 * TwinState — the Commerce Twin's full mirror of authoritative operational
 * state, folded ONLY from the immutable event journal.
 *
 * Contract laws (W1-003):
 * - NEVER holds in-process kernel references: the only input is
 *   `AnyCommerceEvent`. This file imports DOMAIN types only — the
 *   architecture layer order (domain → projection → runtime) makes a kernel
 *   import from here structurally IMPOSSIBLE.
 * - The fold mirrors the kernel's authoritative folds semantically (so the
 *   twin can be PROVEN equivalent to the kernel snapshot), but it is an
 *   independent implementation: divergence is a BUG the verification harness
 *   must catch, and a shared implementation would make the proof vacuous.
 * - Revision discipline: aggregate revisions are RECOMPUTED from the folded
 *   current state (`nextRevision`), never trusted from event payloads.
 * - Serialization: `toSerializable`/`fromSerializable` freeze and restore the
 *   whole mirror as structured plain data (checkpoints for snapshot resume).
 */
import { nextRevision, type AnyCommerceEvent } from "../domain/events.js";
import type { CanonicalInventoryLevel, InventoryReservation } from "../domain/inventory.js";
import { inventoryKey } from "../domain/inventory.js";
import type { Cart, CheckoutSession } from "../domain/cart.js";
import type { OrderSnapshot } from "../domain/orders.js";
import type { PaymentIntent } from "../domain/payments.js";
import type { StockTransfer } from "../domain/transfers.js";
import type { PurchaseOrder } from "../domain/purchasing.js";
import type { FulfillmentOrder, Shipment } from "../domain/fulfillment.js";
import type { RefundRecord, ReturnAuthorization } from "../domain/returns.js";
import type { Subscription } from "../domain/subscriptions.js";
import type { ConsignmentAgreement, RentalAgreement, ResaleListing } from "../domain/circular.js";
import type { AutonomousStorePolicy } from "../domain/policy.js";
import type { ReconciliationRecord } from "../domain/reconciliation.js";
import type { CountObservationState } from "./inventory-projection.js";
import { countObservationStateOf } from "./inventory-projection.js";

interface PayloadLike {
  readonly kind?: unknown;
  readonly [key: string]: unknown;
}

function kindOf(event: AnyCommerceEvent): string {
  const payload = event.payload as PayloadLike | null | undefined;
  return typeof payload?.kind === "string" ? payload.kind : "";
}

function optional<T>(value: unknown): T | undefined {
  return value === null || value === undefined ? undefined : (value as T);
}

/** Read-only views over every twin collection (snapshot/queries fold these). */
export interface TwinCollections {
  readonly levels: ReadonlyMap<string, CanonicalInventoryLevel>;
  readonly reservations: ReadonlyMap<string, InventoryReservation>;
  readonly carts: ReadonlyMap<string, Cart>;
  readonly checkoutSessions: ReadonlyMap<string, CheckoutSession>;
  readonly orders: ReadonlyMap<string, OrderSnapshot>;
  readonly payments: ReadonlyMap<string, PaymentIntent>;
  readonly transfers: ReadonlyMap<string, StockTransfer>;
  readonly purchaseOrders: ReadonlyMap<string, PurchaseOrder>;
  readonly fulfillments: ReadonlyMap<string, FulfillmentOrder>;
  readonly shipments: ReadonlyMap<string, Shipment>;
  readonly returns: ReadonlyMap<string, ReturnAuthorization>;
  readonly refunds: ReadonlyMap<string, RefundRecord>;
  readonly subscriptions: ReadonlyMap<string, Subscription>;
  readonly listings: ReadonlyMap<string, ResaleListing>;
  readonly rentals: ReadonlyMap<string, RentalAgreement>;
  readonly consignments: ReadonlyMap<string, ConsignmentAgreement>;
  readonly policies: ReadonlyMap<string, AutonomousStorePolicy>;
  readonly reconciliationRecords: ReadonlyMap<string, ReconciliationRecord>;
  readonly fulfillmentByOrder: ReadonlyMap<string, string>;
  readonly shipmentByFulfillment: ReadonlyMap<string, string>;
  readonly countObservations: ReadonlyMap<string, CountObservationState>;
}

/** Structured, checkpoint-serializable form of the whole twin mirror. */
export type TwinSerializableState = { readonly [K in keyof TwinCollections]: readonly (readonly [string, TwinCollections[K] extends ReadonlyMap<string, infer V> ? V : never])[] };

/**
 * The full authoritative-state mirror. Field-by-field the same collections the
 * kernel's snapshot exposes (that equality is the twin-verification target),
 * plus derived lookup indexes and the per-level count-observation tri-state
 * (excluded from snapshot comparison, included in checkpoints).
 */
export class TwinState {
  private readonly levels = new Map<string, CanonicalInventoryLevel>();
  private readonly reservations = new Map<string, InventoryReservation>();
  private readonly carts = new Map<string, Cart>();
  private readonly checkoutSessions = new Map<string, CheckoutSession>();
  private readonly orders = new Map<string, OrderSnapshot>();
  private readonly payments = new Map<string, PaymentIntent>();
  private readonly transfers = new Map<string, StockTransfer>();
  private readonly purchaseOrders = new Map<string, PurchaseOrder>();
  private readonly fulfillments = new Map<string, FulfillmentOrder>();
  private readonly shipments = new Map<string, Shipment>();
  private readonly returns = new Map<string, ReturnAuthorization>();
  private readonly refunds = new Map<string, RefundRecord>();
  private readonly subscriptions = new Map<string, Subscription>();
  private readonly listings = new Map<string, ResaleListing>();
  private readonly rentals = new Map<string, RentalAgreement>();
  private readonly consignments = new Map<string, ConsignmentAgreement>();
  private readonly policies = new Map<string, AutonomousStorePolicy>();
  private readonly reconciliationRecords = new Map<string, ReconciliationRecord>();
  private readonly fulfillmentByOrder = new Map<string, string>();
  private readonly shipmentByFulfillment = new Map<string, string>();
  private readonly countObservations = new Map<string, CountObservationState>();

  private constructor() {}

  /** Pure-fold constructor (empty mirror). */
  static empty(): TwinState {
    return new TwinState();
  }

  /** Fold one immutable fact into a NEW state (pure fold, input untouched). */
  static apply(state: TwinState, event: AnyCommerceEvent): TwinState {
    const next = state.clone();
    next.applyInPlace(event);
    return next;
  }

  /** Read-only collection views (snapshot and query construction). */
  collections(): TwinCollections {
    return {
      levels: this.levels,
      reservations: this.reservations,
      carts: this.carts,
      checkoutSessions: this.checkoutSessions,
      orders: this.orders,
      payments: this.payments,
      transfers: this.transfers,
      purchaseOrders: this.purchaseOrders,
      fulfillments: this.fulfillments,
      shipments: this.shipments,
      returns: this.returns,
      refunds: this.refunds,
      subscriptions: this.subscriptions,
      listings: this.listings,
      rentals: this.rentals,
      consignments: this.consignments,
      policies: this.policies,
      reconciliationRecords: this.reconciliationRecords,
      fulfillmentByOrder: this.fulfillmentByOrder,
      shipmentByFulfillment: this.shipmentByFulfillment,
      countObservations: this.countObservations,
    };
  }

  /** @internal fold seam (pure fold + resume only). */
  private applyInPlace(event: AnyCommerceEvent): void {
    const payload = event.payload as PayloadLike;
    const kind = kindOf(event);
    switch (event.subject.subjectType) {
      case "INVENTORY_LEVEL":
        this.foldInventory(payload);
        return;
      case "ORDER":
        this.foldOrder(event.subject.subjectId, kind, payload);
        return;
      case "CART": {
        const cart = optional<Cart>(payload.cart);
        if (cart) this.carts.set(cart.cartId, cart);
        return;
      }
      case "CHECKOUT_SESSION": {
        const session = optional<CheckoutSession>(payload.session);
        if (session) this.checkoutSessions.set(session.checkoutSessionId, session);
        return;
      }
      case "PAYMENT":
        this.foldPayment(event.subject.subjectId, kind, payload);
        return;
      case "STOCK_TRANSFER": {
        const transfer = optional<StockTransfer>(payload.transfer);
        if (transfer) this.transfers.set(transfer.transferId, transfer);
        return;
      }
      case "PURCHASE_ORDER": {
        const po = optional<PurchaseOrder>(payload.purchaseOrder);
        if (po) this.purchaseOrders.set(po.purchaseOrderId, po);
        return;
      }
      case "FULFILLMENT_ORDER":
        this.foldFulfillment(event.subject.subjectId, payload);
        return;
      case "SHIPMENT": {
        const shipment = optional<Shipment>(payload.shipment);
        if (shipment) this.shipments.set(shipment.shipmentId, shipment);
        return;
      }
      case "RETURN": {
        const authorization = optional<ReturnAuthorization>(payload.authorization);
        if (authorization) this.returns.set(authorization.returnId, authorization);
        return;
      }
      case "SUBSCRIPTION": {
        const subscription = optional<Subscription>(payload.subscription);
        if (subscription) this.subscriptions.set(subscription.subscriptionId, subscription);
        return;
      }
      case "RESALE_LISTING": {
        const listing = optional<ResaleListing>(payload.listing);
        if (listing) this.listings.set(listing.listingId, listing);
        return;
      }
      case "RENTAL_AGREEMENT": {
        const rental = optional<RentalAgreement>(payload.rental);
        if (rental) this.rentals.set(rental.rentalAgreementId, rental);
        return;
      }
      case "CONSIGNMENT": {
        const consignment = optional<ConsignmentAgreement>(payload.consignment);
        if (consignment) this.consignments.set(consignment.consignmentId, consignment);
        return;
      }
      case "AUTONOMOUS_STORE_POLICY": {
        const policy = optional<AutonomousStorePolicy>(payload.policy);
        if (policy) this.policies.set(policy.autonomousStoreId, policy);
        return;
      }
      case "RECONCILIATION_RECORD": {
        const record = optional<ReconciliationRecord>(payload.record);
        if (record) {
          this.reconciliationRecords.set(record.reconciliationRecordId, record);
          this.countObservations.set(inventoryKey(record.skuId, record.locationId), countObservationStateOf(record.disposition));
        }
        return;
      }
      default:
        return;
    }
  }

  private foldInventory(payload: PayloadLike): void {
    const level = optional<CanonicalInventoryLevel>(payload.resultingLevel);
    if (level) this.levels.set(inventoryKey(level.skuId, level.locationId), level);
    const reservationId = typeof payload.reservationId === "string" ? payload.reservationId : undefined;
    const kind = typeof payload.kind === "string" ? payload.kind : "";
    if (!reservationId || !kind) return;
    const existing = this.reservations.get(reservationId);
    if (kind === "INVENTORY_RESERVED" && !existing) {
      this.reservations.set(reservationId, {
        reservationId: reservationId as InventoryReservation["reservationId"],
        skuId: payload.skuId as InventoryReservation["skuId"],
        locationId: payload.locationId as InventoryReservation["locationId"],
        units: typeof payload.units === "number" ? payload.units : 0,
        status: "OPEN",
        revision: 1,
      });
      return;
    }
    if (existing && (kind === "INVENTORY_RESERVATION_COMMITTED" || kind === "INVENTORY_RESERVATION_RELEASED")) {
      this.reservations.set(reservationId, {
        ...existing,
        status: kind === "INVENTORY_RESERVATION_COMMITTED" ? "COMMITTED" : "RELEASED",
        revision: nextRevision(existing.revision),
      });
    }
  }

  private foldOrder(orderId: string, kind: string, payload: PayloadLike): void {
    if (kind === "ORDER_PLACED") {
      const snapshot = optional<OrderSnapshot>(payload.snapshot);
      if (snapshot) this.orders.set(orderId, snapshot);
      return;
    }
    const current = this.orders.get(orderId);
    if (!current || typeof payload.to !== "string") return;
    const revision = nextRevision(current.revision);
    if (kind === "ORDER_STATE_CHANGED") {
      this.orders.set(orderId, { ...current, state: payload.to as OrderSnapshot["state"], revision });
    } else if (kind === "ORDER_PAYMENT_STATUS_CHANGED") {
      this.orders.set(orderId, { ...current, paymentStatus: payload.to as OrderSnapshot["paymentStatus"], revision });
    } else if (kind === "ORDER_FULFILLMENT_STATUS_CHANGED") {
      this.orders.set(orderId, { ...current, fulfillmentStatus: payload.to as OrderSnapshot["fulfillmentStatus"], revision });
    }
  }

  private foldPayment(paymentId: string, kind: string, payload: PayloadLike): void {
    if (kind === "REFUND_RECORDED") {
      const refund = optional<RefundRecord>(payload.refund);
      if (refund) this.refunds.set(refund.refundId, refund);
      return;
    }
    const intent = optional<PaymentIntent>(payload.intent);
    if (intent) this.payments.set(paymentId, intent);
  }

  private foldFulfillment(subjectId: string, payload: PayloadLike): void {
    const fulfillment = optional<FulfillmentOrder>(payload.fulfillment);
    const shipment = optional<Shipment>(payload.shipment);
    if (fulfillment) {
      this.fulfillments.set(subjectId, fulfillment);
      this.fulfillmentByOrder.set(fulfillment.orderId, fulfillment.fulfillmentOrderId);
    }
    if (fulfillment && shipment) {
      this.shipmentByFulfillment.set(fulfillment.fulfillmentOrderId, shipment.shipmentId);
      this.shipments.set(shipment.shipmentId, shipment);
    }
  }

  private clone(): TwinState {
    const next = new TwinState();
    for (const [key, value] of this.levels) next.levels.set(key, value);
    for (const [key, value] of this.reservations) next.reservations.set(key, value);
    for (const [key, value] of this.carts) next.carts.set(key, value);
    for (const [key, value] of this.checkoutSessions) next.checkoutSessions.set(key, value);
    for (const [key, value] of this.orders) next.orders.set(key, value);
    for (const [key, value] of this.payments) next.payments.set(key, value);
    for (const [key, value] of this.transfers) next.transfers.set(key, value);
    for (const [key, value] of this.purchaseOrders) next.purchaseOrders.set(key, value);
    for (const [key, value] of this.fulfillments) next.fulfillments.set(key, value);
    for (const [key, value] of this.shipments) next.shipments.set(key, value);
    for (const [key, value] of this.returns) next.returns.set(key, value);
    for (const [key, value] of this.refunds) next.refunds.set(key, value);
    for (const [key, value] of this.subscriptions) next.subscriptions.set(key, value);
    for (const [key, value] of this.listings) next.listings.set(key, value);
    for (const [key, value] of this.rentals) next.rentals.set(key, value);
    for (const [key, value] of this.consignments) next.consignments.set(key, value);
    for (const [key, value] of this.policies) next.policies.set(key, value);
    for (const [key, value] of this.reconciliationRecords) next.reconciliationRecords.set(key, value);
    for (const [key, value] of this.fulfillmentByOrder) next.fulfillmentByOrder.set(key, value);
    for (const [key, value] of this.shipmentByFulfillment) next.shipmentByFulfillment.set(key, value);
    for (const [key, value] of this.countObservations) next.countObservations.set(key, value);
    return next;
  }

  // --- checkpoint serialization (structured, insertion-order preserving) ---

  toSerializable(): TwinSerializableState {
    return {
      levels: [...this.levels.entries()],
      reservations: [...this.reservations.entries()],
      carts: [...this.carts.entries()],
      checkoutSessions: [...this.checkoutSessions.entries()],
      orders: [...this.orders.entries()],
      payments: [...this.payments.entries()],
      transfers: [...this.transfers.entries()],
      purchaseOrders: [...this.purchaseOrders.entries()],
      fulfillments: [...this.fulfillments.entries()],
      shipments: [...this.shipments.entries()],
      returns: [...this.returns.entries()],
      refunds: [...this.refunds.entries()],
      subscriptions: [...this.subscriptions.entries()],
      listings: [...this.listings.entries()],
      rentals: [...this.rentals.entries()],
      consignments: [...this.consignments.entries()],
      policies: [...this.policies.entries()],
      reconciliationRecords: [...this.reconciliationRecords.entries()],
      fulfillmentByOrder: [...this.fulfillmentByOrder.entries()],
      shipmentByFulfillment: [...this.shipmentByFulfillment.entries()],
      countObservations: [...this.countObservations.entries()],
    };
  }

  static fromSerializable(serialized: TwinSerializableState): TwinState {
    const state = new TwinState();
    fill(state.levels, serialized.levels);
    fill(state.reservations, serialized.reservations);
    fill(state.carts, serialized.carts);
    fill(state.checkoutSessions, serialized.checkoutSessions);
    fill(state.orders, serialized.orders);
    fill(state.payments, serialized.payments);
    fill(state.transfers, serialized.transfers);
    fill(state.purchaseOrders, serialized.purchaseOrders);
    fill(state.fulfillments, serialized.fulfillments);
    fill(state.shipments, serialized.shipments);
    fill(state.returns, serialized.returns);
    fill(state.refunds, serialized.refunds);
    fill(state.subscriptions, serialized.subscriptions);
    fill(state.listings, serialized.listings);
    fill(state.rentals, serialized.rentals);
    fill(state.consignments, serialized.consignments);
    fill(state.policies, serialized.policies);
    fill(state.reconciliationRecords, serialized.reconciliationRecords);
    fill(state.fulfillmentByOrder, serialized.fulfillmentByOrder);
    fill(state.shipmentByFulfillment, serialized.shipmentByFulfillment);
    fill(state.countObservations, serialized.countObservations);
    return state;
  }
}

function fill<K, V>(target: Map<K, V>, entries: readonly (readonly [K, V])[]): void {
  for (const [key, value] of entries) target.set(key, value);
}
