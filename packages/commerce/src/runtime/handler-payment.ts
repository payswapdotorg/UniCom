/**
 * Payment boundary command handlers — the typed PORT seam.
 *
 * The kernel records payment intents as immutable facts. All provider
 * interaction happens through the injected PaymentBoundary port (the
 * provider adapts TO the contract — NO provider implementation lives in
 * this package). Recorded statuses preserve the domain laws:
 * - ambiguous outcomes arrive as UNKNOWN with the native status preserved;
 * - customer-action-required is a first-class state;
 * - refunds validate exactly against the CAPTURED FACTS before the port
 *   (W1-004: refund totals can never exceed captured totals — the kernel
 *   enforces the bound, not the adapter).
 * The kernel never sees credentials; PaymentMethodRef is an opaque token.
 *
 * W1-004 additions: kernel-side capture/void/refund state guards (invalid
 * transitions are rejected deterministically BEFORE any port call), capture
 * facts (partial + full, exact amounts), CAPTURE_PAYMENT_PARTIAL via the
 * PartialCaptureBoundary port extension, and refund provenance
 * (refundKind) so policy/goodwill/chargeback refunds stay distinguishable.
 */
import { orderSubject } from "../domain/orders.js";
import { orderTransition, type OrderSnapshot } from "../domain/orders.js";
import { nextRevision } from "../domain/events.js";
import {
  validatePaymentIntentRequest,
  type PaymentIntent,
} from "../domain/payments.js";
import type { PaymentBoundaryError } from "../domain/payments.js";
import type { Result } from "../domain/result.js";
import { isPartialCaptureBoundary, validateRefundAgainstCaptures, type CaptureKind, type PaymentCaptureRecord } from "../domain/settlement.js";
import type { RefundRecord, RefundState } from "../domain/returns.js";
import { paymentSubject } from "./subjects.js";
import { mintCaptureId, mintRefundId } from "./subjects.js";
import {
  accept,
  rejectInvalidCommand,
  rejectInvalidState,
  type CommandContext,
  type RuntimeCommandHandler,
} from "./handler.js";

const PAYMENT_COMMANDS = new Set(["CREATE_PAYMENT_INTENT", "CAPTURE_PAYMENT", "CAPTURE_PAYMENT_PARTIAL", "VOID_PAYMENT", "REFUND_PAYMENT"]);

export function isPaymentCommand(type: string): boolean {
  return PAYMENT_COMMANDS.has(type);
}

/** Statuses from which the rail can still capture funds (UNKNOWN is retriable). */
const CAPTURABLE_STATUSES = new Set(["AUTHORIZED", "PARTIALLY_CAPTURED", "REQUIRES_CUSTOMER_ACTION", "UNKNOWN"]);
/** Statuses from which the rail can still void the authorization. */
const VOIDABLE_STATUSES = new Set(["AUTHORIZED", "REQUIRES_CUSTOMER_ACTION", "UNKNOWN"]);

export const handleCreatePaymentIntent: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "CREATE_PAYMENT_INTENT") return rejectInvalidCommand("not CREATE_PAYMENT_INTENT");
  const request = payload.request;
  const validation = validatePaymentIntentRequest(request);
  if (!validation.ok) return rejectInvalidCommand(`payment intent request: ${validation.error.code} (${validation.error.detail})`);
  if (!ctx.paymentBoundary) return rejectInvalidState("payment boundary port not bound to this kernel");
  const outcome = await ctx.paymentBoundary.createPaymentIntent(request);
  if (!outcome.ok) return portRejection(outcome.error);
  const intent = outcome.value;
  if (ctx.state.paymentIntent(intent.paymentId)) {
    return rejectInvalidState(`payment port returned an already-recorded payment id ${intent.paymentId}`);
  }
  emitIntentRecorded(ctx, intent);
  emitOrderPaymentEffects(ctx, intent);
  return accept();
};

/** Kernel-side guard + capture-fact emission shared by full and partial captures. */
async function captureIntoKernel(
  ctx: CommandContext,
  paymentId: PaymentIntent["paymentId"],
  amountMinor: bigint,
  kind: CaptureKind,
  portCall: () => Promise<Result<PaymentIntent, PaymentBoundaryError>>,
) {
  const existing = ctx.state.paymentIntent(paymentId);
  if (!existing) return rejectInvalidState(`payment ${paymentId} not found`);
  if (!CAPTURABLE_STATUSES.has(existing.status)) {
    return rejectInvalidState(`cannot capture payment ${paymentId} from status ${existing.status}`);
  }
  const capturedTotal = ctx.state.capturedTotalFor(paymentId);
  const intentTotal = BigInt(existing.amount.amountMinor);
  if (capturedTotal >= intentTotal) {
    return rejectInvalidState(`payment ${paymentId} is already fully captured (captured ${capturedTotal} of ${intentTotal})`);
  }
  if (amountMinor <= 0n || capturedTotal + amountMinor > intentTotal) {
    return rejectInvalidCommand(`capture ${amountMinor} out of bounds: captured ${capturedTotal} of ${intentTotal}`);
  }
  if (!ctx.paymentBoundary) return rejectInvalidState("payment boundary port not bound to this kernel");
  const outcome = await portCall();
  if (!outcome.ok) return portRejection(outcome.error);
  const intent = assertSamePayment(existing, outcome.value);
  if (typeof intent === "string") return rejectInvalidState(intent);
  emitIntentRecorded(ctx, intent);
  // The capture FACT records money that definitively moved: an AMBIGUOUS
  // (UNKNOWN) port outcome journals the intent status (order → UNKNOWN) but
  // records NO capture fact — the retry stays possible and the captured
  // total never counts ambiguous money (INVARIANT 10: UNKNOWN ≠ SUCCESS).
  if (intent.status === "CAPTURED" || intent.status === "PARTIALLY_CAPTURED") {
    const capture: PaymentCaptureRecord = {
      captureId: mintCaptureId(ctx.mint()),
      paymentId,
      amount: { currency: existing.amount.currency, amountMinor: amountMinor.toString() as PaymentIntent["amount"]["amountMinor"] },
      kind,
      revision: 1,
    };
    ctx.emit({
      subject: paymentSubject(paymentId),
      kind: "PAYMENT_CAPTURE_RECORDED",
      payload: { kind: "PAYMENT_CAPTURE_RECORDED", capture },
    });
  }
  emitOrderPaymentEffects(ctx, intent);
  return accept();
}

export const handleCapturePayment: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "CAPTURE_PAYMENT") return rejectInvalidCommand("not CAPTURE_PAYMENT");
  const existing = ctx.state.paymentIntent(payload.paymentId);
  if (!existing) return rejectInvalidState(`payment ${payload.paymentId} not found`);
  if (!ctx.paymentBoundary) return rejectInvalidState("payment boundary port not bound to this kernel");
  const boundary = ctx.paymentBoundary;
  // Full capture: everything still authorized (intent amount minus captured facts).
  const remaining = BigInt(existing.amount.amountMinor) - ctx.state.capturedTotalFor(payload.paymentId);
  return captureIntoKernel(ctx, payload.paymentId, remaining, "FULL", () => boundary.capturePayment(payload.paymentId));
};

export const handleCapturePaymentPartial: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "CAPTURE_PAYMENT_PARTIAL") return rejectInvalidCommand("not CAPTURE_PAYMENT_PARTIAL");
  const existing = ctx.state.paymentIntent(payload.paymentId);
  if (!existing) return rejectInvalidState(`payment ${payload.paymentId} not found`);
  if (payload.amount.currency !== existing.amount.currency) {
    return rejectInvalidCommand(`capture currency ${payload.amount.currency} does not match intent ${existing.amount.currency}`);
  }
  if (!ctx.paymentBoundary) return rejectInvalidState("payment boundary port not bound to this kernel");
  if (!isPartialCaptureBoundary(ctx.paymentBoundary)) {
    return rejectInvalidState("payment boundary port does not support amount-aware (partial) capture");
  }
  const boundary = ctx.paymentBoundary;
  return captureIntoKernel(ctx, payload.paymentId, BigInt(payload.amount.amountMinor), "PARTIAL", () =>
    boundary.capturePaymentAmount(payload.paymentId, payload.amount),
  );
};

export const handleVoidPayment: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "VOID_PAYMENT") return rejectInvalidCommand("not VOID_PAYMENT");
  const existing = ctx.state.paymentIntent(payload.paymentId);
  if (!existing) return rejectInvalidState(`payment ${payload.paymentId} not found`);
  if (ctx.state.capturedTotalFor(payload.paymentId) > 0n || existing.status === "CAPTURED" || existing.status === "PARTIALLY_CAPTURED") {
    return rejectInvalidState(`cannot void payment ${payload.paymentId} after capture (captured ${ctx.state.capturedTotalFor(payload.paymentId)})`);
  }
  if (!VOIDABLE_STATUSES.has(existing.status)) {
    return rejectInvalidState(`cannot void payment ${payload.paymentId} from status ${existing.status}`);
  }
  if (!ctx.paymentBoundary) return rejectInvalidState("payment boundary port not bound to this kernel");
  const outcome = await ctx.paymentBoundary.voidPayment(payload.paymentId);
  if (!outcome.ok) return portRejection(outcome.error);
  const intent = assertSamePayment(existing, outcome.value);
  if (typeof intent === "string") return rejectInvalidState(intent);
  emitIntentRecorded(ctx, intent);
  return accept();
};

export const handleRefundPayment: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "REFUND_PAYMENT") return rejectInvalidCommand("not REFUND_PAYMENT");
  const existing = ctx.state.paymentIntent(payload.paymentId);
  if (!existing) return rejectInvalidState(`payment ${payload.paymentId} not found`);
  const guard = validateRefundAgainstCaptures(
    payload.amount,
    existing.amount.currency,
    ctx.state.capturedTotalFor(payload.paymentId),
    ctx.state.refundedTotalFor(payload.paymentId),
  );
  if (!guard.ok) return rejectInvalidCommand(`refund: ${guard.error.code} (${guard.error.detail})`);
  if (!ctx.paymentBoundary) return rejectInvalidState("payment boundary port not bound to this kernel");
  const outcome = await ctx.paymentBoundary.refundPayment(payload.paymentId, payload.amount);
  if (!outcome.ok) return portRejection(outcome.error);
  const intent = assertSamePayment(existing, outcome.value);
  if (typeof intent === "string") return rejectInvalidState(intent);
  emitIntentRecorded(ctx, intent);
  emitRefundRecorded(ctx, intent, payload.amount, "POLICY_REFUND", undefined);
  emitOrderPaymentEffects(ctx, intent);
  return accept();
};

/** Shared refund-fact emission (used by policy refunds, goodwill and chargeback forcing). */
export function emitRefundRecorded(
  ctx: CommandContext,
  intent: PaymentIntent,
  amount: PaymentIntent["amount"],
  refundKind: RefundRecord["refundKind"],
  reason: string | undefined,
): RefundRecord {
  const refund: RefundRecord = {
    refundId: mintRefundId(ctx.mint()),
    paymentId: intent.paymentId,
    amount,
    state: refundStateFor(intent),
    refundKind,
    reason,
    revision: 1,
  };
  ctx.emit({
    subject: paymentSubject(intent.paymentId),
    kind: "REFUND_RECORDED",
    payload: { kind: "REFUND_RECORDED", refund },
  });
  return refund;
}

function refundStateFor(intent: PaymentIntent): RefundState {
  if (intent.status === "UNKNOWN") return "UNKNOWN";
  if (intent.status === "PARTIALLY_REFUNDED" || intent.status === "REFUNDED") return "COMPLETED";
  return "PENDING";
}

function assertSamePayment(existing: PaymentIntent, returned: PaymentIntent): PaymentIntent | string {
  if (returned.paymentId !== existing.paymentId) {
    return `payment port returned ${returned.paymentId} for ${existing.paymentId}`;
  }
  if (returned.amount.currency !== existing.amount.currency || returned.amount.amountMinor !== existing.amount.amountMinor) {
    return `payment port mutated the intent amount for ${existing.paymentId}`;
  }
  return returned;
}

function portRejection(error: PaymentBoundaryError): ReturnType<typeof rejectInvalidState> {
  return rejectInvalidState(`payment boundary: ${error.code}${error.detail ? ` (${error.detail})` : ""}`);
}

export function emitIntentRecorded(ctx: CommandContext, intent: PaymentIntent): void {
  ctx.emit({
    subject: paymentSubject(intent.paymentId),
    kind: "PAYMENT_INTENT_RECORDED",
    payload: { kind: "PAYMENT_INTENT_RECORDED", intent },
  });
}

export function orderPaymentStatusFor(intent: PaymentIntent, order: OrderSnapshot): OrderSnapshot["paymentStatus"] {
  switch (intent.status) {
    case "AUTHORIZED":
      return "AUTHORIZED";
    case "PARTIALLY_CAPTURED":
      // Order-level: funds captured but not the full total — still not fully paid.
      return "AUTHORIZED";
    case "CAPTURED":
      return "PAID";
    case "PARTIALLY_REFUNDED":
      return "PARTIALLY_REFUNDED";
    case "REFUNDED":
      return "REFUNDED";
    case "UNKNOWN":
      return "UNKNOWN";
    case "VOIDED":
      return order.paymentStatus === "NOT_PAID" || order.paymentStatus === "AUTHORIZED" ? "NOT_PAID" : order.paymentStatus;
    default:
      return order.paymentStatus;
  }
}

export function emitOrderPaymentEffects(ctx: CommandContext, intent: PaymentIntent): void {
  if (intent.reference.kind !== "ORDER") return;
  const order = ctx.state.order(intent.reference.orderId);
  if (!order) return;
  const nextStatus = orderPaymentStatusFor(intent, order);
  if (nextStatus !== order.paymentStatus) {
    ctx.emit({
      subject: orderSubject(order.orderId),
      kind: "ORDER_PAYMENT_STATUS_CHANGED",
      payload: {
        kind: "ORDER_PAYMENT_STATUS_CHANGED",
        from: order.paymentStatus,
        to: nextStatus,
        revision: nextRevision(order.revision),
      },
    });
  }
  if (intent.status === "CAPTURED" && order.state === "PENDING") {
    const next = orderTransition("PENDING", "PAYMENT_CONFIRMED");
    if (next.ok) {
      ctx.emit({
        subject: orderSubject(order.orderId),
        kind: "ORDER_STATE_CHANGED",
        payload: { kind: "ORDER_STATE_CHANGED", from: "PENDING", to: next.value, revision: nextRevision(order.revision) + 1 },
      });
    }
  }
}
