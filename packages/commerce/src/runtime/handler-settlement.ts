/**
 * Settlement observation + recourse-window close (W1-004).
 *
 * Settlement outcomes arrive VIA THE PAYMENT PORT (the
 * SettlementObservationBoundary extension — providers adapt to it; no
 * provider integration lives here). The tri-state law is enforced end to
 * end: an UNKNOWN observation resolves the settlement record to UNKNOWN
 * (native status preserved verbatim) and every fold keeps it UNKNOWN; only
 * a LATER OBSERVED outcome moves the record to SETTLED / NOT_SETTLED. A
 * closed recourse window converts an unresolved (PENDING/UNKNOWN)
 * settlement to WINDOW_CLOSED — never to money-in.
 *
 * Order-level projection effect (journaled): while a payment's settlement
 * is UNKNOWN, the order's payment status HOLDS UNKNOWN; an OBSERVED outcome
 * or the window close resolves it (SETTLED → PAID; NOT_SETTLED/window →
 * NOT_PAID). The order projection therefore never silently promotes
 * ambiguous money.
 */
import { orderSubject } from "../domain/orders.js";
import { nextRevision } from "../domain/events.js";
import { isSettlementObservingBoundary } from "../domain/settlement.js";
import { settlementTransition, type SettlementObservation, type SettlementRecord, type SettlementStatus, type SettlementTrigger } from "../domain/settlement.js";
import type { PaymentIntent } from "../domain/payments.js";
import {
  accept,
  rejectInvalidCommand,
  rejectInvalidState,
  type RuntimeCommandHandler,
} from "./handler.js";
import { paymentSubject } from "./subjects.js";

/** Derived settlement status: no record yet = PENDING (unobserved). */
function currentSettlementStatus(ctx: Parameters<RuntimeCommandHandler>[1], paymentId: string): SettlementStatus {
  return ctx.state.settlementRecord(paymentId)?.status ?? "PENDING";
}

export const handleObserveSettlement: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "OBSERVE_SETTLEMENT") return rejectInvalidCommand("not OBSERVE_SETTLEMENT");
  const intent = ctx.state.paymentIntent(payload.paymentId);
  if (!intent) return rejectInvalidState(`payment ${payload.paymentId} not found`);
  if (!ctx.paymentBoundary) return rejectInvalidState("payment boundary port not bound to this kernel");
  if (!isSettlementObservingBoundary(ctx.paymentBoundary)) {
    return rejectInvalidState("payment boundary port does not support settlement observation");
  }
  const boundary = ctx.paymentBoundary;
  const outcome = await boundary.observeSettlement(payload.paymentId);
  if (!outcome.ok) {
    return rejectInvalidState(`payment boundary: ${outcome.error.code}${outcome.error.detail ? ` (${outcome.error.detail})` : ""}`);
  }
  return foldObservation(ctx, intent.paymentId, outcome.value);
};

export const handleCloseSettlementWindow: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "CLOSE_SETTLEMENT_WINDOW") return rejectInvalidCommand("not CLOSE_SETTLEMENT_WINDOW");
  const intent = ctx.state.paymentIntent(payload.paymentId);
  if (!intent) return rejectInvalidState(`payment ${payload.paymentId} not found`);
  if (ctx.state.capturedTotalFor(payload.paymentId) <= 0n) {
    return rejectInvalidState(`settlement recourse window is meaningless for payment ${payload.paymentId} with no captured funds`);
  }
  const current = currentSettlementStatus(ctx, payload.paymentId);
  const next = settlementTransition(current, "CLOSE_WINDOW");
  if (!next.ok) {
    return rejectInvalidState(`settlement ${payload.paymentId}: ${next.error.code} from ${next.error.from} on ${next.error.trigger}`);
  }
  emitSettlementRecord(ctx, payload.paymentId, {
    paymentId: payload.paymentId,
    status: next.value,
    revision: (ctx.state.settlementRecord(payload.paymentId)?.revision ?? 0) + 1,
  });
  emitOrderUnknownResolution(ctx, payload.paymentId, "NOT_PAID");
  return accept();
};

function foldObservation(
  ctx: Parameters<RuntimeCommandHandler>[1],
  paymentId: PaymentIntent["paymentId"],
  observation: SettlementObservation,
) {
  const current = currentSettlementStatus(ctx, paymentId);
  const trigger: SettlementTrigger =
    observation.resolved === "OBSERVED"
      ? observation.status === "SETTLED"
        ? "OBSERVED_SETTLED"
        : "OBSERVED_NOT_SETTLED"
      : "OBSERVED_UNKNOWN";
  const next = settlementTransition(current, trigger);
  if (!next.ok) {
    return rejectInvalidState(`settlement ${paymentId}: ${next.error.code} from ${next.error.from} on ${next.error.trigger}`);
  }
  const prior = ctx.state.settlementRecord(paymentId);
  const record: SettlementRecord = {
    paymentId,
    status: next.value,
    settledAmount: observation.resolved === "OBSERVED" && observation.status === "SETTLED" ? observation.settledAmount : undefined,
    providerNativeStatus: observation.resolved === "UNKNOWN" ? observation.providerNativeStatus : undefined,
    revision: (prior?.revision ?? 0) + 1,
  };
  emitSettlementRecord(ctx, paymentId, record);
  if (observation.resolved === "UNKNOWN") {
    emitOrderUnknownResolution(ctx, paymentId, "UNKNOWN");
  } else if (observation.status === "SETTLED") {
    emitOrderUnknownResolution(ctx, paymentId, "PAID");
  } else {
    emitOrderUnknownResolution(ctx, paymentId, "NOT_PAID");
  }
  return accept();
}

function emitSettlementRecord(ctx: Parameters<RuntimeCommandHandler>[1], paymentId: PaymentIntent["paymentId"], record: SettlementRecord): void {
  ctx.emit({
    subject: paymentSubject(paymentId),
    kind: record.status === "WINDOW_CLOSED" ? "SETTLEMENT_WINDOW_CLOSED" : "SETTLEMENT_OBSERVED",
    payload: {
      kind: record.status === "WINDOW_CLOSED" ? "SETTLEMENT_WINDOW_CLOSED" : "SETTLEMENT_OBSERVED",
      settlement: record,
    },
  });
}

/**
 * The order-level UNKNOWN-hold law: an UNKNOWN settlement observation puts
 * the order's payment status INTO UNKNOWN (PAID/AUTHORIZED → UNKNOWN — the
 * projection refuses to claim money while clearing is ambiguous); an
 * OBSERVED outcome or window close resolves a held UNKNOWN (SETTLED → PAID,
 * NOT_SETTLED/window → NOT_PAID). Resolution never rewrites unambiguous
 * state; hold never touches NOT_PAID (nothing was ambiguous).
 */
function emitOrderUnknownResolution(
  ctx: Parameters<RuntimeCommandHandler>[1],
  paymentId: PaymentIntent["paymentId"],
  to: "UNKNOWN" | "PAID" | "NOT_PAID",
): void {
  const intent = ctx.state.paymentIntent(paymentId);
  if (!intent || intent.reference.kind !== "ORDER") return;
  const order = ctx.state.order(intent.reference.orderId);
  if (!order) return;
  if (to === "UNKNOWN") {
    if (order.paymentStatus !== "PAID" && order.paymentStatus !== "AUTHORIZED") return;
  } else if (order.paymentStatus !== "UNKNOWN") {
    return;
  }
  ctx.emit({
    subject: orderSubject(order.orderId),
    kind: "ORDER_PAYMENT_STATUS_CHANGED",
    payload: {
      kind: "ORDER_PAYMENT_STATUS_CHANGED",
      from: order.paymentStatus,
      to,
      revision: nextRevision(order.revision),
    },
  });
}
