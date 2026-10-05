/**
 * Runtime test — LocalCommerceEdge (W3-003 acceptance scenario 3):
 * disconnected operation queues journeys; reconnect replays them
 * exactly-once (idempotency keys survive restart via the persistence
 * port); degraded mode NEVER promotes observations — the commerce lane
 * reconciles explicitly on its own side.
 */

import { describe, expect, it } from "vitest";
import { createLocalCommerceEdge, type EdgePersistence, type EdgeQueuedJourney } from "../src/runtime/edge/local-commerce-edge";
import type { PhysicalObservation } from "../src/contract";
import { asIdempotencyKey, asLocalEdgeDeviceId, asReconciliationChannelRef } from "../src/runtime/ids";

/** ⚠ TEST DOUBLE: in-memory durable persistence (survives "restarts"). */
class InMemoryEdgePersistence implements EdgePersistence {
  private stored: readonly EdgeQueuedJourney[] = [];
  saveJourneys(journeys: readonly EdgeQueuedJourney[]): void {
    this.stored = journeys.map((journey) => ({ ...journey }));
  }
  loadJourneys(): readonly EdgeQueuedJourney[] {
    return this.stored.map((journey) => ({ ...journey }));
  }
}

/** ⚠ TEST DOUBLE: commerce lane reconciliation sink (Worker 1's lane). */
class CommerceLaneSink {
  readonly receivedObservations: PhysicalObservation[] = [];
  reconciled = false;
  readonly sink = (handoff: never, observations: readonly PhysicalObservation[]) => {
    void handoff;
    this.receivedObservations.push(...observations.map((observation) => ({ ...observation })));
    return { outcome: "submitted" as const };
  };
  reconcileExplicitly(): void {
    this.reconciled = true;
  }
}

const DEVICE = asLocalEdgeDeviceId("edge-device-checkout-1");
const CHANNEL = asReconciliationChannelRef("channel-commerce-reconciliation");

function physicalObservation(id: string, mode: "online" | "offline"): PhysicalObservation {
  return {
    observationId: `obs-${id}`,
    kind: "barcode-scan",
    sourceClass: "pos-reported",
    truthClass: "observed",
    capture: {
      capturedAt: "2026-10-06T12:00:00Z",
      capturedBy: "edge-device",
      captureMode: mode,
      deviceRef: DEVICE,
    },
    payload: {
      barcode: `400638133393${id.length}`,
      quantity: 1,
      locationNote: "lane-3",
    },
  } as unknown as PhysicalObservation;
}

function createEdge(options: {
  persistence: EdgePersistence;
  commerce: CommerceLaneSink;
  execute: (journey: EdgeQueuedJourney) => Promise<"succeeded" | "failed-recoverable" | "unknown">;
}) {
  const clock = (() => {
    let ticks = 0;
    return () => new Date(Date.parse("2026-10-06T12:00:00Z") + ticks++ * 1000).toISOString();
  })();
  return createLocalCommerceEdge({
    edgeDeviceId: DEVICE,
    receivingChannel: CHANNEL,
    submitHandoff: options.commerce.sink,
    executeJourney: options.execute,
    persistence: options.persistence,
    clock,
    maxReplayAttempts: 2,
  });
}

describe("LocalCommerceEdge — scenario 3", () => {
  it("disconnected operation queues journeys locally (never dropped, never executed)", async () => {
    const persistence = new InMemoryEdgePersistence();
    const commerce = new CommerceLaneSink();
    let executions = 0;
    const edge = createEdge({
      persistence, commerce,
      execute: async () => {
        executions += 1;
        return "succeeded";
      },
    });
    edge.setConnectivity("offline");
    edge.enqueueJourney({
      journeyRef: "journey-pos-sale-1",
      commandRef: "create-order",
      payloadRef: "payload-pos-sale-1",
      idempotencyKey: asIdempotencyKey("edge-key-1"),
      connectorId: "connector-shopify-edge",
    });
    edge.enqueueJourney({
      journeyRef: "journey-pos-sale-2",
      commandRef: "create-order",
      payloadRef: "payload-pos-sale-2",
      idempotencyKey: asIdempotencyKey("edge-key-2"),
      connectorId: "connector-shopify-edge",
    });
    expect(edge.connectivity()).toBe("offline");
    expect(edge.journeys()).toHaveLength(2);
    expect(edge.health().queuedJourneys).toBe(2);
    // NOTHING executed while disconnected.
    expect(executions).toBe(0);
    // Queued journeys are durable: persisted for restart survival.
    expect(persistence.loadJourneys()).toHaveLength(2);
  });

  it("reconnect replays queued journeys exactly-once per idempotency key", async () => {
    const persistence = new InMemoryEdgePersistence();
    const commerce = new CommerceLaneSink();
    const executed: string[] = [];
    const edge = createEdge({
      persistence, commerce,
      execute: async (journey) => {
        executed.push(journey.idempotencyKey);
        return "succeeded";
      },
    });
    edge.setConnectivity("offline");
    edge.enqueueJourney({ journeyRef: "j1", commandRef: "create-order", payloadRef: "p1", idempotencyKey: asIdempotencyKey("edge-key-A"), connectorId: "c1" });
    edge.enqueueJourney({ journeyRef: "j2", commandRef: "create-order", payloadRef: "p2", idempotencyKey: asIdempotencyKey("edge-key-B"), connectorId: "c1" });
    edge.setConnectivity("online");
    const settled = await edge.reconnect();
    expect(settled).toHaveLength(2);
    expect(executed).toEqual(["edge-key-A", "edge-key-B"]);
    expect(edge.health().replayedJourneys).toBe(2);
    expect(edge.health().queuedJourneys).toBe(0);

    // A SECOND reconnect after a duplicate enqueue never re-executes.
    edge.enqueueJourney({ journeyRef: "j1-dupe", commandRef: "create-order", payloadRef: "p1", idempotencyKey: asIdempotencyKey("edge-key-A"), connectorId: "c1" });
    expect(edge.journeys().filter((journey) => journey.syncStatus === "queued")).toHaveLength(0);
    await edge.reconnect();
    expect(executed).toHaveLength(2);
  });

  it("idempotency keys survive restart: a fresh edge never re-executes replayed journeys", async () => {
    const persistence = new InMemoryEdgePersistence();
    const commerce = new CommerceLaneSink();
    let executions = 0;
    const edgeOne = createEdge({
      persistence, commerce,
      execute: async () => {
        executions += 1;
        return "succeeded";
      },
    });
    edgeOne.setConnectivity("offline");
    edgeOne.enqueueJourney({ journeyRef: "j-restart", commandRef: "create-order", payloadRef: "p1", idempotencyKey: asIdempotencyKey("edge-key-restart"), connectorId: "c1" });
    edgeOne.setConnectivity("online");
    await edgeOne.reconnect();
    expect(executions).toBe(1);

    // RESTART: a brand-new edge instance over the same durable persistence.
    const edgeTwo = createEdge({
      persistence, commerce,
      execute: async () => {
        executions += 1;
        return "succeeded";
      },
    });
    // The replayed journey loaded back as replayed — reconnect does nothing.
    await edgeTwo.reconnect();
    expect(executions).toBe(1);
    // And a duplicate enqueue under the SAME key is ignored.
    edgeTwo.enqueueJourney({ journeyRef: "j-restart-2", commandRef: "create-order", payloadRef: "p1", idempotencyKey: asIdempotencyKey("edge-key-restart"), connectorId: "c1" });
    expect(edgeTwo.journeys().filter((journey) => journey.syncStatus === "queued")).toHaveLength(0);
    await edgeTwo.reconnect();
    expect(executions).toBe(1);
  });

  it("retry: recoverable replay failures re-queue with bounded attempts, then surface as failed-terminal", async () => {
    const persistence = new InMemoryEdgePersistence();
    const commerce = new CommerceLaneSink();
    let attempts = 0;
    const edge = createEdge({
      persistence, commerce,
      execute: async () => {
        attempts += 1;
        return "failed-recoverable"; // provider unreachable-ish
      },
    });
    edge.setConnectivity("offline");
    edge.enqueueJourney({ journeyRef: "j-flaky", commandRef: "create-order", payloadRef: "p1", idempotencyKey: asIdempotencyKey("edge-key-flaky"), connectorId: "c1" });
    edge.setConnectivity("online");
    // First reconnect: 1 attempt, re-queued (maxReplayAttempts: 2).
    await edge.reconnect();
    expect(attempts).toBe(1);
    expect(edge.journeys()[0]?.syncStatus).toBe("queued");
    // Second reconnect: second attempt → bounded retry exhausted → surfaced.
    await edge.reconnect();
    expect(attempts).toBe(2);
    expect(edge.journeys()[0]?.syncStatus).toBe("failed-terminal");
    expect(edge.health().failedTerminalJourneys).toBe(1);
    expect(edge.health().replayedJourneys).toBe(0);
  });

  it("observations queue offline and hand off AS OBSERVATIONS — degraded mode never promotes them", async () => {
    const persistence = new InMemoryEdgePersistence();
    const commerce = new CommerceLaneSink();
    const edge = createEdge({
      persistence, commerce,
      execute: async () => "succeeded",
    });

    // DEGRADED mode: the edge keeps capturing observations locally.
    edge.setConnectivity("degraded");
    const degradedOne = physicalObservation("1", "offline");
    const degradedTwo = physicalObservation("2", "offline");
    edge.enqueueObservation(degradedOne, asIdempotencyKey("obs-key-1"));
    edge.enqueueObservation(degradedTwo, asIdempotencyKey("obs-key-2"));

    // Degraded-mode health is explicit — never a silent fallback.
    const health = edge.health();
    expect(health.connectivity).toBe("degraded");
    expect(health.degradedNote).toContain("never promoted");

    // Connectivity restored: observations drain to the commerce lane.
    edge.setConnectivity("online");
    const handoff = await edge.drainObservations();
    expect(handoff.observationIds).toEqual(["obs-1", "obs-2"]);
    expect(commerce.receivedObservations).toHaveLength(2);
    // The commerce lane received OBSERVATIONS — nothing was promoted by the
    // edge; reconciliation remains the commerce lane's EXPLICIT operation.
    expect(commerce.receivedObservations.every((observation) => observation.truthClass === "observed")).toBe(true);
    expect(commerce.reconciled).toBe(false);
    commerce.reconcileExplicitly();
    expect(commerce.reconciled).toBe(true);

    // Duplicate observation keys are ignored on re-sync (exactly-once hand-off).
    edge.enqueueObservation(degradedOne, asIdempotencyKey("obs-key-1"));
    const second = await edge.drainObservations();
    expect(second.observationIds).toHaveLength(0);
  });

  it("the edge contract view exposes queue + handoffs for the W3-001 surface", async () => {
    const persistence = new InMemoryEdgePersistence();
    const commerce = new CommerceLaneSink();
    const edge = createEdge({ persistence, commerce, execute: async () => "succeeded" });
    edge.setConnectivity("offline");
    edge.enqueueObservation(physicalObservation("9", "offline"), asIdempotencyKey("obs-key-9"));
    edge.setConnectivity("online");
    await edge.drainObservations();
    const contract = edge.edgeContract(
      "installed-service",
      [
        {
          interfaceKind: "local-pos",
          capabilityRef: "cap-pos-read",
          grantedTo: DEVICE,
          grantedBy: "principal-store-owner" as never,
          grantedAt: "2026-10-06T12:00:00Z",
          scope: "read-only-observation",
          revocable: true,
        },
      ],
      { queueObservations: true, syncTrigger: "connectivity-restored" },
    );
    expect(contract.edgeDeviceId).toBe(DEVICE);
    expect(contract.installationMode).toBe("installed-service");
    expect(contract.queue).toHaveLength(1);
    expect(contract.handoffs).toHaveLength(1);
    expect(contract.authorizedInterfaces[0]?.interfaceKind).toBe("local-pos");
  });
});
