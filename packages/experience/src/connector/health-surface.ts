/**
 * Connector health surface (W3-005; acceptance scenario 3).
 *
 * Per-connector status, last contact, error and recovery surfaces — fed by
 * the W3-003 execution-mode journey states (`JourneyEvidenceRecord`s from
 * the connector telemetry registry + the W3-002 health snapshots). This is
 * observability composition, never truth: provider states and customer-
 * action notes are preserved verbatim, UNKNOWN is never collapsed into
 * failure (INVARIANTS 10/11).
 *
 * Recovery is a TYPED plan — each action names what the merchant can do
 * and where it lands — not a freeform suggestion.
 */

import type {
  ConnectorHealthSnapshot,
  ConnectorExecutionOutcome,
} from "./observability";
import type { ConnectorInstanceId } from "../common/opaque-refs";
import type { EvidenceReference } from "../common/evidence";
import type { ExecutionModeRef } from "../common/opaque-refs";
import type { NavigationSurfaceId } from "../navigation/surfaces";
import type { UtcIso8601String } from "../common/values";

/** When the connector was last heard from (observation or journey). */
export interface ConnectorLastContactView {
  readonly lastCheckedAt?: UtcIso8601String;
  readonly lastObservationSummary?: string;
  readonly lastJourneyAt?: UtcIso8601String;
  readonly lastJourneyOutcome?: ConnectorExecutionOutcome;
}

/** The connector's most recent error, typed. UNKNOWN stays UNKNOWN. */
export interface ConnectorErrorView {
  readonly errorClass: "failed-recoverable" | "failed-terminal" | "unknown";
  readonly summary: string;
  /** Journey steps that did not succeed (evidence-bearing refs). */
  readonly stepRefs: readonly string[];
  readonly evidence: readonly EvidenceReference[];
}

/** One typed recovery action the merchant can take. */
export interface ConnectorRecoveryAction {
  readonly actionId: string;
  readonly userLabel: string;
  readonly kind:
    | "reconnect"
    | "reauthorize"
    | "retry-journey"
    | "check-provider-status"
    | "contact-support";
  readonly rationale: string;
  /** Where the action lands (a registered surface). */
  readonly targetSurfaceId: NavigationSurfaceId;
}

/** The connector's typed recovery plan. */
export interface ConnectorRecoveryPlan {
  readonly actions: readonly ConnectorRecoveryAction[];
}

/** One recent execution-mode journey summarized for the health surface. */
export interface ConnectorJourneyHealthSummary {
  readonly journeyRef: string;
  readonly mode: ExecutionModeRef;
  readonly outcome: ConnectorExecutionOutcome;
  readonly startedAt: UtcIso8601String;
  readonly endedAt: UtcIso8601String;
  /** Steps that ended NOT_EXECUTABLE / failed (blocked-mode rationale). */
  readonly blockedSteps: readonly string[];
}

/** One connector's full health surface entry. */
export interface ConnectorHealthSurfaceEntry {
  readonly connectorId: ConnectorInstanceId;
  readonly providerDisplayName: string;
  /** W3-002 health snapshot — provider states preserved verbatim. */
  readonly health: ConnectorHealthSnapshot;
  readonly lastContact: ConnectorLastContactView;
  readonly lastError?: ConnectorErrorView;
  readonly recovery: ConnectorRecoveryPlan;
  readonly recentJourneys: readonly ConnectorJourneyHealthSummary[];
}

/** The connector health surface: one entry per connector. */
export interface ConnectorHealthSurfaceView {
  readonly entries: readonly ConnectorHealthSurfaceEntry[];
  readonly generatedAt: UtcIso8601String;
}
