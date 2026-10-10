/**
 * trust-recourse component — the J17 surface (lazily loaded).
 *
 * The seed replays a fixed script through the REAL deterministic kernel:
 * three captured orders, a wrong-item dispute, a counterfeit dispute with a
 * provider chargeback already forced, an authorized wrong-item return, and a
 * settlement observed as UNKNOWN. Every live action is a typed command
 * envelope: evidence lands in the dispute record, decisions are journaled
 * (money moves only through the explicit refund paths, each bounded by
 * captured funds), appeals arrive as chargebacks under the no-double-refund
 * cap, and UNKNOWN settlement states stay UNKNOWN until observed or the
 * window closes.
 *
 * Split for the oxlint max-lines gate (pure code motion, zero behavior
 * change): the seed lives in ./seed.ts, the threat-signal queue and the two
 * case sections in ./component-parts.tsx. This file remains the module's
 * public surface (module.ts imports it).
 */

import type { JSX } from "react";


import { useState } from "react";
import type {
  CommandExecution,
  RuntimeCommandPayload,
} from "@unicom/commerce";
import type { CommerceModuleProps } from "../../commerce-host/contract/index.js";
import {
  DEMO_MERCHANT_ACTOR,
  DEMO_SYSTEM_ACTOR,
  demoMoney,
  fmtMoney,
} from "../merchant-shared/demo-runtime.js";
import {
  ConfirmableAction,
  DemoTag,
  EventTrail,
  PermissionBoundary,
  StatusChip,
  useRefresh,
  useSeededRuntime,
} from "../merchant-shared/ui.js";
import {
  DISPUTE_COUNTERFEIT_REASON,
  DISPUTE_WRONG_ITEM_REASON,
  TRUST_FIXTURES_ID,
  WRONG_ITEM_EVIDENCE,
} from "./fixtures.js";
import { seedTrustDemo, RETURN_NEXT_TRIGGER, type KernelRun } from "./seed.js";
import {
  CounterfeitCaseSection,
  ThreatSignalsSection,
  WrongItemCaseSection,
} from "./component-parts.js";

export default function TrustRecourseComponent({ host }: CommerceModuleProps): JSX.Element {
  const { runtime, reset } = useSeededRuntime(seedTrustDemo);
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
          <h1 className="cm-card-title">J17 · Trust &amp; recourse</h1>
          <p className="cm-card-sub">
            Seeding the deterministic demo kernel (three captured orders, two disputes, a forced
            chargeback, an authorized return)…
          </p>
        </div>
      </section>
    );
  }

  const view = runtime.view();
  void version; // re-render trigger after each completed command

  const disputes = view.allDisputes();
  const wrongItemDispute = disputes.find((dispute) => dispute.reason === DISPUTE_WRONG_ITEM_REASON)!;
  const counterfeitDispute = disputes.find((dispute) => dispute.reason === DISPUTE_COUNTERFEIT_REASON)!;
  const chargebacks = view.allChargebacks();
  const returns = view.allReturns();
  const activeReturn = returns.find((entry) => RETURN_NEXT_TRIGGER[entry.state] !== null) ?? returns[0];
  const refunds = view.allRefunds();
  const payments = view.allPaymentIntents();

  /** The honest escalation-ladder rung for a case (derived from real state). */
  const ladderOf = (dispute: (typeof disputes)[number]): string => {
    const hasChargeback = chargebacks.some((record) => record.paymentId === dispute.paymentId);
    if (dispute.state === "RESOLVED_ACCEPTED" || dispute.state === "RESOLVED_REJECTED") return "RESOLVED";
    if (hasChargeback) return "ESCALATED_TO_PROVIDER";
    return "MERCHANT_PROCESSING";
  };

  const runTrust = async (payload: RuntimeCommandPayload): Promise<void> => {
    await runCommand(DEMO_MERCHANT_ACTOR, payload);
  };
  const evidencePayload: RuntimeCommandPayload = {
    type: "SUBMIT_DISPUTE_EVIDENCE",
    disputeId: wrongItemDispute.disputeId,
    evidence: { summary: WRONG_ITEM_EVIDENCE.summary },
  };

  return (
    <div className="cm-stack">
      <section className="cm-card">
        <div className="cm-row">
          <h1 className="cm-card-title">J17 · Trust &amp; recourse</h1>
          <DemoTag />
        </div>
        <p className="cm-card-sub">
          The trust back-office (demo). Disputes, evidence, journaled decisions, provider
          escalations and controlled refunds are REAL deterministic kernel state; the threat-signal
          queue is committed evidence fixtures <code>{TRUST_FIXTURES_ID}</code>. Decisions never
          move money by themselves — refunds execute separately, each bounded by what was actually
          captured, and provider-native statuses are preserved verbatim.
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
            fixtures are synthetic — resettable, no credentials, no live provider or payment rail
          </span>
        </div>
      </section>

      <ThreatSignalsSection />

      <WrongItemCaseSection
        host={host}
        wrongItemDispute={wrongItemDispute}
        ladderOf={ladderOf}
        evidencePayload={evidencePayload}
        runCommand={runCommand}
        runTrust={runTrust}
        activeReturn={activeReturn}
        view={view}
        lastOutcome={lastOutcome}
      />

      <CounterfeitCaseSection
        host={host}
        counterfeitDispute={counterfeitDispute}
        ladderOf={ladderOf}
        runCommand={runCommand}
        runTrust={runTrust}
      />

      <section aria-label="Settlement observations">
        <h2 className="cm-section-title">Settlement observations — UNKNOWN stays UNKNOWN</h2>
        <div className="cm-stack">
          {payments.map((payment) => {
            const settlement = view.settlementRecord(payment.paymentId);
            return (
              <div key={payment.paymentId} className="cm-journey-item">
                <span className="cm-journey-name">{payment.paymentId}</span>
                <StatusChip status={settlement?.status ?? "PENDING"} note="Settlement status (PENDING = never observed; UNKNOWN = observed but unresolvable)" />
                <span className="cm-journey-summary">
                  payment {payment.status} · captured {fmtMoney(demoMoney(view.capturedTotalFor(payment.paymentId).toString()))} ·
                  refunded {fmtMoney(demoMoney(view.refundedTotalFor(payment.paymentId).toString()))}
                  {settlement?.providerNativeStatus ? ` · provider says ${settlement.providerNativeStatus} (verbatim)` : ""}
                </span>
              </div>
            );
          })}
          <div className="cm-row">
            <PermissionBoundary host={host} permission="finance.view-settlements">
              <ConfirmableAction
                actionLabel="Observe settlement for the case-1 payment (the rail answers ambiguously)"
                confirmLabel="Observe the settlement"
                statement="OBSERVE_SETTLEMENT asks the demo rail for the case-1 payment's settlement fact. The rail's native status for it is RAIL_PROCESSING_OPAQUE — the honest answer is UNKNOWN (reason RAIL_TIMEOUT, native status preserved verbatim). UNKNOWN is not failure and not success."
                onExecute={() => {
                  runtime.payments.scriptSettlementOutcome(wrongItemDispute.paymentId, {
                    resolved: "UNKNOWN",
                    reason: "RAIL_TIMEOUT",
                    providerNativeStatus: "RAIL_PROCESSING_OPAQUE",
                  });
                  void runCommand(DEMO_SYSTEM_ACTOR, {
                    type: "OBSERVE_SETTLEMENT",
                    paymentId: wrongItemDispute.paymentId,
                  });
                }}
              />
              <ConfirmableAction
                actionLabel="Close the settlement recourse window (case 1)"
                confirmLabel="Close the window"
                statement="CLOSE_SETTLEMENT_WINDOW ends the recourse window for the case-1 payment: an unresolved (PENDING/UNKNOWN) settlement becomes WINDOW_CLOSED — never silently promoted to money-in."
                onExecute={() => {
                  void runCommand(DEMO_SYSTEM_ACTOR, {
                    type: "CLOSE_SETTLEMENT_WINDOW",
                    paymentId: wrongItemDispute.paymentId,
                  });
                }}
              />
            </PermissionBoundary>
          </div>
          <p className="cm-card-sub">
            The case-3 payment (mug order) is seeded with an UNKNOWN settlement observation — an
            ambiguous rail answer, preserved verbatim until a later observation or the window
            close resolves it.
          </p>
        </div>
      </section>

      <section aria-label="Records">
        <h2 className="cm-section-title">Records — disputes, chargebacks, refunds, returns</h2>
        <div className="cm-stack">
          {disputes.map((dispute) => (
            <div key={dispute.disputeId} className="cm-journey-item">
              <span className="cm-journey-name">{dispute.disputeId}</span>
              <StatusChip status={dispute.state} note="Journaled dispute state" />
              <span className="cm-journey-summary">
                {dispute.reason} · {fmtMoney(dispute.amount)} · payment {dispute.paymentId} · order {dispute.orderId} ·
                provider <code>{dispute.providerNativeStatus ?? "—"}</code>
              </span>
            </div>
          ))}
          {chargebacks.map((chargeback) => (
            <div key={chargeback.chargebackId} className="cm-journey-item">
              <span className="cm-journey-name">{chargeback.chargebackId}</span>
              <StatusChip status={chargeback.state} note="FORCED_REFUND = money pulled back under the cap; NO_ADDITIONAL_REFUND = the double-refund guard held" />
              <span className="cm-journey-summary">
                claimed {fmtMoney(chargeback.amount)} · forced {fmtMoney(chargeback.forcedRefundAmount)} ·
                payment {chargeback.paymentId} · provider <code>{chargeback.providerNativeStatus ?? "—"}</code>
              </span>
            </div>
          ))}
          {refunds.length === 0 ? (
            <p className="cm-card-sub">No refunds executed yet.</p>
          ) : (
            refunds.map((refund) => (
              <div key={refund.refundId} className="cm-journey-item">
                <span className="cm-journey-name">{refund.refundId}</span>
                <StatusChip status={refund.state} note="Refund state — PENDING/UNKNOWN are not failures" />
                <StatusChip status={refund.refundKind ?? "POLICY_REFUND"} note="Refund provenance: policy / goodwill / chargeback-forced" />
                <span className="cm-journey-summary">
                  {fmtMoney(refund.amount)} · payment {refund.paymentId ?? "—"}
                  {refund.reason ? ` · ${refund.reason}` : ""}
                </span>
              </div>
            ))
          )}
          {returns.map((entry) => (
            <div key={entry.returnId} className="cm-journey-item">
              <span className="cm-journey-name">{entry.returnId}</span>
              <StatusChip status={entry.state} note="Return lifecycle state" />
              <span className="cm-journey-summary">
                order {entry.orderId} · resolution {entry.resolution} ·{" "}
                {entry.lines.map((line) => `${line.skuId} ×${line.quantity.units} (${line.reason})`).join(", ")}
              </span>
            </div>
          ))}
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
