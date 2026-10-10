/**
 * W1-012 TradeCycle execution handlers: the kernel's execution authority for
 * multi-leg trade cycles (discovery stays in the agent lane; candidates arrive
 * here as command payloads with opaque item refs).
 *
 * Actor identity is enforced at this boundary (the agent lane's authorization
 * laws, made canonical):
 * - OPEN/EXECUTE_TRADE_CYCLE/EXECUTE_TRADE_CYCLE_LEG/ROLLBACK_TRADE_CYCLE_LEG:
 *   actor = the initiating principal.
 * - AUTHORIZE/REFUSE/WITHDRAW leg: actor = the payload principal (the kernel
 *   then decides clear vs ambiguous attribution against the leg's GIVING
 *   participant — ambiguous attribution is journaled as UNKNOWN, never passed,
 *   never failed).
 * - LAPSE leg: any actor may record the window observation.
 */
import {
  applyTradeCycleLegAction,
  executeTradeCycle,
  executeTradeCycleLeg,
  lapseTradeCycleLeg,
  rollbackTradeCycleLeg,
  validateTradeCycleLegs,
} from "../domain/tradecycle.js";
import type { TradeCycleExecution } from "../domain/tradecycle.js";
import { principalRefEquals } from "../domain/principals.js";
import { accept, rejectInvalidCommand, rejectInvalidState, type RuntimeCommandHandler } from "./handler.js";
import { tradeCycleSubject } from "./subjects.js";

function describeError(error: Record<string, unknown>): string {
  return Object.entries(error)
    .map(([key, value]) => (key === "code" ? value : `${key}=${JSON.stringify(value)}`))
    .join(" ");
}

function legEventKind(next: TradeCycleExecution, legIndex: number, action: "AUTHORIZE" | "REFUSE" | "WITHDRAW"): string {
  const leg = next.legs.find((candidate) => candidate.legIndex === legIndex);
  if (leg?.consentState === "UNKNOWN") {
    if (action === "AUTHORIZE") return "TRADE_CYCLE_LEG_AUTHORIZATION_UNKNOWN";
    if (action === "REFUSE") return "TRADE_CYCLE_LEG_REFUSAL_UNKNOWN";
    return "TRADE_CYCLE_LEG_WITHDRAWAL_UNKNOWN";
  }
  if (action === "AUTHORIZE") return "TRADE_CYCLE_LEG_AUTHORIZED";
  if (action === "REFUSE") return "TRADE_CYCLE_LEG_REFUSED";
  return "TRADE_CYCLE_LEG_WITHDRAWN";
}

export const handleOpenTradeCycle: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "OPEN_TRADE_CYCLE") return rejectInvalidCommand("not OPEN_TRADE_CYCLE");
  const cycle = payload.cycle;
  if (cycle.state !== "OPEN") return rejectInvalidCommand("cycle must open in OPEN state");
  if (cycle.revision !== 1) return rejectInvalidCommand("cycle must open at revision 1");
  if (!Number.isSafeInteger(cycle.bounds.maxHops) || cycle.bounds.maxHops < 1) {
    return rejectInvalidCommand("bounds.maxHops must be a positive safe integer");
  }
  if (cycle.bounds.environment !== "PRODUCTION" && cycle.bounds.environment !== "LAB") {
    return rejectInvalidCommand("bounds.environment must be PRODUCTION or LAB");
  }
  const shape = validateTradeCycleLegs(cycle.legs, cycle.bounds, cycle.executionMode, cycle.recoursePlanRef);
  if (!shape.ok) return rejectInvalidCommand(`cycle ${cycle.tradeCycleId}: ${describeError(shape.error as Record<string, unknown>)}`);
  if (!principalRefEquals(envelope.actor, cycle.initiatingRef)) {
    return rejectInvalidCommand("only the initiating principal may open the cycle");
  }
  if (ctx.state.executionOps().tradeCycle(cycle.tradeCycleId)) {
    return rejectInvalidState(`trade cycle ${cycle.tradeCycleId} already exists`);
  }
  ctx.emit({
    subject: tradeCycleSubject(cycle.tradeCycleId),
    kind: "TRADE_CYCLE_OPENED",
    payload: { kind: "TRADE_CYCLE_OPENED", cycle },
  });
  return accept();
};

export const handleAuthorizeTradeCycleLeg: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "AUTHORIZE_TRADE_CYCLE_LEG") return rejectInvalidCommand("not AUTHORIZE_TRADE_CYCLE_LEG");
  if (!principalRefEquals(envelope.actor, payload.authorizingRef)) {
    return rejectInvalidCommand("the actor must be the principal the authorization is attributed to");
  }
  const cycle = ctx.state.executionOps().tradeCycle(payload.cycleId);
  if (!cycle) return rejectInvalidState(`trade cycle ${payload.cycleId} not found`);
  const next = applyTradeCycleLegAction(cycle, payload.legIndex, {
    kind: "AUTHORIZE",
    actor: payload.authorizingRef,
    authorizationRef: payload.authorizationRef,
    recordedAt: ctx.now,
  });
  if (!next.ok) return rejectInvalidState(`trade cycle ${payload.cycleId}: ${describeError(next.error as Record<string, unknown>)}`);
  ctx.emit({
    subject: tradeCycleSubject(payload.cycleId),
    kind: legEventKind(next.value, payload.legIndex, "AUTHORIZE"),
    payload: { kind: legEventKind(next.value, payload.legIndex, "AUTHORIZE"), cycle: next.value, legIndex: payload.legIndex, authorizationRef: payload.authorizationRef },
  });
  return accept();
};

export const handleRefuseTradeCycleLeg: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "REFUSE_TRADE_CYCLE_LEG") return rejectInvalidCommand("not REFUSE_TRADE_CYCLE_LEG");
  if (!principalRefEquals(envelope.actor, payload.refusingRef)) {
    return rejectInvalidCommand("the actor must be the principal the refusal is attributed to");
  }
  const cycle = ctx.state.executionOps().tradeCycle(payload.cycleId);
  if (!cycle) return rejectInvalidState(`trade cycle ${payload.cycleId} not found`);
  const next = applyTradeCycleLegAction(cycle, payload.legIndex, {
    kind: "REFUSE",
    actor: payload.refusingRef,
    recordedAt: ctx.now,
  });
  if (!next.ok) return rejectInvalidState(`trade cycle ${payload.cycleId}: ${describeError(next.error as Record<string, unknown>)}`);
  const kind = legEventKind(next.value, payload.legIndex, "REFUSE");
  ctx.emit({
    subject: tradeCycleSubject(payload.cycleId),
    kind,
    payload: { kind, cycle: next.value, legIndex: payload.legIndex, reason: payload.reason },
  });
  return accept();
};

export const handleWithdrawTradeCycleLeg: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "WITHDRAW_TRADE_CYCLE_LEG") return rejectInvalidCommand("not WITHDRAW_TRADE_CYCLE_LEG");
  if (!principalRefEquals(envelope.actor, payload.withdrawingRef)) {
    return rejectInvalidCommand("the actor must be the principal the withdrawal is attributed to");
  }
  const cycle = ctx.state.executionOps().tradeCycle(payload.cycleId);
  if (!cycle) return rejectInvalidState(`trade cycle ${payload.cycleId} not found`);
  const next = applyTradeCycleLegAction(cycle, payload.legIndex, {
    kind: "WITHDRAW",
    actor: payload.withdrawingRef,
    recordedAt: ctx.now,
  });
  if (!next.ok) return rejectInvalidState(`trade cycle ${payload.cycleId}: ${describeError(next.error as Record<string, unknown>)}`);
  const kind = legEventKind(next.value, payload.legIndex, "WITHDRAW");
  ctx.emit({
    subject: tradeCycleSubject(payload.cycleId),
    kind,
    payload: { kind, cycle: next.value, legIndex: payload.legIndex },
  });
  return accept();
};

export const handleLapseTradeCycleLeg: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "LAPSE_TRADE_CYCLE_LEG") return rejectInvalidCommand("not LAPSE_TRADE_CYCLE_LEG");
  const cycle = ctx.state.executionOps().tradeCycle(payload.cycleId);
  if (!cycle) return rejectInvalidState(`trade cycle ${payload.cycleId} not found`);
  const next = lapseTradeCycleLeg(cycle, payload.legIndex);
  if (!next.ok) return rejectInvalidState(`trade cycle ${payload.cycleId}: ${describeError(next.error as Record<string, unknown>)}`);
  ctx.emit({
    subject: tradeCycleSubject(payload.cycleId),
    kind: "TRADE_CYCLE_LEG_LAPSED",
    payload: { kind: "TRADE_CYCLE_LEG_LAPSED", cycle: next.value, legIndex: payload.legIndex },
  });
  return accept();
};

export const handleExecuteTradeCycle: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "EXECUTE_TRADE_CYCLE") return rejectInvalidCommand("not EXECUTE_TRADE_CYCLE");
  const cycle = ctx.state.executionOps().tradeCycle(payload.cycleId);
  if (!cycle) return rejectInvalidState(`trade cycle ${payload.cycleId} not found`);
  if (!principalRefEquals(envelope.actor, cycle.initiatingRef)) {
    return rejectInvalidCommand("only the initiating principal may execute the cycle");
  }
  const next = executeTradeCycle(cycle);
  if (!next.ok) return rejectInvalidState(`trade cycle ${payload.cycleId}: ${describeError(next.error as Record<string, unknown>)}`);
  ctx.emit({
    subject: tradeCycleSubject(payload.cycleId),
    kind: "TRADE_CYCLE_COMMITTED",
    payload: { kind: "TRADE_CYCLE_COMMITTED", cycle: next.value },
  });
  return accept();
};

export const handleExecuteTradeCycleLeg: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "EXECUTE_TRADE_CYCLE_LEG") return rejectInvalidCommand("not EXECUTE_TRADE_CYCLE_LEG");
  const cycle = ctx.state.executionOps().tradeCycle(payload.cycleId);
  if (!cycle) return rejectInvalidState(`trade cycle ${payload.cycleId} not found`);
  if (!principalRefEquals(envelope.actor, cycle.initiatingRef)) {
    return rejectInvalidCommand("only the initiating principal may execute a leg");
  }
  const next = executeTradeCycleLeg(cycle, payload.legIndex);
  if (!next.ok) return rejectInvalidState(`trade cycle ${payload.cycleId}: ${describeError(next.error as Record<string, unknown>)}`);
  ctx.emit({
    subject: tradeCycleSubject(payload.cycleId),
    kind: "TRADE_CYCLE_LEG_COMMITTED",
    payload: { kind: "TRADE_CYCLE_LEG_COMMITTED", cycle: next.value, legIndex: payload.legIndex },
  });
  return accept();
};

export const handleRollbackTradeCycleLeg: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "ROLLBACK_TRADE_CYCLE_LEG") return rejectInvalidCommand("not ROLLBACK_TRADE_CYCLE_LEG");
  if (typeof payload.reason !== "string" || payload.reason.trim().length === 0) {
    return rejectInvalidCommand("rollback requires an explicit reason");
  }
  const cycle = ctx.state.executionOps().tradeCycle(payload.cycleId);
  if (!cycle) return rejectInvalidState(`trade cycle ${payload.cycleId} not found`);
  if (!principalRefEquals(envelope.actor, cycle.initiatingRef)) {
    return rejectInvalidCommand("only the initiating principal may roll a leg back");
  }
  const next = rollbackTradeCycleLeg(cycle, payload.legIndex);
  if (!next.ok) return rejectInvalidState(`trade cycle ${payload.cycleId}: ${describeError(next.error as Record<string, unknown>)}`);
  ctx.emit({
    subject: tradeCycleSubject(payload.cycleId),
    kind: "TRADE_CYCLE_LEG_ROLLED_BACK",
    payload: { kind: "TRADE_CYCLE_LEG_ROLLED_BACK", cycle: next.value, legIndex: payload.legIndex, reason: payload.reason },
  });
  return accept();
};
