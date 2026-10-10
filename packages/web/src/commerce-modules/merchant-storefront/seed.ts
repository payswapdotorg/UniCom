/**
 * merchant-storefront seed + module-local kernel constants — split out of
 * component.tsx for the oxlint max-lines gate (pure code motion; the seed
 * body is byte-identical).
 *
 * The seed replays a fixed fixture command script through the REAL
 * deterministic commerce kernel; every seeded state below is canonical
 * kernel state, never UI-fabricated.
 */

import { countQuantity, makeId } from "@unicom/commerce";
import type {
  CommandExecution,
  PrincipalRef,
  ReturnAuthorization,
  ReturnTrigger,
  RuntimeCommandPayload,
  ShipmentTrigger,
} from "@unicom/commerce";
import {
  DEMO_CUSTOMER_ACTOR,
  DEMO_MERCHANT_ACTOR,
  DEMO_SYSTEM_ACTOR,
  DemoCommerceRuntime,
  demoMoney,
} from "../merchant-shared/demo-runtime.js";
import {
  DEMO_AMBIGUOUS_CARD,
  DEMO_CARD,
  DEMO_OPENING_STOCK,
  DEMO_PROMOTIONS,
  STORE_LOCATION,
} from "./fixtures.js";

export type KernelRun = (
  actor: PrincipalRef,
  payload: RuntimeCommandPayload,
  opts?: { readonly commandId?: string; readonly idempotencyKey?: string },
) => Promise<CommandExecution>;

export const RETURN_TRIGGERS_BY_STATE: Readonly<Record<ReturnAuthorization["state"], readonly ReturnTrigger[]>> = {
  REQUESTED: ["AUTHORIZE", "REJECT"],
  AUTHORIZED: ["SHIP_BACK"],
  IN_TRANSIT: ["RECEIVE"],
  RECEIVED: ["INSPECT"],
  INSPECTED: ["RESOLVE"],
  RESOLVED: [],
  REJECTED: [],
  EXPIRED: [],
  CANCELLED: [],
};

export const SHIPMENT_TRIGGERS: readonly ShipmentTrigger[] = [
  "PACK",
  "TENDER",
  "CONFIRM_DELIVERY",
  "FAIL_DELIVERY",
  "RETURN_TO_SENDER",
];

export async function seedStorefrontDemo(): Promise<DemoCommerceRuntime> {
  const runtime = new DemoCommerceRuntime({ promotions: DEMO_PROMOTIONS });

  // Opening stock (typed commands; the only way canonical inventory changes).
  for (const line of DEMO_OPENING_STOCK) {
    await runtime.run(DEMO_MERCHANT_ACTOR, {
      type: "RECEIVE_STOCK",
      skuId: makeId<"SkuId">(line.skuId),
      locationId: STORE_LOCATION,
      units: line.units,
      reason: "MANUAL",
    });
  }

  // Order A — the happy path, delivered, settlement observed SETTLED.
  await runtime.run(DEMO_CUSTOMER_ACTOR, {
    type: "ADD_CART_LINE",
    cartId: makeId<"CartId">("cart-seed-a"),
    skuId: makeId<"SkuId">("sku-demo-a3print"),
    quantity: countQuantity(2),
    unitPrice: demoMoney("1850"),
  });
  await runtime.run(DEMO_CUSTOMER_ACTOR, {
    type: "ADD_CART_LINE",
    cartId: makeId<"CartId">("cart-seed-a"),
    skuId: makeId<"SkuId">("sku-demo-cards"),
    quantity: countQuantity(1),
    unitPrice: demoMoney("1200"),
  });
  await runtime.run(DEMO_CUSTOMER_ACTOR, {
    type: "OPEN_CHECKOUT",
    cartId: makeId<"CartId">("cart-seed-a"),
  });
  const sessionA = runtime
    .view()
    .allCheckoutSessions()
    .find((session) => session.cartId === "cart-seed-a")!;
  await runtime.run(DEMO_CUSTOMER_ACTOR, {
    type: "COMPLETE_CHECKOUT",
    checkoutSessionId: sessionA.checkoutSessionId,
    merchantId: DEMO_MERCHANT_ACTOR.merchantId,
    method: DEMO_CARD,
  });
  const orderA = runtime
    .view()
    .allOrders()
    .find((order) => order.checkoutSessionId === sessionA.checkoutSessionId)!;
  const paymentA = runtime
    .view()
    .allPaymentIntents()
    .find(
      (intent) => intent.reference.kind === "ORDER" && intent.reference.orderId === orderA.orderId,
    )!;
  await runtime.run(DEMO_MERCHANT_ACTOR, { type: "CAPTURE_PAYMENT", paymentId: paymentA.paymentId });
  runtime.payments.scriptSettlementOutcome(paymentA.paymentId, {
    resolved: "OBSERVED",
    status: "SETTLED",
  });
  await runtime.run(DEMO_SYSTEM_ACTOR, { type: "OBSERVE_SETTLEMENT", paymentId: paymentA.paymentId });
  await runtime.run(DEMO_MERCHANT_ACTOR, {
    type: "OPEN_FULFILLMENT",
    orderId: orderA.orderId,
    originLocationId: STORE_LOCATION,
  });
  const fulfillmentA = runtime.view().fulfillmentForOrder(orderA.orderId)!;
  for (const trigger of ["PACK", "TENDER", "CONFIRM_DELIVERY"] as const) {
    await runtime.run(DEMO_MERCHANT_ACTOR, {
      type: "ADVANCE_FULFILLMENT_ORDER",
      fulfillmentOrderId: fulfillmentA.fulfillmentOrderId,
      trigger,
    });
  }

  // Order B — ambiguous payment rail: the order's payment is UNKNOWN (J18:
  // UNKNOWN is preserved, never rendered as paid or failed).
  await runtime.run(DEMO_CUSTOMER_ACTOR, {
    type: "ADD_CART_LINE",
    cartId: makeId<"CartId">("cart-seed-b"),
    skuId: makeId<"SkuId">("sku-demo-poster"),
    quantity: countQuantity(1),
    unitPrice: demoMoney("3400"),
  });
  await runtime.run(DEMO_CUSTOMER_ACTOR, {
    type: "OPEN_CHECKOUT",
    cartId: makeId<"CartId">("cart-seed-b"),
  });
  const sessionB = runtime
    .view()
    .allCheckoutSessions()
    .find((session) => session.cartId === "cart-seed-b")!;
  runtime.payments.makeNextOutcomeAmbiguous("AUTH_STATE_UNCLEAR");
  await runtime.run(DEMO_CUSTOMER_ACTOR, {
    type: "COMPLETE_CHECKOUT",
    checkoutSessionId: sessionB.checkoutSessionId,
    merchantId: DEMO_MERCHANT_ACTOR.merchantId,
    method: DEMO_AMBIGUOUS_CARD,
  });

  // Order C — delivered value, fully returned and refunded through the
  // deterministic return lifecycle + captured-funds refund.
  await runtime.run(DEMO_CUSTOMER_ACTOR, {
    type: "ADD_CART_LINE",
    cartId: makeId<"CartId">("cart-seed-c"),
    skuId: makeId<"SkuId">("sku-demo-cards"),
    quantity: countQuantity(2),
    unitPrice: demoMoney("1200"),
  });
  await runtime.run(DEMO_CUSTOMER_ACTOR, {
    type: "OPEN_CHECKOUT",
    cartId: makeId<"CartId">("cart-seed-c"),
  });
  const sessionC = runtime
    .view()
    .allCheckoutSessions()
    .find((session) => session.cartId === "cart-seed-c")!;
  await runtime.run(DEMO_CUSTOMER_ACTOR, {
    type: "COMPLETE_CHECKOUT",
    checkoutSessionId: sessionC.checkoutSessionId,
    merchantId: DEMO_MERCHANT_ACTOR.merchantId,
    method: DEMO_CARD,
  });
  const orderC = runtime
    .view()
    .allOrders()
    .find((order) => order.checkoutSessionId === sessionC.checkoutSessionId)!;
  const paymentC = runtime
    .view()
    .allPaymentIntents()
    .find(
      (intent) => intent.reference.kind === "ORDER" && intent.reference.orderId === orderC.orderId,
    )!;
  await runtime.run(DEMO_MERCHANT_ACTOR, { type: "CAPTURE_PAYMENT", paymentId: paymentC.paymentId });
  await runtime.run(DEMO_CUSTOMER_ACTOR, { type: "REQUEST_RETURN", orderId: orderC.orderId });
  const returnC = runtime.view().allReturns()[0]!;
  for (const trigger of ["AUTHORIZE", "SHIP_BACK", "RECEIVE", "INSPECT", "RESOLVE"] as const) {
    await runtime.run(DEMO_MERCHANT_ACTOR, {
      type: "ADVANCE_RETURN",
      returnId: returnC.returnId,
      trigger,
    });
  }
  await runtime.run(DEMO_MERCHANT_ACTOR, {
    type: "REFUND_PAYMENT",
    paymentId: paymentC.paymentId,
    amount: orderC.totals.grandTotal,
  });

  // Order A wrong-item EXCHANGE return, mid-flight (AUTHORIZED, in transit back).
  await runtime.run(DEMO_MERCHANT_ACTOR, {
    type: "OPEN_RETURN",
    orderId: orderA.orderId,
    resolution: "EXCHANGE",
    lines: [
      {
        skuId: makeId<"SkuId">("sku-demo-a3print"),
        quantity: countQuantity(1),
        reason: "WRONG_ITEM",
      },
    ],
  });

  return runtime;
}
