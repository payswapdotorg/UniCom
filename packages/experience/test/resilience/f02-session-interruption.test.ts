/**
 * W2-010 — Family F02: interrupted sessions, temporary network loss,
 * retry and resumption. Fixture-contract evidence level.
 *
 * Drives the REAL LiveSessionRuntime (live-commerce sessions) and the REAL
 * OfflineObservationQueueRuntime (edge network loss) through their public
 * typed actions. No runtime is mocked; interruption faults are the actual
 * lifecycle/queue boundary conditions the runtimes expose.
 */

import { describe, expect, it } from "vitest";
import { createLiveSessionRuntime } from "../../src/runtime/surfaces/live-session";
import type { LiveSessionConsumerPort, LiveSessionEventEnvelope } from "../../src/surfaces/live-commerce-ux";
import { createOfflineObservationQueue } from "../../src/runtime/edge/offline-queue-runtime";
import type { PhysicalObservation, ReconciliationHandoff } from "../../src/contract";
import {
  asIdempotencyKey,
  asLocalEdgeDeviceId,
  asPhysicalObservationId,
  asReconciliationChannelRef,
} from "../../src/runtime/ids";
import { fixedClock } from "../../test/doubles"
;
import { scenarioById } from "./matrix/oracle";

const CLOCK_BASE = "2026-10-10T09:00:00Z";
const family = "F02";
const oracle = (suffix: string) => scenarioById(`W2-010-${family}-${suffix}`);

function newLiveSession() {
  return createLiveSessionRuntime({ streamRef: "stream:w2-f02-1" as never, clock: fixedClock(CLOCK_BASE) });
}

const collectorConsumer = (ref: string): { port: LiveSessionConsumerPort; events: LiveSessionEventEnvelope[] } => {
  const events: LiveSessionEventEnvelope[] = [];
  return { port: { consumerRef: ref, onEvent: async (envelope) => { events.push(envelope); return "delivered"; } }, events };
};

/** A consumer that refuses every event until `release` flips true. */
function blockingConsumer(ref: string): { port: LiveSessionConsumerPort; release: () => void; delivered: LiveSessionEventEnvelope[] } {
  const delivered: LiveSessionEventEnvelope[] = [];
  let open = false;
  return {
    port: {
      consumerRef: ref,
      onEvent: async (envelope) => {
        if (!open) return "backpressured";
        delivered.push(envelope);
        return "delivered";
      },
    },
    release: () => {
      open = true;
    },
    delivered,
  };
}

const barcodeObservation = (id: string): PhysicalObservation => ({
  observationId: asPhysicalObservationId(id),
  kind: "barcode-scan",
  sourceClass: "barcode-scan",
  truthClass: "observed",
  capture: {
    capturedAt: "2026-10-10T09:05:00Z",
    capturedBy: "employee",
    captureMode: "offline",
    deviceRef: asLocalEdgeDeviceId("edge-w2-f02"),
  },
  payload: {
    kind: "barcode-scan",
    scan: { symbology: "ean", code: "6291041500213", scanContext: "count" },
  },
});

function newQueue(sink: (handoff: ReconciliationHandoff, observations: readonly PhysicalObservation[]) => { outcome: "submitted" | "unknown" }) {
  return createOfflineObservationQueue({
    edgeDeviceId: asLocalEdgeDeviceId("edge-w2-f02"),
    receivingChannel: asReconciliationChannelRef("reconciliation:w2-f02"),
    submitHandoff: sink,
    clock: fixedClock(CLOCK_BASE),
    syncMode: "manual",
  });
}

describe("W2-010 F02 — session interruption, network loss, retry/resumption (fixture-contract)", () => {
  it("F02-S01: an event after the session ended is refused explicitly — never silent drift", async () => {
    expect(oracle("S01").expectedResultClass).toBe("expected-block");
    const session = newLiveSession();
    session.announce({ title: "W2 resilience live", scheduledFor: CLOCK_BASE, sellerRef: "seller:1" as never, trustSignalRefs: [] });
    session.activate();
    const accepted = session.ingestEvent({ eventId: "evt-1", occurredAt: CLOCK_BASE, kind: "listing", untrustedRawText: "Bench scale, opening $80" });
    expect(accepted.status).toBe("accepted");
    session.end();
    // VISIBLE: the terminal state is presented; the late event is refused.
    const view = session.surfaceView();
    expect(view.lifecycle).toBe("ended");
    expect(view.terminal).toBeDefined();
    const late = session.ingestEvent({ eventId: "evt-2", occurredAt: CLOCK_BASE, kind: "listing", untrustedRawText: "late event" });
    expect(late).toEqual({ status: "rejected-session-ended" });
    // The journal still holds exactly the pre-end envelopes (announce,
    // activate, the one listing) — the late event never landed.
    expect(session.events()).toHaveLength(3);
  });

  it("F02-S02: a late joiner replays the full history (replay:true), then live continues in order", async () => {
    expect(oracle("S02").expectedResultClass).toBe("expected-success");
    const session = newLiveSession();
    session.announce({ title: "W2 replay session", scheduledFor: CLOCK_BASE, sellerRef: "seller:1" as never, trustSignalRefs: [] });
    session.activate();
    for (let index = 1; index <= 3; index += 1) {
      session.ingestEvent({ eventId: `evt-${index}`, occurredAt: CLOCK_BASE, kind: "listing", untrustedRawText: `item ${index}` });
    }
    // 5 envelopes exist (announce, activate, 3 listings).
    expect(session.events()).toHaveLength(5);
    const lateJoiner = collectorConsumer("late-viewer");
    const subscription = session.subscribe(lateJoiner.port, { from: "start" });
    expect(subscription.status).toBe("subscribed");
    expect(subscription.replayQueued).toBe(5);
    await session.pump();
    // VISIBLE: the full history replays (marked), in strict arrival order.
    expect(lateJoiner.events.map((envelope) => envelope.arrivalSequence)).toEqual([1, 2, 3, 4, 5]);
    expect(lateJoiner.events.every((envelope) => envelope.replay)).toBe(true);
    // Live deliveries continue through the SAME contract, unmarked.
    session.ingestEvent({ eventId: "evt-live", occurredAt: CLOCK_BASE, kind: "bid", untrustedRawText: "bid $85" });
    await session.pump();
    expect(lateJoiner.events).toHaveLength(6);
    // Live deliveries are unmarked (replay absent — only replayed events carry it).
    expect(lateJoiner.events[5]?.replay).toBeUndefined();
    const health = session.consumerHealth("late-viewer");
    expect(health?.silentlyDroppedEvents).toBe(0);
    expect(health?.pendingCount).toBe(0);
  });

  it("F02-S03: a backpressured slow consumer loses nothing; the pressure is surfaced and recovers", async () => {
    expect(oracle("S03").expectedResultClass).toBe("expected-success");
    const session = newLiveSession();
    session.announce({ title: "W2 pressure session", scheduledFor: CLOCK_BASE, sellerRef: "seller:1" as never, trustSignalRefs: [] });
    session.activate();
    // Subscribe the slow consumer BEFORE events flow, so deliveries queue.
    const slow = blockingConsumer("slow-viewer");
    session.subscribe(slow.port);
    for (let index = 1; index <= 3; index += 1) {
      session.ingestEvent({ eventId: `evt-${index}`, occurredAt: CLOCK_BASE, kind: "listing", untrustedRawText: `item ${index}` });
    }
    const pumpResult = await session.pump();
    // VISIBLE: the consumer is blocked on the pending head (arrival sequence
    // 3 = the first listing); nothing dropped, nothing reordered.
    expect(pumpResult[0]?.delivered).toBe(0);
    expect(pumpResult[0]?.backpressuredAtSequence).toBe(3);
    const healthWhileBlocked = session.consumerHealth("slow-viewer");
    expect(healthWhileBlocked?.pendingCount).toBe(3);
    expect(healthWhileBlocked?.backpressureSignals).toBeGreaterThan(0);
    expect(healthWhileBlocked?.silentlyDroppedEvents).toBe(0);
    // Recovery: the consumer frees → the backlog delivers in order.
    slow.release();
    const secondPump = await session.pump();
    expect(secondPump[0]?.delivered).toBe(3);
    expect(slow.delivered.map((envelope) => envelope.arrivalSequence)).toEqual([3, 4, 5]);
    expect(session.consumerHealth("slow-viewer")?.pendingCount).toBe(0);
  });

  it("F02-S04: edge network loss → offline queue holds → resumption hands off once; duplicate re-sync supersedes", async () => {
    expect(oracle("S04").expectedResultClass).toBe("expected-success");
    const handedOff: { handoff: ReconciliationHandoff; observations: readonly PhysicalObservation[] }[] = [];
    const queue = newQueue((handoff, observations) => {
      handedOff.push({ handoff, observations });
      return { outcome: "submitted" };
    });
    // Capture while the network is down.
    queue.enqueue(barcodeObservation("obs-f02-1"), asIdempotencyKey("edge:obs-f02-1"));
    queue.enqueue(barcodeObservation("obs-f02-2"), asIdempotencyKey("edge:obs-f02-2"));
    expect(queue.health().queueDepth).toBe(2);
    // Re-sync attempt with the SAME idempotency key while still offline:
    // the newer capture SUPERSEDES the older entry — queue depth never
    // grows for one logical observation.
    const superseding = queue.enqueue(barcodeObservation("obs-f02-2b"), asIdempotencyKey("edge:obs-f02-2"));
    expect(superseding.status).toBe("queued");
    expect(queue.health().queueDepth).toBe(2);
    const supersededEntry = queue
      .entries()
      .find((entry) => entry.observation.observationId === "obs-f02-2");
    expect(supersededEntry?.syncStatus).toBe("duplicate-superseded");
    // Network returns: entries await sync, then drain → handed off once —
    // with the SUPERSEDING observation, never both.
    queue.markOnline();
    const handoff = await queue.drain();
    expect(handoff.observationIds).toEqual(["obs-f02-1", "obs-f02-2b"]);
    expect(handedOff).toHaveLength(1);
    expect(handedOff[0]?.observations).toHaveLength(2);
    // A late duplicate re-sync under an already-handed-off key is ignored.
    const repeat = queue.enqueue(barcodeObservation("obs-f02-2c"), asIdempotencyKey("edge:obs-f02-2"));
    expect(repeat.status).toBe("duplicate-ignored");
    expect(queue.health().queueDepth).toBe(0);
  });
});
