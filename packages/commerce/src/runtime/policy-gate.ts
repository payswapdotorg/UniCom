/**
 * Autonomous-store policy gate at the kernel boundary (W1-002 scenario 5).
 *
 * Deterministic mapping from command payloads to policy proposals:
 * - Stop conditions at/above threshold halt ALL autonomous action (DENY).
 * - REFUND_PAYMENT evaluates the REFUND proposal against the store policy.
 * - Other command kinds have no autonomous-spend semantics yet (W1-005
 *   wires the full runtime loop); they pass the stop-condition gate only.
 *
 * DENY and REQUIRE_APPROVAL both BLOCK execution at the kernel boundary:
 * REQUIRE_APPROVAL is a human gate and no approval path exists yet — the
 * kernel never silently auto-executes a gated action.
 */
import { evaluateAutonomousPolicy, type AutonomousStorePolicy, type PolicyDecision } from "../domain/policy.js";
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
