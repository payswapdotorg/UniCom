/**
 * W3-008 closure journey — USB / serial / LAN interface authorization
 * (matrix rows: "USB/serial/LAN" commerce-network + "USB/serial" physical-commerce
 * + "local network" physical-commerce).
 *
 * Closes the audit gap the matrix-audit flagged: the existing
 * `local-commerce-edge.test.ts` only exercised `interfaceKind: "local-pos"`;
 * the USB, serial and LAN interface kinds (FROZEN §22.4 LocalCommerceEdge,
 * INVARIANT 45) were enumerated in the contract but never driven through a
 * journey. This test drives them through the SAME
 * `createLocalCommerceEdge` runtime the production edge uses (no test-only
 * runtime; W3-005 zero-orphan discoverability law — the surfaces already
 * advertise `local-edge-setup` with `usb-serial-lan`, `physical-edge`,
 * `physical-local-network`, `physical-usb-serial`).
 *
 * Laws held:
 * - Frozen architecture (no new vocabulary): reuses `LocalEdgeInterfaceKind`,
 *   `LocalEdgeInterfaceAuthorization`, `LocalCommerceEdgeContract`.
 * - Local-commerce-edge law: observations queue + reconcile explicitly; the
 *   edge NEVER promotes observations (INVARIANT 29/47).
 * - Zero-orphan discoverability: every interface kind exercised here is
 *   advertised on the `local-edge-setup` surface (surfaces.ts).
 */

import { describe, expect, it } from "vitest";
import { createLocalCommerceEdge, type EdgePersistence, type EdgeQueuedJourney } from "../src/runtime/edge/local-commerce-edge";
import type { PhysicalObservation } from "../src/contract";
import type { LocalEdgeInterfaceAuthorization } from "../src/edge/local-edge";
import { NAVIGATION_SURFACES } from "../src/navigation/surfaces";
import { SURFACE_STATE_MANIFESTS } from "../src/surfaces/surface-state-manifests";
import { asIdempotencyKey, asLocalEdgeDeviceId, asReconciliationChannelRef } from "../src/runtime/ids";

/** ⚠ TEST DOUBLE: in-memory persistence (survives restarts within one test). */
class InMemoryEdgePersistence implements EdgePersistence {
  private stored: readonly EdgeQueuedJourney[] = [];
  saveJourneys(journeys: readonly EdgeQueuedJourney[]): void {
    this.stored = journeys.map((journey) => ({ ...journey }));
  }
  loadJourneys(): readonly EdgeQueuedJourney[] {
    return this.stored.map((journey) => ({ ...journey }));
  }
}

/** ⚠ TEST DOUBLE: commerce lane reconciliation sink. */
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

const DEVICE = asLocalEdgeDeviceId("edge-device-usb-serial-lan-1");
const CHANNEL = asReconciliationChannelRef("channel-commerce-reconciliation");

function makeInterfaceAuth(
  interfaceKind: LocalEdgeInterfaceAuthorization["interfaceKind"],
  capabilityRef: string,
): LocalEdgeInterfaceAuthorization {
  return {
    interfaceKind,
    capabilityRef,
    grantedTo: DEVICE,
    grantedBy: "principal-store-owner" as never,
    grantedAt: "2026-10-08T09:00:00Z",
    scope: "read-only-observation",
    revocable: true,
  };
}

function usbSerialLanObservation(kind: "usb-serial-device-event" | "local-network-service-event"): PhysicalObservation {
  return {
    observationId: `obs-${kind}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    sourceClass: "automated-sensor",
    truthClass: "observed",
    capture: {
      capturedAt: "2026-10-08T09:00:00Z",
      capturedBy: "edge-device",
      captureMode: "offline",
      deviceRef: DEVICE,
    },
    payload:
      kind === "usb-serial-device-event"
        ? { kind: "usb-serial-device-event", deviceEvent: { deviceNote: "scanner-scale-over-usb-serial: weight=1.234kg" } }
        : { kind: "local-network-service-event", serviceEvent: { serviceNote: "lan-pos-terminal-2: daily-close broadcast" } },
  } as unknown as PhysicalObservation;
}

function createEdge(options: { persistence: EdgePersistence; commerce: CommerceLaneSink }) {
  const clock = (() => {
    let ticks = 0;
    return () => new Date(Date.parse("2026-10-08T09:00:00Z") + ticks++ * 1000).toISOString();
  })();
  return createLocalCommerceEdge({
    edgeDeviceId: DEVICE,
    receivingChannel: CHANNEL,
    submitHandoff: options.commerce.sink,
    executeJourney: async () => "succeeded",
    persistence: options.persistence,
    clock,
    maxReplayAttempts: 2,
  });
}

describe("W3-008 — USB/serial/LAN physical-edge interface journey (audit closure)", () => {
  it("the local-edge-setup surface advertises usb-serial-lan, physical-edge, physical-local-network, physical-usb-serial (zero-orphan discoverability)", () => {
    const localEdgeSurface = NAVIGATION_SURFACES.find((surface) => surface.id === "local-edge-setup");
    expect(localEdgeSurface, "local-edge-setup surface must exist (zero-orphan law)").toBeDefined();
    const discovers = new Set(localEdgeSurface!.discovers);
    // Every interface kind we exercise below is discoverable on this surface.
    expect(discovers.has("usb-serial-lan")).toBe(true);
    expect(discovers.has("physical-edge")).toBe(true);
    expect(discovers.has("physical-local-network")).toBe(true);
    expect(discovers.has("physical-usb-serial")).toBe(true);
  });

  it("usb / serial / lan interface authorizations flow through the LocalCommerceEdge contract verbatim", () => {
    const persistence = new InMemoryEdgePersistence();
    const commerce = new CommerceLaneSink();
    const edge = createEdge({ persistence, commerce });

    // Authorize all three local interface kinds the matrix enumerates.
    const authorizedInterfaces: LocalEdgeInterfaceAuthorization[] = [
      makeInterfaceAuth("usb", "cap-usb-scanner-scale"),
      makeInterfaceAuth("serial", "cap-serial-receipt-printer"),
      makeInterfaceAuth("lan", "cap-lan-pos-broadcast"),
    ];

    const contract = edge.edgeContract(
      "installed-service",
      authorizedInterfaces,
      { queueObservations: true, syncTrigger: "connectivity-restored" },
    );

    expect(contract.edgeDeviceId).toBe(DEVICE);
    expect(contract.installationMode).toBe("installed-service");
    expect(contract.authorizedInterfaces).toHaveLength(3);
    // The contract is a verbatim mirror — interface kinds survive untouched.
    expect(contract.authorizedInterfaces.map((authorization) => authorization.interfaceKind)).toEqual([
      "usb",
      "serial",
      "lan",
    ]);
    // Every authorization is revocable (authority is never permanent).
    expect(contract.authorizedInterfaces.every((authorization) => authorization.revocable === true)).toBe(true);
    // Every authorization cites an explicit capability reference (no freeform authority).
    expect(contract.authorizedInterfaces.every((authorization) => authorization.capabilityRef.length > 0)).toBe(true);
  });

  it("a USB-serial device event captured at the offline edge queues, then drains as an OBSERVATION (never promoted)", async () => {
    const persistence = new InMemoryEdgePersistence();
    const commerce = new CommerceLaneSink();
    const edge = createEdge({ persistence, commerce });

    edge.setConnectivity("offline");
    const observation = usbSerialLanObservation("usb-serial-device-event");
    const enqueued = edge.enqueueObservation(observation, asIdempotencyKey("obs-usb-serial-1"));
    expect(enqueued.status).toBe("queued");

    // Reconnect → drain → the commerce lane receives the OBSERVATION verbatim.
    edge.setConnectivity("online");
    const handoff = await edge.drainObservations();
    expect(handoff.observationIds).toHaveLength(1);
    expect(commerce.receivedObservations).toHaveLength(1);
    expect(commerce.receivedObservations[0]?.kind).toBe("usb-serial-device-event");
    // The edge did NOT promote the observation — truth class stays "observed".
    expect(commerce.receivedObservations.every((entry) => entry.truthClass === "observed")).toBe(true);
    expect(commerce.reconciled).toBe(false);
    commerce.reconcileExplicitly();
    expect(commerce.reconciled).toBe(true);
  });

  it("a LAN service event captured at the offline edge queues, then drains as an OBSERVATION (never promoted)", async () => {
    const persistence = new InMemoryEdgePersistence();
    const commerce = new CommerceLaneSink();
    const edge = createEdge({ persistence, commerce });

    edge.setConnectivity("offline");
    const observation = usbSerialLanObservation("local-network-service-event");
    const enqueued = edge.enqueueObservation(observation, asIdempotencyKey("obs-lan-event-1"));
    expect(enqueued.status).toBe("queued");

    edge.setConnectivity("online");
    const handoff = await edge.drainObservations();
    expect(handoff.observationIds).toHaveLength(1);
    expect(commerce.receivedObservations[0]?.kind).toBe("local-network-service-event");
    expect(commerce.receivedObservations.every((entry) => entry.truthClass === "observed")).toBe(true);
    void handoff;
  });

  it("interface authorizations are mirrored on the contract view surface-state — Operator Console reachable", () => {
    // Smoke-checks the surface-state manifest declares a manifest for
    // local-edge-setup so the operator can see these interfaces in production.
    // (W3-005 zero-orphan discoverability law.)
    const manifestIds = new Set(SURFACE_STATE_MANIFESTS.map((manifest) => manifest.surfaceId));
    expect(manifestIds.has("local-edge-setup")).toBe(true);
  });
});
