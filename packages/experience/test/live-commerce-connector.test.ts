/**
 * Runtime test — live-commerce connector (W3-003 acceptance scenario 5,
 * Whatnot-class): ingested live events execute in ARRIVAL ORDER with
 * backpressure handling; NO EVENT LOSS under burst fixtures.
 */

import { describe, expect, it } from "vitest";
import { createLiveCommerceConnector, type LiveActionInput } from "../src/runtime/connector/live-commerce";
import { asAuthorizationContextRef, asIdempotencyKey, asConnectedCapabilityInstanceId } from "../src/runtime/ids";
import type { ConnectorExecutionOutcome } from "../src/contract";

const STREAM = "stream-whatnot-live-1" as never;
const AUTH = asAuthorizationContextRef("auth-live-1");
const CAPABILITY_INSTANCE = asConnectedCapabilityInstanceId("whatnot-instance-live-1");

function createLiveRig(options: { readonly failFirst?: number } = {}) {
  const clock = (() => {
    let ticks = 0;
    return () => new Date(Date.parse("2026-10-06T14:00:00Z") + ticks++ * 1000).toISOString();
  })();
  const executionOrder: string[] = [];
  let failuresLeft = options.failFirst ?? 0;
  const executeAction = async (input: LiveActionInput): Promise<ConnectorExecutionOutcome> => {
    executionOrder.push(`${input.arrivalHint ?? ""}${input.idempotencyKey}`);
    if (failuresLeft > 0) {
      failuresLeft -= 1;
      return "failed-recoverable";
    }
    return "succeeded";
  };
  const connector = createLiveCommerceConnector({
    streamId: STREAM,
    executeAction,
    clock,
    softQueueDepth: 4,
  });
  return { connector, executionOrder, clock };
}

const event = (id: string) => ({
  eventId: id,
  occurredAt: "2026-10-06T14:00:01Z" as never,
  kind: "listing" as const,
  untrustedPayload: `{"listingId":"${id}","title":"Lot ${id}"}`,
});

const action = (key: string, eventId: string) => ({
  action: "bid" as const,
  eventId,
  viaCapabilityInstance: CAPABILITY_INSTANCE,
  idempotencyKey: asIdempotencyKey(key),
  authorization: AUTH,
  payloadRef: `payload-${eventId}`,
});

describe("Live-commerce connector — scenario 5", () => {
  it("ingested events execute in strict ARRIVAL ORDER (FIFO by arrival sequence)", async () => {
    const rig = createLiveRig();
    for (const id of ["evt-1", "evt-2", "evt-3", "evt-4", "evt-5"]) {
      expect(rig.connector.ingestEvent(event(id)).status).toBe("accepted");
    }
    for (const [key, eventId] of [
      ["live-key-1", "evt-1"],
      ["live-key-2", "evt-2"],
      ["live-key-3", "evt-3"],
      ["live-key-4", "evt-4"],
      ["live-key-5", "evt-5"],
    ]) {
      rig.connector.enqueueAction(action(key, eventId));
    }
    const evidence = await rig.connector.drainReady();
    expect(evidence).toHaveLength(5);
    // Arrival order: events 1..5, then actions interleaved in their own
    // arrival sequences — execution follows EXACTLY that order.
    expect(rig.executionOrder).toEqual(["live-key-1", "live-key-2", "live-key-3", "live-key-4", "live-key-5"]);
    expect(evidence.every((record) => record.outcome === "succeeded")).toBe(true);
    const sequences = evidence.map((record) => record.arrivalSequence);
    expect(sequences).toEqual([...sequences].sort((a, b) => a - b));
  });

  it("NO EVENT LOSS under burst: backpressure is reported, the queue stays bounded and never drops", async () => {
    const rig = createLiveRig();
    // The execution backlog fills FIRST (the stream sells faster than the
    // executor drains) — 20 actions queue beyond the soft depth (4).
    for (let index = 1; index <= 20; index += 1) {
      rig.connector.enqueueAction(action(`burst-key-${index}`, `burst-${index}`));
    }
    expect(rig.connector.health().pendingActions).toBe(20);
    // A burst of 20 events ingests WHILE the executor is backed up.
    const statuses: string[] = [];
    for (let index = 1; index <= 20; index += 1) {
      const status = rig.connector.ingestEvent(event(`burst-${index}`));
      statuses.push(status.status);
    }
    // Ingestion reports backpressure under the burst — NONE dropped.
    expect(statuses.filter((status) => status === "backpressured").length).toBe(20);
    expect(statuses).not.toContain("rejected");
    expect(rig.connector.events()).toHaveLength(20);
    expect(rig.connector.health().backpressureEvents).toBe(20);

    // Drain EVERYTHING under the pressure: nothing was lost, all executed
    // exactly once, in arrival order.
    const firstDrain = await rig.connector.drainReady(10);
    expect(firstDrain).toHaveLength(10);
    const secondDrain = await rig.connector.drainReady(10);
    expect(secondDrain).toHaveLength(10);
    expect(rig.executionOrder).toHaveLength(20);
    expect(rig.executionOrder[0]).toBe("burst-key-1");
    expect(rig.executionOrder[19]).toBe("burst-key-20");
    expect(rig.connector.health().pendingActions).toBe(0);
    expect(rig.connector.health().executedActions).toBe(20);
  });

  it("event dedupe: a replayed provider event is ignored, never re-executed", async () => {
    const rig = createLiveRig();
    rig.connector.ingestEvent(event("evt-dedupe"));
    const second = rig.connector.ingestEvent(event("evt-dedupe"));
    expect(second.status).toBe("duplicate-ignored");
    expect(rig.connector.events()).toHaveLength(1);
    expect(rig.connector.health().duplicatesIgnored).toBe(1);

    // Action dedupe by idempotency key too.
    rig.connector.enqueueAction(action("live-dedupe-key", "evt-dedupe"));
    const duplicate = rig.connector.enqueueAction(action("live-dedupe-key", "evt-dedupe"));
    expect(duplicate.status).toBe("duplicate-ignored");
    await rig.connector.drainReady();
    expect(rig.executionOrder).toEqual(["live-dedupe-key"]);
  });

  it("action evidence records carry action, outcome and timing; failures stay recoverable", async () => {
    const rig = createLiveRig({ failFirst: 1 });
    rig.connector.ingestEvent(event("evt-fail"));
    rig.connector.enqueueAction(action("live-fail-key", "evt-fail"));
    const evidence = await rig.connector.drainReady();
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.outcome).toBe("failed-recoverable");
    expect(evidence[0]?.action).toBe("bid");
    expect(evidence[0]?.streamId).toBe(STREAM);
    expect(evidence[0]?.startedAt <= evidence[0]?.endedAt).toBe(true);
    expect(rig.connector.actionEvidence()).toHaveLength(1);
  });

  it("health surface exposes ingestion, pressure, pending and execution counts", async () => {
    const rig = createLiveRig();
    rig.connector.ingestEvent(event("evt-health-1"));
    rig.connector.ingestEvent(event("evt-health-1")); // duplicate
    rig.connector.enqueueAction(action("live-health-key", "evt-health-1"));
    await rig.connector.drainReady();
    const health = rig.connector.health();
    expect(health.streamRef).toBe(STREAM);
    expect(health.ingested).toBe(1);
    expect(health.duplicatesIgnored).toBe(1);
    expect(health.backpressureEvents).toBe(0);
    expect(health.executedActions).toBe(1);
    expect(health.lastOutcome).toBe("succeeded");
  });
});
