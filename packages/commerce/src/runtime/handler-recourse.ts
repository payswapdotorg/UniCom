/**
 * Recourse handlers (W1-004): dispute lifecycle, chargeback forcing,
 * goodwill refunds.
 *
 * Laws enforced here:
 * - Recourse decisions are journaled policy applications: dispute resolution
 *   records the decision (RESOLVED_ACCEPTED / RESOLVED_REJECTED) and moves
 *   NO money by itself — money moves only through the explicit refund paths,
 *   each bounded by captured totals (the decision/execution separation is
 *   the deterministic vocabulary Stage 4 composes).
 * - A chargeback FORCES the refund path under the no-double-refund cap:
 *   forced = min(chargebackAmount, captured − refunded). When the cap
 *   leaves nothing, the chargeback is journaled as NO_ADDITIONAL_REFUND —
 *   the prevention itself is an explicit fact.
 * - A goodwill refund carries its reason into the journal and its
 *   refundKind stays GOODWILL_REFUND — distinguishable from POLICY_REFUND
 *   and CHARGEBACK_FORCED_REFUND in every fold and projection.
 */
import { chargebackForcedAmount, type ChargebackRecord } from "../domain/recourse.js";
import { advanceDispute, type DisputeRecord } from "../domain/recourse.js";
import { validateRefundAgainstCaptures } from "../domain/settlement.js";
import type { PaymentIntent } from "../domain/payments.js";
import {
  accept,
  rejectInvalidCommand,
  rejectInvalidState,
  type RuntimeCommandHandler,
} from "./handler.js";
import { emitRefundRecorded, emitOrderPaymentEffects, emitIntentRecorded } from "./handler-payment.js";
import { chargebackSubject, disputeSubject, mintChargebackId, mintDisputeId } from "./subjects.js";

export const handleOpenDispute: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "OPEN_DISPUTE") return rejectInvalidCommand("not OPEN_DISPUTE");
  const intent = ctx.state.paymentIntent(payload.paymentId);
  if (!intent) return rejectInvalidState(`payment ${payload.paymentId} not found`);
  if (payload.amount.currency !== intent.amount.currency) {
    return rejectInvalidCommand(`dispute currency ${payload.amount.currency} does not match payment ${intent.amount.currency}`);
  }
  if (BigInt(payload.amount.amountMinor) <= 0n || BigInt(payload.amount.amountMinor) > BigInt(intent.amount.amountMinor)) {
    return rejectInvalidCommand(`dispute amount ${payload.amount.amountMinor} out of bounds for ${intent.amount.amountMinor}`);
  }
  if (intent.reference.kind !== "ORDER") {
    return rejectInvalidState(`disputes require an ORDER-referenced payment; ${payload.paymentId} references ${intent.reference.kind}`);
  }
  const dispute: DisputeRecord = {
    disputeId: mintDisputeId(ctx.mint()),
    paymentId: intent.paymentId,
    orderId: intent.reference.orderId,
    amount: payload.amount,
    reason: payload.reason,
    providerNativeStatus: payload.providerNativeStatus,
    state: "OPEN",
    revision: 1,
  };
  ctx.emit({
    subject: disputeSubject(dispute.disputeId),
    kind: "DISPUTE_OPENED",
    payload: { kind: "DISPUTE_OPENED", dispute },
  });
  return accept();
};

export const handleSubmitDisputeEvidence: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "SUBMIT_DISPUTE_EVIDENCE") return rejectInvalidCommand("not SUBMIT_DISPUTE_EVIDENCE");
  const dispute = ctx.state.dispute(payload.disputeId);
  if (!dispute) return rejectInvalidState(`dispute ${payload.disputeId} not found`);
  if (payload.evidence.summary.trim().length === 0) {
    return rejectInvalidCommand("dispute evidence summary must be non-empty");
  }
  const next = advanceDispute(dispute, "SUBMIT_EVIDENCE");
  if (!next.ok) {
    return rejectInvalidState(`dispute ${payload.disputeId}: ${next.error.code} from ${next.error.from} on ${next.error.trigger}`);
  }
  ctx.emit({
    subject: disputeSubject(payload.disputeId),
    kind: "DISPUTE_STATE_CHANGED",
    payload: { kind: "DISPUTE_STATE_CHANGED", dispute: next.value, evidence: payload.evidence },
  });
  return accept();
};

export const handleResolveDispute: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "RESOLVE_DISPUTE") return rejectInvalidCommand("not RESOLVE_DISPUTE");
  const dispute = ctx.state.dispute(payload.disputeId);
  if (!dispute) return rejectInvalidState(`dispute ${payload.disputeId} not found`);
  const trigger = payload.outcome === "ACCEPTED" ? "RESOLVE_ACCEPT" : "RESOLVE_REJECT";
  const next = advanceDispute(dispute, trigger);
  if (!next.ok) {
    return rejectInvalidState(`dispute ${payload.disputeId}: ${next.error.code} from ${next.error.from} on ${next.error.trigger}`);
  }
  // The resolution is a JOURNALED DECISION: money does not move here. The
  // refund executes separately (REFUND_PAYMENT / chargeback forcing), each
  // with its own guard — decision and execution stay composable.
  ctx.emit({
    subject: disputeSubject(payload.disputeId),
    kind: "DISPUTE_RESOLVED",
    payload: { kind: "DISPUTE_RESOLVED", dispute: next.value, outcome: payload.outcome },
  });
  return accept();
};

export const handleRecordChargeback: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "RECORD_CHARGEBACK") return rejectInvalidCommand("not RECORD_CHARGEBACK");
  const intent = ctx.state.paymentIntent(payload.paymentId);
  if (!intent) return rejectInvalidState(`payment ${payload.paymentId} not found`);
  if (payload.amount.currency !== intent.amount.currency) {
    return rejectInvalidCommand(`chargeback currency ${payload.amount.currency} does not match payment ${intent.amount.currency}`);
  }
  const capturedTotal = ctx.state.capturedTotalFor(payload.paymentId);
  if (capturedTotal <= 0n) {
    return rejectInvalidState(`chargeback ${payload.paymentId} has no captured funds to force a refund against (captured ${capturedTotal})`);
  }
  const refundedTotal = ctx.state.refundedTotalFor(payload.paymentId);
  const forcing = chargebackForcedAmount(payload.amount, capturedTotal, refundedTotal);
  if (!forcing.ok) return rejectInvalidCommand(`chargeback: ${forcing.error.code} (${forcing.error.detail})`);
  const forced = forcing.value;
  const chargebackId = mintChargebackId(ctx.mint());
  if (BigInt(forced.amountMinor) > 0n) {
    if (!ctx.paymentBoundary) return rejectInvalidState("payment boundary port not bound to this kernel");
    const outcome = await ctx.paymentBoundary.refundPayment(payload.paymentId, forced);
    if (!outcome.ok) {
      return rejectInvalidState(`payment boundary: ${outcome.error.code}${outcome.error.detail ? ` (${outcome.error.detail})` : ""}`);
    }
    const updated = assertIntent(intent, outcome.value);
    if (typeof updated === "string") return rejectInvalidState(updated);
    emitIntentRecorded(ctx, updated);
    const refund = emitRefundRecorded(ctx, updated, forced, "CHARGEBACK_FORCED_REFUND", `chargeback ${payload.providerNativeStatus ?? "CHARGEBACK"}`);
    const chargeback: ChargebackRecord = {
      chargebackId,
      paymentId: intent.paymentId,
      amount: payload.amount,
      forcedRefundAmount: forced,
      refundId: refund.refundId,
      providerNativeStatus: payload.providerNativeStatus,
      state: "FORCED_REFUND",
      revision: 1,
    };
    ctx.emit({
      subject: chargebackSubject(chargebackId),
      kind: "CHARGEBACK_RECORDED",
      payload: { kind: "CHARGEBACK_RECORDED", chargeback },
    });
    emitOrderPaymentEffects(ctx, updated);
    return accept();
  }
  // Nothing left to refund: the double-refund guard held. The chargeback is
  // still journaled — with the prevention as explicit state.
  const chargeback: ChargebackRecord = {
    chargebackId,
    paymentId: intent.paymentId,
    amount: payload.amount,
    forcedRefundAmount: forced,
    providerNativeStatus: payload.providerNativeStatus,
    state: "NO_ADDITIONAL_REFUND",
    revision: 1,
  };
  ctx.emit({
    subject: chargebackSubject(chargebackId),
    kind: "CHARGEBACK_RECORDED",
    payload: { kind: "CHARGEBACK_RECORDED", chargeback },
  });
  return accept();
};

export const handleIssueGoodwillRefund: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "ISSUE_GOODWILL_REFUND") return rejectInvalidCommand("not ISSUE_GOODWILL_REFUND");
  if (payload.reason.trim().length === 0) {
    return rejectInvalidCommand("goodwill refund requires a journaled non-empty reason");
  }
  const intent = ctx.state.paymentIntent(payload.paymentId);
  if (!intent) return rejectInvalidState(`payment ${payload.paymentId} not found`);
  const guard = validateRefundAgainstCaptures(
    payload.amount,
    intent.amount.currency,
    ctx.state.capturedTotalFor(payload.paymentId),
    ctx.state.refundedTotalFor(payload.paymentId),
  );
  if (!guard.ok) return rejectInvalidCommand(`goodwill refund: ${guard.error.code} (${guard.error.detail})`);
  if (!ctx.paymentBoundary) return rejectInvalidState("payment boundary port not bound to this kernel");
  const outcome = await ctx.paymentBoundary.refundPayment(payload.paymentId, payload.amount);
  if (!outcome.ok) {
    return rejectInvalidState(`payment boundary: ${outcome.error.code}${outcome.error.detail ? ` (${outcome.error.detail})` : ""}`);
  }
  const updated = assertIntent(intent, outcome.value);
  if (typeof updated === "string") return rejectInvalidState(updated);
  emitIntentRecorded(ctx, updated);
  emitRefundRecorded(ctx, updated, payload.amount, "GOODWILL_REFUND", payload.reason);
  emitOrderPaymentEffects(ctx, updated);
  return accept();
};

function assertIntent(existing: PaymentIntent, returned: PaymentIntent): PaymentIntent | string {
  if (returned.paymentId !== existing.paymentId) {
    return `payment port returned ${returned.paymentId} for ${existing.paymentId}`;
  }
  if (returned.amount.currency !== existing.amount.currency || returned.amount.amountMinor !== existing.amount.amountMinor) {
    return `payment port mutated the intent amount for ${existing.paymentId}`;
  }
  return returned;
}
