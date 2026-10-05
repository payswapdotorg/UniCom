/**
 * Runtime test — offline observation queue journey (W3-004 acceptance
 * scenario 4): observations captured while disconnected carry capture-time
 * truth (sequence + timestamp at capture), replay through the
 * LocalCommerceEdge EXACTLY-ONCE after reconnect, and a STALE offline
 * observation conflicting with a FRESHER online fact follows the journaled
 * supersede rule — NEVER a silent overwrite (asserted against the REAL
 * commerce kernel's inventory facts through the public @unicom/commerce
 * seam).
 */

import { describe, expect, it } from "vitest";
import { createLocalCommerceEdge, type EdgePersistence, type EdgeQueuedJourney } from "../src/runtime/edge/local-commerce-edge";
import {
  createOfflineCaptureRecorder,
  createOfflineObservationReplayer,
  type StampedObservation,
} from "../src/runtime/edge/offline-replay";
import { asIdempotencyKey, asLocalEdgeDeviceId, asPhysicalObservationId, asReconciliationChannelRef } from "../src/runtime/ids";
import type { PhysicalObservation } from "../src/contract";
import { CommerceKernelLane } from "./fixtures/commerce/kernel-rig";

const DEVICE = asLocalEdgeDeviceId("edge-register-2");
const CHANNEL = asReconciliationChannelRef("reconciliation-kernel");
const POLICY = { toleranceUnits: 5, promoteWithinTolerance: true };

/** ⚠ TEST DOUBLE: in-memory durable persistence for the edge. */
class InMemoryEdgePersistence implements EdgePersistence {
  private stored: readonly EdgeQueuedJourney[] = [];
  saveJourneys(journeys: readonly EdgeQueuedJourney[]): void {
    this.stored = journeys.map((journey) => ({ ...journey }));
  }
  loadJourneys(): readonly EdgeQueuedJourney[] {
    return this.stored.map((journey) => ({ ...journey }));
  }
}

/** A counted-subject physical observation (mobile barcode cycle count). */
function countObservation(id: string, barcode: string, quantity: string, capturedAt: string): PhysicalObservation {
  return {
    observationId: asPhysicalObservationId(id),
    kind: "cycle-count",
    sourceClass: "barcode-scan",
    truthClass: "observed",
    capture: {
      capturedAt: capturedAt as never,
      capturedBy: "employee",
      captureMode: "offline",
      deviceRef: DEVICE,
      locationRef: "store-1" as never,
    },
    payload: {
      kind: "cycle-count",
      cycleCount: { countedEntries: [{ barcode, countedQuantity: quantity }] },
    },
  };
}

/** Deterministic clock for the capture recorder + kernel lane. */
function makeClock(baseIso: string): () => string {
  let ticks = 0;
  return () => new Date(Date.parse(baseIso) + ticks++ * 1000).toISOString();
}

/** Extract the counted quantity from a cycle-count payload. */
function countedQuantityOf(observation: PhysicalObservation): number {
  const payload = observation.payload as {
    cycleCount?: { countedEntries?: { countedQuantity?: string }[] };
  };
  const quantity = payload.cycleCount?.countedEntries?.[0]?.countedQuantity;
  if (quantity === undefined || !/^\d+$/.test(quantity)) {
    throw new Error(`fixture count is not an integer string: ${String(quantity)}`);
  }
  return Number(quantity);
}

describe("Offline observation queue journey — scenario 4", () => {
  it("captures offline with capture-time truth (sequence + timestamp at CAPTURE, not at replay)", () => {
    let manualNow = Date.parse("2026-10-07T09:05:00Z");
    const clock = () => new Date(manualNow).toISOString();
    const recorder = createOfflineCaptureRecorder({ deviceRef: DEVICE, clock });
    const first = recorder.record(countObservation("obs-a", "6291041500213", "18", "2026-10-07T09:05:00Z"), "sku-milk|store-1", asIdempotencyKey("edge-key-a"));
    manualNow = Date.parse("2026-10-07T09:10:00Z");
    const second = recorder.record(countObservation("obs-b", "6291041500214", "12", "2026-10-07T09:10:00Z"), "sku-bread|store-1", asIdempotencyKey("edge-key-b"));

    // Stamps were minted AT CAPTURE: monotonic sequences, exact timestamps,
    // offline mode — they never change on replay.
    expect(first.stamp).toEqual({ sequence: 1, capturedAt: "2026-10-07T09:05:00.000Z", captureMode: "offline" });
    expect(second.stamp).toEqual({ sequence: 2, capturedAt: "2026-10-07T09:10:00.000Z", captureMode: "offline" });
    expect(recorder.entries().map((entry) => entry.stamp.sequence)).toEqual([1, 2]);
  });

  it("full journey: offline capture → exactly-once replay after reconnect → stale-vs-fresh follows the journaled supersede rule against REAL commerce facts", async () => {
    const lane = new CommerceKernelLane();
    const skuOfBarcode = (barcode: string): string =>
      barcode === "6291041500213" ? "sku-milk" : barcode === "6291041500214" ? "sku-bread" : "sku-apples";

    // Canonical seeding through the real kernel.
    await lane.receiveStock("sku-milk", "store-1", 20);
    await lane.receiveStock("sku-bread", "store-1", 20);
    await lane.receiveStock("sku-apples", "store-1", 20);

    // An ONLINE count for sku-apples at T0 (09:00) — older than the offline
    // capture that will follow.
    await lane.reconcileCount({
      observationId: "obs-online-apples-t0",
      skuId: "sku-apples",
      locationId: "store-1",
      kind: "CYCLE_COUNT",
      observedAt: "2026-10-07T09:00:00Z",
      resolution: { resolved: "OBSERVED", value: 20 },
      capture: { sequence: 100, capturedAt: "2026-10-07T09:00:00Z" },
    }, POLICY);
    expect(lane.facts().inventory.level("sku-apples" as never, "store-1" as never)?.onHand).toBe(20);

    // --- The edge goes OFFLINE; the shift captures three subjects ---
    let manualNow = Date.parse("2026-10-07T09:05:00Z");
    const captureClock = () => new Date(manualNow).toISOString();
    const recorder = createOfflineCaptureRecorder({ deviceRef: DEVICE, clock: captureClock });
    const captureA = countObservation("obs-offline-milk", "6291041500213", "18", "2026-10-07T09:05:00Z");
    const stampedA = recorder.record(captureA, "sku-milk|store-1", asIdempotencyKey("edge-key-milk"));
    manualNow = Date.parse("2026-10-07T09:10:00Z");
    const captureB = countObservation("obs-offline-bread", "6291041500214", "12", "2026-10-07T09:10:00Z");
    const stampedB = recorder.record(captureB, "sku-bread|store-1", asIdempotencyKey("edge-key-bread"));
    manualNow = Date.parse("2026-10-07T09:15:00Z");
    const captureC = countObservation("obs-offline-apples", "6291041500215", "24", "2026-10-07T09:15:00Z");
    const stampedC = recorder.record(captureC, "sku-apples|store-1", asIdempotencyKey("edge-key-apples"));

    // --- While the edge is offline, the ONLINE side counts bread FRESHER
    // (09:20 > the offline 09:10 capture) and reconciles it into the kernel ---
    await lane.reconcileCount({
      observationId: "obs-online-bread-t4",
      skuId: "sku-bread",
      locationId: "store-1",
      kind: "CYCLE_COUNT",
      observedAt: "2026-10-07T09:20:00Z",
      resolution: { resolved: "OBSERVED", value: 16 },
      capture: { sequence: 200, capturedAt: "2026-10-07T09:20:00Z" },
    }, POLICY);
    const breadOnHandAfterOnline = lane.facts().inventory.level("sku-bread" as never, "store-1" as never)?.onHand;
    expect(breadOnHandAfterOnline).toBe(16);

    // --- Reconnect: replay through the LocalCommerceEdge exactly-once ---
    const edge = createLocalCommerceEdge({
      edgeDeviceId: DEVICE,
      receivingChannel: CHANNEL,
      submitHandoff: lane.sink,
      executeJourney: async () => "succeeded",
      persistence: new InMemoryEdgePersistence(),
      clock: makeClock("2026-10-07T09:30:00Z"),
    });
    for (const stamped of [stampedA, stampedB, stampedC]) {
      expect(edge.enqueueObservation(stamped.observation, stamped.idempotencyKey).status).toBe("queued");
    }
    // A duplicate enqueue under the same key never adds queue depth.
    expect(edge.enqueueObservation(captureA, asIdempotencyKey("edge-key-milk")).status).toBe("queued");
    expect(edge.health().observationQueue.queueDepth).toBe(3);
    edge.setConnectivity("online");
    const handoff = await edge.drainObservations();
    // The duplicate milk enqueue SUPERSEDED the original entry (W3-002
    // semantics): the fresh capture re-queues at the tail — the handoff still
    // carries each logical observation exactly once.
    expect(handoff.observationIds).toEqual(["obs-offline-bread", "obs-offline-apples", "obs-offline-milk"]);
    // A late duplicate under a replayed key is IGNORED after the hand-off.
    expect(edge.enqueueObservation(captureA, asIdempotencyKey("edge-key-milk")).status).toBe("duplicate-ignored");

    // --- The journaled conflict fold: the replayer vs the online facts ---
    const replayer = createOfflineObservationReplayer({
      onlineFactOf: (subjectKey) => {
        const stamp = lane.onlineFactStamps.get(subjectKey);
        return stamp === undefined ? undefined : { stamp: { sequence: stamp.sequence, capturedAt: stamp.capturedAt as never, captureMode: "online" } };
      },
      clock: makeClock("2026-10-07T09:31:00Z"),
    });
    const report = replayer.replay([stampedA, stampedB, stampedC]);
    expect(report.replayed).toBe(3);
    // Milk: no online fact → applied. Bread: STALE (09:10) vs fresher online
    // (09:20) → superseded-stale. Apples: FRESHER offline (09:15) than the
    // online fact (09:00) → applied with a JOURNALED supersede.
    expect(report.applied).toBe(2);
    expect(report.supersededStale).toBe(1);
    expect(report.appliedObservations.map((observation) => observation.observationId)).toEqual([
      "obs-offline-milk",
      "obs-offline-apples",
    ]);
    const breadDecision = report.journal.find((entry) => entry.subjectKey === "sku-bread|store-1");
    expect(breadDecision?.decision).toBe("superseded-stale");
    expect(breadDecision?.rationale).toContain("never a silent overwrite");
    expect(breadDecision?.offlineStamp.sequence).toBe(2);
    expect(breadDecision?.onlineStamp?.sequence).toBe(200);
    const applesDecision = report.journal.find((entry) => entry.subjectKey === "sku-apples|store-1");
    expect(applesDecision?.decision).toBe("applied");
    expect(applesDecision?.rationale).toContain("supersede JOURNALED");

    // --- Only the APPLIED fold candidates reach the kernel (the stale
    // offline bread observation never overwrites the fresher online fact) ---
    for (const observation of report.appliedObservations) {
      const entry = [stampedA, stampedB, stampedC].find((stamped) => stamped.observation.observationId === observation.observationId) as StampedObservation;
      await lane.reconcileCount({
        observationId: observation.observationId,
        skuId: entry.subjectKey.split("|")[0] ?? "",
        locationId: "store-1",
        kind: "CYCLE_COUNT",
        observedAt: entry.stamp.capturedAt,
        resolution: { resolved: "OBSERVED", value: countedQuantityOf(entry.observation) },
        capture: { sequence: entry.stamp.sequence, capturedAt: entry.stamp.capturedAt },
      }, POLICY);
    }
    const facts = lane.facts();
    // Applied offline counts promoted within tolerance.
    expect(facts.inventory.level("sku-milk" as never, "store-1" as never)?.onHand).toBe(18);
    expect(facts.inventory.level("sku-apples" as never, "store-1" as never)?.onHand).toBe(24);
    // THE ASSERTION: the stale offline bread count NEVER overwrote the
    // fresher online fact — canonical state is untouched by the replay.
    expect(facts.inventory.level("sku-bread" as never, "store-1" as never)?.onHand).toBe(16);
    // The commerce seam's count-observation facts reflect the fold.
    expect(facts.inventory.countObservation("sku-milk" as never, "store-1" as never)?.resolved).toBe("OBSERVED");
    expect(facts.inventory.countObservation("sku-bread" as never, "store-1" as never)?.resolved).toBe("OBSERVED");

    // --- A second replay pass over the same backlog is ALL duplicates ---
    const secondPass = replayer.replay([stampedA, stampedB, stampedC]);
    expect(secondPass.duplicatesIgnored).toBe(3);
    expect(secondPass.applied).toBe(0);
    expect(replayer.journal()).toHaveLength(6);
  });

  it("identical capture stamps with different captures resolve conflict-ambiguous — UNKNOWN, never a coin-flip pick", () => {
    const replayer = createOfflineObservationReplayer({
      onlineFactOf: (subjectKey) =>
        subjectKey === "sku-x|store-1"
          ? { stamp: { sequence: 7, capturedAt: "2026-10-07T10:00:00Z" as never, captureMode: "online" } }
          : undefined,
      clock: makeClock("2026-10-07T10:05:00Z"),
    });
    const stamped = {
      observation: countObservation("obs-x", "6291041500213", "9", "2026-10-07T10:00:00Z"),
      stamp: { sequence: 7, capturedAt: "2026-10-07T10:00:00Z" as never, captureMode: "offline" as const },
      subjectKey: "sku-x|store-1",
      idempotencyKey: asIdempotencyKey("edge-key-x"),
    } satisfies StampedObservation;
    const report = replayer.replay([stamped]);
    expect(report.ambiguous).toBe(1);
    expect(report.applied).toBe(0);
    expect(report.journal[0]?.decision).toBe("conflict-ambiguous");
    expect(report.journal[0]?.rationale).toContain("UNKNOWN");
  });
});
