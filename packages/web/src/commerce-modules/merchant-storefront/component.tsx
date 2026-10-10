/**
 * merchant-storefront component — the J10 surface (lazily loaded).
 *
 * Everything the user sees here is DEMO state driven by the REAL
 * deterministic commerce kernel (`@unicom/commerce` public entrypoint):
 * the seed script replays a fixed fixture command script; every interactive
 * action hands a typed command envelope to the kernel and renders its
 * outcome (EXECUTED / DUPLICATE / REJECTED) honestly. The UI never mutates
 * canonical truth directly.
 *
 * Split for the oxlint max-lines gate (pure code motion, zero behavior
 * change): the seed lives in ./seed.ts, the catalog/inventory/support and
 * order/refund panels in ./component-parts.tsx, the fulfillment/returns/
 * payments/audit sections in ./lifecycle-sections.tsx. This file remains
 * the module's public surface (module.ts imports it).
 */

import type { JSX } from "react";


import { useState } from "react";
import { computeCartTotals, countQuantity, makeId } from "@unicom/commerce";
import type { CommandExecution } from "@unicom/commerce";
import type { CommerceModuleProps } from "../../commerce-host/contract/index.js";
import {
  DEMO_CUSTOMER_ACTOR,
  DEMO_MERCHANT_ACTOR,
  fmtMoney,
} from "../merchant-shared/demo-runtime.js";
import {
  CommandOutcomeView,
  ConfirmableAction,
  DemoTag,
  PermissionBoundary,
  useRefresh,
  useSeededRuntime,
} from "../merchant-shared/ui.js";
import {
  DEMO_AMBIGUOUS_CARD,
  DEMO_CARD,
  DEMO_PRICE_LIST,
  DEMO_PROMOTIONS,
  DEMO_SKUS,
  STOREFRONT_FIXTURES_ID,
} from "./fixtures.js";
import { seedStorefrontDemo, type KernelRun } from "./seed.js";
import {
  CatalogSection,
  InventorySection,
  OrderRow,
  SupportSection,
} from "./component-parts.js";
import {
  AuditTrailSection,
  FulfillmentSection,
  PaymentsSection,
  ReturnsSection,
} from "./lifecycle-sections.js";

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

      <CatalogSection view={view} />

      <InventorySection view={view} />

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

      <FulfillmentSection view={view} host={host} runCommand={runCommand} />

      <ReturnsSection view={view} host={host} runCommand={runCommand} />

      <PaymentsSection view={view} host={host} runCommand={runCommand} />

      <SupportSection host={host} />

      <AuditTrailSection runtime={runtime} />
    </div>
  );
}
