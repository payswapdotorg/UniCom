/**
 * W1-005 autonomous operations handlers: autonomous till open (policy-banded
 * float), autonomous till close (variance + escalation paths), autonomous
 * restock triggers and autonomous count reconciliation. Every command here
 * is issued BY the autonomous store principal (requireStoreActor), gated by
 * the registered policy, and journals its policy application; variance and
 * anomaly paths land as explicit journaled escalation states — never
 * swallowed. Events reuse the W1-004 store-ops / W1-002 supply + inventory
 * shapes exactly (composition, not duplication).
 */
import { cashVarianceOf, storeSessionTransition, type CashVarianceRecord, type StoreCashSession } from "../domain/store-ops.js";
import { reconcileCountObservation, reconciliationRecord } from "../domain/reconciliation.js";
import { inventorySubject } from "../domain/inventory.js";
import { nextRevision } from "../domain/events.js";
import type { CanonicalInventoryLevel } from "../domain/inventory.js";
import {
  accept,
  rejectInvalidCommand,
  rejectInvalidState,
  type RuntimeCommandHandler,
} from "./handler.js";
import {
  cashVarianceSubject,
  mintCashVarianceId,
  mintReconciliationRecordId,
  mintStoreSessionId,
  storeSessionSubject,
} from "./subjects.js";
import {
  countPolicyOf,
  emitEscalation,
  emitPolicyApplication,
  operatingRulesOf,
  planAutonomousRestock,
  requirePolicy,
  requireStoreActor,
} from "./autonomous-ops-core.js";

function countGuard(label: string, count: { readonly currency: string; readonly amountMinor: string }, currency: string): ReturnType<typeof rejectInvalidCommand> | undefined {
  if (count.currency !== currency) {
    return rejectInvalidCommand(`${label} currency ${count.currency} does not match policy currency ${currency}`);
  }
  if (BigInt(count.amountMinor) < 0n) {
    return rejectInvalidCommand(`${label} must be non-negative, got ${count.amountMinor}`);
  }
  return undefined;
}

export const handleAutonomousOpenTill: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "AUTONOMOUS_OPEN_TILL") return rejectInvalidCommand("not AUTONOMOUS_OPEN_TILL");
  const actor = requireStoreActor(envelope.actor, payload.autonomousStoreId);
  if (!actor.ok) return actor;
  const policy = requirePolicy(ctx, payload.autonomousStoreId);
  if (!policy.ok) return policy;
  if (ctx.state.openStoreSessionFor(payload.autonomousStoreId, payload.tillId)) {
    return rejectInvalidState(`till ${payload.tillId} at store ${payload.autonomousStoreId} already has an OPEN cash session`);
  }
  const rules = operatingRulesOf(policy.value);
  if (!rules) {
    const application = emitPolicyApplication(ctx, payload.autonomousStoreId, "TILL_OPEN", "DENY", ["NO_TILL_FLOAT_RULE"]);
    emitEscalation(ctx, payload.autonomousStoreId, { kind: "POLICY_VIOLATION", application });
    return accept();
  }
  const currencyGuard = countGuard("opening count", payload.openingCount, policy.value.policyCurrency);
  if (currencyGuard) return currencyGuard;
  const withinBand =
    BigInt(payload.openingCount.amountMinor) >= BigInt(rules.tillFloatMin.amountMinor) &&
    BigInt(payload.openingCount.amountMinor) <= BigInt(rules.tillFloatMax.amountMinor);
  if (!withinBand) {
    // Out-of-band float: a journaled policy violation, not a silent drop.
    const application = emitPolicyApplication(ctx, payload.autonomousStoreId, "TILL_OPEN", "DENY", ["TILL_FLOAT_OUT_OF_BOUNDS"]);
    emitEscalation(ctx, payload.autonomousStoreId, { kind: "POLICY_VIOLATION", application });
    return accept();
  }
  // In-band: open the session with the store principal holding custody
  // (same aggregate shape as the W1-004 staff vocabulary).
  const session: StoreCashSession = {
    sessionId: mintStoreSessionId(ctx.mint()),
    autonomousStoreId: payload.autonomousStoreId,
    tillId: payload.tillId,
    staffRef: envelope.actor,
    state: "OPEN",
    openingCount: payload.openingCount,
    expectedCash: payload.openingCount,
    revision: 1,
  };
  emitPolicyApplication(ctx, payload.autonomousStoreId, "TILL_OPEN", "ALLOW", [], `STORE_CASH_SESSION:${session.sessionId}`);
  ctx.emit({
    subject: storeSessionSubject(session.sessionId),
    kind: "STORE_SESSION_OPENED",
    payload: { kind: "STORE_SESSION_OPENED", session },
  });
  return accept();
};

export const handleAutonomousCloseTill: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "AUTONOMOUS_CLOSE_TILL") return rejectInvalidCommand("not AUTONOMOUS_CLOSE_TILL");
  const actor = requireStoreActor(envelope.actor, payload.autonomousStoreId);
  if (!actor.ok) return actor;
  const policy = requirePolicy(ctx, payload.autonomousStoreId);
  if (!policy.ok) return policy;
  const session = ctx.state.storeSession(payload.sessionId);
  if (!session) return rejectInvalidState(`store cash session ${payload.sessionId} not found`);
  if (session.autonomousStoreId !== payload.autonomousStoreId) {
    return rejectInvalidState(`session ${payload.sessionId} belongs to store ${session.autonomousStoreId}, not ${payload.autonomousStoreId}`);
  }
  const transition = storeSessionTransition(session.state, "CLOSE");
  if (!transition.ok) {
    return rejectInvalidState(`store cash session ${payload.sessionId}: ${transition.error.code} from ${transition.error.from} on ${transition.error.trigger}`);
  }
  const guard = countGuard("closing count", payload.closingCount, session.expectedCash.currency);
  if (guard) return guard;
  // Variance is explicit journaled state (W1-004 shapes reused verbatim).
  const variance = cashVarianceOf(session.expectedCash, payload.closingCount);
  if (!variance.ok) throw new TypeError(`cash variance invariant violated: ${variance.error.detail}`);
  const record: CashVarianceRecord = {
    varianceId: mintCashVarianceId(ctx.mint()),
    sessionId: session.sessionId,
    autonomousStoreId: session.autonomousStoreId,
    tillId: session.tillId,
    occasion: "CLOSE",
    expected: session.expectedCash,
    counted: payload.closingCount,
    kind: variance.value.kind,
    varianceAmount: variance.value.varianceAmount,
    revision: 1,
  };
  const closed: StoreCashSession = { ...session, state: "CLOSED", revision: nextRevision(session.revision) };
  emitPolicyApplication(ctx, payload.autonomousStoreId, "TILL_CLOSE", "ALLOW", [], `STORE_CASH_SESSION:${session.sessionId}`);
  ctx.emit({
    subject: storeSessionSubject(session.sessionId),
    kind: "STORE_SESSION_STATE_CHANGED",
    payload: { kind: "STORE_SESSION_STATE_CHANGED", trigger: "CLOSE", session: closed },
  });
  ctx.emit({
    subject: cashVarianceSubject(record.varianceId),
    kind: "CASH_VARIANCE_RECORDED",
    payload: { kind: "CASH_VARIANCE_RECORDED", variance: record },
  });
  // Beyond the variance threshold → explicit journaled escalation state.
  const rules = operatingRulesOf(policy.value);
  if (rules && BigInt(record.varianceAmount.amountMinor) >= BigInt(rules.cashVarianceEscalationThreshold.amountMinor)) {
    emitEscalation(ctx, payload.autonomousStoreId, { kind: "CASH_VARIANCE", variance: record });
  }
  return accept();
};

export const handleAutonomousRestock: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "AUTONOMOUS_RESTOCK") return rejectInvalidCommand("not AUTONOMOUS_RESTOCK");
  const actor = requireStoreActor(envelope.actor, payload.autonomousStoreId);
  if (!actor.ok) return actor;
  const policy = requirePolicy(ctx, payload.autonomousStoreId);
  if (!policy.ok) return policy;
  planAutonomousRestock(ctx, policy.value, payload.autonomousStoreId, payload.skuId, payload.locationId);
  return accept();
};

export const handleAutonomousReconcileCount: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "AUTONOMOUS_RECONCILE_COUNT") return rejectInvalidCommand("not AUTONOMOUS_RECONCILE_COUNT");
  const actor = requireStoreActor(envelope.actor, payload.autonomousStoreId);
  if (!actor.ok) return actor;
  const policy = requirePolicy(ctx, payload.autonomousStoreId);
  if (!policy.ok) return policy;
  const rules = operatingRulesOf(policy.value);
  if (!rules) return rejectInvalidState(`store ${payload.autonomousStoreId} has no store-operating rules — autonomous count reconcile is rule-driven`);
  const observation = payload.observation;
  if (observation.resolution.resolved !== "OBSERVED") {
    return rejectInvalidCommand("autonomous count reconcile requires an OBSERVED resolution (tri-state observations use RECONCILE_COUNT_OBSERVATION)");
  }
  const current: CanonicalInventoryLevel =
    ctx.state.level(observation.skuId, observation.locationId) ??
    { skuId: observation.skuId, locationId: observation.locationId, onHand: 0, reserved: 0, revision: 0, updatedAt: ctx.now };
  const outcome = reconcileCountObservation(current, observation, countPolicyOf(rules));
  const recordId = mintReconciliationRecordId(ctx.mint());
  const record = reconciliationRecord(recordId, observation.observationId, outcome, observation.skuId, observation.locationId, ctx.now);
  emitPolicyApplication(ctx, payload.autonomousStoreId, "COUNT_RECONCILE", "ALLOW", [], `RECONCILIATION_RECORD:${recordId}`);
  ctx.emit({
    subject: { subjectType: "RECONCILIATION_RECORD", subjectId: recordId },
    kind: "RECONCILIATION_RECORDED",
    payload: { kind: "RECONCILIATION_RECORDED", record },
  });
  if (outcome.disposition === "PROMOTED") {
    ctx.emit({
      subject: inventorySubject(observation),
      kind: "INVENTORY_RECONCILED",
      payload: {
        kind: "INVENTORY_RECONCILED",
        skuId: observation.skuId,
        locationId: observation.locationId,
        units: outcome.varianceUnits ?? 0,
        reason: "RECONCILIATION",
        varianceUnits: outcome.varianceUnits,
        resultingLevel: { ...outcome.level, updatedAt: ctx.now },
      },
    });
  }
  // Count mismatch beyond tolerance: DISCREPANCY_HOLD + explicit escalation.
  if (outcome.disposition === "DISCREPANCY_HOLD") {
    emitEscalation(ctx, payload.autonomousStoreId, {
      kind: "COUNT_MISMATCH",
      observationId: observation.observationId,
      varianceUnits: outcome.varianceUnits ?? 0,
      disposition: outcome.disposition,
    });
  }
  return accept();
};
