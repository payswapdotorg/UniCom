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
 */

import type { JSX } from "react";


import { useState } from "react";
import { evaluateAutonomousPolicy } from "@unicom/commerce";
import type {
  CommandExecution,
  PrincipalRef,
  RuntimeCommandPayload,
} from "@unicom/commerce";
import type { CommerceModuleProps } from "../../commerce-host/contract/index.js";
import { autonomousStoreActor, DEMO_MERCHANT_ACTOR, DemoCommerceRuntime, demoMoney, fmtMoney } from "../merchant-shared/demo-runtime.js";
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
  AUTONOMOUS_LOCATION,
  AUTONOMOUS_SKU,
  AUTONOMOUS_STORE_ID,
  AUTONOMOUS_FIXTURES_ID,
  DEMO_STORE_NAME,
  DEMO_TILL_ID,
  HALTED_POLICY,
  HEALTHY_POLICY,
  POLICY_PREVIEWS,
} from "./fixtures.js";

type KernelRun = (
  actor: PrincipalRef,
  payload: RuntimeCommandPayload,
  opts?: { readonly commandId?: string; readonly idempotencyKey?: string },
) => Promise<CommandExecution>;

async function seedAutonomousDemo(): Promise<DemoCommerceRuntime> {
  const runtime = new DemoCommerceRuntime();
  const store = autonomousStoreActor(AUTONOMOUS_STORE_ID);

  // The healthy policy day (revision 1) — registered BEFORE any command.
  runtime.kernel.registerAutonomousPolicy(HEALTHY_POLICY);
  await runtime.run(DEMO_MERCHANT_ACTOR, {
    type: "REGISTER_AUTONOMOUS_STORE",
    autonomousStoreId: AUTONOMOUS_STORE_ID,
    ownerRef: DEMO_MERCHANT_ACTOR,
    displayName: DEMO_STORE_NAME,
  });
  await runtime.run(DEMO_MERCHANT_ACTOR, {
    type: "RECEIVE_STOCK",
    skuId: AUTONOMOUS_SKU.skuId,
    locationId: AUTONOMOUS_LOCATION,
    units: AUTONOMOUS_SKU.openingUnits,
    reason: "MANUAL",
  });
  await runtime.run(DEMO_MERCHANT_ACTOR, {
    type: "SET_SKU_PRICE",
    autonomousStoreId: AUTONOMOUS_STORE_ID,
    skuId: AUTONOMOUS_SKU.skuId,
    unitPrice: demoMoney(AUTONOMOUS_SKU.listPriceMinor),
    costBasis: demoMoney(AUTONOMOUS_SKU.costBasisMinor),
  });
  // Autonomous till opens inside the float band (USD 10.00–60.00 band, USD 25.00 float).
  await runtime.run(store, {
    type: "AUTONOMOUS_OPEN_TILL",
    autonomousStoreId: AUTONOMOUS_STORE_ID,
    tillId: DEMO_TILL_ID,
    openingCount: demoMoney("2500"),
  });
  // Restock trigger: 5 on hand at/below the 6-unit threshold → in-band order
  // (4 units × USD 30.00 = USD 120.00 of the USD 200.00 daily spend limit).
  await runtime.run(store, {
    type: "AUTONOMOUS_RESTOCK",
    autonomousStoreId: AUTONOMOUS_STORE_ID,
    skuId: AUTONOMOUS_SKU.skuId,
    locationId: AUTONOMOUS_LOCATION,
  });
  // In-band price adjustment: USD 42.00 → USD 44.00 (delta USD 2.00 < the
  // USD 5.00 approval threshold) → ALLOW, applied, before/after trailed.
  await runtime.run(store, {
    type: "ADJUST_SKU_PRICE",
    autonomousStoreId: AUTONOMOUS_STORE_ID,
    skuId: AUTONOMOUS_SKU.skuId,
    newPrice: demoMoney("4400"),
    reason: "weekend demand",
  });
  // Till close with a USD 17.00 shortfall (USD 25.00 expected, USD 8.00
  // counted) ≥ the USD 15.00 variance threshold → journaled CASH_VARIANCE
  // escalation, never a silent drop.
  const session = runtime.view().allStoreSessions().find((entry) => entry.tillId === DEMO_TILL_ID)!;
  await runtime.run(store, {
    type: "AUTONOMOUS_CLOSE_TILL",
    autonomousStoreId: AUTONOMOUS_STORE_ID,
    sessionId: session.sessionId,
    closingCount: demoMoney("800"),
  });
  // The HALT: revision 2 journals the observed discrepancy rate crossing the
  // stop threshold. From here the kernel boundary denies every autonomous
  // action with STOP_CONDITION_TRIGGERED until a human intervenes.
  runtime.kernel.registerAutonomousPolicy(HALTED_POLICY);
  return runtime;
}

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

      <section aria-label="Policy in force">
        <h2 className="cm-section-title">Policy in force</h2>
        <div className="cm-stack">
          <div className="cm-card">
            <div className="cm-row">
              <span className="cm-journey-name">{policy.policyId}</span>
              <StatusChip status={halted ? "HALTED" : "ACTIVE"} note={halted ? "A stop condition holds — autonomy is halted" : "No stop condition holds"} />
              <span className="cm-env-note">revision {policy.revision} · {policy.policyCurrency}</span>
            </div>
            {halted ? (
              <div className="cm-state-item" style={{ borderLeftColor: "var(--cm-warn)" }}>
                <div className="cm-row">
                  <span className="cm-state-item-label">
                    Autonomy is HALTED — a stop condition holds
                  </span>
                </div>
                <p className="cm-state-item-detail">
                  The observed reconciliation-discrepancy rate (6200 bps) crossed the stop
                  threshold (5000 bps). Every autonomous action is denied at the kernel
                  boundary with STOP_CONDITION_TRIGGERED until a human intervenes — the
                  human override below is the recorded recovery path, never a silent
                  bypass.
                </p>
              </div>
            ) : null}
            <p className="cm-card-sub">
              Spend limit {fmtMoney(policy.spendLimit.limitPerPeriod)} per{" "}
              {policy.spendLimit.period === "DAILY" ? "day" : policy.spendLimit.period.toLowerCase()} · promotion budget{" "}
              {fmtMoney(policy.promotionBudget.limitPerPeriod)} per{" "}
              {policy.promotionBudget.period === "DAILY" ? "day" : policy.promotionBudget.period.toLowerCase()} · margin floor{" "}
              {policy.marginFloorBps !== undefined ? `${policy.marginFloorBps} bps over cost` : "none"} ·
              refunds at/above {fmtMoney(policy.refundApprovalThreshold)} REQUIRE_APPROVAL ·
              price deltas at/above {fmtMoney(policy.priceChangeApprovalThreshold)} REQUIRE_APPROVAL
            </p>
            <div className="cm-stack">
              {policy.stopConditions.map((condition) => (
                <div key={condition.kind} className="cm-journey-item">
                  <span className="cm-journey-name">{condition.kind}</span>
                  <StatusChip
                    status={condition.currentlyObserved >= condition.threshold ? "STOP_CONDITION_TRIGGERED" : "WITHIN_BOUNDS"}
                    note="Stop condition: crossing the threshold halts autonomy deterministically"
                  />
                  <span className="cm-journey-summary">
                    observed {condition.currentlyObserved} bps · threshold {condition.threshold} bps
                  </span>
                </div>
              ))}
              <p className="cm-card-sub">
                Stop conditions are hard: when an observed rate/level crosses its threshold,
                autonomy halts pending human intervention — no model preference can override
                it. Revision 1 seeded the healthy history; revision 2 (the halt) is journaled
                the same way, never a silent mutation.
              </p>
            </div>
          </div>
          {control ? (
            <div className="cm-journey-item">
              <span className="cm-journey-name">{control.displayName}</span>
              <StatusChip status={control.mode} note="Store control mode" />
              <span className="cm-journey-summary">
                owner {control.ownerRef.kind} · controlling principal {control.controllingPrincipal.kind} ·
                registered {control.registeredAt} · revision {control.revision}
              </span>
              <span className="cm-env-note">
                store-control commands (price book, overrides, escalation handling) are
                authority-gated: only the registered owner or the current controlling
                principal may exercise them — enforced at the kernel boundary.
              </span>
            </div>
          ) : null}
        </div>
      </section>

      <section aria-label="Policy preview">
        <h2 className="cm-section-title">What the policy says before anything commits</h2>
        <div className="cm-stack">
          {POLICY_PREVIEWS.map((row) => {
            const decision = evaluateAutonomousPolicy(
              row.proposal,
              row.against === "healthy" ? HEALTHY_POLICY : HALTED_POLICY,
            );
            return (
              <div key={row.id} className="cm-state-item">
                <div className="cm-row">
                  <span className="cm-state-item-label">{row.label}</span>
                  <StatusChip
                    status={decision.decision === "ALLOW" ? "ALLOWED" : decision.decision}
                    note="Deterministic policy evaluation — a preview, nothing has committed"
                  />
                  {row.against === "halted" ? <DemoTag /> : null}
                </div>
                <p className="cm-state-item-detail">{row.statement}</p>
                <p className="cm-state-item-detail">
                  Decision <code>{decision.decision}</code>
                  {decision.reasons.length > 0 ? ` · reasons ${decision.reasons.join(", ")}` : " · no reasons (allowed)"}
                  {" · evaluated against the "}
                  {row.against === "healthy" ? "revision-1 (healthy) policy" : "revision-2 (halted) policy"}
                  {" — a preview only; nothing has committed."}
                </p>
              </div>
            );
          })}
          <p className="cm-card-sub">
            These previews call the same pure evaluator the kernel uses — before any action
            commits. ALLOW never skips the kernel gate; REQUIRE_APPROVAL actions are blocked
            at the boundary until a human override is recorded; DENY is a hard limit.
          </p>
        </div>
      </section>

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

      <section aria-label="Escalations">
        <h2 className="cm-section-title">Escalations (stop-the-line anomalies)</h2>
        <div className="cm-stack">
          {escalations.length === 0 ? (
            <p className="cm-card-sub">No escalations recorded.</p>
          ) : (
            escalations.map((escalation) => (
              <div key={escalation.escalationId} className="cm-state-item">
                <div className="cm-row">
                  <span className="cm-state-item-label">{escalation.escalationId}</span>
                  <StatusChip status={escalation.state} note="Escalation state (deterministic lifecycle OPEN → ACKNOWLEDGED → RESOLVED)" />
                  <span className="cm-env-note">{escalation.kind} · raised {escalation.raisedAt}</span>
                </div>
                {escalation.evidence.kind === "CASH_VARIANCE" ? (
                  <p className="cm-state-item-detail">
                    Cash variance at close: expected{" "}
                    {fmtMoney(escalation.evidence.variance.expected)}, counted{" "}
                    {fmtMoney(escalation.evidence.variance.counted)} — variance{" "}
                    {fmtMoney(escalation.evidence.variance.varianceAmount)} (
                    {escalation.evidence.variance.kind}), beyond the escalation threshold.
                  </p>
                ) : (
                  <p className="cm-state-item-detail">
                    {escalation.evidence.kind} evidence journaled with the escalation.
                  </p>
                )}
                <div className="cm-row">
                  <PermissionBoundary host={host} permission="storefront.manage">
                    {escalation.state === "OPEN" ? (
                      <ConfirmableAction
                        actionLabel="Acknowledge the cash-variance escalation"
                        confirmLabel="Acknowledge it"
                        statement="ADVANCE_STORE_ESCALATION with ACKNOWLEDGE: an owner confirms the anomaly has been seen (the escalation stays open until resolved). Journaled with your authority."
                        onExecute={() => {
                          void runOwner({
                            type: "ADVANCE_STORE_ESCALATION",
                            escalationId: escalation.escalationId,
                            trigger: "ACKNOWLEDGE",
                          });
                        }}
                      />
                    ) : null}
                    {escalation.state === "ACKNOWLEDGED" ? (
                      <ConfirmableAction
                        actionLabel="Resolve the acknowledged escalation"
                        confirmLabel="Resolve it"
                        statement="ADVANCE_STORE_ESCALATION with RESOLVE: closes the anomaly with the investigation outcome carried in the journal (counted cash reconciled against the shortfall)."
                        onExecute={() => {
                          void runOwner({
                            type: "ADVANCE_STORE_ESCALATION",
                            escalationId: escalation.escalationId,
                            trigger: "RESOLVE",
                          });
                        }}
                      />
                    ) : null}
                    {escalation.state === "RESOLVED" ? (
                      <ConfirmableAction
                        actionLabel="Try to acknowledge the resolved escalation again (see the refusal)"
                        confirmLabel="Attempt the invalid acknowledgement"
                        statement="The escalation is terminal (RESOLVED). Re-acknowledging is an invalid lifecycle transition — the kernel refuses it deterministically; nothing is partially applied. This is what an honest refusal looks like."
                        onExecute={() => {
                          void runOwner({
                            type: "ADVANCE_STORE_ESCALATION",
                            escalationId: escalation.escalationId,
                            trigger: "ACKNOWLEDGE",
                          });
                        }}
                      />
                    ) : null}
                  </PermissionBoundary>
                </div>
              </div>
            ))
          )}
          <p className="cm-card-sub">
            Escalations are journaled states, never swallowed anomalies: the cash variance
            above the threshold raised this one at till close; acknowledging and resolving
            are authority-gated commands an owner exercises.
          </p>
        </div>
      </section>

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
