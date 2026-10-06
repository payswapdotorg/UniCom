/**
 * Autonomous-store policy gate at the kernel boundary (W1-002 scenario 5,
 * extended additively by W1-005).
 *
 * Deterministic mapping from command payloads to policy proposals:
 * - Stop conditions at/above threshold halt ALL autonomous action (DENY).
 * - REFUND_PAYMENT evaluates the REFUND proposal against the store policy.
 * - Other autonomous-store commands pass the stop-condition gate; their
 *   stateful policy bands (restock thresholds, spend-in-period, price bands,
 *   till floats) are evaluated by the handlers and JOURNALED as policy
 *   applications (autonomous-ops-core) — an out-of-band trigger is a
 *   journaled violation, never a silent drop.
 *
 * W1-005 authority gate: store-control commands (override, authority
 * handover, escalation advancement, price-book declaration) are gated for
 * EVERY actor — only the registered owner or the current controlling
 * principal may exercise them. An override outside the actor's authority is
 * a deterministic POLICY_DENIED rejection at the kernel boundary (zero
 * journal entries); an unregistered store fails closed
 * (NO_REGISTERED_AUTHORITY).
 */
import { evaluateAutonomousPolicy, type AutonomousStorePolicy, type PolicyDecision } from "../domain/policy.js";
import type { AutonomousStoreControl } from "../domain/autonomous-store.js";
import type { PrincipalRef } from "../domain/principals.js";
import { principalRefEquals } from "../domain/principals.js";
import type { RuntimeCommandPayload } from "./commands.js";

const ALLOW: PolicyDecision = { decision: "ALLOW", reasons: [] };

export function gateAutonomousCommand(
  payload: RuntimeCommandPayload,
  policy: AutonomousStorePolicy,
): PolicyDecision {
  for (const condition of policy.stopConditions) {
    if (condition.currentlyObserved >= condition.threshold) {
      return { decision: "DENY", reasons: ["STOP_CONDITION_TRIGGERED"] };
    }
  }
  if (payload.type === "REFUND_PAYMENT") {
    return evaluateAutonomousPolicy({ kind: "REFUND", amount: payload.amount }, policy);
  }
  return ALLOW;
}

/** The store a store-control command targets (undefined = not one). */
export function authorityTargetStore(payload: RuntimeCommandPayload): string | undefined {
  switch (payload.type) {
    case "HANDOVER_STORE_AUTHORITY":
    case "RECORD_HUMAN_OVERRIDE":
    case "SET_SKU_PRICE":
      return payload.autonomousStoreId;
    default:
      return undefined;
  }
}

/**
 * Authority gate for store-control commands: deterministic hard check that
 * the actor holds authority over the target store (registered owner or
 * current controlling principal). Unregistered stores fail closed.
 */
export function gateAuthorityCommand(actor: PrincipalRef, control: AutonomousStoreControl | undefined): PolicyDecision {
  if (!control) {
    return { decision: "DENY", reasons: ["NO_REGISTERED_AUTHORITY"] };
  }
  if (principalRefEquals(actor, control.ownerRef) || principalRefEquals(actor, control.controllingPrincipal)) {
    return ALLOW;
  }
  return { decision: "DENY", reasons: ["NOT_AUTHORIZED"] };
}
