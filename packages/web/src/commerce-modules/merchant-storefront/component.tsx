/**
 * merchant-storefront component — the J10 surface (lazily loaded).
 *
 * Everything the user sees here is DEMO state driven by the REAL
 * deterministic commerce kernel (`@unicom/commerce` public entrypoint):
 * the seed script replays a fixed fixture command script; every interactive
 * action hands a typed command envelope to the kernel and renders its
 * outcome (EXECUTED / DUPLICATE / REJECTED) honestly. The UI never mutates
 * canonical truth directly.
 */

import type { JSX } from "react";


import { useState } from "react";
import {
  applyPromotionRule,
  computeCartTotals,
  countQuantity,
  makeId,
  money,
  refundNeedsReview,
} from "@unicom/commerce";
import type {
  CommandExecution,
  OrderSnapshot,
  PrincipalRef,
  ReturnAuthorization,
  ReturnTrigger,
  RuntimeCommandPayload,
  ShipmentTrigger,
} from "@unicom/commerce";
import type { CommerceModuleProps, CommerceHostServices } from "../../commerce-host/contract/index.js";
import { LifecycleStateItem } from "../../commerce-host/shared/index.js";
import {
  DEMO_CUSTOMER_ACTOR,
  DEMO_MERCHANT_ACTOR,
  DEMO_SYSTEM_ACTOR,
  DemoCommerceRuntime,
  demoMoney,
  fmtMoney,
} from "../merchant-shared/demo-runtime.js";
import {
  CommandOutcomeView,
  ConfirmableAction,
  DemoTag,
  EventTrail,
  PermissionBoundary,
  StatusChip,
  useRefresh,
  useSeededRuntime,
} from "../merchant-shared/ui.js";
import {
  DEMO_AMBIGUOUS_CARD,
  DEMO_CARD,
  DEMO_COUPON,
  DEMO_OPENING_STOCK,
  DEMO_PAUSED_PROMOTION,
  DEMO_PRICE_LIST,
  DEMO_PRODUCTS,
  DEMO_PROMOTIONS,
  DEMO_REFUND_POLICY,
  DEMO_SKUS,
  STOREFRONT_FIXTURES_ID,
  STORE_LOCATION,
} from "./fixtures.js";

type KernelRun = (
  actor: PrincipalRef,
  payload: RuntimeCommandPayload,
  opts?: { readonly commandId?: string; readonly idempotencyKey?: string },
) => Promise<CommandExecution>;

const RETURN_TRIGGERS_BY_STATE: Readonly<Record<ReturnAuthorization["state"], readonly ReturnTrigger[]>> = {
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

const SHIPMENT_TRIGGERS: readonly ShipmentTrigger[] = [
  "PACK",
  "TENDER",
  "CONFIRM_DELIVERY",
  "FAIL_DELIVERY",
  "RETURN_TO_SENDER",
];

async function seedStorefrontDemo(): Promise<DemoCommerceRuntime> {
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

export default function MerchantStorefrontComponent({ host }: CommerceModuleProps): JSX.Element {
  const { runtime, reset } = useSeededRuntime(seedStorefrontDemo);
  const { version, refresh } = useRefresh();
  const [lastOutcome, setLastOutcome] = useState<CommandExecution | null>(null);
  const [session, setSession] = useState({
    cartId: "cart-live-1",
    rail: "ok" as "ok" | "ambiguous",
    lastCompleteKeys: null as {
      readonly commandId: string;
      readonly idempotencyKey: string;
      readonly sessionId: string;
    } | null,
  });

  const runCommand: KernelRun = async (actor, payload, opts) => {
    const outcome = await runtime!.run(actor, payload, opts);
    setLastOutcome(outcome);
    refresh();
    return outcome;
  };

  if (runtime === null) {
    return (
      <section className="cm-stack">
        <div className="cm-card" role="status" aria-live="polite" data-testid="cm-loading">
          <h1 className="cm-card-title">J10 · Merchant storefront</h1>
          <p className="cm-card-sub">
            Seeding the deterministic demo kernel (opening stock, three orders, a delivery, a
            return, a refund)…
          </p>
        </div>
      </section>
    );
  }

  const view = runtime.view();
  void version; // re-render trigger after each completed command

  const liveCart = view.cart(session.cartId);
  const liveTotals =
    liveCart && liveCart.lines.length > 0
      ? computeCartTotals(liveCart, { rounding: "HALF_UP", promotions: DEMO_PROMOTIONS })
      : null;
  const liveSession = view
    .allCheckoutSessions()
    .filter((entry) => entry.cartId === session.cartId)
    .at(-1);

  const resetDemo = (): void => {
    setLastOutcome(null);
    setSession((current) => ({
      cartId: `cart-live-${Number(current.cartId.split("-").at(-1) ?? "1") + 1}`,
      rail: "ok",
      lastCompleteKeys: null,
    }));
    reset();
  };

  const completeCheckout = async (): Promise<void> => {
    if (!liveSession) return;
    if (session.rail === "ambiguous") {
      runtime.payments.makeNextOutcomeAmbiguous("AUTH_STATE_UNCLEAR");
    }
    const commandId = `cmd-complete-${session.cartId}`;
    const idempotencyKey = `idem-complete-${session.cartId}`;
    const outcome = await runCommand(
      DEMO_CUSTOMER_ACTOR,
      {
        type: "COMPLETE_CHECKOUT",
        checkoutSessionId: liveSession.checkoutSessionId,
        merchantId: DEMO_MERCHANT_ACTOR.merchantId,
        method: session.rail === "ambiguous" ? DEMO_AMBIGUOUS_CARD : DEMO_CARD,
      },
      { commandId, idempotencyKey },
    );
    if (outcome.status === "EXECUTED") {
      setSession((current) => ({
        ...current,
        lastCompleteKeys: { commandId, idempotencyKey, sessionId: liveSession.checkoutSessionId },
      }));
    }
  };

  return (
    <div className="cm-stack">
      <section className="cm-card">
        <div className="cm-row">
          <h1 className="cm-card-title">J10 · Merchant storefront — the full lifecycle</h1>
          <DemoTag />
        </div>
        <p className="cm-card-sub">
          Harbor Lane Print Studio (demo firm). Catalog, pricing, promotions, inventory, checkout,
          orders, fulfillment, returns, exchanges, refunds and support — every state below is real
          deterministic commerce-kernel state built from committed fixtures{" "}
          <code>{STOREFRONT_FIXTURES_ID}</code>. Money is exact; unknown is never shown as paid or
          failed; duplicate submissions return the original receipt.
        </p>
        <div className="cm-row">
          <button type="button" className="cm-button" onClick={resetDemo}>
            Reset demo data
          </button>
          <span className="cm-env-note">
            fixtures are synthetic — resettable, no credentials, no live payments
          </span>
        </div>
      </section>

      <section aria-label="Catalog and pricing">
        <h2 className="cm-section-title">Catalog, pricing &amp; promotions</h2>
        <div className="cm-stack">
          {DEMO_PRODUCTS.map((product) => {
            const sku = DEMO_SKUS.find((entry) => entry.productId === product.productId)!;
            const entry = DEMO_PRICE_LIST.entries.find((item) => item.skuId === sku.skuId)!;
            const promo = DEMO_PROMOTIONS.find((promotion) =>
              promotion.appliesToSkuIds?.includes(makeId<"SkuId">(sku.skuId)),
            );
            const promoPrice =
              promo && promo.status === "ACTIVE"
                ? applyPromotionRule(entry.unitPrice, promo.rule, "HALF_UP")
                : null;
            const level = view.level(makeId<"SkuId">(sku.skuId), STORE_LOCATION);
            return (
              <div key={product.productId} className="cm-journey-item">
                <span className="cm-journey-name">{product.title}</span>
                <StatusChip
                  status={product.status}
                  note={product.status === "DRAFT" ? "Not yet sellable (draft product)" : undefined}
                />
                <span className="cm-chip cm-chip-muted">
                  {sku.pricingMode === "UNIT" ? "unit" : "per metre"}
                </span>
                <span>
                  {fmtMoney(entry.unitPrice)}
                  {promoPrice?.ok ? (
                    <span className="cm-chip cm-chip-ok">sale {fmtMoney(promoPrice.value.net)}</span>
                  ) : null}
                </span>
                <span className="cm-env-note">
                  SKU {sku.skuId} · barcode {sku.barcode}
                </span>
                <span className="cm-journey-summary">
                  {level
                    ? `On hand at the studio: ${level.onHand} · reserved ${level.reserved} (operational truth, revision ${level.revision})`
                    : "No stock record at the studio location."}
                </span>
              </div>
            );
          })}
          <div className="cm-row">
            {DEMO_PROMOTIONS.map((promotion) => (
              <span key={promotion.promotionId} className="cm-chip cm-chip-ok">
                {promotion.title} · ACTIVE
              </span>
            ))}
            <span className="cm-chip cm-chip-warn">
              {DEMO_PAUSED_PROMOTION.title} · PAUSED — visible, not applied
            </span>
            <span className="cm-chip cm-chip-muted">
              coupon {DEMO_COUPON.code} · {DEMO_COUPON.redemptionCount}/{DEMO_COUPON.maxRedemptions}{" "}
              redeemed
            </span>
          </div>
          <p className="cm-card-sub">
            Promotions apply deterministically at order placement (kernel totals); the paused
            promotion stays visible but never discounts.
          </p>
        </div>
      </section>

      <section aria-label="Inventory observations">
        <h2 className="cm-section-title">Inventory (three truths, kept separate)</h2>
        <div className="cm-stack">
          {view.allLevels().map((level) => (
            <div key={`${level.skuId}-${level.locationId}`} className="cm-journey-item">
              <span className="cm-journey-name">{level.skuId}</span>
              <span className="cm-chip cm-chip-muted">operational · on hand {level.onHand}</span>
              <span className="cm-chip cm-chip-muted">reserved {level.reserved}</span>
              <span className="cm-env-note">
                revision {level.revision} · updated {level.updatedAt}
              </span>
            </div>
          ))}
          <LifecycleStateItem
            label="Shelf count, print rack (offline queue)"
            state="NOT-PROMOTED-UNKNOWN"
            detail="A count captured while offline sits in the observation queue. It has NOT changed canonical stock and may be superseded — see the Physical store surface (J16) for the queue and its replay."
            demo
          />
        </div>
      </section>

      <section aria-label="Checkout demo">
        <h2 className="cm-section-title">Checkout — build a cart, complete, resubmit</h2>
        <div className="cm-stack">
          <div className="cm-row">
            {DEMO_SKUS.filter((sku) => sku.pricingMode === "UNIT").map((sku) => {
              const entry = DEMO_PRICE_LIST.entries.find((item) => item.skuId === sku.skuId)!;
              return (
                <PermissionBoundary key={sku.skuId} host={host} permission="storefront.manage">
                  <ConfirmableAction
                    actionLabel={`Add 1 × ${sku.skuId}`}
                    confirmLabel="Add to demo cart"
                    statement={`Adds one unit of ${sku.skuId} at ${fmtMoney(entry.unitPrice)} to the live demo cart (${session.cartId}) as a typed ADD_CART_LINE command.`}
                    onExecute={() => {
                      void runCommand(DEMO_CUSTOMER_ACTOR, {
                        type: "ADD_CART_LINE",
                        cartId: makeId<"CartId">(session.cartId),
                        skuId: makeId<"SkuId">(sku.skuId),
                        quantity: countQuantity(1),
                        unitPrice: entry.unitPrice,
                      });
                    }}
                  />
                </PermissionBoundary>
              );
            })}
          </div>
          {liveCart && liveCart.lines.length > 0 ? (
            <div className="cm-card">
              <h3 className="cm-card-title">Live demo cart ({session.cartId})</h3>
              <ul className="cm-perm-list">
                {liveCart.lines.map((line) => (
                  <li key={line.lineId}>
                    {line.skuId} ×{" "}
                    {line.kind === "UNIT_LINE"
                      ? line.quantity.units
                      : `${line.quantity.magnitude} ${line.quantity.unit}`}{" "}
                    @ {fmtMoney(line.unitPrice)}
                  </li>
                ))}
              </ul>
              {liveTotals?.ok ? (
                <p className="cm-card-sub">
                  Subtotal {fmtMoney(liveTotals.value.subtotal)} · discount{" "}
                  {fmtMoney(liveTotals.value.discountTotal)} · grand total{" "}
                  <strong>{fmtMoney(liveTotals.value.grandTotal)}</strong> (kernel cart math,
                  promotions applied)
                </p>
              ) : null}
              <div className="cm-row">
                <label htmlFor="cm-rail-mode" className="cm-env-note">
                  Payment rail simulation:
                </label>
                <select
                  id="cm-rail-mode"
                  value={session.rail}
                  onChange={(event) =>
                    setSession((current) => ({
                      ...current,
                      rail: event.target.value === "ambiguous" ? "ambiguous" : "ok",
                    }))
                  }
                >
                  <option value="ok">normal — authorization succeeds</option>
                  <option value="ambiguous">ambiguous — outcome resolves UNKNOWN</option>
                </select>
                <PermissionBoundary host={host} permission="storefront.manage">
                  {liveSession && liveSession.state === "OPEN" ? (
                    <ConfirmableAction
                      actionLabel="Complete checkout"
                      confirmLabel="Complete checkout now"
                      statement={`Hands COMPLETE_CHECKOUT to the kernel for session ${liveSession.checkoutSessionId}: the cart becomes an immutable PENDING order and the demo rail authorizes payment${
                        session.rail === "ambiguous"
                          ? " with an UNKNOWN outcome (preserved, not failed)"
                          : ""
                      }.`}
                      onExecute={() => {
                        void completeCheckout();
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="cm-button"
                      onClick={() => {
                        void runCommand(DEMO_CUSTOMER_ACTOR, {
                          type: "OPEN_CHECKOUT",
                          cartId: makeId<"CartId">(session.cartId),
                        });
                      }}
                    >
                      Open checkout for this cart
                    </button>
                  )}
                </PermissionBoundary>
                {session.lastCompleteKeys ? (
                  <button
                    type="button"
                    className="cm-button"
                    data-testid="cm-duplicate-submit"
                    onClick={() => {
                      const keys = session.lastCompleteKeys;
                      if (!keys) return;
                      void runCommand(
                        DEMO_CUSTOMER_ACTOR,
                        {
                          type: "COMPLETE_CHECKOUT",
                          checkoutSessionId: makeId<"CheckoutSessionId">(keys.sessionId),
                          merchantId: DEMO_MERCHANT_ACTOR.merchantId,
                          method: session.rail === "ambiguous" ? DEMO_AMBIGUOUS_CARD : DEMO_CARD,
                        },
                        { commandId: keys.commandId, idempotencyKey: keys.idempotencyKey },
                      );
                    }}
                  >
                    Resubmit exact same command (duplicate)
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="cm-card-sub">
              The live demo cart is empty — add a unit above to walk the checkout path yourself.
              Three seeded orders below already show delivered, unknown-payment and refunded states.
            </p>
          )}
          {lastOutcome ? <CommandOutcomeView outcome={lastOutcome} /> : null}
        </div>
      </section>

      <section aria-label="Orders">
        <h2 className="cm-section-title">Orders</h2>
        <div className="cm-stack">
          {view.allOrders().map((order) => (
            <OrderRow key={order.orderId} order={order} />
          ))}
        </div>
      </section>

      <section aria-label="Fulfillment">
        <h2 className="cm-section-title">Fulfillment &amp; delivery</h2>
        <div className="cm-stack">
          {view.allFulfillments().map((fulfillment) => {
            const shipmentId = view.shipmentIdForFulfillment(fulfillment.fulfillmentOrderId);
            const shipment = shipmentId ? view.shipment(shipmentId) : undefined;
            return (
              <div key={fulfillment.fulfillmentOrderId} className="cm-journey-item">
                <span className="cm-journey-name">{fulfillment.fulfillmentOrderId}</span>
                <span className="cm-env-note">order {fulfillment.orderId}</span>
                {shipment ? (
                  <StatusChip status={shipment.state} note="Shipment state (deterministic lifecycle)" />
                ) : (
                  <span className="cm-chip cm-chip-muted">no shipment yet</span>
                )}
                <span className="cm-journey-summary">
                  {shipment
                    ? `Shipment ${shipment.shipmentId} · revision ${shipment.revision}. Invalid triggers are refused deterministically with a reason — never a silent no-op.`
                    : "Awaiting first advance (PACK) to mint the shipment."}
                </span>
                <span className="cm-row">
                  <PermissionBoundary host={host} permission="orders.process">
                    {SHIPMENT_TRIGGERS.map((trigger) => (
                      <button
                        key={trigger}
                        type="button"
                        className="cm-button"
                        onClick={() => {
                          void runCommand(DEMO_MERCHANT_ACTOR, {
                            type: "ADVANCE_FULFILLMENT_ORDER",
                            fulfillmentOrderId: fulfillment.fulfillmentOrderId,
                            trigger,
                          });
                        }}
                      >
                        {trigger}
                      </button>
                    ))}
                  </PermissionBoundary>
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section aria-label="Returns exchanges refunds">
        <h2 className="cm-section-title">Returns, exchanges &amp; refunds</h2>
        <div className="cm-stack">
          {view.allReturns().map((returnAuth) => (
            <div key={returnAuth.returnId} className="cm-journey-item">
              <span className="cm-journey-name">{returnAuth.returnId}</span>
              <StatusChip status={returnAuth.state} />
              <span className="cm-chip cm-chip-muted">{returnAuth.resolution}</span>
              <span className="cm-env-note">order {returnAuth.orderId}</span>
              <span className="cm-journey-summary">
                {returnAuth.lines
                  .map((line) => `${line.skuId} ×${line.quantity.units} (${line.reason})`)
                  .join(", ")}
              </span>
              <span className="cm-row">
                <PermissionBoundary host={host} permission="orders.process">
                  {RETURN_TRIGGERS_BY_STATE[returnAuth.state].map((trigger) => (
                    <button
                      key={trigger}
                      type="button"
                      className="cm-button"
                      onClick={() => {
                        void runCommand(DEMO_MERCHANT_ACTOR, {
                          type: "ADVANCE_RETURN",
                          returnId: returnAuth.returnId,
                          trigger,
                        });
                      }}
                    >
                      {trigger}
                    </button>
                  ))}
                </PermissionBoundary>
              </span>
            </div>
          ))}
          <RefundsPanel host={host} view={view} runCommand={runCommand} />
        </div>
      </section>

      <section aria-label="Payments and settlement">
        <h2 className="cm-section-title">Payments &amp; settlement (unknown preserved)</h2>
        <div className="cm-stack">
          {view.allPaymentIntents().map((intent) => {
            const settlement = view.settlementRecord(intent.paymentId);
            return (
              <div key={intent.paymentId} className="cm-journey-item">
                <span className="cm-journey-name">{intent.paymentId}</span>
                <StatusChip status={intent.status} note="Payment-intent status on the demo rail" />
                <span className="cm-env-note">
                  {fmtMoney(intent.amount)} · captured{" "}
                  {fmtMoney(money(view.capturedTotalFor(intent.paymentId).toString(), intent.amount.currency))} ·
                  refunded {fmtMoney(money(view.refundedTotalFor(intent.paymentId).toString(), intent.amount.currency))}
                </span>
                {settlement ? (
                  <StatusChip
                    status={settlement.status}
                    note="Settlement status — tri-state (SETTLED / NOT_SETTLED / SETTLEMENT-UNKNOWN)"
                  />
                ) : (
                  <span className="cm-chip cm-chip-muted">settlement not yet observed</span>
                )}
                <span className="cm-row">
                  <PermissionBoundary host={host} permission="finance.view-settlements">
                    <button
                      type="button"
                      className="cm-button"
                      onClick={() => {
                        void runCommand(DEMO_SYSTEM_ACTOR, {
                          type: "OBSERVE_SETTLEMENT",
                          paymentId: intent.paymentId,
                        });
                      }}
                    >
                      Observe settlement
                    </button>
                  </PermissionBoundary>
                </span>
              </div>
            );
          })}
          <LifecycleStateItem
            label="Payout check, demo rail"
            state="SETTLEMENT-UNKNOWN"
            detail="The rail cannot confirm the payout. UNKNOWN is preserved verbatim — it is never rendered as paid, and never as failed."
            demo
          />
        </div>
      </section>

      <section aria-label="Support bands">
        <h2 className="cm-section-title">Support — refund bands &amp; escalation</h2>
        <div className="cm-card">
          <p className="cm-card-sub">
            Demo policy: refunds at or above{" "}
            <strong>{fmtMoney(DEMO_REFUND_POLICY.autoRefundMax ?? demoMoney("0"))}</strong> require
            finance review before money moves (deterministic refundNeedsReview check). Refunds are
            always bounded by what was actually captured — a refund above the captured total is
            refused with a reason and a recovery path, never silently clamped. Wrong-item,
            counterfeit and dispute escalation live on the Trust &amp; recourse surface.
          </p>
          <p className="cm-card-sub">
            <button
              type="button"
              className="cm-button"
              onClick={() => host.navigate("/commerce/trust/recourse")}
            >
              Open Trust &amp; recourse (J17)
            </button>
          </p>
        </div>
      </section>

      <section aria-label="Audit trail">
        <h2 className="cm-section-title">Audit trail (append-only journal)</h2>
        <EventTrail
          events={runtime
            .events()
            .slice(-24)
            .map((event) => ({
              kind: event.kind,
              subjectId: event.subject.subjectId,
              at: event.occurredAt,
            }))}
          limit={24}
        />
      </section>
    </div>
  );
}

function OrderRow({ order }: { readonly order: OrderSnapshot }): JSX.Element {
  return (
    <div className="cm-journey-item">
      <span className="cm-journey-name">{order.orderId}</span>
      <StatusChip status={order.state} note="Order state" />
      <StatusChip
        status={order.paymentStatus}
        note={
          order.paymentStatus === "UNKNOWN"
            ? "The payment outcome is UNKNOWN — not a failure, and not a success. Preserved verbatim."
            : "Payment status"
        }
      />
      <StatusChip status={order.fulfillmentStatus} note="Fulfillment status" />
      {order.paymentStatus === "UNKNOWN" ? (
        <span className="cm-env-note" data-testid="cm-unknown-payment-note">
          The payment outcome is UNKNOWN — not a failure, and not a success. Preserved verbatim
          (J18 law: never rendered as paid, never as failed).
        </span>
      ) : null}
      <span className="cm-env-note">placed {order.placedAt}</span>
      <span className="cm-journey-summary">
        {order.lines
          .map((line) =>
            line.kind === "UNIT_LINE"
              ? `${line.skuId} ×${line.quantity.units} @ ${fmtMoney(line.unitPrice)}`
              : `${line.skuId} ${line.quantity.magnitude} ${line.quantity.unit} @ ${fmtMoney(line.unitPrice)}/u`,
          )
          .join(" · ")}{" "}
        → grand total <strong>{fmtMoney(order.totals.grandTotal)}</strong> (subtotal{" "}
        {fmtMoney(order.totals.subtotal)}, discount {fmtMoney(order.totals.discountTotal)})
      </span>
    </div>
  );
}

function RefundsPanel({
  host,
  view,
  runCommand,
}: {
  readonly host: CommerceHostServices;
  readonly view: ReturnType<DemoCommerceRuntime["view"]>;
  readonly runCommand: KernelRun;
}): JSX.Element {
  const refunds = view.allRefunds();
  const capturedPayments = view
    .allPaymentIntents()
    .filter((intent) => view.capturedTotalFor(intent.paymentId) > 0n);
  return (
    <div className="cm-card">
      <h3 className="cm-card-title">Refunds (bounded by captured funds)</h3>
      {refunds.length === 0 ? (
        <p className="cm-card-sub">No refunds recorded yet.</p>
      ) : (
        <ul className="cm-perm-list">
          {refunds.map((refund) => (
            <li key={refund.refundId}>
              <StatusChip status={refund.state} /> {refund.refundId} · {fmtMoney(refund.amount)} ·{" "}
              {refund.refundKind ?? "POLICY_REFUND"}
              {refundNeedsReview(refund.amount, DEMO_REFUND_POLICY) ? (
                <span className="cm-chip cm-chip-warn">above auto band — finance review</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {capturedPayments.map((intent) => {
        const captured = view.capturedTotalFor(intent.paymentId);
        const refunded = view.refundedTotalFor(intent.paymentId);
        const remaining = captured - refunded;
        return (
          <div key={intent.paymentId} className="cm-row" style={{ marginTop: 8 }}>
            <span className="cm-env-note">
              {intent.paymentId}: captured {captured}, refunded {refunded} minor units
            </span>
            <PermissionBoundary host={host} permission="finance.approve-refund">
              <span className="cm-row">
                {remaining > 0n ? (
                  <ConfirmableAction
                    actionLabel={`Refund remaining ${remaining} minor units`}
                    confirmLabel="Issue refund"
                    statement={`Hands REFUND_PAYMENT to the kernel for ${intent.paymentId}: exactly the still-captured ${remaining} minor units move back; the deterministic boundary enforces the captured-funds cap.`}
                    onExecute={() => {
                      void runCommand(DEMO_MERCHANT_ACTOR, {
                        type: "REFUND_PAYMENT",
                        paymentId: intent.paymentId,
                        amount: money(remaining.toString(), intent.amount.currency),
                      });
                    }}
                  />
                ) : null}
                <button
                  type="button"
                  className="cm-button"
                  data-testid="cm-over-refund"
                  onClick={() => {
                    void runCommand(DEMO_MERCHANT_ACTOR, {
                      type: "REFUND_PAYMENT",
                      paymentId: intent.paymentId,
                      amount: money((captured + 1000n).toString(), intent.amount.currency),
                    });
                  }}
                >
                  Try refund above captured (see the refusal)
                </button>
              </span>
            </PermissionBoundary>
          </div>
        );
      })}
    </div>
  );
}
