/**
 * W1-002 acceptance scenario 2: full state reconstruction from event replay
 * yields IDENTICAL authoritative state (determinism).
 *
 * A deliberately rich multi-aggregate history (inventory, reservations,
 * cart, checkout, order, payment, fulfillment, transfer, PO, return,
 * refund, subscription, listing, rental, consignment, policy) is folded
 * back from the append-only journal; the reconstructed kernel's snapshot,
 * journal, receipts, idempotency behavior and subsequent id minting are
 * all identical. The events-only fold (no receipts) also reproduces truth
 * exactly, and the domain reference projections agree with the kernel.
 */
import { describe, expect, it } from "vitest";
import {
  CommerceKernel,
  countQuantity,
  currency,
  inventoryKey,
  inventoryProjection,
  makeId,
  measuredQuantity,
  money,
  orderProjection,
  reconstructAuthoritativeState,
  reconstructKernel,
  unitOfMeasure,
  type AnyCommerceEvent,
  type AutonomousStorePolicy,
} from "../../contract.js";
import { ScriptedPaymentDouble } from "./support/payment-double.js";
import { env, mustExecute } from "./support/envelopes.js";

const usd = currency("USD");
const sku = makeId<"SkuId">("sku-tote");
const bananas = makeId<"SkuId">("sku-bananas");
const loc = makeId<"LocationId">("loc-warehouse-1");
const locB = makeId<"LocationId">("loc-store-b");

const policy: AutonomousStorePolicy = {
  policyId: makeId<"AutonomousStorePolicyId">("policy-1"),
  autonomousStoreId: makeId<"AutonomousStoreId">("store-1"),
  revision: 1,
  policyCurrency: usd,
  promotionBudget: { limitPerPeriod: money("5000", usd), period: "MONTHLY" },
  spendLimit: { limitPerPeriod: money("100000", usd), period: "MONTHLY" },
  refundApprovalThreshold: money("10000", usd),
  priceChangeApprovalThreshold: money("2000", usd),
  stopConditions: [],
};

async function buildRichKernel(): Promise<CommerceKernel> {
  const kernel = new CommerceKernel({ paymentBoundary: new ScriptedPaymentDouble() });
  kernel.registerAutonomousPolicy(policy);

  await mustExecute(kernel, env({ type: "RECEIVE_STOCK", skuId: sku, locationId: loc, units: 10, reason: "RECEIVING" }));
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
      method: { methodKind: "CARD", tokenRef: "tok_1" },
    },
  }));
  const paymentId = kernel.view().allPaymentIntents()[0]?.paymentId as string;
  await mustExecute(kernel, env({ type: "CAPTURE_PAYMENT", paymentId: makeId<"PaymentId">(paymentId) }));
  await mustExecute(kernel, env({
    type: "RESERVE_INVENTORY",
    reservation: { reservationId: makeId<"ReservationId">("res-1"), skuId: sku, locationId: loc, units: 2, status: "OPEN", revision: 1 },
  }));
  await mustExecute(kernel, env({ type: "COMMIT_RESERVATION", reservationId: makeId<"ReservationId">("res-1") }));
  await mustExecute(kernel, env({ type: "OPEN_FULFILLMENT", orderId: makeId<"OrderId">(orderId), originLocationId: loc }));
  const fulfillmentOrderId = kernel.view().fulfillmentForOrder(orderId)?.fulfillmentOrderId as string;
  await mustExecute(kernel, env({ type: "ADVANCE_FULFILLMENT_ORDER", fulfillmentOrderId: makeId<"FulfillmentOrderId">(fulfillmentOrderId), trigger: "PACK" }));
  await mustExecute(kernel, env({ type: "ADVANCE_FULFILLMENT_ORDER", fulfillmentOrderId: makeId<"FulfillmentOrderId">(fulfillmentOrderId), trigger: "TENDER" }));
  await mustExecute(kernel, env({ type: "ADVANCE_FULFILLMENT_ORDER", fulfillmentOrderId: makeId<"FulfillmentOrderId">(fulfillmentOrderId), trigger: "CONFIRM_DELIVERY" }));
  await mustExecute(kernel, env({ type: "ADVANCE_ORDER", orderId: makeId<"OrderId">(orderId), trigger: "ORDER_COMPLETED" }));
  await mustExecute(kernel, env({
    type: "OPEN_TRANSFER",
    transfer: {
      transferId: makeId<"TransferId">("tr-1"),
      fromLocationId: loc,
      toLocationId: locB,
      lines: [{ skuId: sku, units: 2 }],
      state: "REQUESTED",
      revision: 1,
    },
  }));
  await mustExecute(kernel, env({ type: "ADVANCE_TRANSFER", transferId: makeId<"TransferId">("tr-1"), trigger: "DISPATCH" }));
  await mustExecute(kernel, env({
    type: "OPEN_PURCHASE_ORDER",
    purchaseOrder: {
      purchaseOrderId: makeId<"PurchaseOrderId">("po-1"),
      supplierId: makeId<"SupplierId">("sup-1"),
      destinationLocationId: loc,
      lines: [{ skuId: sku, orderedUnits: 20, receivedUnits: 0 }],
      state: "DRAFT",
      revision: 1,
    },
  }));
  await mustExecute(kernel, env({ type: "REQUEST_RETURN", orderId: makeId<"OrderId">(orderId) }));
  const returnId = kernel.view().allReturns()[0]?.returnId as string;
  await mustExecute(kernel, env({ type: "ADVANCE_RETURN", returnId: makeId<"ReturnId">(returnId), trigger: "AUTHORIZE" }));
  await mustExecute(kernel, env({
    type: "REFUND_PAYMENT",
    paymentId: makeId<"PaymentId">(paymentId),
    amount: money("500", usd),
  }));
  await mustExecute(kernel, env({
    type: "OPEN_SUBSCRIPTION",
    subscription: {
      subscriptionId: makeId<"SubscriptionId">("sub-1"),
      customerId: makeId<"CustomerId">("customer-1"),
      planId: makeId<"SubscriptionPlanId">("plan-1"),
      state: "PENDING",
      revision: 1,
    },
  }));
  await mustExecute(kernel, env({ type: "ADVANCE_SUBSCRIPTION", subscriptionId: makeId<"SubscriptionId">("sub-1"), trigger: "ACTIVATE" }));
  await mustExecute(kernel, env({
    type: "OPEN_LISTING",
    listing: {
      listingId: makeId<"ResaleListingId">("list-1"),
      sellerRef: { kind: "CUSTOMER", customerId: makeId<"CustomerId">("customer-2") },
      skuRef: makeId<"SkuId">("sku-jacket"),
      itemCondition: "GOOD",
      askingPrice: money("4500", usd),
      state: "DRAFT",
      revision: 1,
    },
  }));
  await mustExecute(kernel, env({ type: "ADVANCE_LISTING", listingId: makeId<"ResaleListingId">("list-1"), trigger: "PUBLISH" }));
  await mustExecute(kernel, env({
    type: "OPEN_RENTAL",
    rental: {
      rentalAgreementId: makeId<"RentalAgreementId">("rent-1"),
      itemSkuRef: makeId<"SkuId">("sku-drill"),
      renterRef: { kind: "CUSTOMER", customerId: makeId<"CustomerId">("customer-3") },
      period: { startsAt: "2026-10-01", endsAt: "2026-10-08" },
      ratePerPeriod: money("2500", usd),
      deposit: money("10000", usd),
      state: "REQUESTED",
      revision: 1,
    },
  }));
  await mustExecute(kernel, env({ type: "ADVANCE_RENTAL", rentalAgreementId: makeId<"RentalAgreementId">("rent-1"), trigger: "START" }));
  await mustExecute(kernel, env({
    type: "OPEN_CONSIGNMENT",
    consignment: {
      consignmentId: makeId<"ConsignmentId">("cons-1"),
      consignorRef: { kind: "CUSTOMER", customerId: makeId<"CustomerId">("customer-4") },
      consignorShareBps: 6_000,
      state: "PROPOSED",
      revision: 1,
    },
  }));
  await mustExecute(kernel, env({ type: "ADVANCE_CONSIGNMENT", consignmentId: makeId<"ConsignmentId">("cons-1"), trigger: "ACCEPT" }));
  return kernel;
}

describe("W1-002 acceptance scenario 2 — full state reconstruction from event replay", () => {
  it("reconstruction yields identical authoritative state, journal and receipts", async () => {
    const kernel = await buildRichKernel();
    const persistent = kernel.persistentState();
    const reconstructed = reconstructKernel(persistent);

    expect(reconstructed.events()).toEqual(kernel.events());
    expect(reconstructed.receipts()).toEqual(kernel.receipts());
    expect(reconstructed.snapshot()).toEqual(kernel.snapshot());
    expect(reconstructed.journalIsValid()).toBe(true);
    // The reconstructed kernel keeps executing correctly (fresh commands run
    // and continue from the reconstructed state).
    const fresh = await reconstructed.execute(env({ type: "RECEIVE_STOCK", skuId: sku, locationId: loc, units: 7, reason: "RECEIVING" }));
    expect(fresh.status).toBe("EXECUTED");
    const before = kernel.view().level(sku, loc)?.onHand ?? 0;
    expect(reconstructed.view().level(sku, loc)?.onHand).toBe(before + 7);
  });

  it("idempotency keys replay as DUPLICATE against the reconstructed ledger", async () => {
    const kernel = await buildRichKernel();
    const originalEnvelope = {
      commandId: makeId<"CommandId">("cmd-replay-probe"),
      idempotencyKey: makeId<"IdempotencyKey">("idem-replay-probe"),
      actor: { kind: "MERCHANT" as const, merchantId: makeId<"MerchantId">("merchant-1") },
      issuedAt: "2026-10-05T00:00:00Z",
      payload: {
        type: "RECEIVE_STOCK" as const,
        skuId: sku,
        locationId: loc,
        units: 7,
        reason: "RECEIVING" as const,
      },
    };
    await mustExecute(kernel, originalEnvelope);
    const before = kernel.view().level(sku, loc)?.onHand;
    const reconstructed = reconstructKernel(kernel.persistentState());
    const replay = await reconstructed.execute(originalEnvelope);
    expect(replay.status).toBe("DUPLICATE");
    expect(reconstructed.view().level(sku, loc)?.onHand).toBe(before);
    expect(reconstructed.events().length).toBe(kernel.events().length);
  });

  it("subsequent id minting continues identically after reconstruction", async () => {
    const kernel = await buildRichKernel();
    const reconstructed = reconstructKernel(kernel.persistentState());
    const next = {
      commandId: makeId<"CommandId">("cmd-mint-probe"),
      idempotencyKey: makeId<"IdempotencyKey">("idem-mint-probe"),
      actor: { kind: "MERCHANT" as const, merchantId: makeId<"MerchantId">("merchant-1") },
      issuedAt: "2026-10-05T00:00:00Z",
      payload: { type: "OPEN_CHECKOUT" as const, cartId: makeId<"CartId">("cart-1") },
    };
    await mustExecute(kernel, next);
    await mustExecute(reconstructed, next);
    const kernelSession = kernel.view().allCheckoutSessions().at(-1);
    const replaySession = reconstructed.view().allCheckoutSessions().at(-1);
    expect(replaySession?.checkoutSessionId).toBe(kernelSession?.checkoutSessionId);
    expect(replaySession).toEqual(kernelSession);
  });

  it("events-only reconstruction reproduces authoritative state exactly", async () => {
    const kernel = await buildRichKernel();
    const events: readonly AnyCommerceEvent[] = kernel.events();
    const folded = reconstructAuthoritativeState(events);
    expect(folded.snapshot()).toEqual(kernel.snapshot());
    expect(folded.journalIsValid()).toBe(true);
  });

  it("the domain reference projections agree with the reconstructed kernel", async () => {
    const kernel = await buildRichKernel();
    const events = kernel.events();
    const foldedLevels = events.reduce((state, event) => inventoryProjection.apply(state, event), inventoryProjection.initialState());
    for (const level of kernel.view().allLevels()) {
      expect(foldedLevels.levels.get(inventoryKey(level.skuId, level.locationId))).toEqual(level);
    }
    const foldedOrders = events.reduce((state, event) => orderProjection.apply(state, event), orderProjection.initialState());
    for (const order of kernel.view().allOrders()) {
      expect(foldedOrders.orders.get(order.orderId)).toEqual(order);
    }
  });

  it("corrupted journals are detected and thrown (never silently absorbed)", async () => {
    const kernel = await buildRichKernel();
    const events = [...kernel.events()];
    // Corruption 1: duplicated event id.
    expect(() => reconstructAuthoritativeState([...events, events[0] as AnyCommerceEvent])).toThrow(TypeError);
    // Corruption 2: sequence gap.
    const gapped = events.map((event, index) => (index === 1 ? { ...event, sequence: event.sequence + 5 } : event));
    expect(() => reconstructAuthoritativeState(gapped)).toThrow(/non-monotonic sequence/);
  });
});
