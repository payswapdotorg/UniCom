/**
 * Contract + runtime test — surface states (W3-005 acceptance scenarios 5
 * and 7).
 *
 * Scenario 5: every surface implements ALL FOUR states (empty/loading/
 * error/offline); the OFFLINE state surfaces the observation-queue sync
 * state and journaled supersede outcomes — built here from the REAL W3-004
 * components (offline observation queue runtime + journaled supersede
 * replayer), with decisions and rationales passed through VERBATIM.
 *
 * Scenario 7: every empty state PROPOSES THE FIRST ACTION — structurally
 * required (`firstAction` is non-optional on the contract, asserted at
 * compile time) and validated against the surface/feature registries.
 */

import { describe, expect, it } from "vitest";
import type {
  EmptyStateView,
  ErrorStateView,
  OfflineStateView,
  SurfaceState,
} from "../src/surfaces/surface-state";
import { EDGE_SYNC_SURFACE_IDS } from "../src/surfaces/surface-state";
import { SURFACE_STATE_MANIFESTS } from "../src/surfaces/surface-state-manifests";
import { NAVIGATION_SURFACES } from "../src/navigation/surfaces";
import { ONBOARDING_PATHWAYS } from "../src/navigation/discoverability";
import { FEATURE_MATRIX } from "../src/navigation/feature-matrix";
import {
  buildOfflineQueueSyncView,
  edgeOfflineState,
  surfaceEmpty,
  surfaceError,
  surfaceLoading,
  surfaceOffline,
  surfaceReady,
  surfaceStateManifest,
} from "../src/runtime/surfaces/surface-state";
import type { OfflineObservationQueueRuntime } from "../src/runtime/edge/offline-queue-runtime";
import { createOfflineObservationQueue } from "../src/runtime/edge/offline-queue-runtime";
import {
  createOfflineObservationReplayer,
  type StampedObservation,
} from "../src/runtime/edge/offline-replay";
import { TestDoubleCommerceLane } from "./doubles";
import { asIdempotencyKey, asPhysicalObservationId, asReconciliationChannelRef, asLocalEdgeDeviceId, asTransactionProofRef, asUtcTimestamp } from "../src/runtime/ids";
import type { PhysicalObservation } from "../src/edge/observation";
import type { EvidenceReference } from "../src/common/evidence";
import { edgeId, utc } from "./branded";
import type { Equal, Expect } from "./type-helpers";

// Compile-time: the first action is REQUIRED on the empty state (the
// onboarding law is structural — an empty surface must propose the next
// action, it cannot compile without one).
export type AssertFirstActionRequired = Expect<
  Equal<Required<Pick<EmptyStateView, "firstAction">>, Pick<EmptyStateView, "firstAction">>
>;
// Compile-time: the four degraded phases exist on the union.
export type AssertPhases = Expect<
  Equal<SurfaceState<never>["phase"], "loading" | "ready" | "empty" | "error" | "offline">
>;
// Compile-time: error states distinguish failed from unknown (UNKNOWN ≠ FAILED).
export type AssertFailureClasses = Expect<
  Equal<ErrorStateView["failureClass"], "failed" | "unknown">
>;

const surfaceIds = (): Set<string> => new Set(NAVIGATION_SURFACES.map((surface) => surface.id));
const featureIds = (): Set<string> => {
  const rows = new Set<string>();
  for (const section of FEATURE_MATRIX) for (const row of section.rows) rows.add(row.id);
  return rows;
};

describe("surface four-state contracts — scenario 5 + 7", () => {
  it("every surface manifest carries ALL FOUR states with non-empty content", () => {
    expect(SURFACE_STATE_MANIFESTS.length).toBe(NAVIGATION_SURFACES.length);
    for (const manifest of SURFACE_STATE_MANIFESTS) {
      expect(manifest.loading.stateKind).toBe("loading");
      expect(manifest.loading.summary.length).toBeGreaterThan(0);
      expect(manifest.empty.stateKind).toBe("empty");
      expect(manifest.empty.reasonSummary.length).toBeGreaterThan(0);
      expect(manifest.error.stateKind).toBe("error");
      expect(manifest.error.summary.length).toBeGreaterThan(0);
      expect(["failed", "unknown"]).toContain(manifest.error.failureClass);
      expect(manifest.offline.stateKind).toBe("offline");
      expect(manifest.offline.degradationNote.length).toBeGreaterThan(0);
      expect(manifest.offline.stillAvailable.length).toBeGreaterThan(0);
    }
  });

  it("scenario 7: EVERY empty state PROPOSES the first action, typed and targeted at a registered surface", () => {
    const ids = surfaceIds();
    const features = featureIds();
    for (const manifest of SURFACE_STATE_MANIFESTS) {
      const action = manifest.empty.firstAction;
      expect(action.actionLabel.length).toBeGreaterThan(0);
      expect(action.rationale.length).toBeGreaterThan(0);
      expect(ids.has(action.targetSurfaceId)).toBe(true);
      if (action.targetFeatureId !== undefined) {
        expect(features.has(action.targetFeatureId)).toBe(true);
      }
    }
  });

  it("empty-state onboarding links route to REAL onboarding pathways", () => {
    const pathwayIds = new Set(ONBOARDING_PATHWAYS.map((pathway) => pathway.id));
    for (const manifest of SURFACE_STATE_MANIFESTS) {
      if (manifest.empty.relatedOnboardingPathwayId !== undefined) {
        expect(pathwayIds.has(manifest.empty.relatedOnboardingPathwayId)).toBe(true);
      }
    }
    // And at least half the surfaces teach through a pathway (education is
    // the fourth discovery path, not an afterthought).
    const linked = SURFACE_STATE_MANIFESTS.filter(
      (manifest) => manifest.empty.relatedOnboardingPathwayId !== undefined,
    );
    expect(linked.length).toBeGreaterThanOrEqual(Math.ceil(SURFACE_STATE_MANIFESTS.length / 2));
  });

  it("EDGE surfaces declare observation-queue sync in their offline design; non-edge surfaces do not", () => {
    const edgeIds = new Set(EDGE_SYNC_SURFACE_IDS);
    for (const manifest of SURFACE_STATE_MANIFESTS) {
      expect(typeof manifest.offline.surfacesObservationQueue).toBe("boolean");
      expect(manifest.offline.surfacesObservationQueue).toBe(edgeIds.has(manifest.surfaceId));
    }
  });

  it("the state constructors render every phase through the typed union", () => {
    const manifest = surfaceStateManifest("physical-commerce-tools");
    if (manifest === undefined) throw new Error("manifest missing");
    expect(surfaceLoading(manifest).phase).toBe("loading");
    expect(surfaceEmpty(manifest).phase).toBe("empty");
    expect(surfaceError(manifest).phase).toBe("error");
    expect(surfaceOffline(manifest).phase).toBe("offline");
    const offlineState = surfaceOffline(manifest);
    if (offlineState.phase !== "offline") throw new Error("not offline phase");
    expect(offlineState.offline.observationQueue).toBeUndefined();
    const readyState = surfaceReady({ some: "view" });
    if (readyState.phase !== "ready") throw new Error("not ready phase");
    expect(readyState.data).toEqual({ some: "view" });
  });

  it("surfaceError carries LIVE evidence over the template (typed evidence, not silent)", () => {
    const manifest = surfaceStateManifest("operate-orders");
    if (manifest === undefined) throw new Error("manifest missing");
    const liveEvidence: EvidenceReference[] = [
      {
        evidenceId: "ev-live-1",
        kind: "execution-log",
        summary: "orders projection failed to rebuild",
        capturedAt: utc("2026-10-08T11:00:00Z"),
        proofRef: asTransactionProofRef("P2"),
        sourceArtifactRefs: [],
      },
    ];
    const state = surfaceError(manifest, liveEvidence);
    if (state.phase !== "error") throw new Error("not error phase");
    expect(state.error.evidence).toEqual(liveEvidence);
    // Without live evidence the template's typed design renders.
    expect(surfaceError(manifest).phase).toBe("error");
  });
});

// ---------------------------------------------------------------------------
// Scenario 5 (offline): the observation-queue sync + journaled supersede
// state, built from the REAL W3-004 components.
// ---------------------------------------------------------------------------

const EDGE = asLocalEdgeDeviceId("edge-register-state-1");
const CHANNEL = asReconciliationChannelRef("reconciliation-kernel");

const barcodeObservation = (id: string): PhysicalObservation => ({
  observationId: asPhysicalObservationId(id),
  kind: "barcode-scan",
  sourceClass: "barcode-scan",
  truthClass: "observed",
  capture: {
    capturedAt: utc("2026-10-08T09:10:00Z"),
    capturedBy: "employee",
    captureMode: "offline",
    deviceRef: EDGE,
  },
  payload: {
    kind: "barcode-scan",
    scan: { symbology: "ean", code: "6291041500213", scanContext: "count" },
  },
});

const stamped = (
  observationId: string,
  subjectKey: string,
  idempotencyKey: string,
  sequence: number,
  capturedAt: string,
): StampedObservation => ({
  observation: barcodeObservation(observationId),
  stamp: { sequence, capturedAt: asUtcTimestamp(capturedAt), captureMode: "offline" },
  subjectKey,
  idempotencyKey: asIdempotencyKey(idempotencyKey),
});

describe("offline degradation surfaces the observation queue + journaled supersedes — scenario 5", () => {
  it("the offline state carries the REAL W3-004 queue sync state and journaled supersede outcomes VERBATIM", () => {
    // --- The W3-004 offline observation queue (real runtime) ---
    const commerceLane = new TestDoubleCommerceLane();
    const queue: OfflineObservationQueueRuntime = createOfflineObservationQueue({
      edgeDeviceId: EDGE,
      receivingChannel: CHANNEL,
      submitHandoff: commerceLane.sink,
      clock: () => "2026-10-08T09:30:00Z",
      syncMode: "manual",
    });
    queue.enqueue(barcodeObservation("obs-state-milk"), asIdempotencyKey("edge:milk"));
    queue.enqueue(barcodeObservation("obs-state-bread"), asIdempotencyKey("edge:bread"));
    const queueHealth = queue.health();
    expect(queueHealth.queueDepth).toBe(2);
    expect(queueHealth.syncMode).toBe("manual");

    // --- The W3-004 journaled supersede replayer (real runtime) ---
    const replayer = createOfflineObservationReplayer({
      onlineFactOf: (subjectKey) => {
        if (subjectKey === "sku-bread|store-1") {
          return { stamp: { sequence: 200, capturedAt: asUtcTimestamp("2026-10-08T09:20:00Z"), captureMode: "online" } };
        }
        if (subjectKey === "sku-apples|store-1") {
          return { stamp: { sequence: 100, capturedAt: asUtcTimestamp("2026-10-08T09:00:00Z"), captureMode: "online" } };
        }
        return undefined;
      },
      clock: () => "2026-10-08T09:31:00Z",
    });
    const report = replayer.replay([
      stamped("obs-state-milk", "sku-milk|store-1", "edge:milk", 1, "2026-10-08T09:00:00Z"),
      stamped("obs-state-bread", "sku-bread|store-1", "edge:bread", 2, "2026-10-08T09:10:00Z"),
      stamped("obs-state-bread", "sku-bread|store-1", "edge:bread", 2, "2026-10-08T09:10:00Z"), // duplicate key
      stamped("obs-state-apples", "sku-apples|store-1", "edge:apples", 3, "2026-10-08T09:15:00Z"),
      stamped("obs-state-eggs", "sku-eggs|store-1", "edge:eggs-1", 4, "2026-10-08T09:25:00Z"),
      stamped("obs-state-eggs", "sku-eggs|store-1", "edge:eggs-2", 4, "2026-10-08T09:25:00Z"), // identical stamp, different capture
    ]);
    // All four journaled decisions appear exactly as W3-004 defines them.
    const decisions = report.journal.map((entry) => entry.decision).sort();
    expect(decisions).toEqual([
      "applied",
      "applied",
      "applied",
      "conflict-ambiguous",
      "duplicate-ignored",
      "superseded-stale",
    ]);

    // --- The W3-005 offline surface state over those components ---
    const queueSync = buildOfflineQueueSyncView(queueHealth, report.journal);
    expect(queueSync.queueHealth).toEqual(queueHealth);
    expect(queueSync.journaledSupersedes.length).toBe(report.journal.length);

    // VERBATIM mapping: every journal entry renders decision + rationale
    // + stamps character-for-character, never rewritten.
    report.journal.forEach((entry, index) => {
      const view = queueSync.journaledSupersedes[index];
      expect(view?.observationId).toBe(entry.observationId);
      expect(view?.subjectKey).toBe(entry.subjectKey);
      expect(view?.decision).toBe(entry.decision);
      expect(view?.rationale).toBe(entry.rationale);
      expect(view?.decidedAt).toBe(entry.decidedAt);
    });
    const bread = queueSync.journaledSupersedes.find(
      (entry) => entry.subjectKey === "sku-bread|store-1" && entry.decision === "superseded-stale",
    );
    expect(bread?.rationale).toContain("never a silent overwrite");
    const apples = queueSync.journaledSupersedes.find(
      (entry) => entry.subjectKey === "sku-apples|store-1",
    );
    expect(apples?.decision).toBe("applied");
    expect(apples?.rationale).toContain("supersede JOURNALED");

    // --- The edge surface renders it: offline is first-class, never silent ---
    const manifest = surfaceStateManifest("physical-commerce-tools");
    if (manifest === undefined) throw new Error("manifest missing");
    const offlineView: OfflineStateView = edgeOfflineState(manifest, queueSync);
    expect(offlineView.stateKind).toBe("offline");
    expect(offlineView.surfacesObservationQueue).toBe(true);
    expect(offlineView.observationQueue?.queueHealth.queueDepth).toBe(2);
    expect(offlineView.observationQueue?.journaledSupersedes.length).toBe(6);
    // And the phase wrapper renders it as the offline phase.
    const state = surfaceOffline(manifest, queueSync);
    if (state.phase !== "offline") throw new Error("not offline phase");
    expect(state.offline.observationQueue).toEqual(queueSync);
  });

  it("edgeOfflineState refuses non-edge surfaces (the queue sync belongs to edge surfaces only)", () => {
    const manifest = surfaceStateManifest("workspace-settings");
    if (manifest === undefined) throw new Error("manifest missing");
    expect(() =>
      edgeOfflineState(manifest, {
        queueHealth: {
          edgeDeviceRef: edgeId("edge-x"),
          queueDepth: 0,
          syncMode: "manual",
        },
        journaledSupersedes: [],
      }),
    ).toThrow("not an edge-sync surface");
  });

  it("EVERY edge-sync surface can render the offline phase with the queue sync state", () => {
    const queueSync = {
      queueHealth: {
        edgeDeviceRef: edgeId("edge-register-state-1"),
        queueDepth: 3,
        syncMode: "periodic" as const,
      },
      journaledSupersedes: [],
    };
    for (const surfaceId of EDGE_SYNC_SURFACE_IDS) {
      const manifest = surfaceStateManifest(surfaceId);
      if (manifest === undefined) throw new Error(`manifest missing for ${surfaceId}`);
      const view = edgeOfflineState(manifest, queueSync);
      expect(view.observationQueue?.queueHealth.queueDepth).toBe(3);
      expect(view.surfacesObservationQueue).toBe(true);
    }
  });
});
