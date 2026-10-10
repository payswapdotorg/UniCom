/**
 * merchant-storefront presentational parts — split out of component.tsx for
 * the oxlint max-lines gate (pure code motion; the JSX is byte-identical).
 *
 * Contains the order/refund row panels and the catalog + inventory sections;
 * composed by component.tsx, which remains the module's public surface.
 */

import type { JSX } from "react";

import { applyPromotionRule, makeId, money, refundNeedsReview } from "@unicom/commerce";
import type { OrderSnapshot } from "@unicom/commerce";
import type { CommerceHostServices } from "../../commerce-host/contract/index.js";
import { LifecycleStateItem } from "../../commerce-host/shared/index.js";
import { DEMO_MERCHANT_ACTOR, demoMoney, fmtMoney } from "../merchant-shared/demo-runtime.js";
import type { KernelView } from "../merchant-shared/demo-runtime.js";
import {
  ConfirmableAction,
  PermissionBoundary,
  StatusChip,
} from "../merchant-shared/ui.js";
import {
  DEMO_COUPON,
  DEMO_PAUSED_PROMOTION,
  DEMO_PRICE_LIST,
  DEMO_PRODUCTS,
  DEMO_PROMOTIONS,
  DEMO_REFUND_POLICY,
  DEMO_SKUS,
  STORE_LOCATION,
} from "./fixtures.js";
import type { KernelRun } from "./seed.js";

export function OrderRow({ order }: { readonly order: OrderSnapshot }): JSX.Element {
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

export function RefundsPanel({
  host,
  view,
  runCommand,
}: {
  readonly host: CommerceHostServices;
  readonly view: KernelView;
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

export function CatalogSection({ view }: { readonly view: KernelView }): JSX.Element {
  return (
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
  );
}

export function InventorySection({ view }: { readonly view: KernelView }): JSX.Element {
  return (
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
  );
}

export function SupportSection({ host }: { readonly host: CommerceHostServices }): JSX.Element {
  return (
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
  );
}
