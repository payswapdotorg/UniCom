/**
 * Fulfillment and shipments.
 *
 * Carrier delivery signals are physical observations: ambiguous scans resolve
 * the shipment to UNKNOWN, and delivery becomes canonical only through
 * deterministic confirmation (three-state law). Tracking refs are opaque —
 * no carrier-specific semantics.
 */
import type { FulfillmentOrderId, ShipmentId, SkuId, TrackingRef, OrderId, LocationId } from "./ids.js";
import { nextRevision } from "./events.js";
import type { CountQuantity } from "./quantity.js";
import { err, ok, type Result } from "./result.js";

export type ShipmentState =
  | "PENDING"
  | "PACKED"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "FAILED_DELIVERY"
  | "RETURNED_TO_SENDER"
  | "CANCELLED"
  | "UNKNOWN";

export type ShipmentTrigger =
  | "PACK"
  | "TENDER"
  | "CONFIRM_DELIVERY"
  | "FAIL_DELIVERY"
  | "RETURN_TO_SENDER"
  | "CANCEL";

export type ShipmentTransitionError = {
  code: "INVALID_SHIPMENT_TRANSITION";
  from: ShipmentState;
  trigger: ShipmentTrigger;
};

/**
 * Deterministic shipment lifecycle. UNKNOWN (ambiguous carrier state) resolves
 * only via CONFIRM_DELIVERY / FAIL_DELIVERY — never by guessing.
 */
export function shipmentTransition(
  state: ShipmentState,
  trigger: ShipmentTrigger,
): Result<ShipmentState, ShipmentTransitionError> {
  const table: Record<ShipmentState, Partial<Record<ShipmentTrigger, ShipmentState>>> = {
    PENDING: { PACK: "PACKED", CANCEL: "CANCELLED" },
    PACKED: { TENDER: "IN_TRANSIT", CANCEL: "CANCELLED" },
    IN_TRANSIT: { CONFIRM_DELIVERY: "DELIVERED", FAIL_DELIVERY: "FAILED_DELIVERY", RETURN_TO_SENDER: "RETURNED_TO_SENDER" },
    UNKNOWN: { CONFIRM_DELIVERY: "DELIVERED", FAIL_DELIVERY: "FAILED_DELIVERY", RETURN_TO_SENDER: "RETURNED_TO_SENDER" },
    DELIVERED: {},
    FAILED_DELIVERY: { RETURN_TO_SENDER: "RETURNED_TO_SENDER" },
    RETURNED_TO_SENDER: {},
    CANCELLED: {},
  };
  const next = table[state][trigger];
  if (next === undefined) return err({ code: "INVALID_SHIPMENT_TRANSITION", from: state, trigger });
  return ok(next);
}

export interface FulfillmentLine {
  readonly skuId: SkuId;
  readonly quantity: CountQuantity;
}

export interface FulfillmentOrder {
  readonly fulfillmentOrderId: FulfillmentOrderId;
  readonly orderId: OrderId;
  readonly lines: readonly FulfillmentLine[];
  readonly originLocationId?: LocationId;
  readonly revision: number;
}

export interface Shipment {
  readonly shipmentId: ShipmentId;
  readonly fulfillmentOrderId: FulfillmentOrderId;
  readonly trackingRef?: TrackingRef;
  readonly state: ShipmentState;
  readonly revision: number;
}

export function advanceShipment(
  shipment: Shipment,
  trigger: ShipmentTrigger,
): Result<Shipment, ShipmentTransitionError> {
  const next = shipmentTransition(shipment.state, trigger);
  if (!next.ok) return next;
  return ok({ ...shipment, state: next.value, revision: nextRevision(shipment.revision) });
}

/** Carrier delivery observation — a physical observation, not canonical state. */
export type DeliveryObservationValue =
  | "DELIVERED"
  | "ATTEMPTED"
  | "EXCEPTION"
  | "RETURN_SIGNAL";

export interface DeliveryObservation {
  readonly shipmentId: ShipmentId;
  readonly observedAt: string;
  readonly resolution:
    | { readonly resolved: "OBSERVED"; readonly value: DeliveryObservationValue; readonly carrierNativeStatus?: string }
    | { readonly resolved: "UNKNOWN"; readonly reason: string; readonly carrierNativeStatus?: string };
}

/**
 * Deterministic mapping of a delivery observation onto a shipment:
 * OBSERVED DELIVERED → DELIVERED; OBSERVED ATTEMPTED/EXCEPTION → stays IN_TRANSIT
 * (not a failure); anything ambiguous → UNKNOWN (preserved, not FAILED).
 */
export function applyDeliveryObservation(
  shipment: Shipment,
  observation: DeliveryObservation,
): Shipment {
  if (observation.resolution.resolved === "UNKNOWN") {
    return { ...shipment, state: "UNKNOWN", revision: nextRevision(shipment.revision) };
  }
  if (observation.resolution.value === "DELIVERED") {
    const next = shipmentTransition(shipment.state, "CONFIRM_DELIVERY");
    return next.ok
      ? { ...shipment, state: next.value, revision: nextRevision(shipment.revision) }
      : { ...shipment, state: "UNKNOWN", revision: nextRevision(shipment.revision) };
  }
  if (observation.resolution.value === "EXCEPTION" || observation.resolution.value === "RETURN_SIGNAL") {
    const trigger = observation.resolution.value === "EXCEPTION" ? "FAIL_DELIVERY" : "RETURN_TO_SENDER";
    const next = shipmentTransition(shipment.state, trigger);
    if (next.ok) return { ...shipment, state: next.value, revision: nextRevision(shipment.revision) };
  }
  // ATTEMPTED (or a terminal-state delivery scan): no canonical change yet.
  return shipment;
}

export function isTerminalShipmentState(state: ShipmentState): boolean {
  return state === "DELIVERED" || state === "RETURNED_TO_SENDER" || state === "CANCELLED";
}
