/**
 * W3-006 acceptance scenario 3 — production observability contracts.
 *
 * Per-subsystem health + connector health + autonomous-store status +
 * live-session status are exposed as TYPED contracts wired to journal-
 * derived projections. The projector is stateless: mutating the underlying
 * journals changes the very next snapshot — observability NEVER becomes a
 * second source of truth (literal `projectionOnly: true` +
 * `sourceOfTruth: "journaled-events"` on every snapshot).
 */

import { describe, expect, it, beforeEach } from "vitest";
import type {
  ObservabilitySnapshot,
  ObservabilityProjectionInput,
  SubsystemHealthView,
} from "../src/deployment/observability";
import { OPERATOR_DASHBOARD_SECTIONS } from "../src/deployment/observability";
import {
  OBSERVABILITY_SUBSYSTEM_IDS,
  createObservabilityProjector,
  liveSessionStatusOf,
} from "../src/runtime/deployment/observability";
import { buildConnectorHealthSurface } from "../src/runtime/surfaces/connector-health";
import { createConnectorTelemetry } from "../src/runtime/connector/telemetry";
import { createConnectorRuntime } from "../src/runtime/connector/runtime";
import { createCredentialVault } from "../src/runtime/connector/vault";
import { createLiveSessionRuntime } from "../src/runtime/surfaces/live-session";
import { createTargetDeploymentAdapter } from "../src/runtime/deployment/target-adapter";
import { NODE_SERVER_TARGET_PLAN } from "../src/runtime/deployment/target-plan";
import { runbookStatusesOf } from "../src/runtime/deployment/dr-objectives";
import type { AutonomousStoreVisibilityView } from "../src/surfaces/autonomous-store";
import type { OfflineQueueHealthView } from "../src/edge/offline-queue";
import type { CommerceJournalStatusPort } from "../src/deployment/observability";
import { asLocalEdgeDeviceId, asPrincipalRef } from "../src/runtime/ids";
import { seedDrWorkload, kernelStateExportPortOf } from "./fixtures/commerce/dr-kernel-rig";
import { TestDoubleConnectorAdapter, doubleDescriptor, fixedUtcClock, resetClock } from "./doubles";

const CLOCK_BASE = "2026-10-09T09:00:00Z";
const CLOCK = fixedUtcClock(CLOCK_BASE);
const OPERATOR = asPrincipalRef("operator:observability-test");

function journalPortOf(lane: Awaited<ReturnType<typeof seedDrWorkload>>): CommerceJournalStatusPort {
  const exportPort = kernelStateExportPortOf(lane);
  const events = lane.events();
  const last = events[events.length - 1];
  return {
    eventCount: events.length,
    ...(last === undefined ? {} : { lastEventAt: last.occurredAt as never }),
    journalFingerprint: exportPort.journalFingerprint,
    sequenceLawHolds: lane.journalIsValid(),
  };
}

function autonomousStoreView(
  runPresentation: AutonomousStoreVisibilityView["store"]["runPresentation"],
): AutonomousStoreVisibilityView {
  return {
    store: {
      storeRef: "store:obs-1" as never,
      displayName: "Observed Store",
      runPresentation,
      presentationNote: "projection fixture",
      lastChangedAt: "2026-10-09T09:00:00Z" as never,
      ownerRef: OPERATOR,
      evidence: [],
    },
    runningPolicies: [],
    variances: [],
    escalations: [],
    overridePoints: [],
    generatedAt: "2026-10-09T09:00:00Z" as never,
  };
}

const queueHealth = (depth: number): OfflineQueueHealthView => ({
  edgeDeviceRef: asLocalEdgeDeviceId("edge-obs-1"),
  queueDepth: depth,
  syncMode: "periodic",
});

async function connectorHealthSurfaceFixture(): Promise<ObservabilityProjectionInput["connectorHealth"]> {
  const vault = createCredentialVault({ clock: fixedUtcClock(CLOCK_BASE) });
  const runtime = createConnectorRuntime({ vault, clock: fixedUtcClock(CLOCK_BASE) });
  const connector = runtime.register(new TestDoubleConnectorAdapter(doubleDescriptor("obs-a", "rest")));
  await runtime.connect({
    connectorId: connector.connectorId,
    accountRef: "account-obs",
    credential: {
      kind: "api-secret",
      material: "obs-material",
      forAdapterId: "obs-a",
      forAccountRef: "account-obs",
    },
    grantedPermissions: ["orders.read"],
    credentialScope: "orders.read",
  });
  await runtime.observe(connector.connectorId);
  const telemetry = createConnectorTelemetry({ clock: fixedUtcClock(CLOCK_BASE) });
  return buildConnectorHealthSurface({
    connectors: runtime.connectors().map((registered) => ({
      connectorId: registered.connectorId,
      providerDisplayName: "Observed Provider (configured label)",
      health: runtime.healthReport().find((report) => report.connectorId === registered.connectorId)?.health
        ?? { status: "unknown", lastCheckedAt: "2026-10-09T09:00:00Z" as never, degradedReasons: [], customerActionNotes: [], evidence: [] },
    })),
    telemetry,
    generatedAt: "2026-10-09T09:00:00Z" as never,
  });
}

async function liveSessionFixture(): Promise<ObservabilityProjectionInput["liveSessions"][number]> {
  const session = createLiveSessionRuntime({
    streamId: "stream:obs-1" as never,
    clock: fixedUtcClock(CLOCK_BASE),
  });
  session.announce({
    title: "Observed live session",
    scheduledFor: "2026-10-09T09:05:00Z" as never,
    sellerRef: asPrincipalRef("seller:obs"),
    trustSignalRefs: [],
  });
  session.activate();
  session.ingestEvent({
    eventId: "evt-1",
    occurredAt: "2026-10-09T09:06:00Z" as never,
    kind: "listing",
    untrustedRawText: "listing: observed widget",
  });
  return session.surfaceView();
}

async function baseInput(): Promise<ObservabilityProjectionInput> {
  const lane = await seedDrWorkload();
  const deployment = createTargetDeploymentAdapter({ plan: NODE_SERVER_TARGET_PLAN, clock: CLOCK });
  return {
    commerceJournal: journalPortOf(lane),
    connectorHealth: await connectorHealthSurfaceFixture(),
    liveSessions: [await liveSessionFixture()],
    autonomousStores: [autonomousStoreView("running")],
    edgeQueues: [queueHealth(0)],
    deploymentPlane: deployment.status(),
    recentExecutions: [],
  };
}

describe("observability contracts (scenario 3)", () => {
  beforeEach(() => resetClock());

  it("projects every subsystem with a typed status and cited journal derivation", async () => {
    const projector = createObservabilityProjector({ clock: CLOCK });
    const snapshot = projector.snapshot(await baseInput());
    expect(snapshot.sourceOfTruth).toBe("journaled-events");
    expect(snapshot.projectionOnly).toBe(true);
    expect(snapshot.subsystems.map((view) => view.subsystemId)).toEqual([...OBSERVABILITY_SUBSYSTEM_IDS]);
    for (const view of snapshot.subsystems) {
      expect(view.projectionOnly).toBe(true);
      expect(view.derivedFrom.length).toBeGreaterThan(0);
      expect(view.note.length).toBeGreaterThan(0);
    }
    const byId = new Map(snapshot.subsystems.map((view) => [view.subsystemId, view]));
    expect(byId.get("commerce-kernel")?.status).toBe("healthy");
    expect(byId.get("connector-plane")?.status).toBe("healthy");
    expect(byId.get("live-commerce")?.status).toBe("healthy");
    expect(byId.get("autonomous-store")?.status).toBe("healthy");
    expect(byId.get("physical-edge")?.status).toBe("healthy");
    // No plan booted → deployment plane is honestly UNKNOWN, never healthy.
    expect(byId.get("deployment-plane")?.status).toBe("unknown");
  });

  it("is a PROJECTION: mutating the underlying journals changes the next snapshot", async () => {
    const projector = createObservabilityProjector({ clock: CLOCK });
    const lane = await seedDrWorkload();
    const input = await baseInput();
    const before = projector.snapshot(input);
    expect(before.subsystems.find((view) => view.subsystemId === "commerce-kernel")?.note).toContain(
      String(lane.events().length),
    );
    // The journal grows (real kernel command)…
    await lane.receiveStock("sku-obs-new", "store-dr", 5, "PURCHASE_ORDER");
    const after = projector.snapshot({
      ...input,
      commerceJournal: journalPortOf(lane),
    });
    const beforeCount = Number((/\d+/).exec(before.subsystems.find((view) => view.subsystemId === "commerce-kernel")?.note ?? "")?.[0]);
    const afterCount = Number((/\d+/).exec(after.subsystems.find((view) => view.subsystemId === "commerce-kernel")?.note ?? "")?.[0]);
    expect(afterCount).toBeGreaterThan(beforeCount);
    // Fingerprints are cited from the journal, not cached.
    expect(after.subsystems.find((view) => view.subsystemId === "commerce-kernel")?.derivedFrom[0]?.refSummary).not.toBe(
      before.subsystems.find((view) => view.subsystemId === "commerce-kernel")?.derivedFrom[0]?.refSummary,
    );
  });

  it("derives subsystem status from the connector health surface (down → degraded)", async () => {
    const projector = createObservabilityProjector({ clock: CLOCK });
    const input = await baseInput();
    const degradedSurface = {
      ...input.connectorHealth,
      entries: input.connectorHealth.entries.map((entry) => ({
        ...entry,
        health: { ...entry.health, status: "down" as const },
      })),
    };
    const snapshot = projector.snapshot({ ...input, connectorHealth: degradedSurface });
    expect(snapshot.subsystems.find((view) => view.subsystemId === "connector-plane")?.status).toBe("degraded");
    // UNKNOWN never collapses into healthy or down.
    const unknownSurface = {
      ...input.connectorHealth,
      entries: input.connectorHealth.entries.map((entry) => ({
        ...entry,
        health: { ...entry.health, status: "unknown" as const },
      })),
    };
    const unknownSnapshot = projector.snapshot({ ...input, connectorHealth: unknownSurface });
    expect(unknownSnapshot.subsystems.find((view) => view.subsystemId === "connector-plane")?.status).toBe("unknown");
  });

  it("projects a journal-law violation as commerce-kernel DOWN (corruption signal)", async () => {
    const projector = createObservabilityProjector({ clock: CLOCK });
    const input = await baseInput();
    const snapshot = projector.snapshot({
      ...input,
      commerceJournal: { ...input.commerceJournal, sequenceLawHolds: false },
    });
    const kernel = snapshot.subsystems.find((view) => view.subsystemId === "commerce-kernel");
    expect(kernel?.status).toBe("down");
    expect(kernel?.note).toContain("journal-corruption");
  });

  it("projects physical-edge degradation from offline queue depth (journal-derived)", async () => {
    const projector = createObservabilityProjector({ clock: CLOCK });
    const input = await baseInput();
    const snapshot = projector.snapshot({ ...input, edgeQueues: [queueHealth(0), queueHealth(7)] });
    const edge = snapshot.subsystems.find((view) => view.subsystemId === "physical-edge");
    expect(edge?.status).toBe("degraded");
    expect(edge?.note).toContain("7 offline observation(s)");
    expect(edge?.derivedFrom.map((source) => source.sourceKind)).toEqual([
      "offline-queue-health",
      "offline-queue-health",
    ]);
  });

  it("projects live-session status incl. backpressure with the literal zero-drop law", async () => {
    const projector = createObservabilityProjector({ clock: CLOCK });
    const input = await baseInput();
    const snapshot = projector.snapshot({ ...input });
    const live = snapshot.liveSessions[0];
    expect(live).toBeDefined();
    expect(live?.lifecycle).toBe("active");
    expect(live?.totalEvents).toBeGreaterThan(0);
    expect(live?.silentlyDroppedEvents).toBe(0);
    expect(live?.pendingDeliveries).toBe(0);
    // A backpressured consumer degrades the subsystem, drops stay zero.
    const pressured = {
      ...input.liveSessions[0] as NonNullable<ObservabilityProjectionInput["liveSessions"][number]>,
      delivery: {
        ...(input.liveSessions[0] as NonNullable<ObservabilityProjectionInput["liveSessions"][number]>).delivery,
        consumers: [
          ...((input.liveSessions[0] as NonNullable<ObservabilityProjectionInput["liveSessions"][number]>).delivery.consumers),
          { consumerRef: "slow-consumer", subscription: "live" as const, deliveredCount: 0, pendingCount: 3, backpressureSignals: 2, silentlyDroppedEvents: 0 as const },
        ],
      },
    };
    const pressuredSnapshot = projector.snapshot({ ...input, liveSessions: [pressured] });
    expect(pressuredSnapshot.subsystems.find((view) => view.subsystemId === "live-commerce")?.status).toBe("degraded");
    expect(pressuredSnapshot.liveSessions[0]?.backpressureSignals).toBe(2);
    expect(pressuredSnapshot.liveSessions[0]?.silentlyDroppedEvents).toBe(0);
  });

  it("projects autonomous-store presentation + variances opaquely (no commerce semantics)", () => {
    const projector = createObservabilityProjector({ clock: CLOCK });
    const store = autonomousStoreView("awaiting-owner-approval");
    const withVariance: AutonomousStoreVisibilityView = {
      ...store,
      variances: [
        {
          varianceRef: "variance:1" as never,
          subjectNote: "shelf count differs from system count",
          status: "open",
          surfacedAt: "2026-10-09T09:00:00Z" as never,
          evidence: [],
        },
      ],
      escalations: [
        {
          escalationRef: "escalation:1" as never,
          summary: "approval required",
          requiresOwnerAction: true,
          raisedAt: "2026-10-09T09:00:00Z" as never,
          evidence: [],
        },
      ],
    };
    const snapshot = projector.snapshot({
      commerceJournal: { eventCount: 3, journalFingerprint: "fp", sequenceLawHolds: true },
      connectorHealth: { entries: [], generatedAt: "2026-10-09T09:00:00Z" as never },
      liveSessions: [],
      autonomousStores: [withVariance],
      edgeQueues: [],
      deploymentPlane: { planId: "p", targetKind: "node-server", services: [], allReady: false },
      recentExecutions: [],
    });
    expect(snapshot.subsystems.find((view) => view.subsystemId === "autonomous-store")?.status).toBe("degraded");
    expect(snapshot.autonomousStores[0]).toMatchObject({
      runPresentation: "awaiting-owner-approval",
      openVarianceCount: 1,
      pendingEscalationCount: 1,
    });
    expect(snapshot.autonomousStores[0]?.derivedFrom[0]?.sourceKind).toBe("autonomous-store-visibility");
  });

  it("preserves UNKNOWN for subsystems with no journaled evidence (never fabricated healthy)", async () => {
    const projector = createObservabilityProjector({ clock: CLOCK });
    const empty: ObservabilityProjectionInput = {
      commerceJournal: { eventCount: 0, journalFingerprint: "empty", sequenceLawHolds: true },
      connectorHealth: { entries: [], generatedAt: "2026-10-09T09:00:00Z" as never },
      liveSessions: [],
      autonomousStores: [],
      edgeQueues: [],
      deploymentPlane: { planId: "p", targetKind: "node-server", services: [], allReady: false },
      recentExecutions: [],
    };
    const snapshot: ObservabilitySnapshot = projector.snapshot(empty);
    for (const view of snapshot.subsystems) {
      expect(view.status).toBe("unknown");
    }
  });

  it("builds the operator dashboard over the snapshot with complete typed sections", async () => {
    const projector = createObservabilityProjector({ clock: CLOCK });
    const input = await baseInput();
    const snapshot = projector.snapshot(input);
    const runbookStatuses = runbookStatusesOf([]);
    const dashboard = projector.operatorDashboard({
      snapshot,
      runbookStatuses,
      operatorRef: OPERATOR,
    });
    expect(dashboard.sections).toEqual([...OPERATOR_DASHBOARD_SECTIONS]);
    expect(dashboard.projectionOnly).toBe(true);
    expect(dashboard.operatorRef).toBe(OPERATOR);
    expect(dashboard.snapshot).toBe(snapshot);
    expect(dashboard.runbookStatuses).toHaveLength(4);
    expect(dashboard.runbookStatuses.every((status) => status.playbookPresent)).toBe(true);
  });

  it("liveSessionStatusOf projects a surface view without re-modeling it", async () => {
    const session = await liveSessionFixture();
    const status = liveSessionStatusOf(session);
    expect(status.streamRef).toBe(session.streamRef);
    expect(status.lifecycle).toBe(session.lifecycle);
    expect(status.viewerCount).toBe(session.viewerCount);
    expect(status.totalEvents).toBe(session.delivery.totalEvents);
  });
});
