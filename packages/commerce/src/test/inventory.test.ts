/**
 * Contract tests — canonical inventory, reservations, the inventory
 * projection, multi-location transfers (scenario 2) and supplier
 * purchase-order receiving (scenario 5).
 */
import { describe, expect, it } from "vitest";
import {
  adjustOnHand,
  advanceTransfer,
  availableUnits,
  commitReservation,
  inventoryKey,
  inventoryProjection,
  isValidTransfer,
  makeId,
  receiveAgainstPurchaseOrder,
  releaseReservation,
  reserveUnits,
  transferTransition,
  transferUnitsFor,
  validateEventSequence,
  type CanonicalInventoryLevel,
  type InventoryEventPayload,
  type PurchaseOrder,
  type StockTransfer,
} from "../contract.js";

const sku = makeId<"SkuId">("sku-flour-10kg");
const locA = makeId<"LocationId">("loc-warehouse-a");
const locB = makeId<"LocationId">("loc-store-b");

function level(onHand: number, reserved = 0, revision = 1): CanonicalInventoryLevel {
  return {
    skuId: sku,
    locationId: locA,
    onHand,
    reserved,
    revision,
    updatedAt: "2026-10-05T00:00:00Z",
  };
}

describe("canonical inventory levels", () => {
  it("availability is derived, never stored", () => {
    expect(availableUnits(level(10, 3))).toBe(7);
    expect(availableUnits(level(0))).toBe(0);
  });

  it("receiving increments onHand and bumps the revision immutably", () => {
    const next = adjustOnHand(level(10), 5, "RECEIVING");
    expect(next).toMatchObject({ ok: true, value: { onHand: 15, revision: 2 } });
  });

  it("canonical stock can never go negative — reconcile instead", () => {
    const result = adjustOnHand(level(3), -4, "POS_SYNC");
    expect(result).toMatchObject({ ok: false, error: { code: "NEGATIVE_ON_HAND" } });
  });

  it("adjustment inputs must be safe integers", () => {
    expect(adjustOnHand(level(3), 1.5, "MANUAL")).toMatchObject({ ok: false });
    expect(adjustOnHand(level(3), Number.NaN, "MANUAL")).toMatchObject({ ok: false });
  });
});

describe("reservations", () => {
  it("reserves against availability and derives a new level", () => {
    const result = reserveUnits(level(10), 2, makeId<"ReservationId">("res-1"));
    expect(result).toMatchObject({
      ok: true,
      value: {
        level: { onHand: 10, reserved: 2, revision: 2 },
        reservation: { status: "OPEN", units: 2 },
      },
    });
    expect(availableUnits(result.ok ? result.value.level : level(0))).toBe(8);
  });

  it("rejects reservations beyond availability", () => {
    const result = reserveUnits(level(10, 8), 3, makeId<"ReservationId">("res-2"));
    expect(result).toMatchObject({ ok: false, error: { code: "INSUFFICIENT_AVAILABLE" } });
  });

  it("committing a reservation consumes stock exactly once", () => {
    const reserved = reserveUnits(level(10), 2, makeId<"ReservationId">("res-3"));
    if (!reserved.ok) throw new Error("unreachable");
    const committed = commitReservation(reserved.value.level, reserved.value.reservation);
    expect(committed).toMatchObject({
      ok: true,
      value: {
        level: { onHand: 8, reserved: 0, revision: 3 },
        reservation: { status: "COMMITTED" },
      },
    });
  });

  it("releasing a reservation restores availability without touching onHand", () => {
    const reserved = reserveUnits(level(10), 2, makeId<"ReservationId">("res-4"));
    if (!reserved.ok) throw new Error("unreachable");
    const released = releaseReservation(reserved.value.level, reserved.value.reservation);
    expect(released).toMatchObject({
      ok: true,
      value: { level: { onHand: 10, reserved: 0, revision: 3 }, reservation: { status: "RELEASED" } },
    });
  });

  it("double-commit is rejected (immutable lifecycle)", () => {
    const reserved = reserveUnits(level(10), 2, makeId<"ReservationId">("res-5"));
    if (!reserved.ok) throw new Error("unreachable");
    const committed = commitReservation(reserved.value.level, reserved.value.reservation);
    if (!committed.ok) throw new Error("unreachable");
    const again = commitReservation(committed.value.level, committed.value.reservation);
    expect(again).toMatchObject({ ok: false, error: { code: "RESERVATION_NOT_OPEN" } });
  });
});

describe("multi-location transfer (scenario 2)", () => {
  const transfer: StockTransfer = {
    transferId: makeId<"TransferId">("tr-1"),
    fromLocationId: locA,
    toLocationId: locB,
    lines: [{ skuId: sku, units: 6 }],
    state: "REQUESTED",
    revision: 1,
  };

  it("walks REQUESTED → DISPATCHED → RECEIVED deterministically", () => {
    expect(transferTransition("REQUESTED", "DISPATCH")).toMatchObject({ ok: true, value: "DISPATCHED" });
    expect(transferTransition("DISPATCHED", "CONFIRM_RECEIPT")).toMatchObject({ ok: true, value: "RECEIVED" });
    expect(transferTransition("REQUESTED", "CONFIRM_RECEIPT")).toMatchObject({ ok: false });
    expect(transferTransition("RECEIVED", "DISPATCH")).toMatchObject({ ok: false });
  });

  it("dispatch decrements source; receipt increments destination (deterministic pair)", () => {
    const dispatched = advanceTransfer(transfer, "DISPATCH");
    if (!dispatched.ok) throw new Error("unreachable");
    expect(dispatched.value.state).toBe("DISPATCHED");
    // Source: TRANSFER_OUT of 6 units.
    const sourceAfterDispatch = adjustOnHand(level(10), -transferUnitsFor(transfer, sku), "TRANSFER_OUT");
    expect(sourceAfterDispatch).toMatchObject({ ok: true, value: { onHand: 4 } });
    const received = advanceTransfer(dispatched.value, "CONFIRM_RECEIPT");
    if (!received.ok) throw new Error("unreachable");
    const destinationAfterReceipt = adjustOnHand(
      { ...level(0), locationId: locB },
      transferUnitsFor(transfer, sku),
      "TRANSFER_IN",
    );
    expect(destinationAfterReceipt).toMatchObject({ ok: true, value: { onHand: 6 } });
  });

  it("cancel is possible before and after dispatch, never after receipt", () => {
    expect(transferTransition("REQUESTED", "CANCEL_REQUEST")).toMatchObject({ ok: true, value: "CANCELLED" });
    expect(transferTransition("DISPATCHED", "CANCEL_IN_TRANSIT")).toMatchObject({ ok: true, value: "CANCELLED" });
    expect(transferTransition("RECEIVED", "CANCEL_IN_TRANSIT")).toMatchObject({ ok: false });
  });

  it("rejects degenerate transfers", () => {
    const sameLocation: StockTransfer = { ...transfer, toLocationId: locA };
    const zeroUnits: StockTransfer = { ...transfer, lines: [{ skuId: sku, units: 0 }] };
    expect(isValidTransfer(transfer)).toBe(true);
    expect(isValidTransfer(sameLocation)).toBe(false);
    expect(isValidTransfer(zeroUnits)).toBe(false);
  });
});

describe("supplier purchase-order receiving (scenario 5)", () => {
  const po: PurchaseOrder = {
    purchaseOrderId: makeId<"PurchaseOrderId">("po-1"),
    supplierId: makeId<"SupplierId">("sup-1"),
    destinationLocationId: locA,
    lines: [
      { skuId: sku, orderedUnits: 50, receivedUnits: 0 },
      { skuId: makeId<"SkuId">("sku-sugar-1kg"), orderedUnits: 20, receivedUnits: 0 },
    ],
    state: "CONFIRMED",
    revision: 1,
  };

  it("partial receiving moves the PO to PARTIALLY_RECEIVED", () => {
    const result = receiveAgainstPurchaseOrder(po, [{ skuId: sku, units: 30 }]);
    expect(result).toMatchObject({
      ok: true,
      value: {
        purchaseOrder: { state: "PARTIALLY_RECEIVED", lines: [{ receivedUnits: 30 }, { receivedUnits: 0 }] },
        receipt: [{ skuId: sku, units: 30 }],
      },
    });
  });

  it("full receiving completes the PO and returns the receipt for inventory", () => {
    const result = receiveAgainstPurchaseOrder(po, [
      { skuId: sku, units: 50 },
      { skuId: makeId<"SkuId">("sku-sugar-1kg"), units: 20 },
    ]);
    expect(result).toMatchObject({ ok: true, value: { purchaseOrder: { state: "RECEIVED" } } });
    if (result.ok) {
      const stock = adjustOnHand(level(0), result.value.receipt[0]?.units ?? 0, "RECEIVING");
      expect(stock).toMatchObject({ ok: true, value: { onHand: 50 } });
    }
  });

  it("over-receipt beyond tolerance is rejected, never silently absorbed", () => {
    const result = receiveAgainstPurchaseOrder(po, [{ skuId: sku, units: 60 }]);
    expect(result).toMatchObject({ ok: false, error: { code: "OVER_RECEIPT" } });
  });

  it("unknown SKUs and invalid units are coded rejections", () => {
    expect(receiveAgainstPurchaseOrder(po, [{ skuId: makeId<"SkuId">("sku-ghost"), units: 1 }])).toMatchObject({
      ok: false,
      error: { code: "UNKNOWN_LINE" },
    });
    expect(receiveAgainstPurchaseOrder(po, [{ skuId: sku, units: 0 }])).toMatchObject({
      ok: false,
      error: { code: "INVALID_UNITS" },
    });
    expect(receiveAgainstPurchaseOrder({ ...po, state: "CANCELLED" }, [{ skuId: sku, units: 1 }])).toMatchObject({
      ok: false,
      error: { code: "PO_NOT_RECEIVABLE" },
    });
  });
});

describe("inventory projection (event-sourced truth)", () => {
  it("folds inventory events into canonical levels and replays identically", () => {
    const l1 = adjustOnHand(level(0), 10, "RECEIVING");
    const l2 = l1.ok ? adjustOnHand(l1.value, -3, "POS_SYNC") : l1;
    const events = [l1, l2].filter((r) => r.ok).map((r) => r.ok && inventoryEvent(r.value));
    const folded = inventoryProjectionApply(events);
    const key = inventoryKey(sku, locA);
    const final = folded.levels.get(key);
    expect(final).toMatchObject({ onHand: 7, reserved: 0 });
    const refolded = inventoryProjectionApply(events);
    expect(refolded.levels.get(key)).toEqual(final);
  });
});

function inventoryEvent(l: CanonicalInventoryLevel): { payload: InventoryEventPayload } & Record<string, unknown> {
  return {
    eventId: makeId<"CommerceEventId">(`evt-inv-${l.revision}`),
    sequence: l.revision,
    occurredAt: "2026-10-05T00:00:00Z",
    subject: { subjectType: "INVENTORY_LEVEL", subjectId: inventoryKey(l.skuId, l.locationId) },
    kind: "INVENTORY_ADJUSTED",
    payload: {
      kind: "INVENTORY_ADJUSTED",
      skuId: l.skuId,
      locationId: l.locationId,
      units: l.onHand,
      reason: "RECEIVING",
      resultingLevel: l,
    },
  };
}

function inventoryProjectionApply(events: readonly unknown[]) {
  let state = inventoryProjection.initialState();
  for (const event of events) {
    state = inventoryProjection.apply(state, event as never);
  }
  return state;
}

describe("journal discipline across the inventory events", () => {
  it("the folded journal satisfies gapless monotonic sequence validation", () => {
    const events = [
      { ...inventoryEvent(level(10, 0, 1)) },
      { ...inventoryEvent(level(7, 0, 2)) },
    ].map((e, index) => ({ ...e, sequence: index + 1 }));
    expect(validateEventSequence(events as never)).toMatchObject({ ok: true });
  });
});
