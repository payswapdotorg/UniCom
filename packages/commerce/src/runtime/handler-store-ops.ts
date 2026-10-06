/**
 * Autonomous-store cash-session handlers (W1-004): the deterministic
 * store-operation vocabulary — opening count, till operations, staff
 * handover (principal transition), closing count, cash reconciliation.
 *
 * Laws:
 * - One OPEN session per (store, till): custody is exclusive; a second
 *   OPEN on the same till is a deterministic rejection.
 * - Till operations apply to the OPEN session only, must match the session
 *   currency, be positive, and can never drive expected cash negative.
 * - Handover is a PRINCIPAL TRANSITION: fromStaff must equal the session's
 *   current staff (custody is handed off by its holder); the counted cash
 *   becomes the successor session's opening count; the variance between
 *   expected and counted is journaled EXPLICITLY at the boundary.
 * - Close reconciles counted vs expected and journals the variance —
 *   BALANCED, OVER and SHORT are all explicit journaled states (never an
 *   error swallowed); both events land in one buffered transaction.
 */
import {
  applyTillOperation,
  cashVarianceOf,
  storeSessionTransition,
  type CashVarianceRecord,
  type StoreCashSession,
  type TillOperation,
} from "../domain/store-ops.js";
import type { Money } from "../domain/money.js";
import { nextRevision } from "../domain/events.js";
import { principalRefEquals } from "../domain/principals.js";
import {
  accept,
  rejectInvalidCommand,
  rejectInvalidState,
  type CommandContext,
  type RuntimeCommandHandler,
} from "./handler.js";
import { cashVarianceSubject, mintCashVarianceId, mintStoreSessionId, storeSessionSubject } from "./subjects.js";

type Ctx = CommandContext;

export const handleOpenStoreCashSession: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "OPEN_STORE_CASH_SESSION") return rejectInvalidCommand("not OPEN_STORE_CASH_SESSION");
  if (BigInt(payload.openingCount.amountMinor) < 0n) {
    return rejectInvalidCommand(`opening count must be non-negative, got ${payload.openingCount.amountMinor}`);
  }
  if (ctx.state.openStoreSessionFor(payload.autonomousStoreId, payload.tillId)) {
    return rejectInvalidState(`till ${payload.tillId} at store ${payload.autonomousStoreId} already has an OPEN cash session`);
  }
  const session: StoreCashSession = {
    sessionId: mintStoreSessionId(ctx.mint()),
    autonomousStoreId: payload.autonomousStoreId,
    tillId: payload.tillId,
    staffRef: payload.staff,
    state: "OPEN",
    openingCount: payload.openingCount,
    expectedCash: payload.openingCount,
    revision: 1,
  };
  ctx.emit({
    subject: storeSessionSubject(session.sessionId),
    kind: "STORE_SESSION_OPENED",
    payload: { kind: "STORE_SESSION_OPENED", session },
  });
  return accept();
};

export const handleRecordTillOperation: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "RECORD_TILL_OPERATION") return rejectInvalidCommand("not RECORD_TILL_OPERATION");
  const session = ctx.state.storeSession(payload.sessionId);
  if (!session) return rejectInvalidState(`store cash session ${payload.sessionId} not found`);
  if (session.state !== "OPEN") {
    return rejectInvalidState(`store cash session ${payload.sessionId} is ${session.state} — only an OPEN session takes till operations`);
  }
  const operation: TillOperation = payload.operation;
  const next = applyTillOperation(session, operation);
  if (!next.ok) {
    return rejectInvalidCommand(`till operation: ${next.error.code} (${next.error.detail})`);
  }
  ctx.emit({
    subject: storeSessionSubject(session.sessionId),
    kind: "TILL_OPERATION_RECORDED",
    payload: { kind: "TILL_OPERATION_RECORDED", operation, resultingSession: next.value },
  });
  return accept();
};

export const handleHandoverStoreCashSession: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "HANDOVER_STORE_CASH_SESSION") return rejectInvalidCommand("not HANDOVER_STORE_CASH_SESSION");
  const session = ctx.state.storeSession(payload.sessionId);
  if (!session) return rejectInvalidState(`store cash session ${payload.sessionId} not found`);
  const transition = storeSessionTransition(session.state, "HANDOVER");
  if (!transition.ok) {
    return rejectInvalidState(`store cash session ${payload.sessionId}: ${transition.error.code} from ${transition.error.from} on ${transition.error.trigger}`);
  }
  if (!principalRefEquals(session.staffRef, payload.fromStaff)) {
    return rejectInvalidState(
      `handover of session ${payload.sessionId} must be performed by its current staff (${session.staffRef.kind}), got ${payload.fromStaff.kind}`,
    );
  }
  const counted = payload.countedCash;
  const guard = countGuard(counted, session.expectedCash.currency, "counted cash");
  if (guard) return guard;
  const variance = varianceRecord(ctx, session, counted, "HANDOVER");
  const handedOver: StoreCashSession = { ...session, state: "HANDED_OVER", revision: nextRevision(session.revision) };
  const successor: StoreCashSession = {
    sessionId: mintStoreSessionId(ctx.mint()),
    autonomousStoreId: session.autonomousStoreId,
    tillId: session.tillId,
    staffRef: payload.toStaff,
    state: "OPEN",
    openingCount: counted,
    expectedCash: counted,
    revision: 1,
  };
  ctx.emit({
    subject: storeSessionSubject(session.sessionId),
    kind: "STORE_SESSION_STATE_CHANGED",
    payload: { kind: "STORE_SESSION_STATE_CHANGED", trigger: "HANDOVER", session: handedOver, successor },
  });
  ctx.emit({
    subject: cashVarianceSubject(variance.varianceId),
    kind: "CASH_VARIANCE_RECORDED",
    payload: { kind: "CASH_VARIANCE_RECORDED", variance },
  });
  return accept();
};

export const handleCloseStoreCashSession: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "CLOSE_STORE_CASH_SESSION") return rejectInvalidCommand("not CLOSE_STORE_CASH_SESSION");
  const session = ctx.state.storeSession(payload.sessionId);
  if (!session) return rejectInvalidState(`store cash session ${payload.sessionId} not found`);
  const transition = storeSessionTransition(session.state, "CLOSE");
  if (!transition.ok) {
    return rejectInvalidState(`store cash session ${payload.sessionId}: ${transition.error.code} from ${transition.error.from} on ${transition.error.trigger}`);
  }
  const guard = countGuard(payload.closingCount, session.expectedCash.currency, "closing count");
  if (guard) return guard;
  const variance = varianceRecord(ctx, session, payload.closingCount, "CLOSE");
  const closed: StoreCashSession = { ...session, state: "CLOSED", revision: nextRevision(session.revision) };
  ctx.emit({
    subject: storeSessionSubject(session.sessionId),
    kind: "STORE_SESSION_STATE_CHANGED",
    payload: { kind: "STORE_SESSION_STATE_CHANGED", trigger: "CLOSE", session: closed },
  });
  ctx.emit({
    subject: cashVarianceSubject(variance.varianceId),
    kind: "CASH_VARIANCE_RECORDED",
    payload: { kind: "CASH_VARIANCE_RECORDED", variance },
  });
  return accept();
};

function countGuard(count: Money, currency: Money["currency"], label: string): ReturnType<typeof rejectInvalidCommand> | undefined {
  if (count.currency !== currency) {
    return rejectInvalidCommand(`${label} currency ${count.currency} does not match session currency ${currency}`);
  }
  if (BigInt(count.amountMinor) < 0n) {
    return rejectInvalidCommand(`${label} must be non-negative, got ${count.amountMinor}`);
  }
  return undefined;
}

/** Explicit reconciliation fact — BALANCED/OVER/SHORT, always journaled. */
function varianceRecord(ctx: Ctx, session: StoreCashSession, counted: Money, occasion: "HANDOVER" | "CLOSE"): CashVarianceRecord {
  const variance = cashVarianceOf(session.expectedCash, counted);
  if (!variance.ok) {
    throw new TypeError(`cash variance invariant violated: ${variance.error.detail}`);
  }
  return {
    varianceId: mintCashVarianceId(ctx.mint()),
    sessionId: session.sessionId,
    autonomousStoreId: session.autonomousStoreId,
    tillId: session.tillId,
    occasion,
    expected: session.expectedCash,
    counted,
    kind: variance.value.kind,
    varianceAmount: variance.value.varianceAmount,
    revision: 1,
  };
}
