/**
 * W1-005 store-control handlers: registration (authority bootstrap),
 * authority handover (journaled principal transition), human override
 * (journaled principal transition + forced action) and escalation
 * advancement. Authority is enforced by the kernel-boundary policy gate
 * (policy-gate.ts gateAuthorityCommand): only the registered owner or the
 * current controlling principal may exercise these commands — anything else
 * is a deterministic POLICY_DENIED rejection with zero journal entries.
 */
import type {
  AutonomousStoreControl,
  AutonomousOverrideRecord,
  StoreEscalation,
} from "../domain/autonomous-store.js";
import { storeEscalationTransition } from "../domain/autonomous-store.js";
import { nextRevision } from "../domain/events.js";
import { principalRefEquals } from "../domain/principals.js";
import {
  accept,
  rejectInvalidCommand,
  rejectInvalidState,
  type CommandContext,
  type RuntimeCommandHandler,
} from "./handler.js";
import { autonomousStoreSubject, mintOverrideId, storeEscalationSubject } from "./subjects.js";
import { planAutonomousPriceAdjustment, planAutonomousRestock, requirePolicy, type OverrideBasis } from "./autonomous-ops-core.js";

/** Initial control state: the autonomous store principal holds custody. */
function initialControl(ctx: CommandContext, storeId: string, ownerRef: AutonomousStoreControl["ownerRef"], displayName: string): AutonomousStoreControl {
  return {
    autonomousStoreId: storeId as AutonomousStoreControl["autonomousStoreId"],
    displayName,
    ownerRef,
    controllingPrincipal: { kind: "AUTONOMOUS_STORE", autonomousStoreId: storeId as AutonomousStoreControl["autonomousStoreId"] },
    mode: "AUTONOMOUS",
    registeredAt: ctx.now,
    revision: 1,
  };
}

export const handleRegisterAutonomousStore: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "REGISTER_AUTONOMOUS_STORE") return rejectInvalidCommand("not REGISTER_AUTONOMOUS_STORE");
  // Authority bootstrap: the registering principal declares ITSELF the owner.
  if (!principalRefEquals(envelope.actor, payload.ownerRef)) {
    return rejectInvalidCommand("the registering actor must be the declared owner (self-registration)");
  }
  if (ctx.state.autonomousOps().controlFor(payload.autonomousStoreId)) {
    return rejectInvalidState(`store ${payload.autonomousStoreId} is already registered`);
  }
  const control = initialControl(ctx, payload.autonomousStoreId, payload.ownerRef, payload.displayName);
  ctx.emit({
    subject: autonomousStoreSubject(payload.autonomousStoreId),
    kind: "STORE_REGISTERED",
    payload: { kind: "STORE_REGISTERED", control },
  });
  return accept();
};

export const handleHandoverStoreAuthority: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "HANDOVER_STORE_AUTHORITY") return rejectInvalidCommand("not HANDOVER_STORE_AUTHORITY");
  const current = ctx.state.autonomousOps().controlFor(payload.autonomousStoreId);
  if (!current) return rejectInvalidState(`store ${payload.autonomousStoreId} is not registered`);
  // Handover is a principal transition performed by the CURRENT controller
  // (mirrors the W1-004 till-custody law); the boundary gate has already
  // verified actor authority (owner or controller).
  if (!principalRefEquals(current.controllingPrincipal, payload.fromPrincipal)) {
    return rejectInvalidState(
      `authority handover must be performed by the current controlling principal (${current.controllingPrincipal.kind}), got ${payload.fromPrincipal.kind}`,
    );
  }
  const next: AutonomousStoreControl = {
    ...current,
    controllingPrincipal: payload.toPrincipal,
    mode: payload.toMode,
    revision: nextRevision(current.revision),
  };
  ctx.emit({
    subject: autonomousStoreSubject(payload.autonomousStoreId),
    kind: "STORE_AUTHORITY_CHANGED",
    payload: { kind: "STORE_AUTHORITY_CHANGED", from: current, to: next },
  });
  return accept();
};

export const handleRecordHumanOverride: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "RECORD_HUMAN_OVERRIDE") return rejectInvalidCommand("not RECORD_HUMAN_OVERRIDE");
  const control = ctx.state.autonomousOps().controlFor(payload.autonomousStoreId);
  if (!control) return rejectInvalidState(`store ${payload.autonomousStoreId} is not registered`);
  const policy = requirePolicy(ctx, payload.autonomousStoreId);
  if (!policy.ok) return policy;
  // The overridden action must have a valid target before anything journals
  // (an override with no object is a deterministic refusal, zero events).
  if (payload.action.kind === "PRICE_ADJUSTMENT" && !ctx.state.autonomousOps().priceRecord(payload.autonomousStoreId, payload.action.skuId)) {
    return rejectInvalidState(`no price record for sku ${payload.action.skuId} at store ${payload.autonomousStoreId} to override against`);
  }
  if (payload.action.kind === "RESTOCK") {
    const { skuId, locationId, units } = payload.action;
    const rule = policy.value.restockRules?.find((item) => item.skuId === skuId && item.locationId === locationId);
    if (!rule) {
      return rejectInvalidState(`no restock rule for ${skuId}|${locationId} to override against`);
    }
    if (!Number.isSafeInteger(units) || units <= 0) {
      return rejectInvalidCommand(`override restock units must be positive: ${units}`);
    }
  }
  // The journaled principal transition: the human principal exercises the
  // store's autonomous decision (on-behalf-of custody, fully auditable).
  const override: AutonomousOverrideRecord = {
    overrideId: mintOverrideId(ctx.mint()),
    autonomousStoreId: payload.autonomousStoreId,
    exercisedBy: envelope.actor,
    onBehalfOf: control.controllingPrincipal,
    action: payload.action,
    justification: payload.justification,
    occurredAt: ctx.now,
    revision: 1,
  };
  ctx.emit({
    subject: autonomousStoreSubject(payload.autonomousStoreId),
    kind: "AUTONOMOUS_OVERRIDE_RECORDED",
    payload: { kind: "AUTONOMOUS_OVERRIDE_RECORDED", override },
  });
  const basis: OverrideBasis = { override };
  if (payload.action.kind === "PRICE_ADJUSTMENT") {
    const outcome = planAutonomousPriceAdjustment(
      ctx,
      policy.value,
      payload.autonomousStoreId,
      payload.action.skuId,
      payload.action.newPrice,
      payload.action.reason,
      basis,
    );
    if (outcome.status !== "APPLIED") return rejectInvalidState("override price adjustment did not apply");
  } else {
    planAutonomousRestock(
      ctx,
      policy.value,
      payload.autonomousStoreId,
      payload.action.skuId,
      payload.action.locationId,
      basis,
    );
  }
  return accept();
};

export const handleAdvanceStoreEscalation: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "ADVANCE_STORE_ESCALATION") return rejectInvalidCommand("not ADVANCE_STORE_ESCALATION");
  const escalation = ctx.state.autonomousOps().escalation(payload.escalationId);
  if (!escalation) return rejectInvalidState(`escalation ${payload.escalationId} not found`);
  const transition = storeEscalationTransition(escalation.state, payload.trigger);
  if (!transition.ok) {
    return rejectInvalidState(`escalation ${payload.escalationId}: ${transition.error.code} from ${transition.error.from} on ${transition.error.trigger}`);
  }
  const next: StoreEscalation = { ...escalation, state: transition.value, revision: nextRevision(escalation.revision) };
  ctx.emit({
    subject: storeEscalationSubject(payload.escalationId),
    kind: "STORE_ESCALATION_ADVANCED",
    payload: { kind: "STORE_ESCALATION_ADVANCED", escalation: next },
  });
  return accept();
};
