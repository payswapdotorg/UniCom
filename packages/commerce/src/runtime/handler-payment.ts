/**
 * Payment boundary command handlers — the typed PORT seam.
 *
 * The kernel records payment intents as immutable facts. All provider
 * interaction happens through the injected PaymentBoundary port (the
 * provider adapts TO the contract — NO provider implementation lives in
 * this package). Recorded statuses preserve the domain laws:
 * - ambiguous outcomes arrive as UNKNOWN with the native status preserved;
 * - customer-action-required is a first-class state;
 * - refunds validate exactly against the captured intent before the port.
 * The kernel never sees credentials; PaymentMethodRef is an opaque token.
 */
import { orderSubject } from "../domain/orders.js";
import { orderTransition, type OrderSnapshot } from "../domain/orders.js";
import { nextRevision } from "../domain/events.js";
import {
  validatePaymentIntentRequest,
  validateRefundAmount,
  type PaymentIntent,
} from "../domain/payments.js";
import type { PaymentBoundaryError } from "../domain/payments.js";
import type { RefundRecord, RefundState } from "../domain/returns.js";
import { paymentSubject } from "./subjects.js";
import { mintRefundId } from "./subjects.js";
import {
  accept,
  rejectInvalidCommand,
  rejectInvalidState,
  type CommandContext,
  type RuntimeCommandHandler,
} from "./handler.js";

const PAYMENT_COMMANDS = new Set(["CREATE_PAYMENT_INTENT", "CAPTURE_PAYMENT", "VOID_PAYMENT", "REFUND_PAYMENT"]);

export function isPaymentCommand(type: string): boolean {
  return PAYMENT_COMMANDS.has(type);
}

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

export const handleCapturePayment: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "CAPTURE_PAYMENT") return rejectInvalidCommand("not CAPTURE_PAYMENT");
  const existing = ctx.state.paymentIntent(payload.paymentId);
  if (!existing) return rejectInvalidState(`payment ${payload.paymentId} not found`);
  if (!ctx.paymentBoundary) return rejectInvalidState("payment boundary port not bound to this kernel");
  const outcome = await ctx.paymentBoundary.capturePayment(payload.paymentId);
  if (!outcome.ok) return portRejection(outcome.error);
  const intent = assertSamePayment(existing, outcome.value);
  if (typeof intent === "string") return rejectInvalidState(intent);
  emitIntentRecorded(ctx, intent);
  emitOrderPaymentEffects(ctx, intent);
  return accept();
};

export const handleVoidPayment: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "VOID_PAYMENT") return rejectInvalidCommand("not VOID_PAYMENT");
  const existing = ctx.state.paymentIntent(payload.paymentId);
  if (!existing) return rejectInvalidState(`payment ${payload.paymentId} not found`);
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
  const validation = validateRefundAmount(existing, payload.amount);
  if (!validation.ok) return rejectInvalidCommand(`refund: ${validation.error.code} (${validation.error.detail})`);
  if (!ctx.paymentBoundary) return rejectInvalidState("payment boundary port not bound to this kernel");
  const outcome = await ctx.paymentBoundary.refundPayment(payload.paymentId, payload.amount);
  if (!outcome.ok) return portRejection(outcome.error);
  const intent = assertSamePayment(existing, outcome.value);
  if (typeof intent === "string") return rejectInvalidState(intent);
  emitIntentRecorded(ctx, intent);
  const refund: RefundRecord = {
    refundId: mintRefundId(ctx.mint()),
    paymentId: intent.paymentId,
    amount: payload.amount,
    state: refundStateFor(intent),
    revision: 1,
  };
  ctx.emit({
    subject: paymentSubject(intent.paymentId),
    kind: "REFUND_RECORDED",
    payload: { kind: "REFUND_RECORDED", refund },
  });
  emitOrderPaymentEffects(ctx, intent);
  return accept();
};

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

function emitIntentRecorded(ctx: CommandContext, intent: PaymentIntent): void {
  ctx.emit({
    subject: paymentSubject(intent.paymentId),
    kind: "PAYMENT_INTENT_RECORDED",
    payload: { kind: "PAYMENT_INTENT_RECORDED", intent },
  });
}

function orderPaymentStatusFor(intent: PaymentIntent, order: OrderSnapshot): OrderSnapshot["paymentStatus"] {
  switch (intent.status) {
    case "AUTHORIZED":
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

function emitOrderPaymentEffects(ctx: CommandContext, intent: PaymentIntent): void {
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
