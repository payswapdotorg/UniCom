/**
 * W1-003 read-model unit coverage: the seven named demand-side projections
 * (catalog / inventory / order / transfer / receiving / returns /
 * reconciliation) folded from REAL kernel journals, plus the typed, versioned
 * commerce-facts query interface (facts only — no opportunity semantics).
 */
import { describe, expect, it } from "vitest";
import {
  COMMERCE_FACTS_INTERFACE_ID,
  COMMERCE_FACTS_INTERFACE_VERSION,
  CommerceKernel,
  CommerceTwin,
  countQuantity,
  currency,
  makeId,
  measuredQuantity,
  money,
  outstandingUnitsFor,
  unitOfMeasure,
  type AnyCommerceEvent,
} from "../../contract.js";
import { ScriptedPaymentDouble } from "../runtime/support/payment-double.js";
import { env, mustExecute } from "../runtime/support/envelopes.js";

const usd = currency("USD");
const sku = makeId<"SkuId">("sku-tote");
const bananas = makeId<"SkuId">("sku-bananas");
const loc = makeId<"LocationId">("loc-warehouse-1");
const locB = makeId<"LocationId">("loc-store-b");

async function supermarketJournal(): Promise<readonly AnyCommerceEvent[]> {
  const kernel = new CommerceKernel({ paymentBoundary: new ScriptedPaymentDouble() });
  await mustExecute(kernel, env({ type: "RECEIVE_STOCK", skuId: sku, locationId: loc, units: 50, reason: "RECEIVING" }));
  await mustExecute(kernel, env({ type: "RECEIVE_STOCK", skuId: bananas, locationId: loc, units: 30, reason: "RECEIVING" }));
  await mustExecute(kernel, env({
    type: "ADD_CART_LINE",
    cartId: makeId<"CartId">("cart-1"),
    skuId: sku,
    quantity: countQuantity(2),
    unitPrice: money("1999", usd),
  }));
  await mustExecute(kernel, env({
    type: "ADD_CART_LINE",
    cartId: makeId<"CartId">("cart-1"),
    skuId: bananas,
    quantity: measuredQuantity("0.542", unitOfMeasure("KG")),
    unitPrice: money("249", usd),
  }));
  await mustExecute(kernel, env({ type: "OPEN_CHECKOUT", cartId: makeId<"CartId">("cart-1") }));
  await mustExecute(kernel, env({ type: "PLACE_ORDER", cartId: makeId<"CartId">("cart-1"), merchantId: makeId<"MerchantId">("merchant-1") }));
  const orderId = kernel.view().allOrders()[0]?.orderId as string;
  await mustExecute(kernel, env({
    type: "CREATE_PAYMENT_INTENT",
    request: {
      amount: money("4133", usd),
      reference: { kind: "ORDER", orderId: makeId<"OrderId">(orderId) },
      method: { methodKind: "CARD", tokenRef: "tok-1" },
    },
  }));
  const paymentId = kernel.view().allPaymentIntents()[0]?.paymentId as string;
  await mustExecute(kernel, env({ type: "CAPTURE_PAYMENT", paymentId: makeId<"PaymentId">(paymentId) }));
  await mustExecute(kernel, env({ type: "OPEN_FULFILLMENT", orderId: makeId<"OrderId">(orderId), originLocationId: loc }));
  const fulfillmentId = kernel.view().fulfillmentForOrder(orderId)?.fulfillmentOrderId as string;
  await mustExecute(kernel, env({ type: "ADVANCE_FULFILLMENT_ORDER", fulfillmentOrderId: makeId<"FulfillmentOrderId">(fulfillmentId), trigger: "PACK" }));
  await mustExecute(kernel, env({ type: "ADVANCE_FULFILLMENT_ORDER", fulfillmentOrderId: makeId<"FulfillmentOrderId">(fulfillmentId), trigger: "TENDER" }));
  await mustExecute(kernel, env({ type: "ADVANCE_FULFILLMENT_ORDER", fulfillmentOrderId: makeId<"FulfillmentOrderId">(fulfillmentId), trigger: "CONFIRM_DELIVERY" }));
  await mustExecute(kernel, env({
    type: "OPEN_TRANSFER",
    transfer: { transferId: makeId<"TransferId">("tr-1"), fromLocationId: loc, toLocationId: locB, lines: [{ skuId: sku, units: 5 }], state: "REQUESTED", revision: 1 },
  }));
  await mustExecute(kernel, env({ type: "ADVANCE_TRANSFER", transferId: makeId<"TransferId">("tr-1"), trigger: "DISPATCH" }));
  await mustExecute(kernel, env({
    type: "OPEN_PURCHASE_ORDER",
    purchaseOrder: {
      purchaseOrderId: makeId<"PurchaseOrderId">("po-1"),
      supplierId: makeId<"SupplierId">("sup-1"),
      destinationLocationId: locB,
      lines: [{ skuId: bananas, orderedUnits: 20, receivedUnits: 0 }],
      state: "DRAFT",
      revision: 1,
    },
  }));
  await mustExecute(kernel, env({ type: "ADVANCE_PURCHASE_ORDER", purchaseOrderId: makeId<"PurchaseOrderId">("po-1"), trigger: "SUBMIT" }));
  await mustExecute(kernel, env({ type: "ADVANCE_PURCHASE_ORDER", purchaseOrderId: makeId<"PurchaseOrderId">("po-1"), trigger: "SUPPLIER_CONFIRM" }));
  await mustExecute(kernel, env({
    type: "RECEIVE_PURCHASE_ORDER",
    purchaseOrderId: makeId<"PurchaseOrderId">("po-1"),
    lines: [{ skuId: bananas, units: 12 }],
  }));
  await mustExecute(kernel, env({ type: "REQUEST_RETURN", orderId: makeId<"OrderId">(orderId) }));
  const returnId = kernel.view().allReturns()[0]?.returnId as string;
  await mustExecute(kernel, env({ type: "ADVANCE_RETURN", returnId: makeId<"ReturnId">(returnId), trigger: "AUTHORIZE" }));
  await mustExecute(kernel, env({ type: "REFUND_PAYMENT", paymentId: makeId<"PaymentId">(paymentId), amount: money("500", usd) }));
  await mustExecute(kernel, env({
    type: "RECONCILE_COUNT_OBSERVATION",
    observation: {
      observationId: makeId<"ObservationId">("obs-1"),
      kind: "CYCLE_COUNT",
      skuId: bananas,
      locationId: loc,
      observedAt: "2026-10-05T00:00:00Z",
      source: { sourceType: "SCANNER", sourceRef: "scanner-1" },
      resolution: { resolved: "OBSERVED", value: 28 },
    },
    policy: { toleranceUnits: 2, promoteWithinTolerance: true },
  }));
  await mustExecute(kernel, env({
    type: "RECONCILE_COUNT_OBSERVATION",
    observation: {
      observationId: makeId<"ObservationId">("obs-2"),
      kind: "CYCLE_COUNT",
      skuId: sku,
      locationId: loc,
      observedAt: "2026-10-05T00:00:00Z",
      source: { sourceType: "SCANNER", sourceRef: "scanner-1" },
      resolution: { resolved: "UNKNOWN", reason: "AMBIGUOUS" },
    },
    policy: { toleranceUnits: 2, promoteWithinTolerance: true },
  }));
  return kernel.events();
}

describe("W1-003 demand-side read models (folded from a real kernel journal)", () => {
  it("inventory projection: levels, availability and reservations", async () => {
    const twin = CommerceTwin.fromEvents(await supermarketJournal());
    const level = twin.inventory.levels.get(`${sku}|${loc}`);
    expect(level?.onHand).toBe(45); // 50 received - 5 transferred out
    expect(twin.facts().inventory.availableUnits(sku, loc)).toBe(45);
    expect(twin.inventory.levels.get(`${bananas}|${loc}`)?.onHand).toBe(28); // 30 → observed 28, promoted (within tolerance 2)
    expect(twin.inventory.levels.get(`${bananas}|${locB}`)?.onHand).toBe(12); // PO receiving
    expect(twin.inventory.levels.size).toBe(3); // sku|loc, bananas|loc, bananas|locB (transfer dispatched, not yet received)
  });

  it("order projection: snapshots, states and fulfillment linkage", async () => {
    const twin = CommerceTwin.fromEvents(await supermarketJournal());
    const orderId = twin.facts().orders.orders()[0]?.orderId as string;
    const order = twin.orderModel.orders.get(orderId);
    expect(order?.state).toBe("FULFILLED"); // delivered; ORDER_COMPLETED not yet triggered
    expect(order?.paymentStatus).toBe("PARTIALLY_REFUNDED");
    expect(order?.fulfillmentStatus).toBe("FULFILLED");
    expect(order?.lines).toHaveLength(2);
    expect(order?.totals.grandTotal.amountMinor).toBe("4133");
    expect(twin.facts().orders.ordersInState("FULFILLED")).toHaveLength(1);
    expect(twin.facts().orders.fulfillmentForOrder(orderId)?.orderId).toBe(orderId);
  });

  it("transfer projection: lifecycle state preserved", async () => {
    const twin = CommerceTwin.fromEvents(await supermarketJournal());
    const transfer = twin.transferModel.transfers.get("tr-1");
    expect(transfer?.state).toBe("DISPATCHED");
    expect(transfer?.lines).toEqual([{ skuId: sku, units: 5 }]);
  });

  it("receiving projection: purchase orders + receipts as facts", async () => {
    const twin = CommerceTwin.fromEvents(await supermarketJournal());
    const po = twin.receiving.purchaseOrders.get("po-1");
    expect(po?.state).toBe("PARTIALLY_RECEIVED");
    expect(po?.lines[0]?.receivedUnits).toBe(12);
    expect(twin.receiving.receipts).toHaveLength(1);
    expect(twin.receiving.receipts[0]?.lines).toEqual([{ skuId: bananas, units: 12 }]);
    expect(outstandingUnitsFor(po as never)).toEqual([{ skuId: bananas, outstanding: 8 }]);
  });

  it("returns projection: authorizations and refunds preserved", async () => {
    const twin = CommerceTwin.fromEvents(await supermarketJournal());
    const returnId = twin.facts().returnsAndRefunds.returns()[0]?.returnId as string;
    const refundId = twin.facts().returnsAndRefunds.refunds()[0]?.refundId as string;
    expect(twin.returnModel.returns.get(returnId)?.state).toBe("AUTHORIZED");
    expect(twin.returnModel.refunds.get(refundId)?.amount.amountMinor).toBe("500");
    // Refund against a partially-refunded intent: the double resolves the
    // intent to PARTIALLY_REFUNDED → refund record COMPLETED (domain law).
    expect(twin.returnModel.refunds.get(refundId)?.state).toBe("COMPLETED");
  });

  it("reconciliation projection: dispositions and counters", async () => {
    const twin = CommerceTwin.fromEvents(await supermarketJournal());
    expect(twin.reconciliation.records).toHaveLength(2);
    expect(twin.reconciliation.records.map((record) => record.disposition).sort()).toEqual(["NOT_PROMOTED_UNKNOWN", "PROMOTED"]);
    expect(twin.reconciliation.counters.get(`${bananas}|${loc}`)).toMatchObject({ promoted: 1 });
    expect(twin.reconciliation.counters.get(`${sku}|${loc}`)).toMatchObject({ notPromotedUnknown: 1 });
    expect(twin.facts().reconciliation.recordsForLevel(bananas, loc)).toHaveLength(1);
  });

  it("catalog projection: SKU facts (locations, references, exact counting)", async () => {
    const twin = CommerceTwin.fromEvents(await supermarketJournal());
    const fact = twin.catalog.skus.get(bananas);
    expect(fact?.locations).toEqual([locB, loc].sort()); // sorted lexicographically
    expect(fact?.orderLineReferences).toBe(1);
    expect(fact?.receiptLineReferences).toBe(1);
    expect(fact?.returnLineReferences).toBe(1);
    expect(fact?.purchaseOrderLineReferences).toBe(1);
    const tote = twin.catalog.skus.get(sku);
    expect(tote?.locations).toEqual([locB, loc].sort()); // transfer endpoints seen
    expect(tote?.orderLineReferences).toBe(1);
    expect(tote?.transferLineReferences).toBe(1);
    expect(tote?.fulfillmentLineReferences).toBe(1);
    expect(twin.facts().catalog.skuFacts()).toHaveLength(2);
    expect(twin.skuFact(sku)?.firstSeenAt).toBe("2026-01-01T00:00:00Z");
  });

  it("facts interface is typed and versioned (commerce-facts v1)", async () => {
    const twin = CommerceTwin.fromEvents(await supermarketJournal());
    const facts = twin.facts();
    expect(facts.interfaceId).toBe(COMMERCE_FACTS_INTERFACE_ID);
    expect(facts.version).toBe(COMMERCE_FACTS_INTERFACE_VERSION);
    // Facts only: queries return domain values, never opportunity semantics.
    expect(facts.orders.orders()).toHaveLength(1);
    expect(facts.payments.intents()).toHaveLength(1);
    expect(facts.payments.refunds()).toHaveLength(1);
    expect(facts.supply.transfers()).toHaveLength(1);
    expect(facts.supply.purchaseOrders()).toHaveLength(1);
    expect(facts.returnsAndRefunds.returns()).toHaveLength(1);
    expect(facts.reconciliation.records()).toHaveLength(2);
    expect(facts.catalog.skuFacts()).toHaveLength(2);
    expect(facts.circular.subscriptions()).toHaveLength(0);
    // UNKNOWN tri-state fact preserved through the facts query.
    expect(facts.inventory.countObservation(sku, loc)).toEqual({ resolved: "UNKNOWN" });
    expect(facts.inventory.countObservation(bananas, loc)).toEqual({ resolved: "OBSERVED" });
  });
});
