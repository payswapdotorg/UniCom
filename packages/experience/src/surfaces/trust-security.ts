/**
 * Trust and Security experience surfaces
 * (docs/UX-DEPLOYMENT.md §5, FROZEN-ARCHITECTURE §3.G, §3.H, §22.3).
 *
 * Trust is displayed as EXPLAINABLE COMPONENTS, not one score — the view
 * type has no aggregate score field. Security incidents show
 * signal → reason → effect → mitigation → next action, and defensive
 * broadcasts contain signatures/mitigations, never weaponized payloads
 * (INVARIANT 25/49). Trust/proof objects are opaque refs into
 * `@unicom/agent` (Worker 2).
 */

import type { SecurityEventRef, TransactionProofRef, TrustSignalRef } from "../common/opaque-refs";
import type { EvidenceReference } from "../common/evidence";
import type { UtcIso8601String } from "../common/values";

/** Explainable trust component kinds (docs/UX-DEPLOYMENT.md §5). */
export type TrustComponentKind =
  | "verified-purchase"
  | "provider-signed-state"
  | "independent-observation"
  | "account-age-history"
  | "transaction-proof-level"
  | "agent-certification"
  | "security-warning";

/** One explainable trust component. */
export interface TrustComponentView {
  readonly componentId: string;
  readonly kind: TrustComponentKind;
  readonly label: string;
  readonly explanation: string;
  readonly proofRef: TransactionProofRef;
  readonly evidence: readonly EvidenceReference[];
}

/** Stages of the security pipeline made visible (FROZEN §22.3). */
export type SecurityPipelineStage =
  | "signal"
  | "classification"
  | "policy-decision"
  | "mitigation"
  | "evidence"
  | "defensive-broadcast"
  | "learning";

/** Mitigation decision (deterministic policy, BLOCK cannot be overridden). */
export type SecurityMitigationDecision =
  | "allowed"
  | "blocked"
  | "quarantined"
  | "under-review"
  | "recovered"
  | "unknown";

/** A security incident as shown to the user. */
export interface SecurityIncidentView {
  readonly incidentId: string;
  readonly securityEventRef: SecurityEventRef;
  readonly signal: string;
  readonly reason: string;
  readonly effect: string;
  readonly mitigation: string;
  readonly nextAction: string;
  readonly severity: "low" | "medium" | "high" | "severe";
  readonly decision: SecurityMitigationDecision;
  readonly pipelineStage: SecurityPipelineStage;
  readonly evidence: readonly EvidenceReference[];
  /** Defensive broadcast state — content is defensive only, never weaponized. */
  readonly defensiveBroadcast: "not-applicable" | "prepared" | "broadcast" | "unknown";
  readonly updatedAt: UtcIso8601String;
}

/** The Trust & Safety center view contract. */
export interface TrustCenterView {
  readonly components: readonly TrustComponentView[];
  readonly trustSignals: readonly TrustSignalRef[];
  readonly incidents: readonly SecurityIncidentView[];
  readonly proofLegend: readonly {
    readonly proofRef: TransactionProofRef;
    readonly label: string;
    readonly description: string;
  }[];
}
