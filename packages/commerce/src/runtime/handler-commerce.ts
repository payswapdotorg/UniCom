/**
 * Cart, checkout boundary and order placement handlers.
 *
 * A cart materializes on the first ADD_CART_LINE (currency fixed by the
 * first line, single-currency law). Line ids are minted deterministically
 * from the cart revision. PLACE_ORDER computes exact totals through the
 * frozen cart math (fixed order of operations) and snapshots an immutable
 * PENDING order; the B2B minimum-order gate is enforced here when configured.
 */
import {
  computeCartTotals,
  lineSubtotal,
  type Cart,
  type CartLine,
} from "../domain/cart.js";
import { checkoutTransition, type CheckoutSession } from "../domain/cart.js";
import { nextRevision } from "../domain/events.js";
import { orderSubject } from "../domain/orders.js";
import { orderTransition, type OrderLine, type OrderSnapshot } from "../domain/orders.js";
import { enforceMinimumOrder } from "../domain/b2b.js";
import { decimal, decimalCompare } from "../domain/decimal.js";
import type { PrincipalRef } from "../domain/principals.js";
import { countQuantity, type CountQuantity, type MeasurementQuantity } from "../domain/quantity.js";
import {
  accept,
  rejectInvalidCommand,
  rejectInvalidState,
  type CommandContext,
  type RuntimeCommandHandler,
} from "./handler.js";
import { cartSubject, checkoutSubject, mintCheckoutSessionId, mintOrderId } from "./subjects.js";

export const handleAddCartLine: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "ADD_CART_LINE") return rejectInvalidCommand("not ADD_CART_LINE");
  const quantity = payload.quantity;
  if (quantity.kind === "COUNT" && (!Number.isSafeInteger(quantity.units) || quantity.units < 1)) {
    return rejectInvalidCommand(`count quantity must be a positive safe integer: ${quantity.units}`);
  }
  if (quantity.kind === "MEASUREMENT" && decimalCompare(quantity.magnitude, decimal("0")) !== 1) {
    return rejectInvalidCommand("measured quantity must be positive");
  }
  const existing = ctx.state.cart(payload.cartId);
  const cart: Cart = existing ?? { cartId: payload.cartId, currency: payload.unitPrice.currency, lines: [], revision: 0 };
  if (payload.unitPrice.currency !== cart.currency) {
    return rejectInvalidCommand(
      `MIXED_CURRENCY: cart ${payload.cartId} is ${cart.currency}, line is ${payload.unitPrice.currency}`,
    );
  }
  const lineId = `line-${nextRevision(cart.revision)}`;
  const line: CartLine =
    quantity.kind === "COUNT"
      ? {
          kind: "UNIT_LINE",
          lineId,
          skuId: payload.skuId,
          quantity: countQuantity(quantity.units) as CountQuantity,
          unitPrice: payload.unitPrice,
        }
      : {
          kind: "MEASURED_LINE",
          lineId,
          skuId: payload.skuId,
          quantity: quantity as MeasurementQuantity,
          unitPrice: payload.unitPrice,
          rounding: ctx.options.defaultRounding,
        };
  const next: Cart = { ...cart, lines: [...cart.lines, line], revision: nextRevision(cart.revision) };
  ctx.emit({
    subject: cartSubject(payload.cartId),
    kind: "CART_LINE_ADDED",
    payload: { kind: "CART_LINE_ADDED", cart: next },
  });
  return accept();
};

export const handleRemoveCartLine: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "REMOVE_CART_LINE") return rejectInvalidCommand("not REMOVE_CART_LINE");
  const cart = ctx.state.cart(payload.cartId);
  if (!cart) return rejectInvalidState(`cart ${payload.cartId} not found`);
  if (!cart.lines.some((line) => line.lineId === payload.lineId)) {
    return rejectInvalidState(`line ${payload.lineId} not on cart ${payload.cartId}`);
  }
  const next: Cart = {
    ...cart,
    lines: cart.lines.filter((line) => line.lineId !== payload.lineId),
    revision: nextRevision(cart.revision),
  };
  ctx.emit({
    subject: cartSubject(payload.cartId),
    kind: "CART_LINE_REMOVED",
    payload: { kind: "CART_LINE_REMOVED", cart: next },
  });
  return accept();
};

export const handleOpenCheckout: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "OPEN_CHECKOUT") return rejectInvalidCommand("not OPEN_CHECKOUT");
  const cart = ctx.state.cart(payload.cartId);
  if (!cart) return rejectInvalidState(`cart ${payload.cartId} not found`);
  if (cart.lines.length === 0) return rejectInvalidState("cannot check out an empty cart");
  const sessionId = mintCheckoutSessionId(ctx.mint());
  const session: CheckoutSession = {
    checkoutSessionId: sessionId,
    cartId: payload.cartId,
    state: "OPEN",
    revision: 1,
    opportunityRef: payload.opportunityRef,
  };
  ctx.emit({
    subject: checkoutSubject(sessionId),
    kind: "CHECKOUT_OPENED",
    payload: { kind: "CHECKOUT_OPENED", session },
  });
  return accept();
};

export const handleAdvanceCheckout: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "ADVANCE_CHECKOUT") return rejectInvalidCommand("not ADVANCE_CHECKOUT");
  const session = ctx.state.checkoutSession(payload.checkoutSessionId);
  if (!session) return rejectInvalidState(`checkout session ${payload.checkoutSessionId} not found`);
  const next = checkoutTransition(session.state, payload.trigger);
  if (!next.ok) {
    return rejectInvalidState(`checkout ${payload.checkoutSessionId}: ${next.error.code} from ${next.error.from} on ${next.error.trigger}`);
  }
  const advanced: CheckoutSession = { ...session, state: next.value, revision: nextRevision(session.revision) };
  ctx.emit({
    subject: checkoutSubject(session.checkoutSessionId),
    kind: "CHECKOUT_STATE_CHANGED",
    payload: { kind: "CHECKOUT_STATE_CHANGED", session: advanced },
  });
  return accept();
};

function toOrderLine(line: CartLine): OrderLine {
  if (line.kind === "UNIT_LINE") {
    return { kind: "UNIT_LINE", skuId: line.skuId, quantity: line.quantity, unitPrice: line.unitPrice };
  }
  return {
    kind: "MEASURED_LINE",
    skuId: line.skuId,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    lineTotal: lineSubtotal(line),
  };
}

export const handlePlaceOrder: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "PLACE_ORDER") return rejectInvalidCommand("not PLACE_ORDER");
  const cart = ctx.state.cart(payload.cartId);
  if (!cart) return rejectInvalidState(`cart ${payload.cartId} not found`);
  if (cart.lines.length === 0) return rejectInvalidState("cannot place an order from an empty cart");
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
  const orderId = mintOrderId(ctx.mint());
  const customerRef: PrincipalRef | undefined =
    envelope.actor.kind === "CUSTOMER" ? { kind: "CUSTOMER", customerId: envelope.actor.customerId } : undefined;
  // Opaque opportunity reference: explicit on the command, else inherited from
  // the cart's checkout session (passed through verbatim — Worker 2's lane).
  const sessionRef = ctx.state
    .allCheckoutSessions()
    .filter((candidate) => candidate.cartId === payload.cartId)
    .at(-1)?.opportunityRef;
  const snapshot: OrderSnapshot = {
    orderId,
    merchantRef: { kind: "MERCHANT", merchantId: payload.merchantId },
    customerRef,
    cartId: payload.cartId,
    state: "PENDING",
    paymentStatus: "NOT_PAID",
    fulfillmentStatus: "UNFULFILLED",
    lines: cart.lines.map(toOrderLine),
    totals: totals.value,
    opportunityRef: payload.opportunityRef ?? sessionRef ?? cart.opportunityRef,
    revision: 1,
    placedAt: ctx.now,
  };
  ctx.emit({
    subject: orderSubject(orderId),
    kind: "ORDER_PLACED",
    payload: { kind: "ORDER_PLACED", snapshot },
  });
  return accept();
};

export const handleCancelOrder: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "CANCEL_ORDER") return rejectInvalidCommand("not CANCEL_ORDER");
  return advanceOrderTo(ctx, payload.orderId, "CANCELLED");
};

export const handleAdvanceOrder: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "ADVANCE_ORDER") return rejectInvalidCommand("not ADVANCE_ORDER");
  return advanceOrderTo(ctx, payload.orderId, payload.trigger);
};

function advanceOrderTo(ctx: CommandContext, orderId: OrderSnapshot["orderId"], trigger: Parameters<typeof orderTransition>[1]) {
  const order = ctx.state.order(orderId);
  if (!order) return rejectInvalidState(`order ${orderId} not found`);
  const next = orderTransition(order.state, trigger);
  if (!next.ok) {
    return rejectInvalidState(`order ${orderId}: ${next.error.code} from ${next.error.from} on ${next.error.trigger}`);
  }
  ctx.emit({
    subject: orderSubject(orderId),
    kind: "ORDER_STATE_CHANGED",
    payload: { kind: "ORDER_STATE_CHANGED", from: order.state, to: next.value, revision: nextRevision(order.revision) },
  });
  return accept();
}
