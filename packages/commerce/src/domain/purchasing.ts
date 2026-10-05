/**
 * Supplier purchase orders and receiving.
 *
 * Receiving is deterministic: received quantities accumulate per line within
 * declared tolerances. Over-receipt beyond tolerance is REJECTED (never
 * silently absorbed); under-receipt moves the PO to PARTIALLY_RECEIVED.
 * Supplier-reported data is an observation — it becomes canonical only via
 * the deterministic receiving path below (INVARIANT 29).
 */
import type { LocationId, PurchaseOrderId, SkuId, SupplierId } from "./ids.js";
import { nextRevision } from "./events.js";
import { err, ok, type Result } from "./result.js";

export type PurchaseOrderState =
  | "DRAFT"
  | "SUBMITTED"
  | "CONFIRMED"
  | "PARTIALLY_RECEIVED"
  | "RECEIVED"
  | "CLOSED"
  | "CANCELLED";

export type PurchaseOrderTrigger =
  | "SUBMIT"
  | "SUPPLIER_CONFIRM"
  | "RECEIVE"
  | "CLOSE"
  | "CANCEL";

export interface PurchaseOrderLine {
  readonly skuId: SkuId;
  readonly orderedUnits: number;
  readonly receivedUnits: number;
}

export interface PurchaseOrder {
  readonly purchaseOrderId: PurchaseOrderId;
  readonly supplierId: SupplierId;
  readonly destinationLocationId: LocationId;
  readonly lines: readonly PurchaseOrderLine[];
  readonly state: PurchaseOrderState;
  readonly revision: number;
}

export type PurchaseOrderTransitionError = {
  code: "INVALID_PURCHASE_ORDER_TRANSITION";
  from: PurchaseOrderState;
  trigger: PurchaseOrderTrigger;
};

export function purchaseOrderTransition(
  state: PurchaseOrderState,
  trigger: PurchaseOrderTrigger,
): Result<PurchaseOrderState, PurchaseOrderTransitionError> {
  const table: Record<PurchaseOrderState, Partial<Record<PurchaseOrderTrigger, PurchaseOrderState>>> = {
    DRAFT: { SUBMIT: "SUBMITTED", CANCEL: "CANCELLED" },
    SUBMITTED: { SUPPLIER_CONFIRM: "CONFIRMED", CANCEL: "CANCELLED" },
    CONFIRMED: { RECEIVE: "PARTIALLY_RECEIVED", CANCEL: "CANCELLED" },
    PARTIALLY_RECEIVED: { RECEIVE: "PARTIALLY_RECEIVED", CLOSE: "CLOSED", CANCEL: "CANCELLED" },
    RECEIVED: { CLOSE: "CLOSED" },
    CLOSED: {},
    CANCELLED: {},
  };
  const next = table[state][trigger];
  if (next === undefined) {
    return err({ code: "INVALID_PURCHASE_ORDER_TRANSITION", from: state, trigger });
  }
  return ok(next);
}

export type ReceivingErrorCode =
  | "PO_NOT_RECEIVABLE"
  | "UNKNOWN_LINE"
  | "OVER_RECEIPT"
  | "INVALID_UNITS";

export type ReceivingError = { code: ReceivingErrorCode; detail: string };

export interface ReceivingLine {
  readonly skuId: SkuId;
  readonly units: number;
}

export interface ReceivingResult {
  readonly purchaseOrder: PurchaseOrder;
  /** Positive deltas to apply to destination inventory (deterministic receiving path). */
  readonly receipt: readonly ReceivingLine[];
}

/** Default tolerance: allow receiving at most 5% over the ordered quantity. */
export const DEFAULT_OVER_RECEIPT_TOLERANCE_BPS = 500;

/**
 * Deterministic receiving against a purchase order.
 * Receiving exactly completes a line; under-receipt leaves the line open.
 * The returned receipt carries the delta to increment canonical inventory.
 */
export function receiveAgainstPurchaseOrder(
  purchaseOrder: PurchaseOrder,
  lines: readonly ReceivingLine[],
  overReceiptToleranceBps = DEFAULT_OVER_RECEIPT_TOLERANCE_BPS,
): Result<ReceivingResult, ReceivingError> {
  if (purchaseOrder.state === "DRAFT" || purchaseOrder.state === "CANCELLED" || purchaseOrder.state === "CLOSED") {
    return err({ code: "PO_NOT_RECEIVABLE", detail: `state ${purchaseOrder.state}` });
  }
  for (const line of lines) {
    if (!Number.isSafeInteger(line.units) || line.units <= 0) {
      return err({ code: "INVALID_UNITS", detail: `invalid units for ${line.skuId}: ${line.units}` });
    }
    const orderLine = purchaseOrder.lines.find((item) => item.skuId === line.skuId);
    if (!orderLine) {
      return err({ code: "UNKNOWN_LINE", detail: `sku ${line.skuId} is not on the purchase order` });
    }
    const newReceived = orderLine.receivedUnits + line.units;
    const toleranceUnits = Math.floor((orderLine.orderedUnits * overReceiptToleranceBps) / 10_000);
    if (newReceived > orderLine.orderedUnits + toleranceUnits) {
      return err({
        code: "OVER_RECEIPT",
        detail: `sku ${line.skuId}: received ${newReceived} > ordered ${orderLine.orderedUnits} + tolerance ${toleranceUnits}`,
      });
    }
  }
  const nextLines = purchaseOrder.lines.map((orderLine) => {
    const line = lines.find((item) => item.skuId === orderLine.skuId);
    if (!line) return orderLine;
    return { ...orderLine, receivedUnits: orderLine.receivedUnits + line.units };
  });
  const allComplete = nextLines.every((line) => line.receivedUnits >= line.orderedUnits);
  const anyReceived = nextLines.some((line) => line.receivedUnits > 0);
  const nextState: PurchaseOrderState = allComplete ? "RECEIVED" : anyReceived ? "PARTIALLY_RECEIVED" : purchaseOrder.state;
  const advance = purchaseOrderTransition(purchaseOrder.state, "RECEIVE");
  const validState = allComplete || anyReceived ? (advance.ok ? advance.value : nextState) : nextState;
  return ok({
    purchaseOrder: { ...purchaseOrder, lines: nextLines, state: validState, revision: nextRevision(purchaseOrder.revision) },
    receipt: lines,
  });
}

export function outstandingUnits(line: PurchaseOrderLine): number {
  return Math.max(0, line.orderedUnits - line.receivedUnits);
}
