/**
 * Checkout completion (W1-004): the buyer-facing end of the transactional
 * surface — cart → checkout session → ORDER with an AUTHORIZED payment,
 * atomically.
 *
 * Laws:
 * - One command, one journal transaction: the order placement, the payment
 *   authorization and the checkout terminal transition are buffered together
 *   and appended together. A failed port call rejects the WHOLE command with
 *   zero events — no torn half-checkouts (the handler seam guarantees this).
 * - Duplicate submissions are idempotent: exact envelope replay is a kernel
 *   DUPLICATE (original receipt, zero new effects); a NEW command against a
 *   session already COMPLETED is a deterministic INVALID_STATE rejection.
 * - The session flow is the frozen checkout state machine: OPEN may pass
 *   through START_PAYMENT (journaled) before COMPLETE; COMPLETED, ABANDONED
 *   and EXPIRED are terminal.
 * - Opportunity references ride the session/cart VERBATIM (Worker 2's lane
 *   stays opaque here).
 */
import { computeCartTotals, checkoutTransition } from "../domain/cart.js";
import { nextRevision } from "../domain/events.js";
import { orderSubject } from "../domain/orders.js";
import { enforceMinimumOrder } from "../domain/b2b.js";
import type { PrincipalRef } from "../domain/principals.js";
import { validatePaymentIntentRequest } from "../domain/payments.js";
import {
  accept,
  rejectInvalidCommand,
  rejectInvalidState,
  type CommandContext,
  type RuntimeCommandHandler,
} from "./handler.js";
import { orderSnapshotOf } from "./handler-commerce.js";
import { emitIntentRecorded, orderPaymentStatusFor } from "./handler-payment.js";
import { checkoutSubject, mintOrderId } from "./subjects.js";

export const handleCompleteCheckout: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "COMPLETE_CHECKOUT") return rejectInvalidCommand("not COMPLETE_CHECKOUT");
  const session = ctx.state.checkoutSession(payload.checkoutSessionId);
  if (!session) return rejectInvalidState(`checkout session ${payload.checkoutSessionId} not found`);
  if (session.state !== "OPEN" && session.state !== "PAYMENT_PENDING") {
    return rejectInvalidState(`checkout session ${payload.checkoutSessionId} is terminal (${session.state}) — duplicate submissions are rejected`);
  }
  const cart = ctx.state.cart(session.cartId);
  if (!cart) return rejectInvalidState(`cart ${session.cartId} not found for checkout session ${payload.checkoutSessionId}`);
  if (cart.lines.length === 0) return rejectInvalidState("cannot complete checkout of an empty cart");
  const totals = computeCartTotals(cart, {
    rounding: ctx.options.defaultRounding,
    taxRateBps: ctx.options.taxRateBps,
    promotions: ctx.options.promotions,
  });
  if (!totals.ok) return rejectInvalidCommand(`cart totals rejected: ${totals.error.code}`);
  if (ctx.options.minimumOrderPolicy) {
    const gate = enforceMinimumOrder(ctx.options.minimumOrderPolicy, totals.value.grandTotal);
    if (!gate.ok) {
      return rejectInvalidState(`B2B minimum order: ${gate.error.code} (minimum ${gate.error.minimum.amountMinor}, actual ${gate.error.actual.amountMinor})`);
    }
  }
  if (!ctx.paymentBoundary) return rejectInvalidState("payment boundary port not bound to this kernel");
  // Mint the order id BEFORE the port call so the intent can reference it;
  // on port failure the command rejects with zero events (no order exists).
  const orderId = mintOrderId(ctx.mint());
  const intentRequest: import("../domain/payments.js").PaymentIntentRequest = {
    amount: totals.value.grandTotal,
    reference: { kind: "ORDER", orderId },
    method: payload.method,
  };
  const requestValidation = validatePaymentIntentRequest(intentRequest);
  if (!requestValidation.ok) {
    return rejectInvalidCommand(`payment intent request: ${requestValidation.error.code} (${requestValidation.error.detail})`);
  }
  const outcome = await ctx.paymentBoundary.createPaymentIntent(intentRequest);
  if (!outcome.ok) {
    return rejectInvalidState(`payment boundary: ${outcome.error.code}${outcome.error.detail ? ` (${outcome.error.detail})` : ""}`);
  }
  const intent = outcome.value;
  if (ctx.state.paymentIntent(intent.paymentId)) {
    return rejectInvalidState(`payment port returned an already-recorded payment id ${intent.paymentId}`);
  }
  // --- buffered transaction: session walk → order → payment → completion ---
  if (session.state === "OPEN") {
    emitSessionState(ctx, session, "START_PAYMENT", "PAYMENT_PENDING");
  }
  const customerRef: PrincipalRef | undefined =
    envelope.actor.kind === "CUSTOMER" ? { kind: "CUSTOMER", customerId: envelope.actor.customerId } : undefined;
  const snapshot = orderSnapshotOf(
    cart,
    totals.value,
    orderId,
    payload.merchantId,
    customerRef,
    session.opportunityRef ?? cart.opportunityRef,
    session.checkoutSessionId,
    ctx.now,
  );
  ctx.emit({
    subject: orderSubject(orderId),
    kind: "ORDER_PLACED",
    payload: { kind: "ORDER_PLACED", snapshot },
  });
  emitIntentRecorded(ctx, intent);
  // The order's payment status derives from the RETURNED intent (an ambiguous
  // authorization holds UNKNOWN on the order — never a guessed AUTHORIZED).
  const orderStatus = orderPaymentStatusFor(intent, snapshot);
  if (orderStatus !== snapshot.paymentStatus) {
    ctx.emit({
      subject: orderSubject(orderId),
      kind: "ORDER_PAYMENT_STATUS_CHANGED",
      payload: { kind: "ORDER_PAYMENT_STATUS_CHANGED", from: snapshot.paymentStatus, to: orderStatus, revision: nextRevision(snapshot.revision) },
    });
  }
  emitSessionState(ctx, { ...session, state: "PAYMENT_PENDING", revision: nextRevision(session.revision) }, "COMPLETE", "COMPLETED");
  return accept();
};

function emitSessionState(
  ctx: CommandContext,
  session: { readonly checkoutSessionId: string; readonly state: string; readonly revision: number },
  trigger: "START_PAYMENT" | "COMPLETE",
  to: "PAYMENT_PENDING" | "COMPLETED",
): void {
  const next = checkoutTransition(session.state as "OPEN" | "PAYMENT_PENDING", trigger);
  if (!next.ok || next.value !== to) {
    throw new TypeError(`checkout completion invariant violated: ${trigger} from ${session.state} must reach ${to}`);
  }
  ctx.emit({
    subject: checkoutSubject(session.checkoutSessionId),
    kind: "CHECKOUT_STATE_CHANGED",
    payload: {
      kind: "CHECKOUT_STATE_CHANGED",
      session: { ...session, state: to, revision: nextRevision(session.revision) },
    },
  });
}
