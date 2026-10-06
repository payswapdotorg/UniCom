/**
 * W1-005 store-operating-cycle handlers: BEGIN (derives the day key from the
 * deterministic time source — never a wall clock) and ADVANCE through the
 * documented cycle state machine (OPEN → OPERATING → CLOSED → RECONCILED).
 * CLOSE requires every till session of the store to be terminal (cash fully
 * accounted); RECONCILE journals a deterministic summary folded from the
 * store's journaled operational facts.
 */
import { dayKeyOf, storeCycleTransition, type StoreCycle, type StoreCycleSummary } from "../domain/autonomous-store.js";
import { nextRevision } from "../domain/events.js";
import { money } from "../domain/money.js";
import type { AutonomousStorePolicy } from "../domain/policy.js";
import {
  accept,
  rejectInvalidCommand,
  rejectInvalidState,
  type CommandContext,
  type RuntimeCommandHandler,
} from "./handler.js";
import { mintStoreCycleId, storeCycleSubject } from "./subjects.js";
import { emitPolicyApplication, requirePolicy, requireStoreActor } from "./autonomous-ops-core.js";

export const handleBeginStoreCycle: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "BEGIN_STORE_CYCLE") return rejectInvalidCommand("not BEGIN_STORE_CYCLE");
  const actor = requireStoreActor(envelope.actor, payload.autonomousStoreId);
  if (!actor.ok) return actor;
  const policy = requirePolicy(ctx, payload.autonomousStoreId);
  if (!policy.ok) return policy;
  const dayKey = dayKeyOf(ctx.now);
  if (ctx.state.autonomousOps().activeCycleFor(payload.autonomousStoreId, dayKey)) {
    return rejectInvalidState(`store ${payload.autonomousStoreId} already has an active cycle for day ${dayKey}`);
  }
  const cycle: StoreCycle = {
    cycleId: mintStoreCycleId(ctx.mint()),
    autonomousStoreId: payload.autonomousStoreId,
    dayKey,
    state: "OPEN",
    beganAt: ctx.now,
    revision: 1,
  };
  emitPolicyApplication(ctx, payload.autonomousStoreId, "CYCLE_ADVANCE", "ALLOW", [], `STORE_CYCLE:${cycle.cycleId}`);
  ctx.emit({
    subject: storeCycleSubject(cycle.cycleId),
    kind: "STORE_CYCLE_BEGUN",
    payload: { kind: "STORE_CYCLE_BEGUN", cycle },
  });
  return accept();
};

export const handleAdvanceStoreCycle: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "ADVANCE_STORE_CYCLE") return rejectInvalidCommand("not ADVANCE_STORE_CYCLE");
  const cycle = ctx.state.autonomousOps().cycle(payload.cycleId);
  if (!cycle) return rejectInvalidState(`store cycle ${payload.cycleId} not found`);
  const actor = requireStoreActor(envelope.actor, cycle.autonomousStoreId);
  if (!actor.ok) return actor;
  const policy = requirePolicy(ctx, cycle.autonomousStoreId);
  if (!policy.ok) return policy;
  const transition = storeCycleTransition(cycle.state, payload.trigger);
  if (!transition.ok) {
    return rejectInvalidState(`store cycle ${payload.cycleId}: ${transition.error.code} from ${transition.error.from} on ${transition.error.trigger}`);
  }
  if (payload.trigger === "CLOSE") {
    const openSession = ctx.state
      .allStoreSessions()
      .find((session) => session.autonomousStoreId === cycle.autonomousStoreId && session.state === "OPEN");
    if (openSession) {
      return rejectInvalidState(
        `store cycle ${payload.cycleId} cannot close: till session ${openSession.sessionId} is still OPEN (cash must be accounted)`,
      );
    }
  }
  const reconciling = payload.trigger === "RECONCILE";
  const advanced: StoreCycle = {
    ...cycle,
    state: transition.value,
    endedAt: reconciling || payload.trigger === "CLOSE" ? ctx.now : cycle.endedAt,
    summary: reconciling ? summarizeStoreFacts(ctx, cycle.autonomousStoreId, policy.value) : cycle.summary,
    revision: nextRevision(cycle.revision),
  };
  emitPolicyApplication(ctx, cycle.autonomousStoreId, "CYCLE_ADVANCE", "ALLOW", [], `STORE_CYCLE:${cycle.cycleId}`);
  ctx.emit({
    subject: storeCycleSubject(cycle.cycleId),
    kind: "STORE_CYCLE_ADVANCED",
    payload: { kind: "STORE_CYCLE_ADVANCED", cycle: advanced },
  });
  return accept();
};

/**
 * Deterministic fold of the store's journaled operational facts at reconcile
 * time: closed sessions, variance count + signed net variance (policy
 * currency), escalations, restock orders + spend. Pure over kernel state.
 */
function summarizeStoreFacts(ctx: CommandContext, storeId: string, policy: AutonomousStorePolicy): StoreCycleSummary {
  const sessions = ctx.state.allStoreSessions().filter((session) => session.autonomousStoreId === storeId);
  const variances = ctx.state.allCashVariances().filter((variance) => variance.autonomousStoreId === storeId);
  const escalations = ctx.state.autonomousOps().escalationsForStore(storeId);
  const restocks = ctx.state.autonomousOps().restockOrdersFor(storeId);
  let netMinor = 0n;
  for (const variance of variances) {
    if (variance.expected.currency !== policy.policyCurrency) continue;
    netMinor += BigInt(variance.counted.amountMinor) - BigInt(variance.expected.amountMinor);
  }
  let spendMinor = 0n;
  for (const order of restocks) {
    if (order.plannedValue.currency === policy.policyCurrency) spendMinor += BigInt(order.plannedValue.amountMinor);
  }
  return {
    closedSessions: sessions.filter((session) => session.state === "CLOSED").length,
    cashVarianceCount: variances.length,
    netCashVariance: money(netMinor.toString(), policy.policyCurrency),
    escalationCount: escalations.length,
    restockOrderCount: restocks.length,
    restockSpend: money(spendMinor.toString(), policy.policyCurrency),
  };
}
