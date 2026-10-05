/**
 * Runtime test — offline observation queue drains to the commerce lane as
 * OBSERVATIONS with explicit no-promotion semantics (W3-002 acceptance
 * scenario 4; INVARIANTS 29/47).
 *
 * The commerce lane is a clearly-marked TEST DOUBLE: it receives the
 * hand-off (ids + idempotency keys only) plus read-only observation
 * payloads, and reconciliation happens EXPLICITLY on the commerce side.
 * Nothing in the experience runtime can drive or observe commerce truth.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  createOfflineObservationQueue,
  ObservationBoundaryRefused,
  type OfflineObservationQueueRuntime,
} from "../src/runtime/edge/offline-queue-runtime";
import type { PhysicalObservation, ReconciliationHandoff } from "../src/contract";
import { asIdempotencyKey, asLocalEdgeDeviceId, asReconciliationChannelRef, asPhysicalObservationId } from "../src/runtime/ids";
import { money, principalRef, utc } from "./branded";
import { TestDoubleCommerceLane, fixedClock, resetClock } from "./doubles";

const CLOCK_BASE = "2026-10-05T09:00:00Z";
const EDGE = asLocalEdgeDeviceId("edge-register-1");
const CHANNEL = asReconciliationChannelRef("reconciliation-kernel");

function buildQueue(): {
  queue: OfflineObservationQueueRuntime;
  commerceLane: TestDoubleCommerceLane;
} {
  const commerceLane = new TestDoubleCommerceLane();
  const queue = createOfflineObservationQueue({
    edgeDeviceId: EDGE,
    receivingChannel: CHANNEL,
    submitHandoff: commerceLane.sink,
    clock: fixedClock(CLOCK_BASE),
    syncMode: "manual",
  });
  return { queue, commerceLane };
}

const barcodeObservation = (id: string): PhysicalObservation => ({
  observationId: asPhysicalObservationId(id),
  kind: "barcode-scan",
  sourceClass: "barcode-scan",
  truthClass: "observed",
  capture: {
    capturedAt: utc("2026-10-05T09:10:00Z"),
    capturedBy: "employee",
    captureMode: "offline",
    deviceRef: EDGE,
  },
  payload: {
    kind: "barcode-scan",
    scan: { symbology: "ean", code: "6291041500213", scanContext: "count" },
  },
});

const posObservation = (id: string): PhysicalObservation => ({
  observationId: asPhysicalObservationId(id),
  kind: "pos-sale-event",
  sourceClass: "pos-reported",
  truthClass: "observed",
  capture: {
    capturedAt: utc("2026-10-05T09:20:00Z"),
    capturedBy: "edge-device",
    captureMode: "offline",
    deviceRef: EDGE,
  },
  payload: {
    kind: "pos-sale-event",
    transaction: {
      posTerminalRef: "pos-1",
      transactionRef: `txn-${id}`,
      lineItems: [{ barcode: "6291041500213", quantity: "2" }],
      totalDisplay: money("18.40"),
    },
  },
});

describe("offline observation queue (no promotion, explicit hand-off)", () => {
  beforeEach(() => resetClock());

  it("queues observations captured offline and requires idempotency keys", () => {
    const { queue } = buildQueue();
    const first = queue.enqueue(barcodeObservation("obs-1"), asIdempotencyKey("edge:obs-1"));
    expect(first.status).toBe("queued");
    expect(first.entry?.capturedOffline).toBe(true);
    expect(first.entry?.syncStatus).toBe("queued-offline");
    expect(first.entry?.dedupeScope).toBe("edge-device");
    const malformed = queue.enqueue(barcodeObservation("obs-bad"), asIdempotencyKey(""));
    expect(malformed.status).toBe("rejected-malformed");
  });

  it("refuses non-observations at the boundary (adversarial shape)", () => {
    const { queue } = buildQueue();
    const smuggled = { truthClass: "operational", note: "not an observation" } as unknown as PhysicalObservation;
    expect(() => queue.enqueue(smuggled, asIdempotencyKey("k"))).toThrow(ObservationBoundaryRefused);
  });

  it("duplicate idempotency keys supersede — queue depth never grows for one logical observation", () => {
    const { queue } = buildQueue();
    queue.enqueue(barcodeObservation("obs-1"), asIdempotencyKey("edge:obs-1"));
    const repeat = queue.enqueue(barcodeObservation("obs-1b"), asIdempotencyKey("edge:obs-1"));
    expect(repeat.status).toBe("queued");
    const entries = queue.entries();
    expect(entries).toHaveLength(2);
    expect(entries.filter((entry) => entry.syncStatus === "duplicate-superseded")).toHaveLength(1);
    expect(queue.health().queueDepth).toBe(1);
  });

  it("drains to the commerce lane as observations — the hand-off carries ONLY ids and keys", async () => {
    const { queue, commerceLane } = buildQueue();
    queue.enqueue(barcodeObservation("obs-1"), asIdempotencyKey("edge:obs-1"));
    queue.enqueue(posObservation("obs-2"), asIdempotencyKey("edge:obs-2"));
    queue.markOnline();
    const handoff: ReconciliationHandoff = await queue.drain();
    expect(handoff.observationIds).toEqual(["obs-1", "obs-2"]);
    expect(handoff.idempotencyKeys).toEqual(["edge:obs-1", "edge:obs-2"]);
    expect(handoff.receivingChannel).toBe(CHANNEL);
    expect(handoff.submittingEdgeDevice).toBe(EDGE);
    expect(handoff.outcome).toBe("submitted");
    // The hand-off shape carries no canonical/result field (contract law).
    expect(Object.keys(handoff).sort()).toEqual([
      "handoffId",
      "idempotencyKeys",
      "observationIds",
      "outcome",
      "receivingChannel",
      "submittedAt",
      "submittingEdgeDevice",
    ]);
    // The commerce lane received observations AS observations.
    const received = commerceLane.received();
    expect(received.observations).toHaveLength(2);
    expect(received.observations.every((observation) => observation.truthClass === "observed")).toBe(true);
    // Entries are handed-off; re-drain is a no-op.
    expect(queue.entries().every((entry) => entry.syncStatus === "handed-off")).toBe(true);
    const second = await queue.drain();
    expect(second.observationIds).toEqual([]);
    expect(commerceLane.received().observations).toHaveLength(2);
  });

  it("NO silent promotion: the commerce double reconciles explicitly, never driven by the queue", async () => {
    const { queue, commerceLane } = buildQueue();
    queue.enqueue(barcodeObservation("obs-1"), asIdempotencyKey("edge:obs-1"));
    queue.markOnline();
    await queue.drain();
    // After the hand-off the commerce lane holds observations — and its own
    // explicit reconciliation state is still untouched.
    expect(commerceLane.received().explicitlyReconciled).toBe(false);
    // Reconciliation is an EXPLICIT act on the commerce side (Worker 1's lane).
    commerceLane.reconcileExplicitly();
    expect(commerceLane.received().explicitlyReconciled).toBe(true);
    // The queue's view of the world did not change by that act: entries are
    // still just handed-off observations.
    expect(queue.entries().every((entry) => entry.syncStatus === "handed-off")).toBe(true);
    expect(queue.entries()[0]?.observation.truthClass).toBe("observed");
  });

  it("late duplicates after a hand-off are ignored (idempotent re-sync after outages)", async () => {
    const { queue, commerceLane } = buildQueue();
    queue.enqueue(barcodeObservation("obs-1"), asIdempotencyKey("edge:obs-1"));
    queue.markOnline();
    await queue.drain();
    const lateRepeat = queue.enqueue(barcodeObservation("obs-1-late"), asIdempotencyKey("edge:obs-1"));
    expect(lateRepeat.status).toBe("duplicate-ignored");
    expect(queue.entries().every((entry) => entry.syncStatus === "handed-off")).toBe(true);
    expect(commerceLane.received().observations).toHaveLength(1);
  });

  it("acknowledge records the commerce receipt without observing commerce truth", async () => {
    const { queue } = buildQueue();
    queue.enqueue(barcodeObservation("obs-1"), asIdempotencyKey("edge:obs-1"));
    queue.markOnline();
    const handoff = await queue.drain();
    queue.acknowledge(handoff.handoffId);
    const recorded = queue.handoffs()[0];
    expect(recorded?.outcome).toBe("acknowledged");
    expect(() => queue.acknowledge("no-such-handoff" as ReconciliationHandoff["handoffId"])).toThrow();
  });

  it("health view reports depth, oldest entry, sync mode and last hand-off", async () => {
    const { queue } = buildQueue();
    queue.enqueue(barcodeObservation("obs-1"), asIdempotencyKey("edge:obs-1"));
    expect(queue.health().queueDepth).toBe(1);
    expect(queue.health().syncMode).toBe("manual");
    queue.markOnline();
    await queue.drain();
    const health = queue.health();
    expect(health.queueDepth).toBe(0);
    expect(health.lastHandoffRef).toBeDefined();
    expect(health.lastHandoffAt).toBeDefined();
  });

  it("assembles the W3-001 LocalCommerceEdge contract view (queue + handoffs read-only)", async () => {
    const { queue } = buildQueue();
    queue.enqueue(barcodeObservation("obs-1"), asIdempotencyKey("edge:obs-1"));
    queue.markOnline();
    await queue.drain();
    const edgeContract = queue.edgeContract(
      "installed-service",
      [
        {
          interfaceKind: "local-pos",
          capabilityRef: "edge-cap-pos",
          grantedTo: EDGE,
          grantedBy: principalRef("principal-1"),
          grantedAt: utc("2026-10-05T08:00:00Z"),
          scope: "read-only-observation",
          revocable: true,
        },
      ],
      { queueObservations: true, syncTrigger: "manual" },
    );
    expect(edgeContract.edgeDeviceId).toBe(EDGE);
    expect(edgeContract.queue.every((entry) => entry.syncStatus === "handed-off")).toBe(true);
    expect(edgeContract.handoffs).toHaveLength(1);
    expect(edgeContract.offlinePolicy.queueObservations).toBe(true);
  });
});
