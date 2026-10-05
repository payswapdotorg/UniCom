/**
 * Supply-side handlers: multi-location stock transfers and supplier
 * purchase-order receiving.
 *
 * Transfer inventory effects are deterministic and symmetrical:
 * DISPATCH → source -units (TRANSFER_OUT); CONFIRM_RECEIPT → destination
 * +units (TRANSFER_IN); CANCEL_IN_TRANSIT → units return to source. All
 * lines are validated BEFORE any effect is buffered (atomicity: a
 * multi-line transfer never half-applies).
 */
import { adjustOnHand, inventorySubject, type CanonicalInventoryLevel } from "../domain/inventory.js";
import { advanceTransfer, isValidTransfer, type StockTransfer, type TransferTrigger } from "../domain/transfers.js";
import {
  purchaseOrderTransition,
  receiveAgainstPurchaseOrder,
} from "../domain/purchasing.js";
import {
  accept,
  rejectInvalidCommand,
  rejectInsufficientInventory,
  rejectInvalidState,
  type CommandContext,
  type RuntimeCommandHandler,
} from "./handler.js";
import { purchaseOrderSubject, transferSubject } from "./subjects.js";

function stamped(level: CanonicalInventoryLevel, now: string): CanonicalInventoryLevel {
  return { ...level, updatedAt: now };
}

function levelOrInit(ctx: CommandContext, skuId: CanonicalInventoryLevel["skuId"], locationId: CanonicalInventoryLevel["locationId"]): CanonicalInventoryLevel {
  return ctx.state.level(skuId, locationId) ?? { skuId, locationId, onHand: 0, reserved: 0, revision: 0, updatedAt: ctx.now };
}

export const handleOpenTransfer: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "OPEN_TRANSFER") return rejectInvalidCommand("not OPEN_TRANSFER");
  const transfer = payload.transfer;
  if (!isValidTransfer(transfer)) return rejectInvalidCommand("transfer is degenerate (same location or non-positive lines)");
  if (transfer.state !== "REQUESTED") return rejectInvalidCommand("transfer must open in REQUESTED state");
  if (transfer.revision !== 1) return rejectInvalidCommand("transfer must open at revision 1");
  if (ctx.state.transfer(transfer.transferId)) return rejectInvalidState(`transfer ${transfer.transferId} already exists`);
  ctx.emit({
    subject: transferSubject(transfer.transferId),
    kind: "TRANSFER_OPENED",
    payload: { kind: "TRANSFER_OPENED", transfer },
  });
  return accept();
};

export const handleAdvanceTransfer: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "ADVANCE_TRANSFER") return rejectInvalidCommand("not ADVANCE_TRANSFER");
  const transfer = ctx.state.transfer(payload.transferId);
  if (!transfer) return rejectInvalidState(`transfer ${payload.transferId} not found`);
  const advanced = advanceTransfer(transfer, payload.trigger);
  if (!advanced.ok) {
    return rejectInvalidState(`transfer ${payload.transferId}: ${advanced.error.code} from ${advanced.error.from} on ${advanced.error.trigger}`);
  }
  // Validate the full inventory impact BEFORE buffering anything (atomic).
  const inventoryEffects = planTransferInventoryEffects(ctx, transfer, payload.trigger);
  if (typeof inventoryEffects === "string") return rejectInsufficientInventory(inventoryEffects);
  ctx.emit({
    subject: transferSubject(transfer.transferId),
    kind: "TRANSFER_STATE_CHANGED",
    payload: { kind: "TRANSFER_STATE_CHANGED", transfer: advanced.value },
  });
  for (const effect of inventoryEffects) {
    ctx.emit({
      subject: inventorySubject(effect),
      kind: "INVENTORY_ADJUSTED",
      payload: {
        kind: "INVENTORY_ADJUSTED",
        skuId: effect.skuId,
        locationId: effect.locationId,
        units: effect.units,
        reason: effect.reason,
        resultingLevel: stamped(effect, ctx.now),
      },
    });
  }
  return accept();
};

interface TransferInventoryEffect extends CanonicalInventoryLevel {
  readonly units: number;
  readonly reason: "TRANSFER_OUT" | "TRANSFER_IN";
}

function planTransferInventoryEffects(
  ctx: CommandContext,
  transfer: StockTransfer,
  trigger: TransferTrigger,
): TransferInventoryEffect[] | string {
  const effects: TransferInventoryEffect[] = [];
  const working = new Map<string, CanonicalInventoryLevel>();
  const read = (skuId: CanonicalInventoryLevel["skuId"], locationId: CanonicalInventoryLevel["locationId"]) => {
    const key = `${skuId}|${locationId}`;
    return working.get(key) ?? levelOrInit(ctx, skuId, locationId);
  };
  const write = (level: CanonicalInventoryLevel) => working.set(`${level.skuId}|${level.locationId}`, level);
  if (trigger === "DISPATCH") {
    for (const line of transfer.lines) {
      const current = read(line.skuId, transfer.fromLocationId);
      const next = adjustOnHand(current, -line.units, "TRANSFER_OUT");
      if (!next.ok) return `dispatch rejected at ${line.skuId}: ${next.error.code} (${next.error.detail})`;
      write(next.value);
      effects.push({ ...next.value, units: -line.units, reason: "TRANSFER_OUT" });
    }
  } else if (trigger === "CONFIRM_RECEIPT") {
    for (const line of transfer.lines) {
      const current = read(line.skuId, transfer.toLocationId);
      const next = adjustOnHand(current, line.units, "TRANSFER_IN");
      if (!next.ok) return `receipt rejected at ${line.skuId}: ${next.error.code}`;
      write(next.value);
      effects.push({ ...next.value, units: line.units, reason: "TRANSFER_IN" });
    }
  } else if (trigger === "CANCEL_IN_TRANSIT") {
    for (const line of transfer.lines) {
      const current = read(line.skuId, transfer.fromLocationId);
      const next = adjustOnHand(current, line.units, "TRANSFER_IN");
      if (!next.ok) return `cancel-return rejected at ${line.skuId}: ${next.error.code}`;
      write(next.value);
      effects.push({ ...next.value, units: line.units, reason: "TRANSFER_IN" });
    }
  }
  return effects;
}

export const handleOpenPurchaseOrder: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "OPEN_PURCHASE_ORDER") return rejectInvalidCommand("not OPEN_PURCHASE_ORDER");
  const po = payload.purchaseOrder;
  if (po.state !== "DRAFT") return rejectInvalidCommand("purchase order must open in DRAFT state");
  if (po.revision !== 1) return rejectInvalidCommand("purchase order must open at revision 1");
  if (po.lines.length === 0) return rejectInvalidCommand("purchase order needs at least one line");
  if (!po.lines.every((line) => Number.isSafeInteger(line.orderedUnits) && line.orderedUnits > 0)) {
    return rejectInvalidCommand("ordered units must be positive safe integers");
  }
  if (ctx.state.purchaseOrder(po.purchaseOrderId)) return rejectInvalidState(`purchase order ${po.purchaseOrderId} already exists`);
  ctx.emit({
    subject: purchaseOrderSubject(po.purchaseOrderId),
    kind: "PURCHASE_ORDER_OPENED",
    payload: { kind: "PURCHASE_ORDER_OPENED", purchaseOrder: po },
  });
  return accept();
};

export const handleAdvancePurchaseOrder: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "ADVANCE_PURCHASE_ORDER") return rejectInvalidCommand("not ADVANCE_PURCHASE_ORDER");
  const po = ctx.state.purchaseOrder(payload.purchaseOrderId);
  if (!po) return rejectInvalidState(`purchase order ${payload.purchaseOrderId} not found`);
  const next = purchaseOrderTransition(po.state, payload.trigger);
  if (!next.ok) {
    return rejectInvalidState(`purchase order ${payload.purchaseOrderId}: ${next.error.code} from ${next.error.from} on ${next.error.trigger}`);
  }
  ctx.emit({
    subject: purchaseOrderSubject(po.purchaseOrderId),
    kind: "PURCHASE_ORDER_STATE_CHANGED",
    payload: { kind: "PURCHASE_ORDER_STATE_CHANGED", purchaseOrder: { ...po, state: next.value, revision: po.revision + 1 } },
  });
  return accept();
};

export const handleReceivePurchaseOrder: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "RECEIVE_PURCHASE_ORDER") return rejectInvalidCommand("not RECEIVE_PURCHASE_ORDER");
  const po = ctx.state.purchaseOrder(payload.purchaseOrderId);
  if (!po) return rejectInvalidState(`purchase order ${payload.purchaseOrderId} not found`);
  const result = receiveAgainstPurchaseOrder(po, payload.lines, ctx.options.overReceiptToleranceBps);
  if (!result.ok) {
    return rejectInvalidState(`receiving rejected: ${result.error.code} (${result.error.detail})`);
  }
  ctx.emit({
    subject: purchaseOrderSubject(po.purchaseOrderId),
    kind: "PURCHASE_ORDER_RECEIVED",
    payload: { kind: "PURCHASE_ORDER_RECEIVED", purchaseOrder: result.value.purchaseOrder, receipt: result.value.receipt },
  });
  for (const line of result.value.receipt) {
    const current = levelOrInit(ctx, line.skuId, po.destinationLocationId);
    const next = adjustOnHand(current, line.units, "RECEIVING");
    if (!next.ok) return rejectInvalidState(`receiving inventory effect rejected: ${next.error.code}`);
    ctx.emit({
      subject: inventorySubject({ skuId: line.skuId, locationId: po.destinationLocationId }),
      kind: "INVENTORY_RECEIVED",
      payload: {
        kind: "INVENTORY_RECEIVED",
        skuId: line.skuId,
        locationId: po.destinationLocationId,
        units: line.units,
        reason: "RECEIVING",
        resultingLevel: stamped(next.value, ctx.now),
      },
    });
  }
  return accept();
};
