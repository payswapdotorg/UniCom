/**
 * merchant-storefront command center (W1-026 §3) — the merchant's first
 * screen inside the J10 module: where the store stands RIGHT NOW, what work
 * is in flight, and the highest-value next actions.
 *
 * Honesty laws (work order):
 * - every number below is DERIVED from the live deterministic demo kernel
 *   (view projections of committed fixtures) — observed state only, never a
 *   claim about live orders, inventory or connectivity;
 * - connected integrations: 0 (host fixture truth; no provider is connected);
 * - the three truth classes stay labelled: operational (kernel), observation
 *   (queued physical count — not yet canonical), predictive (none on THIS
 *   surface; the Twin link is labelled predictive);
 * - UNKNOWN payments are preserved, never rendered as paid or failed.
 */
import type { JSX } from "react";

import type { ReturnAuthorization } from "@unicom/commerce";
import type { CommerceHostServices } from "../../commerce-host/contract/index.js";
import { LifecycleStateItem } from "../../commerce-host/shared/index.js";
import type { KernelView } from "../merchant-shared/demo-runtime.js";
import { DemoTag, StatusChip } from "../merchant-shared/ui.js";
import { STOREFRONT_FIXTURES_ID } from "./fixtures.js";
import { RETURN_TRIGGERS_BY_STATE } from "./seed.js";

/** Non-terminal return states — work still in flight. */
const IN_FLIGHT_RETURN_STATES: readonly ReturnAuthorization["state"][] = [
  "REQUESTED",
  "AUTHORIZED",
  "IN_TRANSIT",
  "RECEIVED",
  "INSPECTED",
];

/** High-value next actions (real registered routes; authority stays checked). */
const NEXT_ACTIONS: readonly { readonly label: string; readonly path: string; readonly note: string }[] = [
  {
    label: "Review the group-buy proposal on your desk",
    path: "/commerce/merchant/group-buy-review",
    note: "accept, counter or reject — review never binds silently",
  },
  {
    label: "Count and reconcile shelf stock",
    path: "/commerce/physical/store",
    note: "offline counts stay queued observations until reconciled",
  },
  {
    label: "Restock through procurement",
    path: "/commerce/procurement/supply",
    note: "quotes → approvals → PO → receiving → reconciliation",
  },
  {
    label: "Handle a dispute or escalation",
    path: "/commerce/trust/recourse",
    note: "evidence, policy reasons, controlled refunds",
  },
  {
    label: "See model forecasts on the Commerce Twin",
    path: "/commerce/twin",
    note: "labelled predictive — never operational truth",
  },
];

function StatCard({
  title,
  value,
  detail,
  chip,
}: {
  readonly title: string;
  readonly value: string;
  readonly detail: string;
  readonly chip: string;
}): JSX.Element {
  return (
    <div className="cm-card" style={{ padding: 12 }}>
      <div className="cm-row" style={{ gap: 6 }}>
        <span className={chip}>operational</span>
        <strong style={{ fontSize: 13 }}>{title}</strong>
      </div>
      <p className="cm-card-sub" style={{ marginTop: 6, fontSize: 15, color: "var(--cm-fg)" }}>
        {value}
      </p>
      <p className="cm-card-sub" style={{ marginTop: 4 }}>{detail}</p>
    </div>
  );
}

export function CommandCenterSection({
  view,
  host,
}: {
  readonly view: KernelView;
  readonly host: CommerceHostServices;
}): JSX.Element {
  const orders = view.allOrders();
  const unknownPayments = orders.filter((order) => order.paymentStatus === "UNKNOWN");
  const inFlightReturns = view
    .allReturns()
    .filter((entry) => IN_FLIGHT_RETURN_STATES.includes(entry.state));
  const levels = view.allLevels();
  const totalOnHand = levels.reduce((sum, level) => sum + level.onHand, 0);
  const totalReserved = levels.reduce((sum, level) => sum + level.reserved, 0);

  const ordersByState = new Map<string, number>();
  for (const order of orders) {
    ordersByState.set(order.state, (ordersByState.get(order.state) ?? 0) + 1);
  }

  return (
    <section className="cm-stack" aria-label="Command center" data-testid="cm-command-center">
      <section className="cm-card">
        <div className="cm-row">
          <h2 className="cm-card-title">Command center — where your store stands right now</h2>
          <DemoTag />
        </div>
        <p className="cm-card-sub">
          Every number below is observed deterministic kernel state built from committed fixtures{" "}
          <code>{STOREFRONT_FIXTURES_ID}</code> — the operational truth of the demo store, live in
          this browser. Connected integrations: 0 — no channel, feed or payment provider is
          connected, so nothing here claims a live order, live stock or live connectivity. This
          surface shows no predictions; the only model output anywhere in the product is the
          Commerce Twin, always labelled predictive.
        </p>
      </section>

      <div className="cm-grid" data-testid="cm-command-center-stats">
        <StatCard
          title="Orders"
          value={`${orders.length} order${orders.length === 1 ? "" : "s"}`}
          detail={
            [...ordersByState.entries()].map(([state, count]) => `${state} ×${count}`).join(" · ") ||
            "none yet"
          }
          chip="cm-chip cm-chip-ok"
        />
        <StatCard
          title="Payments"
          value={
            unknownPayments.length === 0
              ? "no UNKNOWN payments"
              : `${unknownPayments.length} payment${unknownPayments.length === 1 ? "" : "s"} UNKNOWN`
          }
          detail="UNKNOWN is preserved — never rendered as paid or failed. Observe settlement in the Payments section below."
          chip="cm-chip cm-chip-ok"
        />
        <StatCard
          title="Returns in flight"
          value={`${inFlightReturns.length} open return${inFlightReturns.length === 1 ? "" : "s"}`}
          detail={
            inFlightReturns
              .map(
                (entry) =>
                  `${entry.returnId} ${entry.state} — next step: ${RETURN_TRIGGERS_BY_STATE[entry.state].join(" / ") || "none"}`,
              )
              .join(" · ") || "no open returns right now"
          }
          chip="cm-chip cm-chip-ok"
        />
        <StatCard
          title="Inventory (canonical)"
          value={`${levels.length} SKU${levels.length === 1 ? "" : "s"} · ${totalOnHand} on hand · ${totalReserved} reserved`}
          detail="Deterministic stock levels — observations change them only through reconciliation."
          chip="cm-chip cm-chip-ok"
        />
      </div>

      <section className="cm-card" aria-label="Work in flight">
        <h3 className="cm-card-title">Work in flight (and what it is waiting for)</h3>
        <div className="cm-stack" style={{ gap: 8, marginTop: 4 }}>
          {inFlightReturns.map((entry) => (
            <div
              key={entry.returnId}
              className="cm-state-item"
              style={{ borderLeftColor: "var(--cm-border-strong)" }}
            >
              <div className="cm-row">
                <span className="cm-state-item-label">
                  Exchange return {entry.returnId} (order {entry.orderId})
                </span>
                <StatusChip status={entry.state} note="Return state (deterministic lifecycle)" />
                <DemoTag />
              </div>
              <p className="cm-state-item-detail">
                Waiting on your next step: {RETURN_TRIGGERS_BY_STATE[entry.state].join(" / ") || "none"}.
                Lines:{" "}
                {entry.lines
                  .map((line) => `${line.skuId} ×${line.quantity.units} (${line.reason})`)
                  .join(", ")}
                . The Returns section below runs the lifecycle.
              </p>
            </div>
          ))}
          {unknownPayments.length > 0 ? (
            <LifecycleStateItem
              label={`Payment for ${unknownPayments.map((order) => order.orderId).join(", ")} — outcome UNKNOWN`}
              state="SETTLEMENT-UNKNOWN"
              detail="The demo rail could not confirm the authorization. It is preserved verbatim — not a failure, and not a success — until an observation resolves it (Payments section below)."
              demo
            />
          ) : null}
          <LifecycleStateItem
            label="Offline stock count, shelf B4 (queued observation)"
            state="NOT-PROMOTED-UNKNOWN"
            detail="A count captured offline waits in the reconciliation queue. It has NOT changed canonical stock and may be superseded — the Physical store surface owns its replay."
            demo
          />
        </div>
      </section>

      <section className="cm-card" aria-label="High-value next actions">
        <h3 className="cm-card-title">High-value next actions</h3>
        <ul className="cm-perm-list" style={{ margin: "6px 0 0", listStyle: "none", padding: 0 }}>
          {NEXT_ACTIONS.map((action) => (
            <li key={action.path} style={{ marginBottom: 6 }}>
              <div className="cm-row" style={{ gap: 8 }}>
                <button
                  type="button"
                  className="cm-button"
                  onClick={() => host.navigate(action.path)}
                >
                  {action.label}
                </button>
                <span className="cm-env-note">{action.note}</span>
              </div>
            </li>
          ))}
        </ul>
        <p className="cm-card-sub" style={{ marginTop: 8 }}>
          The work surfaces for everything on this page are the sections below — catalog, pricing,
          inventory, checkout, orders, fulfillment, returns, payments, support and the audit
          journal. Authority is checked per action: anything your roles do not permit renders
          visibly blocked with the reason, never hidden.
        </p>
        <div className="cm-row" style={{ marginTop: 6 }}>
          <StatusChip status="DEMO" note="Deterministic synthetic fixtures — resettable, no credentials, no live payments" />
        </div>
      </section>
    </section>
  );
}
