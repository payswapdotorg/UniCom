/**
 * merchant-autonomous component — the J13 surface (lazily loaded).
 *
 * Autonomous-store controls on the REAL deterministic commerce kernel: the
 * policy is registered on the kernel (POLICY_REVISED journal facts), the
 * seeded script runs the store through a healthy policy day (restock ordered
 * within the spend limit, an in-band price adjustment applied, a till cycle
 * with a cash variance that escalates), and then registers the HALTED
 * revision — a stop condition crossing its threshold. Every live action
 * below is a typed command envelope judged by the kernel's own policy gate:
 * the halt denies autonomous action at the boundary, and the recorded human
 * override path (owner authority, journaled, on-behalf-of) is the recovery.
 *
 * Split for the oxlint max-lines gate (pure code motion, zero behavior
 * change): the seed lives in ./seed.ts, the policy-in-force / policy-preview
 * / escalation sections in ./component-parts.tsx. This file remains the
 * module's public surface (module.ts imports it).
 */

import type { JSX } from "react";


import { useState } from "react";
import type {
  CommandExecution,
  RuntimeCommandPayload,
} from "@unicom/commerce";
import type { CommerceModuleProps } from "../../commerce-host/contract/index.js";
import {
  autonomousStoreActor,
  DEMO_MERCHANT_ACTOR,
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
  AUTONOMOUS_FIXTURES_ID,
  AUTONOMOUS_LOCATION,
  AUTONOMOUS_SKU,
  AUTONOMOUS_STORE_ID,
  DEMO_STORE_NAME,
} from "./fixtures.js";
import { seedAutonomousDemo, type KernelRun } from "./seed.js";
import {
  EscalationsSection,
  PolicyInForceSection,
  PolicyPreviewSection,
} from "./component-parts.js";

export default function MerchantAutonomousComponent({ host }: CommerceModuleProps): JSX.Element {
  const { runtime, reset } = useSeededRuntime(seedAutonomousDemo);
  const { version, refresh } = useRefresh();
  const [lastOutcome, setLastOutcome] = useState<CommandExecution | null>(null);

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
          <h1 className="cm-card-title">J13 · Autonomous store controls</h1>
          <p className="cm-card-sub">
            Seeding the deterministic demo kernel (registering the kiosk, its policy and one healthy operating day)…
          </p>
        </div>
      </section>
    );
  }

  const view = runtime.view();
  void version; // re-render trigger after each completed command

  const ops = view.autonomousOps();
  const policy = view.policyFor(AUTONOMOUS_STORE_ID)!;
  const control = ops.allStores()[0];
  const escalations = ops.allEscalations();
  const halted = policy.stopConditions.some(
    (condition) => condition.currentlyObserved >= condition.threshold,
  );
  const restockSpendMinor = ops
    .allRestockOrders()
    .reduce((sum, order) => sum + BigInt(order.plannedValue.amountMinor), 0n);

  const runAutonomous = async (payload: RuntimeCommandPayload): Promise<void> => {
    await runCommand(autonomousStoreActor(AUTONOMOUS_STORE_ID), payload);
  };
  const runOwner = async (payload: RuntimeCommandPayload): Promise<void> => {
    await runCommand(DEMO_MERCHANT_ACTOR, payload);
  };

  return (
    <div className="cm-stack">
      <section className="cm-card">
        <div className="cm-row">
          <h1 className="cm-card-title">J13 · Autonomous store controls</h1>
          <DemoTag />
        </div>
        <p className="cm-card-sub">
          {DEMO_STORE_NAME} (demo kiosk). The policy in force, its approval gates and stop
          conditions, the human override path, and the audit trail — all real kernel state
          driven from committed fixtures <code>{AUTONOMOUS_FIXTURES_ID}</code>. Autonomy here
          is deterministic policy application: the store can only do what the registered
          policy allows, and every decision is journaled.
        </p>
        <div className="cm-row">
          <button
            type="button"
            className="cm-button"
            onClick={() => {
              setLastOutcome(null);
              reset();
            }}
          >
            Reset demo data
          </button>
          <span className="cm-env-note">
            fixtures are synthetic — resettable, no credentials, no live store
          </span>
        </div>
      </section>

      <PolicyInForceSection policy={policy} halted={halted} control={control} />

      <PolicyPreviewSection />

      <section aria-label="Autonomous actions">
        <h2 className="cm-section-title">Autonomous actions and the human override path</h2>
        <div className="cm-stack">
          <PermissionBoundary host={host} permission="storefront.manage">
            <ConfirmableAction
              actionLabel="Try an autonomous price adjustment (in-band) while halted"
              confirmLabel="Attempt the adjustment"
              statement="Hands ADJUST_SKU_PRICE (kettle → USD 44.50, in-band under revision 1) to the kernel AS the store principal. With the stop condition holding, the kernel boundary denies it — you will see the POLICY_DENIED refusal, not a silent no-op."
              onExecute={() => {
                void runAutonomous({
                  type: "ADJUST_SKU_PRICE",
                  autonomousStoreId: AUTONOMOUS_STORE_ID,
                  skuId: AUTONOMOUS_SKU.skuId,
                  newPrice: demoMoney("4450"),
                  reason: "in-band attempt while halted",
                });
              }}
            />
            <ConfirmableAction
              actionLabel="Human override — set the kettle price to USD 46.00 (journaled)"
              confirmLabel="Record the override (price)"
              statement="Records a human override (owner authority, on-behalf-of the store) and applies the price change at USD 46.00 — above the margin floor, journaled with your justification. The override IS the approval gate: the human decision is recorded, auditable, and lands even while autonomy is halted."
              onExecute={() => {
                void runOwner({
                  type: "RECORD_HUMAN_OVERRIDE",
                  autonomousStoreId: AUTONOMOUS_STORE_ID,
                  action: {
                    kind: "PRICE_ADJUSTMENT",
                    skuId: AUTONOMOUS_SKU.skuId,
                    newPrice: demoMoney("4600"),
                    reason: "competitor price match",
                  },
                  justification: "Competitor dropped to USD 46.00; matching within owner authority.",
                });
              }}
            />
            <ConfirmableAction
              actionLabel="Human override — force a 2-unit kettle restock (journaled)"
              confirmLabel="Record the override (restock)"
              statement="Records a human override forcing a 2-unit restock (USD 60.00) even though a policy restock is already pending — the override basis is journaled on the restock order, and the human authority replaces the autonomous spend evaluation by design."
              onExecute={() => {
                void runOwner({
                  type: "RECORD_HUMAN_OVERRIDE",
                  autonomousStoreId: AUTONOMOUS_STORE_ID,
                  action: {
                    kind: "RESTOCK",
                    skuId: AUTONOMOUS_SKU.skuId,
                    locationId: AUTONOMOUS_LOCATION,
                    units: 2,
                    reason: "weekend event coverage",
                  },
                  justification: "Harbor festival weekend; 2 extra units beyond the standing order.",
                });
              }}
            />
          </PermissionBoundary>
          {lastOutcome ? <CommandOutcomeView outcome={lastOutcome} /> : null}
        </div>
      </section>

      <EscalationsSection escalations={escalations} host={host} runOwner={runOwner} />

      <section aria-label="Price book">
        <h2 className="cm-section-title">Price book and adjustment trail</h2>
        <div className="cm-stack">
          {ops.allPriceRecords().map((record) => (
            <div key={record.skuId} className="cm-journey-item">
              <span className="cm-journey-name">{record.skuId}</span>
              <span className="cm-chip cm-chip-muted">unit price {fmtMoney(record.unitPrice)}</span>
              <span className="cm-env-note">
                cost basis {fmtMoney(record.costBasis)} · revision {record.revision}
              </span>
            </div>
          ))}
          {ops.allPriceAdjustments().length === 0 ? (
            <p className="cm-card-sub">No price adjustments recorded yet.</p>
          ) : (
            ops.allPriceAdjustments().map((adjustment) => (
              <div key={adjustment.adjustmentId} className="cm-state-item">
                <div className="cm-row">
                  <span className="cm-state-item-label">{adjustment.adjustmentId}</span>
                  <StatusChip
                    status={adjustment.applied ? "APPLIED" : "NOT_APPLIED"}
                    note={adjustment.applied ? "The price book moved" : "Journaled refusal — the price book did NOT move"}
                  />
                  <StatusChip status={adjustment.decision} note="The policy decision behind this adjustment" />
                </div>
                <p className="cm-state-item-detail">
                  {adjustment.skuId}: {fmtMoney(adjustment.before)} → {fmtMoney(adjustment.after)} ·
                  cost basis {fmtMoney(adjustment.costBasis)} ·{" "}
                  {adjustment.reasons.length > 0 ? `reasons ${adjustment.reasons.join(", ")}` : "no denial reasons"}
                  {adjustment.overrideRef ? ` · override ${adjustment.overrideRef}` : ""}
                  {adjustment.reason ? ` · ${adjustment.reason}` : ""}
                </p>
              </div>
            ))
          )}
          <p className="cm-card-sub">
            An out-of-policy adjustment is a JOURNALED refusal (applied: false with the
            policy reasons) — never a silent drop, never a collapsed error.
          </p>
        </div>
      </section>

      <section aria-label="Restock orders and spend">
        <h2 className="cm-section-title">Restock orders and spend against the limit</h2>
        <div className="cm-stack">
          {ops.allRestockOrders().length === 0 ? (
            <p className="cm-card-sub">No restock orders recorded yet.</p>
          ) : (
            ops.allRestockOrders().map((order) => (
              <div key={order.restockId} className="cm-journey-item">
                <span className="cm-journey-name">{order.restockId}</span>
                <StatusChip status={order.basis === "POLICY" ? "POLICY" : "HUMAN_OVERRIDE"} note="Who decided this restock" />
                <span className="cm-journey-summary">
                  {order.skuId} · units {order.units} · planned value {fmtMoney(order.plannedValue)} ·
                  PO {order.purchaseOrderId ?? "—"} · period {order.periodKey}
                </span>
              </div>
            ))
          )}
          <div className="cm-journey-item">
            <span className="cm-journey-name">Spend today</span>
            <span className="cm-journey-summary">
              {fmtMoney(demoMoney(restockSpendMinor.toString()))} of the{" "}
              {fmtMoney(policy.spendLimit.limitPerPeriod)} {policy.spendLimit.period.toLowerCase()} limit
              (sum of journaled restock order values)
            </span>
            <span className="cm-env-note">
              policy restocks are spend-checked before ordering; human-override restocks
              replace that evaluation with the recorded human authority (journaled either way)
            </span>
          </div>
        </div>
      </section>

      <section aria-label="Audit trail">
        <h2 className="cm-section-title">Audit trail — every policy application</h2>
        <div className="cm-stack">
          {ops.allPolicyApplications().length === 0 ? (
            <p className="cm-card-sub">No policy applications journaled yet.</p>
          ) : (
            ops.allPolicyApplications().map((application) => (
              <div key={application.applicationId} className="cm-journey-item">
                <span className="cm-journey-name">{application.applicationId}</span>
                <StatusChip status={application.decision} note="The gate decision (ALLOW / REQUIRE_APPROVAL / DENY / OVERRIDE)" />
                <span className="cm-journey-summary">
                  {application.actionKind} ·{" "}
                  {application.reasons.length > 0 ? application.reasons.join(", ") : "no reasons"} ·
                  {application.effectRef ? ` effect ${application.effectRef}` : " no effect"}
                  {application.overrideRef ? ` · override ${application.overrideRef}` : ""} ·
                  {" "}{application.occurredAt}
                </span>
              </div>
            ))
          )}
          <p className="cm-card-sub">
            One journaled fact per decision — the append-only record an auditor replays.
          </p>
        </div>
      </section>

      <section aria-label="Journal">
        <h2 className="cm-section-title">Journal (append-only, deterministic)</h2>
        <EventTrail
          events={runtime
            .events()
            .slice(-20)
            .map((event) => ({
              kind: event.kind,
              subjectId: event.subject.subjectId,
              at: event.occurredAt,
            }))}
          limit={20}
        />
      </section>
    </div>
  );
}
