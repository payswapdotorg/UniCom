/**
 * trust-recourse seed + module-local constants — split out of component.tsx
 * for the oxlint max-lines gate (pure code motion; the seed body is
 * byte-identical).
 *
 * The seed replays a fixed script through the REAL deterministic kernel:
 * three captured orders, a wrong-item dispute, a counterfeit dispute with a
 * provider chargeback already forced, an authorized wrong-item return, and
 * a settlement observed as UNKNOWN.
 */

import { countQuantity, makeId } from "@unicom/commerce";
import type {
  CommandExecution,
  PrincipalRef,
  ReturnAuthorization,
  ReturnTrigger,
  RuntimeCommandPayload,
} from "@unicom/commerce";
import {
  DEMO_CUSTOMER_ACTOR,
  DEMO_MERCHANT_ACTOR,
  DEMO_SYSTEM_ACTOR,
  DemoCommerceRuntime,
  demoMoney,
} from "../merchant-shared/demo-runtime.js";
import {
  DISPUTE_COUNTERFEIT_REASON,
  DISPUTE_WRONG_ITEM_REASON,
  PROVIDER_DISPUTE_OPEN,
  PROVIDER_DISPUTE_UNDER_REVIEW,
  TRUST_CARD,
  TRUST_LOCATION,
  TRUST_SKUS,
} from "./fixtures.js";

export type KernelRun = (
  actor: PrincipalRef,
  payload: RuntimeCommandPayload,
  opts?: { readonly commandId?: string; readonly idempotencyKey?: string },
) => Promise<CommandExecution>;

export const RETURN_NEXT_TRIGGER: Readonly<Record<ReturnAuthorization["state"], ReturnTrigger | null>> = {
  REQUESTED: "AUTHORIZE",
  AUTHORIZED: "SHIP_BACK",
  IN_TRANSIT: "RECEIVE",
  RECEIVED: "INSPECT",
  INSPECTED: "RESOLVE",
  RESOLVED: null,
  REJECTED: null,
  EXPIRED: null,
  CANCELLED: null,
};

/** Deterministic order seed: cart → checkout → captured ORDER payment. */
async function seedCapturedOrder(
  runtime: DemoCommerceRuntime,
  cartId: string,
  skuId: string,
  units: number,
  unitPriceMinor: string,
): Promise<{ readonly orderId: string; readonly paymentId: string }> {
  await runtime.run(DEMO_CUSTOMER_ACTOR, {
    type: "ADD_CART_LINE",
    cartId: makeId<"CartId">(cartId),
    skuId: makeId<"SkuId">(skuId),
    quantity: countQuantity(units),
    unitPrice: demoMoney(unitPriceMinor),
  });
  await runtime.run(DEMO_CUSTOMER_ACTOR, {
    type: "OPEN_CHECKOUT",
    cartId: makeId<"CartId">(cartId),
  });
  const session = runtime.view().allCheckoutSessions().find((entry) => entry.cartId === cartId)!;
  await runtime.run(DEMO_CUSTOMER_ACTOR, {
    type: "COMPLETE_CHECKOUT",
    checkoutSessionId: session.checkoutSessionId,
    merchantId: DEMO_MERCHANT_ACTOR.merchantId,
    method: TRUST_CARD,
  });
  const order = runtime.view().allOrders().find((entry) => entry.checkoutSessionId === session.checkoutSessionId)!;
  const payment = runtime
    .view()
    .allPaymentIntents()
    .find((intent) => intent.reference.kind === "ORDER" && intent.reference.orderId === order.orderId)!;
  await runtime.run(DEMO_MERCHANT_ACTOR, { type: "CAPTURE_PAYMENT", paymentId: payment.paymentId });
  return { orderId: order.orderId, paymentId: payment.paymentId };
}

export async function seedTrustDemo(): Promise<DemoCommerceRuntime> {
  const runtime = new DemoCommerceRuntime();

  for (const sku of TRUST_SKUS) {
    await runtime.run(DEMO_MERCHANT_ACTOR, {
      type: "RECEIVE_STOCK",
      skuId: makeId<"SkuId">(sku.skuId),
      locationId: TRUST_LOCATION,
      units: sku.openingUnits,
      reason: "MANUAL",
    });
  }

  // Case 1 — wrong item: order D1 (two pin sets, USD 48.00 captured),
  // dispute OPEN, one-unit return authorized.
  const case1 = await seedCapturedOrder(runtime, "cart-trust-d1", "sku-trust-pins", 2, "2400");
  await runtime.run(DEMO_SYSTEM_ACTOR, {
    type: "OPEN_DISPUTE",
    paymentId: makeId<"PaymentId">(case1.paymentId),
    amount: demoMoney("4800"),
    reason: DISPUTE_WRONG_ITEM_REASON,
    providerNativeStatus: PROVIDER_DISPUTE_OPEN,
  });
  await runtime.run(DEMO_CUSTOMER_ACTOR, {
    type: "OPEN_RETURN",
    orderId: makeId<"OrderId">(case1.orderId),
    resolution: "REFUND",
    lines: [
      {
        skuId: makeId<"SkuId">("sku-trust-pins"),
        quantity: countQuantity(1),
        reason: "WRONG_ITEM",
      },
    ],
  });
  const seededReturn = runtime.view().allReturns()[0]!;
  await runtime.run(DEMO_MERCHANT_ACTOR, {
    type: "ADVANCE_RETURN",
    returnId: seededReturn.returnId,
    trigger: "AUTHORIZE",
  });

  // Case 2 — counterfeit claim: order D2 (pendant, USD 99.00 captured),
  // dispute OPEN, and the provider already FORCED a full chargeback refund.
  const case2 = await seedCapturedOrder(runtime, "cart-trust-d2", "sku-trust-pendant", 1, "9900");
  await runtime.run(DEMO_SYSTEM_ACTOR, {
    type: "OPEN_DISPUTE",
    paymentId: makeId<"PaymentId">(case2.paymentId),
    amount: demoMoney("9900"),
    reason: DISPUTE_COUNTERFEIT_REASON,
    providerNativeStatus: PROVIDER_DISPUTE_UNDER_REVIEW,
  });
  await runtime.run(DEMO_SYSTEM_ACTOR, {
    type: "RECORD_CHARGEBACK",
    paymentId: makeId<"PaymentId">(case2.paymentId),
    amount: demoMoney("9900"),
    providerNativeStatus: "PROVIDER_ARBITRATION_WON",
  });

  // Case 3 — the ordinary mug order whose settlement the rail reports
  // ambiguously: observed UNKNOWN, preserved as UNKNOWN.
  const case3 = await seedCapturedOrder(runtime, "cart-trust-d3", "sku-trust-mug", 2, "1600");
  await runtime.run(DEMO_SYSTEM_ACTOR, {
    type: "OBSERVE_SETTLEMENT",
    paymentId: makeId<"PaymentId">(case3.paymentId),
  });
  return runtime;
}
