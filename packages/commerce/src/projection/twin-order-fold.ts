/**
 * Twin-side fold for the order-family subjects of the commerce twin
 * (inventory levels/reservations, carts, checkout sessions, orders, payment
 * intents, fulfillments, shipments).
 *
 * W1-012 NOTE: this module is a MECHANICAL EXTRACTION of the corresponding
 * private fold helpers from twin-state.ts (same logic, same map targets,
 * zero semantic change) so twin-state.ts can hold the architecture policy's
 * 400-line limit while the execution-aggregate collections (W1-012) land.
 * TwinState passes its own maps per fold step (the established
 * recourseBag/storeOpsBag pattern); divergence between twin and kernel is a
 * BUG the twin-verification harness must catch.
 */
import { nextRevision, type AnyCommerceEvent } from "../domain/events.js";
import type { CanonicalInventoryLevel, InventoryReservation } from "../domain/inventory.js";
import { inventoryKey } from "../domain/inventory.js";
import type { Cart, CheckoutSession } from "../domain/cart.js";
import type { OrderSnapshot } from "../domain/orders.js";
import type { PaymentIntent } from "../domain/payments.js";
import type { FulfillmentOrder, Shipment } from "../domain/fulfillment.js";

/** The TwinState-owned maps this family folds into (passed by reference). */
export interface TwinOrderCollections {
  readonly levels: Map<string, CanonicalInventoryLevel>;
  readonly reservations: Map<string, InventoryReservation>;
  readonly carts: Map<string, Cart>;
  readonly checkoutSessions: Map<string, CheckoutSession>;
  readonly orders: Map<string, OrderSnapshot>;
  readonly payments: Map<string, PaymentIntent>;
  readonly fulfillments: Map<string, FulfillmentOrder>;
  readonly shipments: Map<string, Shipment>;
  readonly fulfillmentByOrder: Map<string, string>;
  readonly shipmentByFulfillment: Map<string, string>;
}

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

/** Fold one order-family subject event into the collections (set-latest / recompute). */
export function applyOrderFamilyEvent(collections: TwinOrderCollections, event: AnyCommerceEvent): void {
  const payload = event.payload as PayloadLike;
  const kind = kindOf(event);
  switch (event.subject.subjectType) {
    case "INVENTORY_LEVEL":
      foldInventory(collections, payload);
      return;
    case "ORDER":
      foldOrder(collections, event.subject.subjectId, kind, payload);
      return;
    case "CART": {
      const cart = optional<Cart>(payload.cart);
      if (cart) collections.carts.set(cart.cartId, cart);
      return;
    }
    case "CHECKOUT_SESSION": {
      const session = optional<CheckoutSession>(payload.session);
      if (session) collections.checkoutSessions.set(session.checkoutSessionId, session);
      return;
    }
    case "PAYMENT":
      foldPayment(collections, event.subject.subjectId, payload);
      return;
    case "FULFILLMENT_ORDER":
      foldFulfillment(collections, event.subject.subjectId, payload);
      return;
    case "SHIPMENT": {
      const shipment = optional<Shipment>(payload.shipment);
      if (shipment) collections.shipments.set(shipment.shipmentId, shipment);
      return;
    }
    default:
      return;
  }
}

function foldInventory(collections: TwinOrderCollections, payload: PayloadLike): void {
  const level = optional<CanonicalInventoryLevel>(payload.resultingLevel);
  if (level) collections.levels.set(inventoryKey(level.skuId, level.locationId), level);
  const reservationId = typeof payload.reservationId === "string" ? payload.reservationId : undefined;
  const kind = typeof payload.kind === "string" ? payload.kind : "";
  if (!reservationId || !kind) return;
  const existing = collections.reservations.get(reservationId);
  if (kind === "INVENTORY_RESERVED" && !existing) {
    collections.reservations.set(reservationId, {
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
    collections.reservations.set(reservationId, {
      ...existing,
      status: kind === "INVENTORY_RESERVATION_COMMITTED" ? "COMMITTED" : "RELEASED",
      revision: nextRevision(existing.revision),
    });
  }
}

function foldOrder(collections: TwinOrderCollections, orderId: string, kind: string, payload: PayloadLike): void {
  if (kind === "ORDER_PLACED") {
    const snapshot = optional<OrderSnapshot>(payload.snapshot);
    if (snapshot) collections.orders.set(orderId, snapshot);
    return;
  }
  const current = collections.orders.get(orderId);
  if (!current || typeof payload.to !== "string") return;
  const revision = nextRevision(current.revision);
  if (kind === "ORDER_STATE_CHANGED") {
    collections.orders.set(orderId, { ...current, state: payload.to as OrderSnapshot["state"], revision });
  } else if (kind === "ORDER_PAYMENT_STATUS_CHANGED") {
    collections.orders.set(orderId, { ...current, paymentStatus: payload.to as OrderSnapshot["paymentStatus"], revision });
  } else if (kind === "ORDER_FULFILLMENT_STATUS_CHANGED") {
    collections.orders.set(orderId, { ...current, fulfillmentStatus: payload.to as OrderSnapshot["fulfillmentStatus"], revision });
  }
}

function foldPayment(collections: TwinOrderCollections, paymentId: string, payload: PayloadLike): void {
  const intent = optional<PaymentIntent>(payload.intent);
  if (intent) collections.payments.set(paymentId, intent);
}

function foldFulfillment(collections: TwinOrderCollections, subjectId: string, payload: PayloadLike): void {
  const fulfillment = optional<FulfillmentOrder>(payload.fulfillment);
  const shipment = optional<Shipment>(payload.shipment);
  if (fulfillment) {
    collections.fulfillments.set(subjectId, fulfillment);
    collections.fulfillmentByOrder.set(fulfillment.orderId, fulfillment.fulfillmentOrderId);
  }
  if (fulfillment && shipment) {
    collections.shipmentByFulfillment.set(fulfillment.fulfillmentOrderId, shipment.shipmentId);
    collections.shipments.set(shipment.shipmentId, shipment);
  }
}
