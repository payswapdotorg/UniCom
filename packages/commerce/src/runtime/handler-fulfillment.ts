/**
 * Fulfillment and shipment handlers.
 *
 * OPEN_FULFILLMENT starts fulfillment on a PAID order (one fulfillment per
 * order; measured order lines ship as one physical unit each — the
 * supermarket model). ADVANCE_FULFILLMENT_ORDER drives the frozen shipment
 * state machine; carrier delivery signals arrive as OBSERVATIONS
 * (APPLY_DELIVERY_OBSERVATION) — ambiguous scans resolve the shipment to
 * UNKNOWN, never FAILED, and delivery becomes canonical only through
 * deterministic confirmation.
 */
import { nextRevision } from "../domain/events.js";
import { orderSubject } from "../domain/orders.js";
import { orderTransition, type OrderSnapshot } from "../domain/orders.js";
import {
  advanceShipment,
  applyDeliveryObservation,
  isTerminalShipmentState,
  type FulfillmentOrder,
  type Shipment,
} from "../domain/fulfillment.js";
import { countQuantity } from "../domain/quantity.js";
import {
  accept,
  rejectInvalidCommand,
  rejectInvalidState,
  type CommandContext,
  type RuntimeCommandHandler,
} from "./handler.js";
import { fulfillmentSubject, mintFulfillmentOrderId, mintShipmentId, shipmentSubject } from "./subjects.js";

export const handleOpenFulfillment: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "OPEN_FULFILLMENT") return rejectInvalidCommand("not OPEN_FULFILLMENT");
  const order = ctx.state.order(payload.orderId);
  if (!order) return rejectInvalidState(`order ${payload.orderId} not found`);
  if (order.state !== "PAID") {
    return rejectInvalidState(`fulfillment requires a PAID order, order ${payload.orderId} is ${order.state}`);
  }
  if (ctx.state.fulfillmentForOrder(payload.orderId)) {
    return rejectInvalidState(`order ${payload.orderId} already has an open fulfillment`);
  }
  const lines = order.lines.map((line) => ({
    skuId: line.skuId,
    quantity: countQuantity(line.kind === "UNIT_LINE" ? line.quantity.units : 1),
  }));
  const fulfillmentOrderId = mintFulfillmentOrderId(ctx.mint());
  const shipmentId = mintShipmentId(ctx.mint());
  const fulfillment: FulfillmentOrder = {
    fulfillmentOrderId,
    orderId: order.orderId,
    lines,
    originLocationId: payload.originLocationId,
    revision: 1,
  };
  const shipment: Shipment = {
    shipmentId,
    fulfillmentOrderId,
    state: "PENDING",
    revision: 1,
  };
  const stateChange = orderTransition(order.state, "FULFILLMENT_STARTED");
  if (!stateChange.ok) {
    return rejectInvalidState(`order ${payload.orderId}: cannot start fulfillment (${stateChange.error.code})`);
  }
  ctx.emit({
    subject: orderSubject(order.orderId),
    kind: "ORDER_STATE_CHANGED",
    payload: { kind: "ORDER_STATE_CHANGED", from: order.state, to: stateChange.value, revision: nextRevision(order.revision) },
  });
  ctx.emit({
    subject: orderSubject(order.orderId),
    kind: "ORDER_FULFILLMENT_STATUS_CHANGED",
    payload: { kind: "ORDER_FULFILLMENT_STATUS_CHANGED", from: order.fulfillmentStatus, to: "PARTIAL", revision: nextRevision(order.revision) + 1 },
  });
  ctx.emit({
    subject: fulfillmentSubject(fulfillmentOrderId),
    kind: "FULFILLMENT_OPENED",
    payload: { kind: "FULFILLMENT_OPENED", fulfillment, shipment },
  });
  return accept();
};

export const handleAdvanceFulfillmentOrder: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "ADVANCE_FULFILLMENT_ORDER") return rejectInvalidCommand("not ADVANCE_FULFILLMENT_ORDER");
  const fulfillment = ctx.state.fulfillmentOrder(payload.fulfillmentOrderId);
  if (!fulfillment) return rejectInvalidState(`fulfillment order ${payload.fulfillmentOrderId} not found`);
  const shipmentId = ctx.state.shipmentIdForFulfillment(payload.fulfillmentOrderId);
  if (!shipmentId) return rejectInvalidState(`shipment for ${payload.fulfillmentOrderId} not found`);
  const shipment = ctx.state.shipment(shipmentId);
  if (!shipment) return rejectInvalidState(`shipment ${shipmentId} not found`);
  const advanced = advanceShipment(shipment, payload.trigger);
  if (!advanced.ok) {
    return rejectInvalidState(
      `fulfillment ${payload.fulfillmentOrderId}: ${advanced.error.code} from ${advanced.error.from} on ${advanced.error.trigger}`,
    );
  }
  ctx.emit({
    subject: shipmentSubject(shipment.shipmentId),
    kind: "SHIPMENT_STATE_CHANGED",
    payload: { kind: "SHIPMENT_STATE_CHANGED", shipment: advanced.value },
  });
  if (advanced.value.state === "DELIVERED") {
    const completion = emitOrderFulfilled(ctx, fulfillment.orderId);
    if (typeof completion === "string") return rejectInvalidState(completion);
  }
  return accept();
};

export const handleApplyDeliveryObservation: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "APPLY_DELIVERY_OBSERVATION") return rejectInvalidCommand("not APPLY_DELIVERY_OBSERVATION");
  const observation = payload.observation;
  const shipment = ctx.state.shipment(observation.shipmentId);
  if (!shipment) return rejectInvalidState(`shipment ${observation.shipmentId} not found`);
  if (isTerminalShipmentState(shipment.state)) {
    return rejectInvalidState(`shipment ${observation.shipmentId} is terminal (${shipment.state})`);
  }
  const observed = applyDeliveryObservation(shipment, observation);
  if (observed.revision === shipment.revision && observed.state === shipment.state) {
    // ATTEMPTED or another no-canonical-change scan: nothing to record.
    return accept();
  }
  ctx.emit({
    subject: shipmentSubject(shipment.shipmentId),
    kind: "SHIPMENT_STATE_CHANGED",
    payload: { kind: "SHIPMENT_STATE_CHANGED", shipment: observed },
  });
  if (observed.state === "DELIVERED") {
    const orderId = orderOfShipment(ctx, shipment.shipmentId);
    if (orderId) {
      const completion = emitOrderFulfilled(ctx, orderId);
      if (typeof completion === "string") return rejectInvalidState(completion);
    }
  }
  return accept();
};

function orderOfShipment(ctx: CommandContext, shipmentId: string): OrderSnapshot["orderId"] | undefined {
  const fulfillment = ctx.state.allFulfillments().find((candidate) =>
    ctx.state.shipmentIdForFulfillment(candidate.fulfillmentOrderId) === shipmentId,
  );
  return fulfillment?.orderId;
}

function emitOrderFulfilled(ctx: CommandContext, orderId: OrderSnapshot["orderId"]): string | undefined {
  const order = ctx.state.order(orderId);
  if (!order) return `order ${orderId} not found`;
  if (order.fulfillmentStatus === "FULFILLED") return undefined;
  const next = orderTransition(order.state, "FULFILLMENT_COMPLETED");
  if (!next.ok) return `order ${orderId}: ${next.error.code} from ${next.error.from}`;
  ctx.emit({
    subject: orderSubject(orderId),
    kind: "ORDER_STATE_CHANGED",
    payload: { kind: "ORDER_STATE_CHANGED", from: order.state, to: next.value, revision: nextRevision(order.revision) },
  });
  ctx.emit({
    subject: orderSubject(orderId),
    kind: "ORDER_FULFILLMENT_STATUS_CHANGED",
    payload: {
      kind: "ORDER_FULFILLMENT_STATUS_CHANGED",
      from: order.fulfillmentStatus,
      to: "FULFILLED",
      revision: nextRevision(order.revision) + 1,
    },
  });
  return undefined;
}
