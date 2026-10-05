/**
 * Connector observability (docs/UX-DEPLOYMENT.md "Observability"; W3-001 §3).
 *
 * Every long-running connector action has: task id, run id, principal,
 * connector, capability, provider object ids, decision id, authorization id,
 * evidence refs and correlation/trace id. Health distinguishes UNKNOWN from
 * FAILED and preserves customer-action-required and provider states
 * (INVARIANTS 10/11; AGENTS rules 8/9).
 */

import type {
  AuthorizationContextRef,
  CapabilityDefinitionId,
  CapabilityObservationRef,
  ConnectedCapabilityInstanceId,
  ConnectorInstanceId,
  DecisionRef,
  PrincipalRef,
} from "../common/opaque-refs";
import type { EvidenceReference } from "../common/evidence";
import type { UtcIso8601String } from "../common/values";

/** Connector health status. UNKNOWN is neither healthy nor down. */
export type ConnectorHealthStatus =
  | "healthy"
  | "degraded"
  | "customer-action-required"
  | "unknown"
  | "down";

/** A health snapshot with its evidence. */
export interface ConnectorHealthSnapshot {
  readonly status: ConnectorHealthStatus;
  readonly lastCheckedAt: UtcIso8601String;
  readonly degradedReasons: readonly string[];
  readonly customerActionNotes: readonly string[];
  readonly evidence: readonly EvidenceReference[];
}

/** Outcome of a connector execution (UNKNOWN preserved). */
export type ConnectorExecutionOutcome =
  | "succeeded"
  | "failed-recoverable"
  | "failed-terminal"
  | "awaiting-customer-action"
  | "unknown";

/** Execution evidence record for a long-running connector action. */
export interface ConnectorExecutionEvidence {
  readonly taskId: string;
  readonly runId: string;
  readonly principal: PrincipalRef;
  readonly connectorId: ConnectorInstanceId;
  readonly capabilityRefs: readonly CapabilityDefinitionId[];
  readonly connectedInstanceRefs: readonly ConnectedCapabilityInstanceId[];
  readonly providerObjectIds: readonly string[];
  readonly decisionRef?: DecisionRef;
  readonly authorizationRef?: AuthorizationContextRef;
  readonly evidenceRefs: readonly EvidenceReference[];
  readonly correlationId: string;
  readonly startedAt: UtcIso8601String;
  readonly endedAt?: UtcIso8601String;
  readonly outcome: ConnectorExecutionOutcome;
  /** Provider-specific state must be preserved for consequential operations. */
  readonly providerStatePreserved: boolean | "unknown";
}

/** Observation freshness summary rendered in health views. */
export interface ObservationFreshnessView {
  readonly observationRef: CapabilityObservationRef;
  readonly observedAt: UtcIso8601String;
  readonly staleness: "fresh" | "stale" | "unknown";
}
