/**
 * Return/exchange handlers.
 *
 * REQUEST_RETURN (frozen payload) opens a full-order REFUND return; OPEN_RETURN
 * gives explicit resolution control (REFUND / EXCHANGE / STORE_CREDIT) and
 * explicit lines. ADVANCE_RETURN walks the frozen deterministic lifecycle.
 * Refund money movement is a separate payment-boundary command (REFUND_PAYMENT)
 * — the return authorizes, the payment boundary executes.
 */
import { nextRevision } from "../domain/events.js";
import { advanceReturn, type ReturnAuthorization, type ReturnLine } from "../domain/returns.js";
import { countQuantity } from "../domain/quantity.js";
import {
  accept,
  rejectInvalidCommand,
  rejectInvalidState,
  type RuntimeCommandHandler,
} from "./handler.js";
import { mintReturnId, returnSubject } from "./subjects.js";

export const handleRequestReturn: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "REQUEST_RETURN") return rejectInvalidCommand("not REQUEST_RETURN");
  const order = ctx.state.order(payload.orderId);
  if (!order) return rejectInvalidState(`order ${payload.orderId} not found`);
  const lines: ReturnLine[] = order.lines.map((line) => ({
    skuId: line.skuId,
    quantity: countQuantity(line.kind === "UNIT_LINE" ? line.quantity.units : 1),
    reason: "CUSTOMER_REMORSE",
  }));
  return openReturn(ctx, order.orderId, "REFUND", lines);
};

export const handleOpenReturn: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "OPEN_RETURN") return rejectInvalidCommand("not OPEN_RETURN");
  const order = ctx.state.order(payload.orderId);
  if (!order) return rejectInvalidState(`order ${payload.orderId} not found`);
  if (payload.lines.length === 0) return rejectInvalidCommand("return needs at least one line");
  if (!payload.lines.every((line) => Number.isSafeInteger(line.quantity.units) && line.quantity.units >= 1)) {
    return rejectInvalidCommand("return line quantities must be positive safe integers");
  }
  return openReturn(ctx, payload.orderId, payload.resolution, payload.lines);
};

function openReturn(
  ctx: Parameters<RuntimeCommandHandler>[1],
  orderId: ReturnAuthorization["orderId"],
  resolution: ReturnAuthorization["resolution"],
  lines: readonly ReturnLine[],
) {
  const returnId = mintReturnId(ctx.mint());
  const authorization: ReturnAuthorization = {
    returnId,
    orderId,
    resolution,
    lines,
    state: "REQUESTED",
    revision: 1,
  };
  ctx.emit({
    subject: returnSubject(returnId),
    kind: "RETURN_REQUESTED",
    payload: { kind: "RETURN_REQUESTED", authorization },
  });
  return accept();
}

export const handleAdvanceReturn: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "ADVANCE_RETURN") return rejectInvalidCommand("not ADVANCE_RETURN");
  const authorization = ctx.state.returnAuthorization(payload.returnId);
  if (!authorization) return rejectInvalidState(`return ${payload.returnId} not found`);
  const next = advanceReturn(authorization, payload.trigger);
  if (!next.ok) {
    return rejectInvalidState(
      `return ${payload.returnId}: ${next.error.code} from ${next.error.from} on ${next.error.trigger}`,
    );
  }
  ctx.emit({
    subject: returnSubject(payload.returnId),
    kind: "RETURN_STATE_CHANGED",
    payload: {
      kind: "RETURN_STATE_CHANGED",
      authorization: next.value,
      revision: nextRevision(authorization.revision),
    },
  });
  return accept();
};
