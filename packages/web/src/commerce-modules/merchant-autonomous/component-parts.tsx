/**
 * merchant-autonomous presentational parts — split out of component.tsx for
 * the oxlint max-lines gate (pure code motion; the JSX is byte-identical).
 *
 * The policy-in-force card (with the HALTED banner + stop conditions), the
 * deterministic policy previews and the escalation queue; composed by
 * component.tsx, which remains the module's public surface.
 */

import type { JSX } from "react";

import { evaluateAutonomousPolicy } from "@unicom/commerce";
import type {
  AutonomousStoreControl,
  AutonomousStorePolicy,
  RuntimeCommandPayload,
  StoreEscalation,
} from "@unicom/commerce";
import type { CommerceHostServices } from "../../commerce-host/contract/index.js";
import { fmtMoney } from "../merchant-shared/demo-runtime.js";
import {
  ConfirmableAction,
  DemoTag,
  PermissionBoundary,
  StatusChip,
} from "../merchant-shared/ui.js";
import { HALTED_POLICY, HEALTHY_POLICY, POLICY_PREVIEWS } from "./fixtures.js";

export function PolicyInForceSection({
  policy,
  halted,
  control,
}: {
  readonly policy: AutonomousStorePolicy;
  readonly halted: boolean;
  readonly control: AutonomousStoreControl | undefined;
}): JSX.Element {
  return (
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
  );
}

export function PolicyPreviewSection(): JSX.Element {
  return (
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
  );
}

export function EscalationsSection({
  escalations,
  host,
  runOwner,
}: {
  readonly escalations: readonly StoreEscalation[];
  readonly host: CommerceHostServices;
  readonly runOwner: (payload: RuntimeCommandPayload) => Promise<void>;
}): JSX.Element {
  return (
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
  );
}
