/**
 * Runtime test — the no-RFID supermarket journey on REAL runtime paths
 * (W3-002 acceptance scenario 1 for the W3-001 "no-RFID journey" area;
 * docs/SUPERMARKET-WITHOUT-RFID.md, INVARIANT 46).
 *
 * Barcode → POS → weight observations (NO RFID anywhere) are captured
 * offline on a LocalCommerceEdge, ingested through the physical-edge
 * transport (sanitized), queued, drained to the commerce lane as
 * observations, and reconciled EXPLICITLY on the commerce side. Every hop
 * in this test runs the real runtime components.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createOfflineObservationQueue } from "../src/runtime/edge/offline-queue-runtime";
import { createTransportRouter } from "../src/runtime/transport/router";
import { createCredentialVault } from "../src/runtime/connector/vault";
import { createConnectorRuntime } from "../src/runtime/connector/runtime";
import { createModelContextGate } from "../src/runtime/model-context-gate";
import type { PhysicalObservation } from "../src/contract";
import {
  asConnectorInstanceId,
  asIdempotencyKey,
  asLocalEdgeDeviceId,
  asPhysicalObservationId,
  asReconciliationChannelRef,
} from "../src/runtime/ids";
import { TestDoubleCommerceLane, TestDoubleConnectorAdapter, doubleDescriptor, fixedClock, resetClock } from "./doubles";
import { money, utc } from "./branded";

const CLOCK_BASE = "2026-10-05T09:00:00Z";
const EDGE = asLocalEdgeDeviceId("edge-register-1");
const CHANNEL = asReconciliationChannelRef("reconciliation-kernel");

describe("no-RFID supermarket journey (real runtime, barcode/POS/weight only)", () => {
  beforeEach(() => resetClock());

  it("captures, ingests, queues, drains and hands off — full offline shift end-to-end", async () => {
    const commerceLane = new TestDoubleCommerceLane();
    const queue = createOfflineObservationQueue({
      edgeDeviceId: EDGE,
      receivingChannel: CHANNEL,
      submitHandoff: commerceLane.sink,
      clock: fixedClock(CLOCK_BASE),
      syncMode: "periodic",
    });
    const router = createTransportRouter();

    // The physical-edge transport is bound to a connector (TEST DOUBLE
    // adapter — provider adapters are W3-003; the transport plumbing is real).
    router.bind(
      asConnectorInstanceId("edge-connector-1"),
      new TestDoubleConnectorAdapter(doubleDescriptor("edge-double", "physical-edge")),
    );

    // --- Offline shift: three no-RFID observations ---
    const shift: readonly PhysicalObservation[] = [
      {
        observationId: asPhysicalObservationId("obs-pos-sale"),
        kind: "pos-sale-event",
        sourceClass: "pos-reported",
        truthClass: "observed",
        capture: {
          capturedAt: utc("2026-10-05T09:00:00Z"),
          capturedBy: "edge-device",
          captureMode: "offline",
          deviceRef: EDGE,
        },
        payload: {
          kind: "pos-sale-event",
          transaction: {
            posTerminalRef: "pos-1",
            transactionRef: "txn-1001",
            lineItems: [{ barcode: "6291041500213", quantity: "2" }],
            totalDisplay: money("18.40"),
          },
        },
      },
      {
        observationId: asPhysicalObservationId("obs-barcode-count"),
        kind: "barcode-scan",
        sourceClass: "barcode-scan",
        truthClass: "observed",
        capture: {
          capturedAt: utc("2026-10-05T09:15:00Z"),
          capturedBy: "employee",
          captureMode: "offline",
          deviceRef: EDGE,
        },
        payload: {
          kind: "barcode-scan",
          scan: { symbology: "ean", code: "6291041500213", scanContext: "count" },
        },
      },
      {
        observationId: asPhysicalObservationId("obs-weight"),
        kind: "weight-measurement",
        sourceClass: "automated-sensor",
        truthClass: "observed",
        capture: {
          capturedAt: utc("2026-10-05T09:20:00Z"),
          capturedBy: "automated-sensor",
          captureMode: "offline",
          deviceRef: EDGE,
        },
        payload: {
          kind: "weight-measurement",
          weight: { measuredAmount: "1.24", unit: "kg", scaleDeviceRef: "scale-1" },
        },
      },
    ];

    // A supplier note rides along the physical-edge transport as untrusted
    // content and must be neutralized at the ingest boundary.
    const ingested = router.ingestObservation({
      kind: "supplier-file",
      rawText: "delivery note <script>alert('tamper')</script> 12 crates",
      sourceTransportId: "physical-edge",
    });
    expect(ingested.sanitized.inertText).not.toContain("<script");

    // --- Offline queueing with idempotency keys ---
    for (const observation of shift) {
      const result = queue.enqueue(
        observation,
        asIdempotencyKey(`${EDGE}:${observation.observationId}`),
      );
      expect(result.status).toBe("queued");
    }
    expect(queue.health().queueDepth).toBe(3);

    // --- Connectivity returns: drain to the commerce lane ---
    expect(queue.markOnline()).toBe(3);
    const handoff = await queue.drain();
    expect(handoff.observationIds).toEqual(["obs-pos-sale", "obs-barcode-count", "obs-weight"]);

    // The commerce lane received observations, still observations.
    const received = commerceLane.received();
    expect(received.observations).toHaveLength(3);
    expect(received.observations.every((observation) => observation.truthClass === "observed")).toBe(true);
    // No RFID payload or transport was used anywhere in the journey.
    expect(received.observations.every((observation) => observation.kind !== "rfid-read")).toBe(true);

    // --- Explicit reconciliation happens ONLY on the commerce side ---
    expect(commerceLane.received().explicitlyReconciled).toBe(false);
    commerceLane.reconcileExplicitly();
    expect(commerceLane.received().explicitlyReconciled).toBe(true);
    // ...and the edge's view is unchanged: still handed-off observations.
    expect(queue.entries().every((entry) => entry.syncStatus === "handed-off")).toBe(true);
    queue.acknowledge(handoff.handoffId);
    expect(queue.handoffs()[0]?.outcome).toBe("acknowledged");
  });

  it("the same journey keeps credentials vaulted and model context clean", async () => {
    const commerceLane = new TestDoubleCommerceLane();
    const vault = createCredentialVault({ clock: fixedClock(CLOCK_BASE) });
    const queue = createOfflineObservationQueue({
      edgeDeviceId: EDGE,
      receivingChannel: CHANNEL,
      submitHandoff: commerceLane.sink,
      clock: fixedClock(CLOCK_BASE),
      syncMode: "manual",
    });
    const runtime = createConnectorRuntime({ vault, clock: fixedClock(CLOCK_BASE) });
    // The edge's browser-backoffice observation connector connects with a
    // real (vaulted) credential — the browser back office has no API route.
    const adapter = new TestDoubleConnectorAdapter(doubleDescriptor("backoffice-double", "browser"));
    const connector = runtime.register(adapter);
    await runtime.connect({
      connectorId: connector.connectorId,
      accountRef: "backoffice-account",
      credential: {
        kind: "cookie",
        material: "backoffice-session-cookie-secret",
        forAdapterId: "backoffice-double",
        forAccountRef: "backoffice-account",
      },
      grantedPermissions: ["read"],
      credentialScope: "read",
    });
    const observation: PhysicalObservation = {
      observationId: asPhysicalObservationId("obs-backoffice"),
      kind: "browser-backoffice-observation",
      sourceClass: "pos-reported",
      truthClass: "observed",
      capture: {
        capturedAt: utc("2026-10-05T09:25:00Z"),
        capturedBy: "edge-device",
        captureMode: "offline",
        deviceRef: EDGE,
      },
      payload: {
        kind: "browser-backoffice-observation",
        backoffice: { pageNote: "stock level screenshot reviewed" },
      },
    };
    queue.enqueue(observation, asIdempotencyKey(`${EDGE}:obs-backoffice`));
    queue.markOnline();
    await queue.drain();

    // Everything the edge lane could ever show is credential-free and
    // clears the model-context gate.
    const gate = createModelContextGate({ vault, clearedAt: "2026-10-05T09:30:00Z" });
    for (const artifact of [queue.entries(), queue.handoffs(), queue.health(), runtime.healthReport()]) {
      expect(() => gate.clear(artifact as object)).not.toThrow();
      expect(JSON.stringify(artifact)).not.toContain("backoffice-session-cookie-secret");
    }
  });
});
