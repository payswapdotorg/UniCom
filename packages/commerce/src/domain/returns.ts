/**
 * Returns, exchanges and refund recourse.
 *
 * A return is a revisioned authorization object with a deterministic state
 * machine. Refunds are recorded against the payment boundary with the same
 * three-state discipline: an ambiguous refund outcome is UNKNOWN, never FAILED
 * (INVARIANT 10). Recourse status tracks the customer's escalation ladder
 * deterministically.
 */
import type { OrderId, PaymentId, RefundId, ReturnId, SkuId } from "./ids.js";
import { nextRevision } from "./events.js";
import type { Money } from "./money.js";
import type { CountQuantity } from "./quantity.js";
import { err, ok, type Result } from "./result.js";

export type ReturnResolution = "REFUND" | "EXCHANGE" | "STORE_CREDIT";

export type ReturnReason =
  | "DEFECTIVE"
  | "WRONG_ITEM"
  | "NOT_AS_DESCRIBED"
  | "DAMAGED_IN_TRANSIT"
  | "CUSTOMER_REMORSE"
  | "OTHER";

export type ReturnState =
  | "REQUESTED"
  | "AUTHORIZED"
  | "REJECTED"
  | "IN_TRANSIT"
  | "RECEIVED"
  | "INSPECTED"
  | "RESOLVED"
  | "EXPIRED"
  | "CANCELLED";

export type ReturnTrigger =
  | "AUTHORIZE"
  | "REJECT"
  | "SHIP_BACK"
  | "RECEIVE"
  | "INSPECT"
  | "RESOLVE"
  | "EXPIRE"
  | "CANCEL";

export type ReturnTransitionError = {
  code: "INVALID_RETURN_TRANSITION";
  from: ReturnState;
  trigger: ReturnTrigger;
};

/**
 * Deterministic return lifecycle:
 * REQUESTED → AUTHORIZED → IN_TRANSIT → RECEIVED → INSPECTED → RESOLVED,
 * with REJECTED/EXPIRED/CANCELLED exits.
 */
export function returnTransition(
  state: ReturnState,
  trigger: ReturnTrigger,
): Result<ReturnState, ReturnTransitionError> {
  const table: Record<ReturnState, Partial<Record<ReturnTrigger, ReturnState>>> = {
    REQUESTED: { AUTHORIZE: "AUTHORIZED", REJECT: "REJECTED", EXPIRE: "EXPIRED", CANCEL: "CANCELLED" },
    AUTHORIZED: { SHIP_BACK: "IN_TRANSIT", EXPIRE: "EXPIRED", CANCEL: "CANCELLED" },
    IN_TRANSIT: { RECEIVE: "RECEIVED", EXPIRE: "EXPIRED" },
    RECEIVED: { INSPECT: "INSPECTED" },
    INSPECTED: { RESOLVE: "RESOLVED" },
    RESOLVED: {},
    REJECTED: {},
    EXPIRED: {},
    CANCELLED: {},
  };
  const next = table[state][trigger];
  if (next === undefined) return err({ code: "INVALID_RETURN_TRANSITION", from: state, trigger });
  return ok(next);
}

export interface ReturnLine {
  readonly skuId: SkuId;
  readonly quantity: CountQuantity;
  readonly reason: ReturnReason;
}

export interface ReturnAuthorization {
  readonly returnId: ReturnId;
  readonly orderId: OrderId;
  readonly resolution: ReturnResolution;
  readonly lines: readonly ReturnLine[];
  readonly state: ReturnState;
  readonly revision: number;
}

export function advanceReturn(
  authorization: ReturnAuthorization,
  trigger: ReturnTrigger,
): Result<ReturnAuthorization, ReturnTransitionError> {
  const next = returnTransition(authorization.state, trigger);
  if (!next.ok) return next;
  return ok({ ...authorization, state: next.value, revision: nextRevision(authorization.revision) });
}

/** Customer recourse escalation ladder (deterministic, explicit). */
export type RecourseStatus =
  | "NOT_NEEDED"
  | "MERCHANT_PROCESSING"
  | "ESCALATED_TO_PROVIDER"
  | "RESOLVED";

export interface RefundRecoursePolicy {
  /** Refunds at or below this amount may auto-resolve; larger need review. */
  readonly autoRefundMax?: Money;
  readonly providerDisputeWindowDays?: number;
}

/**
 * W1-004 (additive): how a refund came to exist — distinguishable in the
 * journal and every projection. POLICY_REFUND is the ordinary policy-driven
 * path (REFUND_PAYMENT); GOODWILL_REFUND is an explicit merchant concession;
 * CHARGEBACK_FORCED_REFUND is money the provider pulled back (recorded via the
 * chargeback primitive, never silently merged with policy refunds).
 */
export type RefundKind = "POLICY_REFUND" | "GOODWILL_REFUND" | "CHARGEBACK_FORCED_REFUND";

export interface RefundRecord {
  readonly refundId: RefundId;
  readonly returnId?: ReturnId;
  readonly paymentId?: PaymentId;
  readonly amount: Money;
  readonly state: RefundState;
  /** W1-004 (additive): provenance discriminator; absent = POLICY_REFUND. */
  readonly refundKind?: RefundKind;
  /** W1-004 (additive): journaled policy-application reason (goodwill/chargeback). */
  readonly reason?: string;
  readonly revision: number;
}

/** Ambiguous provider refund outcomes are UNKNOWN — never silently FAILED. */
export type RefundState = "PENDING" | "COMPLETED" | "FAILED" | "UNKNOWN";

export function refundNeedsReview(
  amount: Money,
  policy: RefundRecoursePolicy,
): boolean {
  const max = policy.autoRefundMax;
  if (!max) return false;
  if (amount.currency !== max.currency) return true;
  return BigInt(amount.amountMinor) > BigInt(max.amountMinor);
}

/** Deterministic refund record progression. */
export function refundTransition(
  refund: RefundRecord,
  to: RefundState,
): Result<RefundRecord, { code: "INVALID_REFUND_TRANSITION"; from: RefundState; to: RefundState }> {
  const allowed: Record<RefundState, readonly RefundState[]> = {
    PENDING: ["COMPLETED", "FAILED", "UNKNOWN"],
    UNKNOWN: ["COMPLETED", "FAILED"],
    COMPLETED: [],
    FAILED: ["PENDING"],
  };
  if (!allowed[refund.state].includes(to)) {
    return err({ code: "INVALID_REFUND_TRANSITION", from: refund.state, to });
  }
  return ok({ ...refund, state: to, revision: nextRevision(refund.revision) });
}
