/**
 * Recourse primitives: the dispute lifecycle and chargeback forcing (W1-004).
 *
 * Laws:
 * - Recourse decisions are JOURNALED policy applications — a dispute
 *   resolution is an immutable fact, never a silent mutation of money state.
 *   Resolving a dispute records the decision; money moves only through the
 *   explicit refund paths (REFUND_PAYMENT / goodwill / chargeback forcing),
 *   each guarded by the captured-total bound.
 * - A chargeback FORCES the refund path with the no-double-refund guard: the
 *   forced amount is capped at (captured − refunded) so refund totals can
 *   never exceed captured totals under any interleaving. When nothing
 *   remains, the chargeback is journaled as NO_ADDITIONAL_REFUND — the
 *   double-refund prevention is itself an explicit fact, never an error
 *   swallowed.
 * - Provider-native statuses are preserved verbatim (INVARIANT 11).
 */
import type { ChargebackId, DisputeId, OrderId, PaymentId, RefundId } from "./ids.js";
import type { Money } from "./money.js";
import { nextRevision } from "./events.js";
import { err, ok, type Result } from "./result.js";

// --- Dispute lifecycle (open → evidence → resolve) ---

export type DisputeState = "OPEN" | "EVIDENCE_SUBMITTED" | "RESOLVED_ACCEPTED" | "RESOLVED_REJECTED";

export type DisputeTrigger = "SUBMIT_EVIDENCE" | "RESOLVE_ACCEPT" | "RESOLVE_REJECT";

export type DisputeTransitionError = {
  code: "INVALID_DISPUTE_TRANSITION";
  from: DisputeState;
  trigger: DisputeTrigger;
};

/**
 * Deterministic dispute lifecycle:
 * OPEN --SUBMIT_EVIDENCE--> EVIDENCE_SUBMITTED --RESOLVE_ACCEPT|RESOLVE_REJECT--> terminal.
 * RESOLVE_* is also legal directly from OPEN (a merchant may concede or
 * reject before submitting evidence); resolved states are terminal.
 * ACCEPTED means the dispute is UPHELD (the claim stands); REJECTED means
 * denied. Resolution journals the decision; it never silently moves money.
 */
export function disputeTransition(
  state: DisputeState,
  trigger: DisputeTrigger,
): Result<DisputeState, DisputeTransitionError> {
  const table: Record<DisputeState, Partial<Record<DisputeTrigger, DisputeState>>> = {
    OPEN: { SUBMIT_EVIDENCE: "EVIDENCE_SUBMITTED", RESOLVE_ACCEPT: "RESOLVED_ACCEPTED", RESOLVE_REJECT: "RESOLVED_REJECTED" },
    EVIDENCE_SUBMITTED: { RESOLVE_ACCEPT: "RESOLVED_ACCEPTED", RESOLVE_REJECT: "RESOLVED_REJECTED" },
    RESOLVED_ACCEPTED: {},
    RESOLVED_REJECTED: {},
  };
  const next = table[state][trigger];
  if (next === undefined) return err({ code: "INVALID_DISPUTE_TRANSITION", from: state, trigger });
  return ok(next);
}

/** Evidence is untrusted DATA submitted into the record — never instructions. */
export interface DisputeEvidence {
  readonly summary: string;
}

export interface DisputeRecord {
  readonly disputeId: DisputeId;
  readonly paymentId: PaymentId;
  readonly orderId: OrderId;
  readonly amount: Money;
  readonly reason?: string;
  /** Provider-native dispute status, preserved verbatim (INVARIANT 11). */
  readonly providerNativeStatus?: string;
  readonly state: DisputeState;
  readonly revision: number;
}

export function advanceDispute(
  dispute: DisputeRecord,
  trigger: DisputeTrigger,
): Result<DisputeRecord, DisputeTransitionError> {
  const next = disputeTransition(dispute.state, trigger);
  if (!next.ok) return next;
  return ok({ ...dispute, state: next.value, revision: nextRevision(dispute.revision) });
}

// --- Chargeback forcing ---

export type ChargebackState = "FORCED_REFUND" | "NO_ADDITIONAL_REFUND";

/**
 * The provider-initiated reversal record. `amount` is what the provider
 * claimed; `forcedRefundAmount` is what the refund path actually executed
 * under the no-double-refund cap. When the cap left nothing to refund the
 * state is NO_ADDITIONAL_REFUND — an explicit journaled fact.
 */
export interface ChargebackRecord {
  readonly chargebackId: ChargebackId;
  readonly paymentId: PaymentId;
  readonly amount: Money;
  readonly forcedRefundAmount: Money;
  readonly refundId?: RefundId;
  readonly providerNativeStatus?: string;
  readonly state: ChargebackState;
  readonly revision: number;
}

/**
 * The chargeback forcing decision: cap the forced refund at the un-refunded
 * captured remainder. Pure — the kernel journals the outcome.
 */
export function chargebackForcedAmount(
  chargebackAmount: Money,
  capturedTotal: bigint,
  refundedTotal: bigint,
): Result<Money, { code: "INVALID_AMOUNT"; detail: string }> {
  if (BigInt(chargebackAmount.amountMinor) <= 0n) {
    return err({ code: "INVALID_AMOUNT", detail: `chargeback amount must be positive, got ${chargebackAmount.amountMinor}` });
  }
  const remaining = capturedTotal - refundedTotal;
  if (remaining <= 0n) {
    return ok({ ...chargebackAmount, amountMinor: "0" as Money["amountMinor"] });
  }
  const forced = BigInt(chargebackAmount.amountMinor) > remaining ? remaining : BigInt(chargebackAmount.amountMinor);
  return ok({ ...chargebackAmount, amountMinor: forced.toString() as Money["amountMinor"] });
}
