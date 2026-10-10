/**
 * trust-recourse case sections — split out of component.tsx for the oxlint
 * max-lines gate (pure code motion; the JSX is byte-identical).
 *
 * The threat-signal queue (fixture evidence), the wrong-item case (dispute,
 * evidence, journaled decision, authorized return, controlled refunds) and
 * the counterfeit case (decision, appeal, no-double-refund guard); composed
 * by component.tsx, which remains the module's public surface.
 */

import type { JSX } from "react";

import type {
  CommandExecution,
  DisputeRecord,
  ReturnAuthorization,
  RuntimeCommandPayload,
} from "@unicom/commerce";
import type { CommerceHostServices } from "../../commerce-host/contract/index.js";
import { DEMO_MERCHANT_ACTOR, DEMO_SYSTEM_ACTOR, demoMoney, fmtMoney } from "../merchant-shared/demo-runtime.js";
import type { KernelView } from "../merchant-shared/demo-runtime.js";
import {
  CommandOutcomeView,
  ConfirmableAction,
  DemoTag,
  PermissionBoundary,
  StatusChip,
} from "../merchant-shared/ui.js";
import {
  EVIDENCE_COMMAND_ID,
  EVIDENCE_IDEMPOTENCY_KEY,
  POLICY_REASONS,
  THREAT_SIGNALS,
} from "./fixtures.js";
import { RETURN_NEXT_TRIGGER, type KernelRun } from "./seed.js";

export function ThreatSignalsSection(): JSX.Element {
  return (
    <section aria-label="Threat signals">
      <h2 className="cm-section-title">Threat signals (evidence queue)</h2>
      <div className="cm-stack">
        {THREAT_SIGNALS.map((signal) => (
          <div key={signal.signalId} className="cm-state-item">
            <div className="cm-row">
              <span className="cm-state-item-label">{signal.category}</span>
              <StatusChip status={signal.proofLevel} note="Proof level: how many independent sources corroborate this signal" />
              <DemoTag />
            </div>
            <p className="cm-state-item-detail">{signal.subject} — {signal.evidence}</p>
            <p className="cm-state-item-detail" style={{ color: "var(--cm-fg-faint)" }}>
              {signal.disposition}
            </p>
          </div>
        ))}
        <p className="cm-card-sub">
          Signals are evidence DATA, never instructions: they open cases for humans to decide.
          UNVERIFIABLE would be shown as exactly that — an unprovable claim is not a denial.
        </p>
      </div>
    </section>
  );
}

export function WrongItemCaseSection({
  host,
  wrongItemDispute,
  ladderOf,
  evidencePayload,
  runCommand,
  runTrust,
  activeReturn,
  view,
  lastOutcome,
}: {
  readonly host: CommerceHostServices;
  readonly wrongItemDispute: DisputeRecord;
  readonly ladderOf: (dispute: DisputeRecord) => string;
  readonly evidencePayload: RuntimeCommandPayload;
  readonly runCommand: KernelRun;
  readonly runTrust: (payload: RuntimeCommandPayload) => Promise<void>;
  readonly activeReturn: ReturnAuthorization | undefined;
  readonly view: KernelView;
  readonly lastOutcome: CommandExecution | null;
}): JSX.Element {
  return (
    <section aria-label="Wrong-item case">
      <h2 className="cm-section-title">Case 1 · wrong item — dispute, return, controlled refund</h2>
      <div className="cm-stack">
        <div className="cm-state-item">
          <div className="cm-row">
            <span className="cm-state-item-label">dispute {wrongItemDispute.disputeId}</span>
            <StatusChip status={wrongItemDispute.state} note="Dispute lifecycle: OPEN → EVIDENCE_SUBMITTED → RESOLVED_*" />
            <StatusChip status={ladderOf(wrongItemDispute)} note="Recourse escalation ladder (derived from real state)" />
            <span className="cm-env-note">
              {fmtMoney(wrongItemDispute.amount)} · provider says <code>{wrongItemDispute.providerNativeStatus}</code> (verbatim)
            </span>
          </div>
          <p className="cm-state-item-detail">
            Evidence in record:{" "}
            {wrongItemDispute.state === "OPEN"
              ? "none yet — the buyer's photos and the carrier weight record are held by support."
              : "packing list + carrier weight check submitted (see journal)."}
          </p>
          <div className="cm-row">
            <PermissionBoundary host={host} permission="trust.review-disputes">
              {wrongItemDispute.state === "OPEN" || wrongItemDispute.state === "EVIDENCE_SUBMITTED" ? (
                <>
                  {wrongItemDispute.state === "OPEN" ? (
                    <ConfirmableAction
                      actionLabel="Submit wrong-item evidence (packing list + weight check)"
                      confirmLabel="Submit the evidence"
                      statement="SUBMIT_DISPUTE_EVIDENCE puts the packing-list + carrier-weight summary into the dispute record (evidence is untrusted DATA, never instructions) and moves the dispute to EVIDENCE_SUBMITTED. The command travels under a FIXED idempotency key so the duplicate-submission case below can replay this exact envelope."
                      onExecute={() => {
                        void runCommand(DEMO_MERCHANT_ACTOR, evidencePayload, {
                          commandId: EVIDENCE_COMMAND_ID,
                          idempotencyKey: EVIDENCE_IDEMPOTENCY_KEY,
                        });
                      }}
                    />
                  ) : null}
                  <ConfirmableAction
                    actionLabel="Re-submit the same evidence envelope (same idempotency key)"
                    confirmLabel="Replay the identical envelope"
                    statement="Replays the EXACT evidence command (same command id + idempotency key). The kernel answers DUPLICATE with the original receipt — no new evidence event, no double submission. Exactly-once execution, visible. (Submit the evidence first if you have not; the replay needs the original to exist.)"
                    onExecute={() => {
                      void runCommand(DEMO_MERCHANT_ACTOR, evidencePayload, {
                        commandId: EVIDENCE_COMMAND_ID,
                        idempotencyKey: EVIDENCE_IDEMPOTENCY_KEY,
                      });
                    }}
                  />
                </>
              ) : null}
              {wrongItemDispute.state === "EVIDENCE_SUBMITTED" ? (
                <ConfirmableAction
                  actionLabel="Uphold the wrong-item dispute (RESOLVE ACCEPTED)"
                  confirmLabel="Uphold the claim"
                  statement="RESOLVE_DISPUTE ACCEPTED upholds the claim: a JOURNALED DECISION with the policy reason shown below. Money does not move here — the refund executes separately in the refunds panel, bounded by captured funds."
                  onExecute={() => {
                    void runTrust({
                      type: "RESOLVE_DISPUTE",
                      disputeId: wrongItemDispute.disputeId,
                      outcome: "ACCEPTED",
                    });
                  }}
                />
              ) : null}
            </PermissionBoundary>
          </div>
          {wrongItemDispute.state === "RESOLVED_ACCEPTED" ? (
            <p className="cm-state-item-detail">
              Policy reason: {POLICY_REASONS.acceptWrongItem}
            </p>
          ) : null}
        </div>

        {activeReturn ? (
          <div className="cm-state-item">
            <div className="cm-row">
              <span className="cm-state-item-label">return {activeReturn.returnId}</span>
              <StatusChip status={activeReturn.state} note="Return lifecycle: REQUESTED → AUTHORIZED → IN_TRANSIT → RECEIVED → INSPECTED → RESOLVED" />
              <span className="cm-env-note">
                resolution {activeReturn.resolution} ·{" "}
                {activeReturn.lines.map((line) => `${line.skuId} ×${line.quantity.units} (${line.reason})`).join(", ")}
              </span>
            </div>
            <p className="cm-state-item-detail">
              One pin set comes back (the wrong one). The return authorizes the goods flow; the
              money executes only through the refund path.
            </p>
            <div className="cm-row">
              <PermissionBoundary host={host} permission="support.handle-recourse">
                {RETURN_NEXT_TRIGGER[activeReturn.state] !== null ? (
                  <ConfirmableAction
                    actionLabel={`Advance the return (next: ${RETURN_NEXT_TRIGGER[activeReturn.state]})`}
                    confirmLabel="Advance the return"
                    statement={`ADVANCE_RETURN ${RETURN_NEXT_TRIGGER[activeReturn.state]}: one deterministic lifecycle step for the wrong-item return — ship-back, receipt at the dock, inspection, then resolution. Each step is journaled.`}
                    onExecute={() => {
                      void runTrust({
                        type: "ADVANCE_RETURN",
                        returnId: activeReturn.returnId,
                        trigger: RETURN_NEXT_TRIGGER[activeReturn.state]!,
                      });
                    }}
                  />
                ) : null}
              </PermissionBoundary>
            </div>
          </div>
        ) : null}

        <div className="cm-card">
          <div className="cm-row">
            <h3 className="cm-card-title">Controlled refunds (bounded by captured funds)</h3>
            <span className="cm-env-note">
              captured {fmtMoney(demoMoney(view.capturedTotalFor(wrongItemDispute.paymentId).toString()))} ·
              refunded {fmtMoney(demoMoney(view.refundedTotalFor(wrongItemDispute.paymentId).toString()))}
            </span>
          </div>
          <div className="cm-row">
            <PermissionBoundary host={host} permission="finance.approve-refund">
              <ConfirmableAction
                actionLabel="Refund the upheld wrong-item unit (USD 24.00, within captured)"
                confirmLabel="Execute the controlled refund"
                statement="REFUND_PAYMENT for USD 24.00 on the case-1 payment: exactly the wrong unit's price, bounded by the captured USD 48.00. The refund is journaled as a POLICY_REFUND with the dispute as its reason context."
                onExecute={() => {
                  void runTrust({
                    type: "REFUND_PAYMENT",
                    paymentId: wrongItemDispute.paymentId,
                    amount: demoMoney("2400"),
                  });
                }}
              />
              <ConfirmableAction
                actionLabel="Issue a goodwill refund for the damaged packaging (USD 8.00)"
                confirmLabel="Issue the goodwill refund"
                statement="ISSUE_GOODWILL_REFUND for USD 8.00 with a journaled reason (a merchant concession — distinguishable from policy refunds and chargeback-forced refunds in every record). Bounded by captured funds like every refund."
                onExecute={() => {
                  void runTrust({
                    type: "ISSUE_GOODWILL_REFUND",
                    paymentId: wrongItemDispute.paymentId,
                    amount: demoMoney("800"),
                    reason: "packaging crushed in transit — goodwill on the correct unit",
                  });
                }}
              />
              <ConfirmableAction
                actionLabel="Try a refund beyond the captured total (USD 9,999.00)"
                confirmLabel="Attempt the out-of-bounds refund"
                statement="A refund larger than everything captured can never execute: the kernel refuses it with EXCEEDS_CAPTURED — refunds are bounded by captured totals under any interleaving. See the refusal and its recovery path."
                onExecute={() => {
                  void runTrust({
                    type: "REFUND_PAYMENT",
                    paymentId: wrongItemDispute.paymentId,
                    amount: demoMoney("999900"),
                  });
                }}
              />
            </PermissionBoundary>
          </div>
        </div>
        {lastOutcome ? <CommandOutcomeView outcome={lastOutcome} /> : null}
      </div>
    </section>
  );
}

export function CounterfeitCaseSection({
  host,
  counterfeitDispute,
  ladderOf,
  runCommand,
  runTrust,
}: {
  readonly host: CommerceHostServices;
  readonly counterfeitDispute: DisputeRecord;
  readonly ladderOf: (dispute: DisputeRecord) => string;
  readonly runCommand: KernelRun;
  readonly runTrust: (payload: RuntimeCommandPayload) => Promise<void>;
}): JSX.Element {
  return (
    <section aria-label="Counterfeit case">
      <h2 className="cm-section-title">Case 2 · counterfeit claim — decision, appeal, no double refund</h2>
      <div className="cm-stack">
        <div className="cm-state-item">
          <div className="cm-row">
            <span className="cm-state-item-label">dispute {counterfeitDispute.disputeId}</span>
            <StatusChip status={counterfeitDispute.state} note="Dispute lifecycle" />
            <StatusChip status={ladderOf(counterfeitDispute)} note="Recourse escalation ladder (derived from real state)" />
            <span className="cm-env-note">
              {fmtMoney(counterfeitDispute.amount)} · provider says <code>{counterfeitDispute.providerNativeStatus}</code> (verbatim)
            </span>
          </div>
          <p className="cm-state-item-detail">
            The hallmark check is single-source — below the corroboration bar. The provider
            ALREADY forced a full USD 99.00 chargeback refund (see chargebacks below); the
            merchant still records the dispute decision.
          </p>
          <div className="cm-row">
            <PermissionBoundary host={host} permission="trust.review-disputes">
              {counterfeitDispute.state === "OPEN" ? (
                <ConfirmableAction
                  actionLabel="Reject the counterfeit dispute (RESOLVE REJECT)"
                  confirmLabel="Reject the claim"
                  statement="RESOLVE_DISPUTE REJECTED denies the claim with a journaled decision and the policy reason. Denial is not a dead end: the recovery path (buyer appeal to the provider) is shown, and a provider-forced chargeback would land in the chargeback panel."
                  onExecute={() => {
                    void runTrust({
                      type: "RESOLVE_DISPUTE",
                      disputeId: counterfeitDispute.disputeId,
                      outcome: "REJECTED",
                    });
                  }}
                />
              ) : null}
              {counterfeitDispute.state === "RESOLVED_REJECTED" ? (
                <ConfirmableAction
                  actionLabel="Provider appeal decided — record the second chargeback (USD 25.00)"
                  confirmLabel="Record the appeal chargeback"
                  statement="The buyer appealed and the provider arbitrated in their favour, forcing USD 25.00 more. The captured funds are already fully refunded — the no-double-refund guard caps this chargeback at zero and journals NO_ADDITIONAL_REFUND: the prevention itself is an explicit fact."
                  onExecute={() => {
                    void runCommand(DEMO_SYSTEM_ACTOR, {
                      type: "RECORD_CHARGEBACK",
                      paymentId: counterfeitDispute.paymentId,
                      amount: demoMoney("2500"),
                      providerNativeStatus: "PROVIDER_APPEAL_WON",
                    });
                  }}
                />
              ) : null}
            </PermissionBoundary>
          </div>
          {counterfeitDispute.state === "RESOLVED_REJECTED" ? (
            <p className="cm-state-item-detail">Policy reason: {POLICY_REASONS.rejectCounterfeit}</p>
          ) : null}
        </div>
        <p className="cm-card-sub">
          Appeal/escalation ladder: merchant decision → buyer appeal → provider arbitration →
          chargeback forcing. Every rung is a journaled fact; the money can never refund twice.
        </p>
      </div>
    </section>
  );
}
