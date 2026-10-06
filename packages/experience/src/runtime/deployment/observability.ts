/**
 * Observability projector runtime (W3-006 §Scope 3; acceptance scenario 3).
 *
 * Projects the journaled event streams into the typed health/status
 * contracts. This runtime is STATELESS BY LAW: every call re-reads its
 * read-only inputs and recomputes — it never caches, never stores, never
 * becomes a second source of truth. Mutating a journal beneath it changes
 * the very next snapshot (tested).
 *
 * Subsystem status rules are DETERMINISTIC and documented per subsystem;
 * UNKNOWN is preserved (a subsystem with no journaled evidence projects
 * "unknown", never a fabricated healthy state).
 */

import type {
  AutonomousStoreObservationView,
  CommerceJournalStatusPort,
  JournalProjectionSource,
  LiveSessionStatusView,
  ObservabilityProjectionInput,
  ObservabilitySnapshot,
  ObservabilitySubsystemId,
  OperatorDashboardView,
  SubsystemHealthStatus,
  SubsystemHealthView,
} from "../../deployment/observability";
import { OPERATOR_DASHBOARD_SECTIONS } from "../../deployment/observability";
import type { DrRunbookStatusView } from "../../deployment/runbook";
import type { AutonomousStoreVisibilityView } from "../../surfaces/autonomous-store";
import type { LiveSessionSurfaceView } from "../../surfaces/live-commerce-ux";
import type { OfflineQueueHealthView } from "../../edge/offline-queue";
import type { ConnectorHealthSurfaceView } from "../../connector/health-surface";
import type { ConnectorExecutionEvidence } from "../../connector/observability";
import type { DeploymentPlaneStatus } from "../../deployment/manifest";
import type { PrincipalRef } from "../../common/opaque-refs";
import type { UtcIso8601String } from "../../common/values";

function commerceKernelHealth(
  journal: CommerceJournalStatusPort,
): SubsystemHealthView {
  const derivedFrom: JournalProjectionSource[] = [
    {
      sourceKind: "commerce-event-journal",
      refSummary: `kernel journal: ${journal.eventCount} events, fingerprint ${journal.journalFingerprint}`,
      ...(journal.lastEventAt === undefined ? {} : { lastEntryAt: journal.lastEventAt }),
    },
  ];
  if (!journal.sequenceLawHolds) {
    return {
      subsystemId: "commerce-kernel",
      status: "down",
      note: "kernel journal violates the gapless per-subject sequence law — treat as corruption, run the DR journal-corruption playbook",
      derivedFrom,
      projectionOnly: true,
    };
  }
  if (journal.eventCount === 0) {
    return {
      subsystemId: "commerce-kernel",
      status: "unknown",
      note: "no journaled commerce events yet — no evidence to project health from",
      derivedFrom,
      projectionOnly: true,
    };
  }
  return {
    subsystemId: "commerce-kernel",
    status: "healthy",
    note: `journal law holds; ${journal.eventCount} events folded`,
    derivedFrom,
    projectionOnly: true,
  };
}

function connectorPlaneHealth(surface: ConnectorHealthSurfaceView): SubsystemHealthView {
  const derivedFrom: JournalProjectionSource[] = [
    {
      sourceKind: "connector-health-probes",
      refSummary: `${surface.entries.length} connector health snapshot(s)`,
      ...(surface.entries.length === 0 ? {} : { lastEntryAt: surface.generatedAt }),
    },
    {
      sourceKind: "connector-execution-log",
      refSummary: `${surface.entries.reduce((total, entry) => total + entry.recentJourneys.length, 0)} recent journey evidence record(s)`,
    },
  ];
  if (surface.entries.length === 0) {
    return {
      subsystemId: "connector-plane",
      status: "unknown",
      note: "no connected connectors — nothing observed yet (UNKNOWN, not healthy)",
      derivedFrom,
      projectionOnly: true,
    };
  }
  const statuses = surface.entries.map((entry) => entry.health.status);
  const anyDown = statuses.includes("down");
  const anyAttention = statuses.some((status) => status === "degraded" || status === "customer-action-required");
  const anyUnknown = statuses.includes("unknown");
  const status: SubsystemHealthStatus = anyDown || anyAttention ? "degraded" : anyUnknown ? "unknown" : "healthy";
  const note =
    status === "healthy"
      ? `${surface.entries.length} connector(s) healthy`
      : `${statuses.filter((value) => value !== "healthy").length} connector(s) need attention (statuses preserved verbatim; UNKNOWN never collapsed)`;
  return { subsystemId: "connector-plane", status, note, derivedFrom, projectionOnly: true };
}

function physicalEdgeHealth(queues: readonly OfflineQueueHealthView[]): SubsystemHealthView {
  const derivedFrom: JournalProjectionSource[] = queues.map((queue) => ({
    sourceKind: "offline-queue-health" as const,
    refSummary: `edge ${queue.edgeDeviceRef}: depth ${queue.queueDepth}, sync ${queue.syncMode}`,
    ...(queue.lastHandoffAt === undefined ? {} : { lastEntryAt: queue.lastHandoffAt }),
  }));
  if (queues.length === 0) {
    return {
      subsystemId: "physical-edge",
      status: "unknown",
      note: "no edge devices registered — no observations to project",
      derivedFrom,
      projectionOnly: true,
    };
  }
  const pending = queues.reduce((total, queue) => total + queue.queueDepth, 0);
  return {
    subsystemId: "physical-edge",
    status: pending > 0 ? "degraded" : "healthy",
    note: pending > 0 ? `${pending} offline observation(s) awaiting sync across ${queues.length} edge device(s)` : "all edge queues drained",
    derivedFrom,
    projectionOnly: true,
  };
}

function liveCommerceHealth(sessions: readonly LiveSessionSurfaceView[]): SubsystemHealthView {
  const derivedFrom: JournalProjectionSource[] = sessions.map((session) => ({
    sourceKind: "live-session-events" as const,
    refSummary: `stream ${session.streamRef}: ${session.delivery.totalEvents} events, ${session.delivery.consumers.length} consumer(s)`,
  }));
  if (sessions.length === 0) {
    return {
      subsystemId: "live-commerce",
      status: "unknown",
      note: "no live sessions — nothing to project",
      derivedFrom,
      projectionOnly: true,
    };
  }
  const pressured = sessions.filter((session) =>
    session.delivery.consumers.some((consumer) => consumer.backpressureSignals > 0 || consumer.pendingCount > 0),
  );
  return {
    subsystemId: "live-commerce",
    status: pressured.length > 0 ? "degraded" : "healthy",
    note:
      pressured.length > 0
        ? `${pressured.length} session(s) with backpressured/slow consumers — delivery guarantees still hold (never dropped)`
        : `${sessions.length} session(s) delivering in arrival order`,
    derivedFrom,
    projectionOnly: true,
  };
}

function autonomousStoreHealth(
  stores: readonly AutonomousStoreVisibilityView[],
): SubsystemHealthView {
  const derivedFrom: JournalProjectionSource[] = stores.map((store) => ({
    sourceKind: "autonomous-store-visibility" as const,
    refSummary: `store ${store.store.storeRef}: ${store.store.runPresentation}`,
    lastEntryAt: store.generatedAt,
  }));
  if (stores.length === 0) {
    return {
      subsystemId: "autonomous-store",
      status: "unknown",
      note: "no autonomous stores configured — nothing to project",
      derivedFrom,
      projectionOnly: true,
    };
  }
  const presentations = stores.map((store) => store.store.runPresentation);
  const status: SubsystemHealthStatus = presentations.includes("stopped")
    ? "down"
    : presentations.some((value) => value === "paused" || value === "awaiting-owner-approval")
      ? "degraded"
      : presentations.includes("unknown")
        ? "unknown"
        : "healthy";
  return {
    subsystemId: "autonomous-store",
    status,
    note: `run presentation(s): ${presentations.join(", ")} (commerce semantics stay opaque behind refs)`,
    derivedFrom,
    projectionOnly: true,
  };
}

function deploymentPlaneHealth(plane: DeploymentPlaneStatus): SubsystemHealthView {
  const derivedFrom: JournalProjectionSource[] = plane.services.map((service) => ({
    sourceKind: "deployment-probe-log" as const,
    refSummary: `service ${service.serviceId}: ${service.state}`,
    ...(service.lastProbe === undefined ? {} : { lastEntryAt: service.lastProbe.checkedAt }),
  }));
  if (plane.services.length === 0) {
    return {
      subsystemId: "deployment-plane",
      status: "unknown",
      note: "no deployment plan booted — nothing to project",
      derivedFrom,
      projectionOnly: true,
    };
  }
  const status: SubsystemHealthStatus = plane.allReady
    ? "healthy"
    : plane.services.some((service) => service.state === "failed")
      ? "degraded"
      : "unknown";
  return {
    subsystemId: "deployment-plane",
    status,
    note: plane.allReady
      ? `all ${plane.services.length} service(s) ready`
      : `${plane.services.filter((service) => service.state !== "ready").length} service(s) not ready`,
    derivedFrom,
    projectionOnly: true,
  };
}

/** Project one live session's surface view into its observability status. */
export function liveSessionStatusOf(session: LiveSessionSurfaceView): LiveSessionStatusView {
  return {
    streamRef: session.streamRef,
    lifecycle: session.lifecycle,
    viewerCount: session.viewerCount,
    totalEvents: session.delivery.totalEvents,
    pendingDeliveries: session.delivery.consumers.reduce((total, consumer) => total + consumer.pendingCount, 0),
    backpressureSignals: session.delivery.consumers.reduce((total, consumer) => total + consumer.backpressureSignals, 0),
    silentlyDroppedEvents: 0,
  };
}

/** Project one autonomous-store visibility view into its observability status. */
export function autonomousStoreObservationOf(
  store: AutonomousStoreVisibilityView,
): AutonomousStoreObservationView {
  return {
    storeRef: store.store.storeRef,
    displayName: store.store.displayName,
    runPresentation: store.store.runPresentation,
    openVarianceCount: store.variances.filter((variance) => variance.status === "open").length,
    pendingEscalationCount: store.escalations.filter((escalation) => escalation.requiresOwnerAction).length,
    derivedFrom: [
      {
        sourceKind: "autonomous-store-visibility",
        refSummary: `store ${store.store.storeRef}: ${store.store.runPresentation}`,
        lastEntryAt: store.generatedAt,
      },
    ],
  };
}

export interface ObservabilityProjectorOptions {
  readonly clock: () => UtcIso8601String;
}

export interface ObservabilityProjector {
  /** Recompute the full snapshot from fresh inputs (no caching, ever). */
  snapshot(input: ObservabilityProjectionInput): ObservabilitySnapshot;
  /** Build the operator dashboard view over a snapshot + runbook statuses. */
  operatorDashboard(input: {
    readonly snapshot: ObservabilitySnapshot;
    readonly runbookStatuses: readonly DrRunbookStatusView[];
    readonly operatorRef: PrincipalRef;
  }): OperatorDashboardView;
}

export function createObservabilityProjector(options: ObservabilityProjectorOptions): ObservabilityProjector {
  const clock = options.clock;
  return {
    snapshot(input) {
      const subsystems: SubsystemHealthView[] = [
        commerceKernelHealth(input.commerceJournal),
        connectorPlaneHealth(input.connectorHealth),
        physicalEdgeHealth(input.edgeQueues),
        liveCommerceHealth(input.liveSessions),
        autonomousStoreHealth(input.autonomousStores),
        deploymentPlaneHealth(input.deploymentPlane),
      ];
      return {
        observedAt: clock(),
        sourceOfTruth: "journaled-events",
        projectionOnly: true,
        subsystems,
        connectors: input.connectorHealth,
        liveSessions: input.liveSessions.map(liveSessionStatusOf),
        autonomousStores: input.autonomousStores.map(autonomousStoreObservationOf),
        edgeQueues: input.edgeQueues,
        deploymentPlane: input.deploymentPlane,
        recentExecutions: input.recentExecutions,
      };
    },
    operatorDashboard(input) {
      return {
        operatorRef: input.operatorRef,
        generatedAt: clock(),
        snapshot: input.snapshot,
        runbookStatuses: input.runbookStatuses,
        sections: [...OPERATOR_DASHBOARD_SECTIONS],
        projectionOnly: true,
      };
    },
  };
}

/** All subsystem ids the projector must cover (completeness registry). */
export const OBSERVABILITY_SUBSYSTEM_IDS: readonly ObservabilitySubsystemId[] = [
  "commerce-kernel",
  "connector-plane",
  "physical-edge",
  "live-commerce",
  "autonomous-store",
  "deployment-plane",
];

/** Re-exported input types for projector consumers. */
export type {
  ObservabilityProjectionInput,
  ConnectorExecutionEvidence,
};
