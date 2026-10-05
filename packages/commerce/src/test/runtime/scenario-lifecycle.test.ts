/**
 * W1-002 runtime scenario 1 (twin of W1-001 scenario 1): online product →
 * order → inventory lifecycle, executed against the REAL kernel dispatch —
 * no contract stubs anywhere on the hot path (the only test double is the
 * sanctioned payment-boundary double, which is NOT a kernel stub).
 *
 * Every consequential step is a typed command with an idempotency key,
 * every effect is an immutable event, and final state is re-derived from
 * the journal via the DOMAIN reference projections — proving the runtime
 * fold and the domain fold agree.
 */
import { describe, expect, it } from "vitest";
import {
  CommerceKernel,
  availableUnits,
  countQuantity,
  currency,
  inventoryKey,
  inventoryProjection,
  makeId,
  money,
  orderProjection,
  type CommandExecution,
} from "../../contract.js";
import { ScriptedPaymentDouble } from "./support/payment-double.js";
import { env, explicitEnv, mustExecute } from "./support/envelopes.js";

const usd = currency("USD");
const sku = makeId<"SkuId">("sku-canvas-tote");
const loc = makeId<"LocationId">("loc-warehouse-1");
const merchantId = makeId<"MerchantId">("merchant-1");

function newKernel() {
  const paymentBoundary = new ScriptedPaymentDouble();
  const kernel = new CommerceKernel({ paymentBoundary });
  return { kernel, paymentBoundary };
}

describe("runtime scenario 1 — online product → order → inventory lifecycle (real kernel)", () => {
  it("walks the full deterministic path with exact money end-to-end", async () => {
    const { kernel } = newKernel();

    // 2. Inventory: receive 10 units via typed command (event + revision).
    const received = await mustExecute(kernel, env({
      type: "RECEIVE_STOCK",
      skuId: sku,
      locationId: loc,
      units: 10,
      reason: "RECEIVING",
    }));
    expect(received.receipt?.subjectRefs).toContain(`INVENTORY_LEVEL:${inventoryKey(sku, loc)}`);
    expect(kernel.view().level(sku, loc)).toMatchObject({ onHand: 10, reserved: 0, revision: 1 });

    // 3. Cart: 2 units × $19.99 — the cart materializes on first line.
    await mustExecute(kernel, env({
      type: "ADD_CART_LINE",
      cartId: makeId<"CartId">("cart-1"),
      skuId: sku,
      quantity: countQuantity(2),
      unitPrice: money("1999", usd),
    }));
    const cart = kernel.view().cart("cart-1");
    expect(cart).toMatchObject({ revision: 1, currency: "USD" });
    expect(cart?.lines).toHaveLength(1);
    expect(cart?.lines[0]).toMatchObject({ kind: "UNIT_LINE", lineId: "line-1", quantity: { units: 2 } });

    // 4. Checkout boundary: session opens (handoff, not payment processing).
    await mustExecute(kernel, env({ type: "OPEN_CHECKOUT", cartId: makeId<"CartId">("cart-1") }));
    const session = kernel.view().allCheckoutSessions()[0];
    if (!session) throw new Error("checkout session missing");
    expect(session).toMatchObject({ state: "OPEN", cartId: "cart-1", revision: 1 });
    await mustExecute(kernel, env({ type: "ADVANCE_CHECKOUT", checkoutSessionId: session.checkoutSessionId, trigger: "START_PAYMENT" }));
    expect(kernel.view().checkoutSession(session.checkoutSessionId)?.state).toBe("PAYMENT_PENDING");

    // 5. Order placed from the cart: PENDING, NOT_PAID, exact totals.
    await mustExecute(kernel, env({
      type: "PLACE_ORDER",
      cartId: makeId<"CartId">("cart-1"),
      merchantId,
    }));
    const orderId = kernel.view().allOrders()[0]?.orderId as string;
    const order = kernel.view().order(orderId);
    expect(order).toMatchObject({
      orderId,
      state: "PENDING",
      paymentStatus: "NOT_PAID",
      fulfillmentStatus: "UNFULFILLED",
      revision: 1,
    });
    expect(order?.totals).toMatchObject({
      subtotal: { amountMinor: "3998" },
      discountTotal: { amountMinor: "0" },
      taxTotal: { amountMinor: "0" },
      grandTotal: { amountMinor: "3998" },
    });
    expect(order?.lines[0]).toMatchObject({ kind: "UNIT_LINE", skuId: sku, quantity: { units: 2 }, unitPrice: { amountMinor: "1999" } });

    // 6. Payment boundary: intent → AUTHORIZED, then CAPTURED (real port calls).
    await mustExecute(kernel, env({
      type: "CREATE_PAYMENT_INTENT",
      request: {
        amount: money("3998", usd),
        reference: { kind: "ORDER", orderId: makeId<"OrderId">(orderId) },
        method: { methodKind: "CARD", tokenRef: "tok_visa_1" },
      },
    }));
    expect(kernel.view().paymentIntent("pay-double-1")).toMatchObject({ status: "AUTHORIZED" });
    expect(kernel.view().paymentIntent("pay-double-1")?.amount).toMatchObject({ amountMinor: "3998" });
    expect(kernel.view().order(orderId)?.paymentStatus).toBe("AUTHORIZED");

    const captured: CommandExecution = await mustExecute(kernel, env({
      type: "CAPTURE_PAYMENT",
      paymentId: makeId<"PaymentId">("pay-double-1"),
    }));
    expect(captured.receipt?.subjectRefs).toContain("PAYMENT:pay-double-1");
    expect(kernel.view().paymentIntent("pay-double-1")?.status).toBe("CAPTURED");
    // Order: payment status PAID and state PENDING → PAID (deterministic pair).
    expect(kernel.view().order(orderId)?.paymentStatus).toBe("PAID");
    expect(kernel.view().order(orderId)?.state).toBe("PAID");

    // 7. Inventory: reserve 2 then commit (deduct exactly once).
    await mustExecute(kernel, env({
      type: "RESERVE_INVENTORY",
      reservation: {
        reservationId: makeId<"ReservationId">("res-1001"),
        skuId: sku,
        locationId: loc,
        units: 2,
        status: "OPEN",
        revision: 1,
      },
    }));
    const reservedLevel = kernel.view().level(sku, loc);
    expect(reservedLevel && availableUnits(reservedLevel)).toBe(8);
    await mustExecute(kernel, env({ type: "COMMIT_RESERVATION", reservationId: makeId<"ReservationId">("res-1001") }));
    expect(kernel.view().level(sku, loc)).toMatchObject({ onHand: 8, reserved: 0, revision: 3 });
    expect(kernel.view().reservation("res-1001")).toMatchObject({ status: "COMMITTED", revision: 2 });

    // 8. Fulfillment: PENDING → PACKED → IN_TRANSIT → DELIVERED.
    await mustExecute(kernel, env({ type: "OPEN_FULFILLMENT", orderId: makeId<"OrderId">(orderId), originLocationId: loc }));
    expect(kernel.view().order(orderId)?.state).toBe("PARTIALLY_FULFILLED");
    expect(kernel.view().order(orderId)?.fulfillmentStatus).toBe("PARTIAL");
    const fulfillment = kernel.view().fulfillmentForOrder(orderId);
    if (!fulfillment) throw new Error("fulfillment missing");
    const shipmentId = kernel.view().shipmentIdForFulfillment(fulfillment.fulfillmentOrderId);
    if (!shipmentId) throw new Error("shipment missing");
    expect(fulfillment.lines).toEqual([{ skuId: sku, quantity: { kind: "COUNT", units: 2 } }]);
    await mustExecute(kernel, env({ type: "ADVANCE_FULFILLMENT_ORDER", fulfillmentOrderId: fulfillment.fulfillmentOrderId, trigger: "PACK" }));
    await mustExecute(kernel, env({ type: "ADVANCE_FULFILLMENT_ORDER", fulfillmentOrderId: fulfillment.fulfillmentOrderId, trigger: "TENDER" }));
    await mustExecute(kernel, env({ type: "ADVANCE_FULFILLMENT_ORDER", fulfillmentOrderId: fulfillment.fulfillmentOrderId, trigger: "CONFIRM_DELIVERY" }));
    expect(kernel.view().shipment(shipmentId)?.state).toBe("DELIVERED");
    expect(kernel.view().order(orderId)?.state).toBe("FULFILLED");
    expect(kernel.view().order(orderId)?.fulfillmentStatus).toBe("FULFILLED");

    // 9. Order: FULFILLED → COMPLETED.
    await mustExecute(kernel, env({ type: "ADVANCE_ORDER", orderId: makeId<"OrderId">(orderId), trigger: "ORDER_COMPLETED" }));
    expect(kernel.view().order(orderId)?.state).toBe("COMPLETED");

    // 10. Derived truth: journal discipline + domain reference projections agree.
    expect(kernel.journalIsValid()).toBe(true);
    const foldedLevels = kernel
      .events()
      .reduce((state, event) => inventoryProjection.apply(state, event), inventoryProjection.initialState());
    expect(foldedLevels.levels.get(inventoryKey(sku, loc))).toEqual(kernel.view().level(sku, loc));
    const foldedOrders = kernel
      .events()
      .reduce((state, event) => orderProjection.apply(state, event), orderProjection.initialState());
    expect(foldedOrders.orders.get(orderId)).toEqual(kernel.view().order(orderId));
  });

  it("replays the whole lifecycle deterministically (identical journal from identical commands)", async () => {
    const build = async () => {
      const { kernel } = newKernel();
      await kernel.execute(explicitEnv("cmd-r-1", "idem-r-1", { type: "RECEIVE_STOCK", skuId: sku, locationId: loc, units: 10, reason: "RECEIVING" }));
      await kernel.execute(explicitEnv("cmd-r-2", "idem-r-2", {
        type: "ADD_CART_LINE",
        cartId: makeId<"CartId">("cart-1"),
        skuId: sku,
        quantity: countQuantity(2),
        unitPrice: money("1999", usd),
      }));
      await kernel.execute(explicitEnv("cmd-r-3", "idem-r-3", { type: "PLACE_ORDER", cartId: makeId<"CartId">("cart-1"), merchantId }));
      return kernel;
    };
    const first = await build();
    const second = await build();
    expect(second.events()).toEqual(first.events());
    expect(second.snapshot()).toEqual(first.snapshot());
  });

  it("passes opaque opportunity references through untouched (Worker 2's lane stays opaque)", async () => {
    const kernel = new CommerceKernel();
    const opportunityRef = {
      kind: "GROUP_BUY" as const,
      ref: makeId<"GroupBuyId">("gb-77"),
      role: "SATISFIES" as const,
    };
    await mustExecute(kernel, env({
      type: "ADD_CART_LINE",
      cartId: makeId<"CartId">("cart-opaque"),
      skuId: sku,
      quantity: countQuantity(1),
      unitPrice: money("1999", usd),
    }));
    await mustExecute(kernel, env({ type: "OPEN_CHECKOUT", cartId: makeId<"CartId">("cart-opaque"), opportunityRef }));
    const session = kernel.view().allCheckoutSessions()[0];
    expect(session?.opportunityRef).toEqual(opportunityRef);
    await mustExecute(kernel, env({ type: "PLACE_ORDER", cartId: makeId<"CartId">("cart-opaque"), merchantId }));
    const order = kernel.view().allOrders()[0];
    expect(order?.opportunityRef).toEqual(opportunityRef);
    // The reference is carried verbatim — no coordination semantics leak in.
    // @ts-expect-error — group-buy terms belong to Worker 2's lane, not this package
    const leaked = order?.opportunityRef?.participantCommitments;
    void leaked;
  });
});
