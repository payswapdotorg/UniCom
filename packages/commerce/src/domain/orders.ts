/**
 * Orders and the order lifecycle state machine.
 *
 * Orders are immutable, revisioned snapshots; every state change is a new
 * event. Payment/fulfillment sub-states include UNKNOWN — ambiguous provider
 * or carrier state is preserved, never flattened to failure (INVARIANT 10/11).
 */
import type { OrderId, SkuId, CartId, CheckoutSessionId } from "./ids.js";
import { nextRevision, type AnyCommerceEvent, type CommerceEvent, type CommerceSubjectRef } from "./events.js";
import { moneyEquals, type Money } from "./money.js";
import type { CartTotals } from "./cart.js";
import type { CountQuantity, MeasurementQuantity } from "./quantity.js";
import type { OpportunityReference } from "./opportunity.js";
import type { PrincipalRef } from "./principals.js";
import { err, ok, type Result } from "./result.js";

export type OrderState =
  | "PENDING"
  | "PAID"
  | "PARTIALLY_FULFILLED"
  | "FULFILLED"
  | "COMPLETED"
  | "CANCELLED";

export type OrderTrigger =
  | "PAYMENT_CONFIRMED"
  | "FULFILLMENT_STARTED"
  | "FULFILLMENT_COMPLETED"
  | "ORDER_COMPLETED"
  | "CANCELLED";

export type OrderTransitionError = {
  code: "INVALID_ORDER_TRANSITION";
  from: OrderState;
  trigger: OrderTrigger;
};

/**
 * Deterministic order lifecycle:
 * PENDING --PAYMENT_CONFIRMED--> PAID --FULFILLMENT_STARTED--> PARTIALLY_FULFILLED
 *   --FULFILLMENT_COMPLETED--> FULFILLED --ORDER_COMPLETED--> COMPLETED
 * CANCELLED reachable from PENDING or PAID (never after fulfillment began).
 */
export function orderTransition(
  state: OrderState,
  trigger: OrderTrigger,
): Result<OrderState, OrderTransitionError> {
  const table: Record<OrderState, Partial<Record<OrderTrigger, OrderState>>> = {
    PENDING: { PAYMENT_CONFIRMED: "PAID", CANCELLED: "CANCELLED" },
    PAID: { FULFILLMENT_STARTED: "PARTIALLY_FULFILLED", FULFILLMENT_COMPLETED: "FULFILLED", CANCELLED: "CANCELLED" },
    PARTIALLY_FULFILLED: { FULFILLMENT_COMPLETED: "FULFILLED" },
    FULFILLED: { ORDER_COMPLETED: "COMPLETED" },
    COMPLETED: {},
    CANCELLED: {},
  };
  const next = table[state][trigger];
  if (next === undefined) return err({ code: "INVALID_ORDER_TRANSITION", from: state, trigger });
  return ok(next);
}

/** Ambiguous payment status is UNKNOWN, never flattened (three-state law). */
export type OrderPaymentStatus =
  | "NOT_PAID"
  | "AUTHORIZED"
  | "PAID"
  | "PARTIALLY_REFUNDED"
  | "REFUNDED"
  | "UNKNOWN";

export type OrderFulfillmentStatus = "UNFULFILLED" | "PARTIAL" | "FULFILLED" | "UNKNOWN";

export interface OrderLineUnit {
  readonly kind: "UNIT_LINE";
  readonly skuId: SkuId;
  readonly quantity: CountQuantity;
  readonly unitPrice: Money;
}

export interface OrderLineMeasured {
  readonly kind: "MEASURED_LINE";
  readonly skuId: SkuId;
  readonly quantity: MeasurementQuantity;
  readonly unitPrice: Money;
  readonly lineTotal: Money;
}

export type OrderLine = OrderLineUnit | OrderLineMeasured;

export interface OrderSnapshot {
  readonly orderId: OrderId;
  readonly merchantRef: PrincipalRef;
  readonly customerRef?: PrincipalRef;
  readonly cartId?: CartId;
  readonly checkoutSessionId?: CheckoutSessionId;
  readonly state: OrderState;
  readonly paymentStatus: OrderPaymentStatus;
  readonly fulfillmentStatus: OrderFulfillmentStatus;
  readonly lines: readonly OrderLine[];
  readonly totals: CartTotals;
  readonly opportunityRef?: OpportunityReference;
  readonly revision: number;
  readonly placedAt: string;
}

// --- Order events (immutable facts) ---

export interface OrderPlacedPayload {
  readonly kind: "ORDER_PLACED";
  readonly snapshot: OrderSnapshot;
}

export interface OrderStateChangedPayload {
  readonly kind: "ORDER_STATE_CHANGED";
  readonly from: OrderState;
  readonly to: OrderState;
  readonly revision: number;
}

export interface OrderPaymentStatusChangedPayload {
  readonly kind: "ORDER_PAYMENT_STATUS_CHANGED";
  readonly from: OrderPaymentStatus;
  readonly to: OrderPaymentStatus;
  readonly revision: number;
}

export interface OrderFulfillmentStatusChangedPayload {
  readonly kind: "ORDER_FULFILLMENT_STATUS_CHANGED";
  readonly from: OrderFulfillmentStatus;
  readonly to: OrderFulfillmentStatus;
  readonly revision: number;
}

export type OrderEventPayload =
  | OrderPlacedPayload
  | OrderStateChangedPayload
  | OrderPaymentStatusChangedPayload
  | OrderFulfillmentStatusChangedPayload;

export type OrderDomainEvent = CommerceEvent<OrderEventPayload["kind"], OrderEventPayload>;

export function orderSubject(orderId: OrderId): CommerceSubjectRef {
  return { subjectType: "ORDER", subjectId: orderId };
}

export interface OrderProjectionState {
  readonly orders: ReadonlyMap<string, OrderSnapshot>;
}

/** Reference fold: order events → latest order snapshots. Pure and deterministic. */
export const orderProjection = {
  projectionId: "orders/v1",
  initialState: (): OrderProjectionState => ({ orders: new Map<string, OrderSnapshot>() }),
  apply(state: OrderProjectionState, event: AnyCommerceEvent): OrderProjectionState {
    if (!isOrderEvent(event)) return state;
    const orders = new Map(state.orders);
    const payload = event.payload;
    if (payload.kind === "ORDER_PLACED") {
      orders.set(event.subject.subjectId, payload.snapshot);
      return { orders };
    }
    const current = orders.get(event.subject.subjectId);
    if (!current) return state;
    const revision = nextRevision(current.revision);
    if (payload.kind === "ORDER_STATE_CHANGED") {
      orders.set(event.subject.subjectId, { ...current, state: payload.to, revision });
    } else if (payload.kind === "ORDER_PAYMENT_STATUS_CHANGED") {
      orders.set(event.subject.subjectId, { ...current, paymentStatus: payload.to, revision });
    } else if (payload.kind === "ORDER_FULFILLMENT_STATUS_CHANGED") {
      orders.set(event.subject.subjectId, { ...current, fulfillmentStatus: payload.to, revision });
    }
    return { orders };
  },
} as const satisfies import("./events.js").CommerceProjection<OrderProjectionState>;

function isOrderEvent(event: AnyCommerceEvent): event is OrderDomainEvent {
  const kind = (event.payload as OrderEventPayload | null)?.kind;
  return typeof kind === "string" && kind.startsWith("ORDER_");
}

export function orderLineUnits(line: OrderLine): number | undefined {
  return line.kind === "UNIT_LINE" ? line.quantity.units : undefined;
}

export function orderTotalsEqual(a: CartTotals, b: CartTotals): boolean {
  return (
    moneyEquals(a.subtotal, b.subtotal) &&
    moneyEquals(a.discountTotal, b.discountTotal) &&
    moneyEquals(a.taxTotal, b.taxTotal) &&
    moneyEquals(a.grandTotal, b.grandTotal)
  );
}
