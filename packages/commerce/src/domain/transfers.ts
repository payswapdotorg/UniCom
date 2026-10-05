/**
 * Multi-location stock transfers.
 *
 * A transfer is an immutable, revisioned object with a deterministic state
 * machine. The inventory effects are deterministic and symmetrical:
 * DISPATCH  → source adjusted by -units (TRANSFER_OUT);
 * CONFIRM_RECEIPT → destination adjusted by +units (TRANSFER_IN).
 * Until receipt is confirmed the units are in transit — they are not silently
 * available at the destination (three-state law applied to in-transit stock).
 */
import type { LocationId, SkuId, TransferId } from "./ids.js";
import { nextRevision } from "./events.js";
import { err, ok, type Result } from "./result.js";

export type TransferState = "REQUESTED" | "DISPATCHED" | "RECEIVED" | "CANCELLED";

export type TransferTrigger =
  | "DISPATCH"
  | "CONFIRM_RECEIPT"
  | "CANCEL_REQUEST"
  | "CANCEL_IN_TRANSIT";

export type TransferTransitionError = {
  code: "INVALID_TRANSFER_TRANSITION";
  from: TransferState;
  trigger: TransferTrigger;
};

export interface StockTransferLine {
  readonly skuId: SkuId;
  readonly units: number;
}

export interface StockTransfer {
  readonly transferId: TransferId;
  readonly fromLocationId: LocationId;
  readonly toLocationId: LocationId;
  readonly lines: readonly StockTransferLine[];
  readonly state: TransferState;
  readonly revision: number;
}

/**
 * Deterministic transfer state machine:
 * REQUESTED --DISPATCH--> DISPATCHED --CONFIRM_RECEIPT--> RECEIVED
 * REQUESTED --CANCEL_REQUEST--> CANCELLED
 * DISPATCHED --CANCEL_IN_TRANSIT--> CANCELLED (units must be returned to source)
 */
export function transferTransition(
  state: TransferState,
  trigger: TransferTrigger,
): Result<TransferState, TransferTransitionError> {
  const table: Record<TransferState, Partial<Record<TransferTrigger, TransferState>>> = {
    REQUESTED: { DISPATCH: "DISPATCHED", CANCEL_REQUEST: "CANCELLED" },
    DISPATCHED: { CONFIRM_RECEIPT: "RECEIVED", CANCEL_IN_TRANSIT: "CANCELLED" },
    RECEIVED: {},
    CANCELLED: {},
  };
  const next = table[state][trigger];
  if (next === undefined) {
    return err({ code: "INVALID_TRANSFER_TRANSITION", from: state, trigger });
  }
  return ok(next);
}

export function advanceTransfer(
  transfer: StockTransfer,
  trigger: TransferTrigger,
): Result<StockTransfer, TransferTransitionError> {
  const next = transferTransition(transfer.state, trigger);
  if (!next.ok) return next;
  return ok({ ...transfer, state: next.value, revision: nextRevision(transfer.revision) });
}

export function transferUnitsFor(transfer: StockTransfer, skuId: SkuId): number {
  const line = transfer.lines.find((item) => item.skuId === skuId);
  return line?.units ?? 0;
}

/** Validate transfer shape: positive units, distinct locations. */
export function isValidTransfer(transfer: StockTransfer): boolean {
  if (transfer.fromLocationId === transfer.toLocationId) return false;
  return transfer.lines.every(
    (line) => Number.isSafeInteger(line.units) && line.units > 0 && line.skuId.length > 0,
  );
}
