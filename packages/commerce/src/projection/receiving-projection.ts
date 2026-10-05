/**
 * Receiving read model: supplier purchase orders plus the recorded receiving
 * receipts (the physical goods that actually arrived against each PO).
 *
 * Facts only: the projection reports what the journal records — ordered,
 * received and outstanding units per line — and never re-validates receiving
 * tolerances (the kernel enforced them before the fact existed).
 */
import type { PurchaseOrder, ReceivingLine } from "../domain/purchasing.js";
import type { ProjectionDefinition } from "./engine.js";

export interface PurchaseOrderReceipt {
  readonly purchaseOrderId: string;
  readonly lines: readonly ReceivingLine[];
  readonly receivedAt: string;
}

export interface ReceivingReadModelState {
  readonly purchaseOrders: ReadonlyMap<string, PurchaseOrder>;
  /** Receiving receipts in journal order (append-only history of arrivals). */
  readonly receipts: readonly PurchaseOrderReceipt[];
}

export const RECEIVING_PROJECTION_ID = "receiving/v2";

interface ReceivingPayloadShape {
  readonly kind?: unknown;
  readonly purchaseOrder?: PurchaseOrder | undefined;
  readonly receipt?: readonly ReceivingLine[] | undefined;
}

export const receivingReadModel: ProjectionDefinition<ReceivingReadModelState> = {
  projectionId: RECEIVING_PROJECTION_ID,
  schemaVersion: 2,
  initialState: (): ReceivingReadModelState => ({
    purchaseOrders: new Map<string, PurchaseOrder>(),
    receipts: [],
  }),
  apply(state, event): ReceivingReadModelState {
    if (event.subject.subjectType !== "PURCHASE_ORDER") return state;
    const payload = event.payload as ReceivingPayloadShape;
    let purchaseOrders = state.purchaseOrders;
    if (payload.purchaseOrder) {
      const copy = new Map(state.purchaseOrders);
      copy.set(payload.purchaseOrder.purchaseOrderId, payload.purchaseOrder);
      purchaseOrders = copy;
    }
    let receipts = state.receipts;
    if (payload.receipt && payload.receipt.length > 0 && payload.purchaseOrder) {
      receipts = [
        ...state.receipts,
        { purchaseOrderId: payload.purchaseOrder.purchaseOrderId, lines: payload.receipt, receivedAt: event.occurredAt },
      ];
    }
    if (purchaseOrders === state.purchaseOrders && receipts === state.receipts) return state;
    return { ...state, purchaseOrders, receipts };
  },
};

/** Outstanding (ordered minus received) units per line, folded from the read model. */
export function outstandingUnitsFor(po: PurchaseOrder): { readonly skuId: string; readonly outstanding: number }[] {
  return po.lines.map((line) => ({
    skuId: line.skuId,
    outstanding: Math.max(0, line.orderedUnits - line.receivedUnits),
  }));
}
