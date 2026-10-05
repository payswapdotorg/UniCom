/**
 * Order read model: live order snapshots folded from ORDER_* events.
 *
 * The fold mirrors the kernel's authoritative order fold exactly: ORDER_PLACED
 * installs the immutable snapshot; state / paymentStatus / fulfillmentStatus
 * transitions apply `to` and recompute the revision from the current snapshot
 * (`nextRevision(current.revision)`). The revision in the event payload is
 * advisory only — the fold never trusts it, which is precisely why the twin
 * verification harness can catch events that disagree with folded state.
 */
import { nextRevision } from "../domain/events.js";
import type { OrderSnapshot } from "../domain/orders.js";
import type { ProjectionDefinition } from "./engine.js";

export interface OrderReadModelState {
  readonly orders: ReadonlyMap<string, OrderSnapshot>;
}

export const ORDER_PROJECTION_ID = "order/v2";

interface OrderPayloadShape {
  readonly kind?: unknown;
  readonly snapshot?: OrderSnapshot | undefined;
  readonly to?: unknown;
}

export const orderReadModel: ProjectionDefinition<OrderReadModelState> = {
  projectionId: ORDER_PROJECTION_ID,
  schemaVersion: 2,
  initialState: (): OrderReadModelState => ({ orders: new Map<string, OrderSnapshot>() }),
  apply(state, event): OrderReadModelState {
    if (event.subject.subjectType !== "ORDER") return state;
    const orderId = event.subject.subjectId;
    const payload = event.payload as OrderPayloadShape;
    const kind = typeof payload.kind === "string" ? payload.kind : undefined;
    if (kind === "ORDER_PLACED") {
      if (!payload.snapshot) return state;
      const orders = new Map(state.orders);
      orders.set(orderId, payload.snapshot);
      return { ...state, orders };
    }
    const current = state.orders.get(orderId);
    if (!current) return state;
    if (typeof payload.to !== "string") return state;
    const revision = nextRevision(current.revision);
    let next: OrderSnapshot | undefined;
    if (kind === "ORDER_STATE_CHANGED") {
      next = { ...current, state: payload.to as OrderSnapshot["state"], revision };
    } else if (kind === "ORDER_PAYMENT_STATUS_CHANGED") {
      next = { ...current, paymentStatus: payload.to as OrderSnapshot["paymentStatus"], revision };
    } else if (kind === "ORDER_FULFILLMENT_STATUS_CHANGED") {
      next = { ...current, fulfillmentStatus: payload.to as OrderSnapshot["fulfillmentStatus"], revision };
    }
    if (!next) return state;
    const orders = new Map(state.orders);
    orders.set(orderId, next);
    return { ...state, orders };
  },
};
