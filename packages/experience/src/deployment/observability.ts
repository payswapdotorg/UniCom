/**
 * Production observability contracts (W3-006 §Scope 3).
 *
 * LAW: observability projects existing journal truth — NEVER a second source
 * of truth. Every health/status view below is a PROJECTION carrying the
 * journal-derived inputs it was computed from (`derivedFrom`), and the
 * snapshot itself declares `projectionOnly: true` + `sourceOfTruth:
 * "journaled-events"` as literal guarantees. The projector runtime holds no
 * mutable state of its own; mutating the underlying journals must be
 * reflected by the very next snapshot (tested).
 *
 * UNKNOWN is preserved end-to-end: a subsystem with no journaled evidence
 * projects `"unknown"`, never a fabricated healthy state (INVARIANT 10).
 */

import type { OfflineQueueHealthView } from "../edge/offline-queue";
import type { ConnectorHealthSurfaceView } from "../connector/health-surface";
import type { ConnectorExecutionEvidence } from "../connector/observability";
import type { AutonomousStoreVisibilityView } from "../surfaces/autonomous-store";
import type { LiveSessionSurfaceView } from "../surfaces/live-commerce-ux";
import type { DeploymentPlaneStatus } from "./manifest";
import type { DrRunbookStatusView } from "./runbook";
import type { PrincipalRef } from "../common/opaque-refs";
import type { UtcIso8601String } from "../common/values";

/** The subsystems production observability covers (fixed registry). */
export type ObservabilitySubsystemId =
  | "commerce-kernel"
  | "connector-plane"
  | "physical-edge"
  | "live-commerce"
  | "autonomous-store"
  | "deployment-plane";

/** Subsystem health (UNKNOWN preserved; distinct from connector status). */
export type SubsystemHealthStatus = "healthy" | "degraded" | "down" | "unknown";

/** Which journaled stream a projection was derived from. */
export type JournalProjectionSourceKind =
  | "commerce-event-journal"
  | "connector-execution-log"
  | "connector-health-probes"
  | "offline-supersede-journal"
  | "offline-queue-health"
  | "live-session-events"
  | "autonomous-store-visibility"
  | "deployment-probe-log"
  | "dr-decision-journal";

/** The journal-derived source record a projection cites. */
export interface JournalProjectionSource {
  readonly sourceKind: JournalProjectionSourceKind;
  readonly refSummary: string;
  readonly lastEntryAt?: UtcIso8601String;
}

/** Health of one subsystem — a projection, with its derivation cited. */
export interface SubsystemHealthView {
  readonly subsystemId: ObservabilitySubsystemId;
  readonly status: SubsystemHealthStatus;
  readonly note: string;
  readonly derivedFrom: readonly JournalProjectionSource[];
  readonly projectionOnly: true;
}

/** Read-only view over the commerce kernel journal (the sole writer's truth). */
export interface CommerceJournalStatusPort {
  readonly eventCount: number;
  readonly lastEventAt?: UtcIso8601String;
  readonly journalFingerprint: string;
  /** Kernel's own sequence-law verdict (never re-implemented here). */
  readonly sequenceLawHolds: boolean;
}

/** Live-session observability projection (from the session surface view). */
export interface LiveSessionStatusView {
  readonly streamRef: LiveSessionSurfaceView["streamRef"];
  readonly lifecycle: LiveSessionSurfaceView["lifecycle"];
  readonly viewerCount: number;
  readonly totalEvents: number;
  readonly pendingDeliveries: number;
  readonly backpressureSignals: number;
  readonly silentlyDroppedEvents: 0;
}

/** Autonomous-store observability projection (opaque refs preserved). */
export interface AutonomousStoreObservationView {
  readonly storeRef: AutonomousStoreVisibilityView["store"]["storeRef"];
  readonly displayName: string;
  readonly runPresentation: AutonomousStoreVisibilityView["store"]["runPresentation"];
  readonly openVarianceCount: number;
  readonly pendingEscalationCount: number;
  readonly derivedFrom: readonly JournalProjectionSource[];
}

/** The full observability snapshot — projections only, recomputed on demand. */
export interface ObservabilitySnapshot {
  readonly observedAt: UtcIso8601String;
  readonly sourceOfTruth: "journaled-events";
  readonly projectionOnly: true;
  readonly subsystems: readonly SubsystemHealthView[];
  readonly connectors: ConnectorHealthSurfaceView;
  readonly liveSessions: readonly LiveSessionStatusView[];
  readonly autonomousStores: readonly AutonomousStoreObservationView[];
  readonly edgeQueues: readonly OfflineQueueHealthView[];
  readonly deploymentPlane: DeploymentPlaneStatus;
  readonly recentExecutions: readonly ConnectorExecutionEvidence[];
}

/** Sections the operator dashboard must render (completeness registry). */
export const OPERATOR_DASHBOARD_SECTIONS = [
  "subsystem-health",
  "connector-health",
  "live-sessions",
  "autonomous-stores",
  "edge-queues",
  "deployment-plane",
  "dr-runbooks",
] as const;

/** The operator dashboard view — observability + runbook status in one place. */
export interface OperatorDashboardView {
  readonly operatorRef: PrincipalRef;
  readonly generatedAt: UtcIso8601String;
  readonly snapshot: ObservabilitySnapshot;
  readonly runbookStatuses: readonly DrRunbookStatusView[];
  readonly sections: readonly (typeof OPERATOR_DASHBOARD_SECTIONS)[number][];
  readonly projectionOnly: true;
}

/** Inputs the observability projector consumes (all read-only). */
export interface ObservabilityProjectionInput {
  readonly commerceJournal: CommerceJournalStatusPort;
  readonly connectorHealth: ConnectorHealthSurfaceView;
  readonly liveSessions: readonly LiveSessionSurfaceView[];
  readonly autonomousStores: readonly AutonomousStoreVisibilityView[];
  readonly edgeQueues: readonly OfflineQueueHealthView[];
  readonly deploymentPlane: DeploymentPlaneStatus;
  readonly recentExecutions: readonly ConnectorExecutionEvidence[];
}
