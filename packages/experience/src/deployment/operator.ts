/**
 * Operator tooling surface (W3-001 §3).
 *
 * Where operators see deployment health, provider-agnostic adapter status,
 * quota observations, incident/runbook references, reconciliation queue
 * status and offline-edge sync health. Domain contracts stay
 * provider-agnostic; provider names appear only via configured display
 * labels on adapter views.
 */

import type { DeploymentAdapterId } from "../common/opaque-refs";
import type {
  DeploymentAdapterStatus,
  DeploymentCapabilityKind,
  DeploymentQuotaObservation,
  DeploymentTier,
} from "./provider-adapter";
import type { ConnectorExecutionEvidence } from "../connector/observability";
import type { OfflineQueueHealthView } from "../edge/offline-queue";
import type { UtcIso8601String } from "../common/values";

/** One adapter's status as shown to operators. */
export interface AdapterStatusView {
  readonly adapterId: DeploymentAdapterId;
  readonly displayLabel: string;
  readonly tier: DeploymentTier;
  readonly capabilities: readonly DeploymentCapabilityKind[];
  readonly status: DeploymentAdapterStatus;
  readonly quotaObservations: readonly DeploymentQuotaObservation[];
  readonly migrationPathways: readonly MigrationPathwayView[];
}

/**
 * How to move workloads between adapters. Domain contract changes are
 * structurally NOT required (`domainContractChangesRequired: false`).
 */
export interface MigrationPathwayView {
  readonly fromAdapterId: DeploymentAdapterId;
  readonly toAdapterId: DeploymentAdapterId;
  readonly domainContractChangesRequired: false;
  readonly steps: readonly string[];
  readonly estimatedEffortNote?: string;
}

/** The operator console view contract. */
export interface OperatorConsoleView {
  readonly adapters: readonly AdapterStatusView[];
  readonly incidentRefs: readonly string[];
  readonly runbookRefs: readonly string[];
  readonly reconciliationQueueStatus: {
    readonly pendingHandoffs: number;
    readonly oldestSubmittedAt?: UtcIso8601String;
    readonly note: string;
  };
  readonly edgeQueueHealth: readonly OfflineQueueHealthView[];
  readonly recentExecutions: readonly ConnectorExecutionEvidence[];
}
