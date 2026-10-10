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
 */

import type { JSX } from "react";


import { useState } from "react";
import { countQuantity, makeId } from "@unicom/commerce";
import type {
  CommandExecution,
  PrincipalRef,
  ReturnAuthorization,
  ReturnTrigger,
  RuntimeCommandPayload,
} from "@unicom/commerce";
import type { CommerceModuleProps } from "../../commerce-host/contract/index.js";
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
  DISPUTE_COUNTERFEIT_REASON,
  DISPUTE_WRONG_ITEM_REASON,
  EVIDENCE_COMMAND_ID,
  EVIDENCE_IDEMPOTENCY_KEY,
  POLICY_REASONS,
  PROVIDER_DISPUTE_OPEN,
  PROVIDER_DISPUTE_UNDER_REVIEW,
  THREAT_SIGNALS,
  TRUST_CARD,
  TRUST_FIXTURES_ID,
  TRUST_LOCATION,
  TRUST_SKUS,
  WRONG_ITEM_EVIDENCE,
} from "./fixtures.js";

type KernelRun = (
  actor: PrincipalRef,
  payload: RuntimeCommandPayload,
  opts?: { readonly commandId?: string; readonly idempotencyKey?: string },
) => Promise<CommandExecution>;

const RETURN_NEXT_TRIGGER: Readonly<Record<ReturnAuthorization["state"], ReturnTrigger | null>> = {
  REQUESTED: "AUTHORIZE",
  AUTHORIZED: "SHIP_BACK",
  IN_TRANSIT: "RECEIVE",
  RECEIVED: "INSPECT",
  INSPECTED: "RESOLVE",
  RESOLVED: null,
  REJECTED: null,
  EXPIRED: null,
  CANCELLED: null,
};

/** Deterministic order seed: cart → checkout → captured ORDER payment. */
async function seedCapturedOrder(
  runtime: DemoCommerceRuntime,
  cartId: string,
  skuId: string,
  units: number,
  unitPriceMinor: string,
): Promise<{ readonly orderId: string; readonly paymentId: string }> {
  await runtime.run(DEMO_CUSTOMER_ACTOR, {
    type: "ADD_CART_LINE",
    cartId: makeId<"CartId">(cartId),
    skuId: makeId<"SkuId">(skuId),
    quantity: countQuantity(units),
    unitPrice: demoMoney(unitPriceMinor),
  });
  await runtime.run(DEMO_CUSTOMER_ACTOR, {
    type: "OPEN_CHECKOUT",
    cartId: makeId<"CartId">(cartId),
  });
  const session = runtime.view().allCheckoutSessions().find((entry) => entry.cartId === cartId)!;
  await runtime.run(DEMO_CUSTOMER_ACTOR, {
    type: "COMPLETE_CHECKOUT",
    checkoutSessionId: session.checkoutSessionId,
    merchantId: DEMO_MERCHANT_ACTOR.merchantId,
    method: TRUST_CARD,
  });
  const order = runtime.view().allOrders().find((entry) => entry.checkoutSessionId === session.checkoutSessionId)!;
  const payment = runtime
    .view()
    .allPaymentIntents()
    .find((intent) => intent.reference.kind === "ORDER" && intent.reference.orderId === order.orderId)!;
  await runtime.run(DEMO_MERCHANT_ACTOR, { type: "CAPTURE_PAYMENT", paymentId: payment.paymentId });
  return { orderId: order.orderId, paymentId: payment.paymentId };
}

async function seedTrustDemo(): Promise<DemoCommerceRuntime> {
  const runtime = new DemoCommerceRuntime();

  for (const sku of TRUST_SKUS) {
    await runtime.run(DEMO_MERCHANT_ACTOR, {
      type: "RECEIVE_STOCK",
      skuId: makeId<"SkuId">(sku.skuId),
      locationId: TRUST_LOCATION,
      units: sku.openingUnits,
      reason: "MANUAL",
    });
  }

  // Case 1 — wrong item: order D1 (two pin sets, USD 48.00 captured),
  // dispute OPEN, one-unit return authorized.
  const case1 = await seedCapturedOrder(runtime, "cart-trust-d1", "sku-trust-pins", 2, "2400");
  await runtime.run(DEMO_SYSTEM_ACTOR, {
    type: "OPEN_DISPUTE",
    paymentId: makeId<"PaymentId">(case1.paymentId),
    amount: demoMoney("4800"),
    reason: DISPUTE_WRONG_ITEM_REASON,
    providerNativeStatus: PROVIDER_DISPUTE_OPEN,
  });
  await runtime.run(DEMO_CUSTOMER_ACTOR, {
    type: "OPEN_RETURN",
    orderId: makeId<"OrderId">(case1.orderId),
    resolution: "REFUND",
    lines: [
      {
        skuId: makeId<"SkuId">("sku-trust-pins"),
        quantity: countQuantity(1),
        reason: "WRONG_ITEM",
      },
    ],
  });
  const seededReturn = runtime.view().allReturns()[0]!;
  await runtime.run(DEMO_MERCHANT_ACTOR, {
    type: "ADVANCE_RETURN",
    returnId: seededReturn.returnId,
    trigger: "AUTHORIZE",
  });

  // Case 2 — counterfeit claim: order D2 (pendant, USD 99.00 captured),
  // dispute OPEN, and the provider already FORCED a full chargeback refund.
  const case2 = await seedCapturedOrder(runtime, "cart-trust-d2", "sku-trust-pendant", 1, "9900");
  await runtime.run(DEMO_SYSTEM_ACTOR, {
    type: "OPEN_DISPUTE",
    paymentId: makeId<"PaymentId">(case2.paymentId),
    amount: demoMoney("9900"),
    reason: DISPUTE_COUNTERFEIT_REASON,
    providerNativeStatus: PROVIDER_DISPUTE_UNDER_REVIEW,
  });
  await runtime.run(DEMO_SYSTEM_ACTOR, {
    type: "RECORD_CHARGEBACK",
    paymentId: makeId<"PaymentId">(case2.paymentId),
    amount: demoMoney("9900"),
    providerNativeStatus: "PROVIDER_ARBITRATION_WON",
  });

  // Case 3 — the ordinary mug order whose settlement the rail reports
  // ambiguously: observed UNKNOWN, preserved as UNKNOWN.
  const case3 = await seedCapturedOrder(runtime, "cart-trust-d3", "sku-trust-mug", 2, "1600");
  await runtime.run(DEMO_SYSTEM_ACTOR, {
    type: "OBSERVE_SETTLEMENT",
    paymentId: makeId<"PaymentId">(case3.paymentId),
  });
  return runtime;
}

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
