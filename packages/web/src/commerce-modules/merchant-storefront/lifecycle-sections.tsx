/**
 * merchant-storefront lifecycle sections — split out of component.tsx for
 * the oxlint max-lines gate (pure code motion; the JSX is byte-identical).
 *
 * The fulfillment / returns / payments / audit sections of the J10 surface;
 * composed by component.tsx, which remains the module's public surface.
 */

import type { JSX } from "react";

import { money } from "@unicom/commerce";
import type { CommerceHostServices } from "../../commerce-host/contract/index.js";
import { LifecycleStateItem } from "../../commerce-host/shared/index.js";
import {
  DEMO_MERCHANT_ACTOR,
  DEMO_SYSTEM_ACTOR,
  DemoCommerceRuntime,
  fmtMoney,
} from "../merchant-shared/demo-runtime.js";
import type { KernelView } from "../merchant-shared/demo-runtime.js";
import { EventTrail, PermissionBoundary, StatusChip } from "../merchant-shared/ui.js";
import { RefundsPanel } from "./component-parts.js";
import {
  RETURN_TRIGGERS_BY_STATE,
  SHIPMENT_TRIGGERS,
  type KernelRun,
} from "./seed.js";

export function FulfillmentSection({
  view,
  host,
  runCommand,
}: {
  readonly view: KernelView;
  readonly host: CommerceHostServices;
  readonly runCommand: KernelRun;
}): JSX.Element {
  return (
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
  );
}

export function ReturnsSection({
  view,
  host,
  runCommand,
}: {
  readonly view: KernelView;
  readonly host: CommerceHostServices;
  readonly runCommand: KernelRun;
}): JSX.Element {
  return (
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
  );
}

export function PaymentsSection({
  view,
  host,
  runCommand,
}: {
  readonly view: KernelView;
  readonly host: CommerceHostServices;
  readonly runCommand: KernelRun;
}): JSX.Element {
  return (
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
  );
}

export function AuditTrailSection({
  runtime,
}: {
  readonly runtime: DemoCommerceRuntime;
}): JSX.Element {
  return (
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
  );
}
