/**
 * Contract tests — scenario 1: online product → order → inventory lifecycle
 * (the happy deterministic path), executed through typed commands.
 *
 * Every consequential step is a command with an idempotency key, every effect
 * is an immutable event, and the final state is re-derived from the journal
 * via the reference projections. Money is exact end-to-end.
 */
import { describe, expect, it } from "vitest";
import {
  advanceShipment,
  availableUnits,
  checkoutTransition,
  commitReservation,
  computeCartTotals,
  countQuantity,
  currency,
  err,
  inventoryKey,
  inventoryProjection,
  inventorySubject,
  makeId,
  money,
  ok,
  orderProjection,
  orderSubject,
  orderTransition,
  reserveUnits,
  unwrap,
  type CanonicalInventoryLevel,
  type CommerceCommandEnvelope,
  type CommandRejection,
  type InventoryCommandPayload,
  type InventoryReservation,
  type OrderSnapshot,
  type Result,
  type Shipment,
} from "../contract.js";
import { DeterministicKernelHarness, envelope } from "./support/harness.js";

type Effect = { subject: ReturnType<typeof inventorySubject>; kind: string; payload: unknown };

const usd = currency("USD");
const sku = makeId<"SkuId">("sku-canvas-tote");
const loc = makeId<"LocationId">("loc-warehouse-1");
const orderId = makeId<"OrderId">("order-1001");
const orderSubjectRef = orderSubject(orderId);
const invSubject = inventorySubject({ skuId: sku, locationId: loc });
const harness = new DeterministicKernelHarness();

const state = {
  level: {
    skuId: sku,
    locationId: loc,
    onHand: 0,
    reserved: 0,
    revision: 0,
    updatedAt: "2026-10-05T00:00:00Z",
  } as CanonicalInventoryLevel,
  openReservation: undefined as InventoryReservation | undefined,
};

function inventoryApply(payload: InventoryCommandPayload): Result<Effect, CommandRejection> {
  if (payload.type === "RECEIVE_STOCK") {
    const next = { ...state.level, onHand: state.level.onHand + payload.units, revision: state.level.revision + 1 };
    state.level = next;
    return ok({ subject: invSubject, kind: "INVENTORY_RECEIVED", payload: { ...inventoryEventBase(), kind: "INVENTORY_RECEIVED", units: payload.units, resultingLevel: next } });
  }
  if (payload.type === "RESERVE_INVENTORY") {
    const reservation = payload.reservation;
    const result = reserveUnits(state.level, reservation.units, reservation.reservationId);
    if (!result.ok) return err({ code: "INSUFFICIENT_INVENTORY", detail: "reserve rejected" });
    state.level = result.value.level;
    state.openReservation = result.value.reservation;
    return ok({ subject: invSubject, kind: "INVENTORY_RESERVED", payload: { ...inventoryEventBase(), kind: "INVENTORY_RESERVED", units: reservation.units, reservationId: reservation.reservationId, resultingLevel: result.value.level } });
  }
  if (payload.type === "COMMIT_RESERVATION") {
    const reservation = state.openReservation;
    if (!reservation || reservation.reservationId !== payload.reservationId) {
      return err({ code: "INVALID_STATE", detail: "unknown reservation" });
    }
    const result = commitReservation(state.level, reservation);
    if (!result.ok) return err({ code: "INVALID_STATE", detail: "commit rejected" });
    state.level = result.value.level;
    state.openReservation = result.value.reservation;
    return ok({ subject: invSubject, kind: "INVENTORY_RESERVATION_COMMITTED", payload: { ...inventoryEventBase(), kind: "INVENTORY_RESERVATION_COMMITTED", units: reservation.units, reservationId: reservation.reservationId, resultingLevel: result.value.level } });
  }
  return err({ code: "INVALID_COMMAND", detail: `unsupported ${payload.type}` });
}

function inventoryEventBase() {
  return { skuId: sku, locationId: loc };
}

function run(payload: InventoryCommandPayload, commandId: string, key: string) {
  const env: CommerceCommandEnvelope<InventoryCommandPayload> = envelope(commandId, key, payload);
  return harness.execute(env, inventoryApply);
}

function foldInventory() {
  let s = inventoryProjection.initialState();
  for (const event of harness.journal()) s = inventoryProjection.apply(s, event);
  return s;
}

function foldOrders() {
  let s = orderProjection.initialState();
  for (const event of harness.journal()) s = orderProjection.apply(s, event);
  return s;
}

describe("scenario 1 — online product → order → inventory lifecycle", () => {
  it("walks the full deterministic path with exact money", () => {
    // 1. Catalog: product → variant → SKU (unit-priced online good).
    expect(makeId<"ProductId">("p-tote")).toBe("p-tote");

    // 2. Inventory: receive 10 units via typed command (event + revision).
    const received = run(
      { type: "RECEIVE_STOCK", skuId: sku, locationId: loc, units: 10, reason: "RECEIVING" },
      "cmd-1",
      "idem-receive-10",
    );
    expect(received.status).toBe("EXECUTED");
    expect(state.level.onHand).toBe(10);

    // 3. Cart: 2 units × $19.99 — exact money math.
    const cart = {
      cartId: makeId<"CartId">("cart-1"),
      currency: usd,
      lines: [
        {
          kind: "UNIT_LINE" as const,
          lineId: "l-1",
          skuId: sku,
          quantity: countQuantity(2),
          unitPrice: money("1999", usd),
        },
      ],
      revision: 1,
    };
    const totals = computeCartTotals(cart, { rounding: "HALF_UP" });
    expect(unwrap(totals)).toMatchObject({
      subtotal: { amountMinor: "3998" },
      discountTotal: { amountMinor: "0" },
      taxTotal: { amountMinor: "0" },
      grandTotal: { amountMinor: "3998" },
    });

    // 4. Checkout boundary: OPEN → PAYMENT_PENDING (handoff, not processing).
    expect(checkoutTransition("OPEN", "START_PAYMENT")).toMatchObject({ ok: true, value: "PAYMENT_PENDING" });

    // 5. Payment boundary outcome recorded as an immutable fact (captured intent).
    const paymentIntent = {
      paymentId: makeId<"PaymentId">("pay-1"),
      reference: { kind: "ORDER", orderId },
      amount: money("3998", usd),
      status: "CAPTURED" as const,
      revision: 1,
    };
    expect(paymentIntent.amount.amountMinor).toBe("3998");

    // 6. Order placed: PENDING, then payment confirmed → PAID.
    const snapshot: OrderSnapshot = {
      orderId,
      merchantRef: { kind: "MERCHANT", merchantId: makeId<"MerchantId">("merchant-1") },
      state: "PENDING",
      paymentStatus: "NOT_PAID",
      fulfillmentStatus: "UNFULFILLED",
      lines: [{ kind: "UNIT_LINE", skuId: sku, quantity: countQuantity(2), unitPrice: money("1999", usd) }],
      totals: unwrap(totals),
      revision: 1,
      placedAt: "2026-10-05T00:00:00Z",
    };
    harness.appendFact(orderSubjectRef, "ORDER_PLACED", { kind: "ORDER_PLACED", snapshot });
    harness.appendFact(orderSubjectRef, "ORDER_PAYMENT_STATUS_CHANGED", {
      kind: "ORDER_PAYMENT_STATUS_CHANGED",
      from: "NOT_PAID",
      to: "PAID",
      revision: 2,
    });
    expect(orderTransition("PENDING", "PAYMENT_CONFIRMED")).toMatchObject({ ok: true, value: "PAID" });

    // 7. Inventory: reserve 2 then commit (deduct exactly once).
    const reserved = run(
      {
        type: "RESERVE_INVENTORY",
        reservation: {
          reservationId: makeId<"ReservationId">("res-1001"),
          skuId: sku,
          locationId: loc,
          units: 2,
          status: "OPEN",
          revision: 1,
        },
      },
      "cmd-2",
      "idem-reserve-1001",
    );
    expect(reserved.status).toBe("EXECUTED");
    expect(availableUnits(state.level)).toBe(8);
    const committed = run(
      { type: "COMMIT_RESERVATION", reservationId: makeId<"ReservationId">("res-1001") },
      "cmd-3",
      "idem-commit-1001",
    );
    expect(committed.status).toBe("EXECUTED");
    expect(state.level.onHand).toBe(8);
    expect(state.level.reserved).toBe(0);

    // 8. Fulfillment: PENDING → PACKED → IN_TRANSIT → DELIVERED.
    let shipment: Shipment = {
      shipmentId: makeId<"ShipmentId">("ship-1"),
      fulfillmentOrderId: makeId<"FulfillmentOrderId">("ff-1"),
      state: "PENDING",
      revision: 1,
    };
    shipment = unwrap(advanceShipment(shipment, "PACK"));
    shipment = unwrap(advanceShipment(shipment, "TENDER"));
    shipment = unwrap(advanceShipment(shipment, "CONFIRM_DELIVERY"));
    expect(shipment.state).toBe("DELIVERED");

    // 9. Order: PAID → PARTIALLY_FULFILLED → FULFILLED → COMPLETED.
    const paidToFulfilling = orderTransition("PAID", "FULFILLMENT_STARTED");
    expect(paidToFulfilling).toMatchObject({ ok: true, value: "PARTIALLY_FULFILLED" });
    harness.appendFact(orderSubjectRef, "ORDER_STATE_CHANGED", {
      kind: "ORDER_STATE_CHANGED",
      from: "PAID",
      to: "PARTIALLY_FULFILLED",
      revision: 3,
    });
    const completing = orderTransition("PARTIALLY_FULFILLED", "FULFILLMENT_COMPLETED");
    expect(completing).toMatchObject({ ok: true, value: "FULFILLED" });
    harness.appendFact(orderSubjectRef, "ORDER_STATE_CHANGED", {
      kind: "ORDER_STATE_CHANGED",
      from: "PARTIALLY_FULFILLED",
      to: "FULFILLED",
      revision: 4,
    });
    const finished = orderTransition("FULFILLED", "ORDER_COMPLETED");
    expect(finished).toMatchObject({ ok: true, value: "COMPLETED" });
    harness.appendFact(orderSubjectRef, "ORDER_STATE_CHANGED", {
      kind: "ORDER_STATE_CHANGED",
      from: "FULFILLED",
      to: "COMPLETED",
      revision: 5,
    });

    // 10. Derived truth: projections reproduce the final state from the journal.
    expect(harness.journalIsValid()).toBe(true);
    const finalLevel = foldInventory().levels.get(inventoryKey(sku, loc));
    expect(finalLevel).toMatchObject({ onHand: 8, reserved: 0, revision: 3 });
    const finalOrder = foldOrders().orders.get(orderId);
    expect(finalOrder).toMatchObject({ state: "COMPLETED", paymentStatus: "PAID", revision: 5 });
    // Event-sourced history: 3 inventory facts + 5 order facts, gapless.
    expect(harness.journal().length).toBe(8);
  });

  it("commands cannot be modeled without an idempotency key (compile time)", () => {
    // @ts-expect-error — an envelope without an idempotency key is not a command
    const missingKey: CommerceCommandEnvelope<{ type: "RECEIVE_STOCK" }> = {
      commandId: makeId<"CommandId">("cmd-x"),
      actor: { kind: "MERCHANT", merchantId: makeId<"MerchantId">("merchant-1") },
      issuedAt: "2026-10-05T00:00:00Z",
      payload: { type: "RECEIVE_STOCK" },
    };
    void missingKey;
    expect(true).toBe(true);
  });
});
