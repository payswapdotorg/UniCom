/**
 * W2-010 — Family F07: inventory changes, partial receiving, substitutions,
 * delayed delivery, wrong item and reconciliation conflict.
 * Fixture-contract evidence level.
 *
 * Drives the REAL CommerceKernel (supply receiving, fulfillment/delivery
 * observations, count reconciliation) through the rig. Faults are the real
 * domain inputs: wrong-item receipts, ambiguous/contradictory counts,
 * sold-out reservations. The VISIBLE dimension: PO states, canonical levels,
 * reconciliation dispositions, shipment states and the storefront
 * availability view — never a silent overwrite.
 */

import { describe, expect, it } from "vitest";
import { countQuantity, makeId, type PurchaseOrder } from "@unicom/commerce";
import { availabilityViewOf, createResilienceKernel, rigMoney, USD } from "./adapters/resilience-rig";
import { scenarioById } from "./matrix/oracle";

const family = "F07";
const oracle = (suffix: string) => scenarioById(`W2-010-${family}-${suffix}`);

const SKU_A = makeId<"SkuId">("sku-f07-widget");
const SKU_B = makeId<"SkuId">("sku-f07-wrong-item");
const LOC = makeId<"LocationId">("loc-f07-warehouse");
const SUPPLIER = makeId<"SupplierId">("sup-f07");
const MERCHANT = makeId<"MerchantId">("merchant-f07");

function draftPO(poId: string, orderedUnits = 10): PurchaseOrder {
  return {
    purchaseOrderId: makeId<"PurchaseOrderId">(poId),
    supplierId: SUPPLIER,
    destinationLocationId: LOC,
    lines: [{ skuId: SKU_A, orderedUnits, receivedUnits: 0 }],
    state: "DRAFT",
    revision: 1,
  };
}

/** Open → submit → supplier-confirm (the receivable state). */
async function confirmedPO(rig: ReturnType<typeof createResilienceKernel>, poId: string, orderedUnits = 10): Promise<void> {
  await rig.exec({ type: "OPEN_PURCHASE_ORDER", purchaseOrder: draftPO(poId, orderedUnits) });
  await rig.exec({ type: "ADVANCE_PURCHASE_ORDER", purchaseOrderId: makeId<"PurchaseOrderId">(poId), trigger: "SUBMIT" });
  await rig.exec({ type: "ADVANCE_PURCHASE_ORDER", purchaseOrderId: makeId<"PurchaseOrderId">(poId), trigger: "SUPPLIER_CONFIRM" });
}

/** A paid order + open fulfillment + tendered shipment, ready for delivery observations. */
async function inTransitShipment(rig: ReturnType<typeof createResilienceKernel>): Promise<string> {
  const cartId = makeId<"CartId">("cart-f07-s03");
  await rig.exec({ type: "ADD_CART_LINE", cartId, skuId: SKU_A, quantity: countQuantity(1), unitPrice: rigMoney("5000") });
  await rig.exec({ type: "PLACE_ORDER", cartId, merchantId: MERCHANT });
  const order = rig.kernel.view().allOrders().at(-1);
  if (order === undefined) throw new Error("order missing");
  await rig.exec({
    type: "CREATE_PAYMENT_INTENT",
    request: { amount: rigMoney("5000"), reference: { kind: "ORDER", orderId: order.orderId }, method: { methodKind: "CARD", tokenRef: "tok-f07" } },
  });
  const payment = rig.kernel.view().allPaymentIntents().at(-1);
  if (payment === undefined) throw new Error("payment missing");
  await rig.exec({ type: "CAPTURE_PAYMENT", paymentId: payment.paymentId });
  await rig.exec({ type: "OPEN_FULFILLMENT", orderId: order.orderId, originLocationId: LOC });
  const fulfillment = rig.kernel.view().fulfillmentForOrder(order.orderId);
  if (fulfillment === undefined) throw new Error("fulfillment missing");
  await rig.exec({ type: "ADVANCE_FULFILLMENT_ORDER", fulfillmentOrderId: fulfillment.fulfillmentOrderId, trigger: "PACK" });
  await rig.exec({ type: "ADVANCE_FULFILLMENT_ORDER", fulfillmentOrderId: fulfillment.fulfillmentOrderId, trigger: "TENDER" });
  const shipmentId = rig.kernel.view().shipmentIdForFulfillment(fulfillment.fulfillmentOrderId);
  if (shipmentId === undefined) throw new Error("shipment missing");
  return shipmentId;
}

describe("W2-010 F07 — inventory changes / receiving / reconciliation (fixture-contract)", () => {
  it("F07-S01: partial receiving (6 of 10) — PO PARTIALLY_RECEIVED, on-hand exact, remainder outstanding", async () => {
    expect(oracle("S01").expectedResultClass).toBe("expected-success");
    const rig = createResilienceKernel();
    await confirmedPO(rig, "po-f07-s01", 10);
    const received = await rig.exec({
      type: "RECEIVE_PURCHASE_ORDER",
      purchaseOrderId: makeId<"PurchaseOrderId">("po-f07-s01"),
      lines: [{ skuId: SKU_A, units: 6 }],
    });
    expect(received.status).toBe("EXECUTED");
    // VISIBLE: the PO is exactly partial; the level is exactly what landed.
    const po = rig.kernel.view().purchaseOrder("po-f07-s01");
    expect(po?.state).toBe("PARTIALLY_RECEIVED");
    expect(po?.lines[0]).toMatchObject({ orderedUnits: 10, receivedUnits: 6 });
    expect(rig.kernel.view().level(SKU_A, LOC)).toMatchObject({ onHand: 6, reserved: 0 });
    // The storefront projection renders from the canonical level — the band
    // (adapter definition: <=5 low-stock, >5 in-stock) puts 6 honestly in
    // stock; the exact-count note proves on-hand is the RECEIVED 6, never the
    // ordered 10. (Expectation corrected from the draft's "low-stock": the
    // frozen oracle requires "availability reflects the real count", which the
    // note + in-stock band satisfy; disclosed in the completion report.)
    expect(availabilityViewOf(rig.kernel.view().level(SKU_A, LOC)).displayStatus).toBe("in-stock");
    expect(availabilityViewOf(rig.kernel.view().level(SKU_A, LOC)).note).toBe("6 units available");
  });

  it("F07-S02: wrong item delivered — deterministic UNKNOWN_LINE rejection, zero effects, no silent substitution", async () => {
    expect(oracle("S02").expectedResultClass).toBe("expected-block");
    const rig = createResilienceKernel();
    await confirmedPO(rig, "po-f07-s02", 10);
    const journalBefore = rig.events();
    // The delivery actually contains SKU_B (the wrong item).
    const wrongItem = await rig.exec({
      type: "RECEIVE_PURCHASE_ORDER",
      purchaseOrderId: makeId<"PurchaseOrderId">("po-f07-s02"),
      lines: [{ skuId: SKU_B, units: 10 }],
    });
    expect(wrongItem.status).toBe("REJECTED");
    if (wrongItem.status === "REJECTED") {
      expect(wrongItem.reason.detail).toContain("UNKNOWN_LINE");
    }
    // VISIBLE: the discrepancy is explicit — NEITHER sku's stock moved (no
    // substitution into SKU_B, no pretend-receipt of SKU_A), zero events.
    expect(rig.events()).toBe(journalBefore);
    expect(rig.kernel.view().level(SKU_A, LOC)).toBeUndefined();
    expect(rig.kernel.view().level(SKU_B, LOC)).toBeUndefined();
    const po = rig.kernel.view().purchaseOrder("po-f07-s02");
    expect(po?.state).toBe("CONFIRMED");
    expect(po?.lines[0]?.receivedUnits).toBe(0);
    // The awaiting goods render as unknown-availability, never out-of-stock.
    expect(availabilityViewOf(rig.kernel.view().level(SKU_A, LOC)).displayStatus).toBe("unknown");
  });

  it("F07-S03: delayed delivery — ATTEMPTED is not a failure; the late DELIVERED scan is journaled with true timestamps", async () => {
    expect(oracle("S03").expectedResultClass).toBe("expected-success");
    const rig = createResilienceKernel();
    const shipmentId = await inTransitShipment(rig);
    const journalBeforeAttempt = rig.events();
    // The carrier attempts delivery but the customer is out — ATTEMPTED.
    const attempted = await rig.exec({
      type: "APPLY_DELIVERY_OBSERVATION",
      observation: {
        shipmentId: makeId<"ShipmentId">(shipmentId),
        observedAt: "2026-10-11T09:00:00Z",
        resolution: { resolved: "OBSERVED", value: "ATTEMPTED", carrierNativeStatus: "CARD_LEFT" },
      },
    });
    expect(attempted.status).toBe("EXECUTED");
    // VISIBLE: ATTEMPTED changes NOTHING canonically — the shipment stays
    // IN_TRANSIT (preserved, not failed), no journal event was fabricated.
    expect(rig.kernel.view().shipment(shipmentId)?.state).toBe("IN_TRANSIT");
    expect(rig.events()).toBe(journalBeforeAttempt);
    // The late delivery scan arrives two days later with its true timestamp.
    const lateAt = "2026-10-13T15:30:00Z";
    const delivered = await rig.exec({
      type: "APPLY_DELIVERY_OBSERVATION",
      observation: {
        shipmentId: makeId<"ShipmentId">(shipmentId),
        observedAt: lateAt,
        resolution: { resolved: "OBSERVED", value: "DELIVERED", carrierNativeStatus: "DELIVERED_PHOTO" },
      },
    });
    expect(delivered.status).toBe("EXECUTED");
    expect(rig.kernel.view().shipment(shipmentId)?.state).toBe("DELIVERED");
    // The delivery fact is journaled AFTER the attempt (arrival order), and
    // the observation's true late timestamp is the recorded evidence input.
    expect(rig.events()).toBeGreaterThan(journalBeforeAttempt);
    const shipmentEvents = rig.kernel.events().filter((event) => event.kind === "SHIPMENT_STATE_CHANGED");
    const lateEvent = shipmentEvents.at(-1);
    expect(lateEvent?.payload).toMatchObject({ kind: "SHIPMENT_STATE_CHANGED", shipment: { state: "DELIVERED" } });
    // The order reached FULFILLED through the deterministic confirmation.
    const order = rig.kernel.view().allOrders().at(-1);
    expect(order?.state).toBe("FULFILLED");
    expect(order?.fulfillmentStatus).toBe("FULFILLED");
  });

  it("F07-S04: physical count 3 vs system 10 → policy-coded DISCREPANCY_HOLD — canonical truth never silently overwritten", async () => {
    expect(oracle("S04").expectedResultClass).toBe("expected-block");
    const rig = createResilienceKernel();
    await rig.exec({ type: "RECEIVE_STOCK", skuId: SKU_A, locationId: LOC, units: 10, reason: "PURCHASE_ORDER" });
    const canonicalBefore = rig.kernel.view().level(SKU_A, LOC);
    // The device counted 3; the system holds 10 (tolerance 0).
    const outcome = await rig.exec({
      type: "RECONCILE_COUNT_OBSERVATION",
      observation: {
        observationId: makeId<"ObservationId">("obs-f07-s04"),
        kind: "CYCLE_COUNT",
        skuId: SKU_A,
        locationId: LOC,
        observedAt: "2026-10-11T08:00:00Z",
        source: { sourceType: "EDGE_DEVICE", sourceRef: "edge-f07" },
        resolution: { resolved: "OBSERVED", value: 3 },
      },
      policy: { toleranceUnits: 0, promoteWithinTolerance: true },
    });
    expect(outcome.status).toBe("EXECUTED"); // the reconciliation FACT is recorded
    // VISIBLE: the disposition is a policy-coded hold with the variance —
    // the canonical level is untouched (no overwrite, no average).
    const records = rig.kernel.view().allReconciliationRecords();
    expect(records.at(-1)).toMatchObject({ disposition: "DISCREPANCY_HOLD", varianceUnits: -7 });
    expect(rig.kernel.view().level(SKU_A, LOC)).toEqual(canonicalBefore);
    expect(rig.kernel.view().level(SKU_A, LOC)?.onHand).toBe(10);
    // The availability view still renders the canonical 10 — honestly
    // operational, never the disputed 3.
    expect(availabilityViewOf(rig.kernel.view().level(SKU_A, LOC)).displayStatus).toBe("in-stock");
  });

  it("F07-S05: UNKNOWN count folds NOT_PROMOTED_UNKNOWN — on-hand unchanged, never zeroed", async () => {
    expect(oracle("S05").expectedResultClass).toBe("expected-block");
    const rig = createResilienceKernel();
    await rig.exec({ type: "RECEIVE_STOCK", skuId: SKU_A, locationId: LOC, units: 10, reason: "PURCHASE_ORDER" });
    const canonicalBefore = rig.kernel.view().level(SKU_A, LOC);
    const outcome = await rig.exec({
      type: "RECONCILE_COUNT_OBSERVATION",
      observation: {
        observationId: makeId<"ObservationId">("obs-f07-s05"),
        kind: "CYCLE_COUNT",
        skuId: SKU_A,
        locationId: LOC,
        observedAt: "2026-10-11T09:00:00Z",
        source: { sourceType: "EDGE_DEVICE", sourceRef: "edge-f07" },
        resolution: { resolved: "UNKNOWN", reason: "SENSOR_UNREADABLE" },
      },
      policy: { toleranceUnits: 0, promoteWithinTolerance: true },
    });
    expect(outcome.status).toBe("EXECUTED");
    // VISIBLE: UNKNOWN is preserved as NOT_PROMOTED_UNKNOWN with its reason;
    // the level is unchanged — never zeroed, never failed.
    expect(rig.kernel.view().allReconciliationRecords().at(-1)).toMatchObject({
      disposition: "NOT_PROMOTED_UNKNOWN",
    });
    expect(rig.kernel.view().level(SKU_A, LOC)).toEqual(canonicalBefore);
    expect(availabilityViewOf(rig.kernel.view().level(SKU_A, LOC)).displayStatus).toBe("in-stock");
    expect(availabilityViewOf(rig.kernel.view().level(SKU_A, LOC)).displayStatus).not.toBe("out-of-stock");
  });

  it("F07-S06: sold out before the order — availability out-of-stock and a deterministic INSUFFICIENT_INVENTORY refusal", async () => {
    expect(oracle("S06").expectedResultClass).toBe("expected-block");
    const rig = createResilienceKernel();
    // Stock arrives, then sells out through a POS sync (canonical 0 left).
    await rig.exec({ type: "RECEIVE_STOCK", skuId: SKU_A, locationId: LOC, units: 4, reason: "PURCHASE_ORDER" });
    await rig.exec({
      type: "RECONCILE_POS_SYNC",
      observation: {
        observationId: makeId<"ObservationId">("obs-f07-s06-pos"),
        kind: "POS_SYNC",
        skuId: SKU_A,
        locationId: LOC,
        observedAt: "2026-10-11T10:00:00Z",
        source: { sourceType: "POS", sourceRef: "pos-f07" },
        resolution: { resolved: "OBSERVED", value: { unitsSold: 4 } },
      },
    });
    // VISIBLE: the storefront renders out-of-stock from canonical truth.
    const availability = availabilityViewOf(rig.kernel.view().level(SKU_A, LOC));
    expect(availability.displayStatus).toBe("out-of-stock");
    expect(availability.note).toBe("system count is zero");
    // The order attempt (reservation) is refused deterministically with the
    // exact shortfall — zero journal effects.
    const journalBefore = rig.events();
    const reservationId = makeId<"InventoryReservationId">("res-f07-s06");
    const refused = await rig.exec({
      type: "RESERVE_INVENTORY",
      reservation: {
        reservationId,
        skuId: SKU_A,
        locationId: LOC,
        units: 2,
        status: "OPEN",
        revision: 1,
      },
    });
    expect(refused.status).toBe("REJECTED");
    if (refused.status === "REJECTED") {
      expect(refused.reason.code).toBe("INSUFFICIENT_INVENTORY");
      expect(refused.reason.detail).toContain("requested 2, available 0");
    }
    expect(rig.events()).toBe(journalBefore);
    expect(rig.kernel.view().level(SKU_A, LOC)?.onHand).toBe(0);
  });
});

void USD;
