/**
 * Runtime test — transport-coverage plumbing (W3-002; FROZEN §3.D/§17).
 *
 * All ten transport families can bind adapters (provider-agnostic TEST
 * DOUBLES); command requests only travel over command-capable transports;
 * every inbound payload routes through the untrusted-content sanitizer.
 */

import { describe, expect, it } from "vitest";
import { createTransportRouter } from "../src/runtime/transport/router";
import { CONNECTOR_TRANSPORTS, type ConnectorCommandRequest, type ConnectorTransportFamily } from "../src/contract";
import { asConnectorInstanceId, asConnectedCapabilityInstanceId, asIdempotencyKey, asAuthorizationContextRef, asUtcTimestamp } from "../src/runtime/ids";
import { TestDoubleConnectorAdapter, doubleDescriptor } from "./doubles";

const REQUIRED_FAMILIES: readonly ConnectorTransportFamily[] = [
  "api-sdk",
  "rest",
  "graphql",
  "agent-protocol",
  "cli",
  "file-feed",
  "browser",
  "live-commerce",
  "physical-edge",
  "webhook",
];

const commandRequest = (transportId: string): ConnectorCommandRequest => ({
  requestId: "req-1",
  connectorId: asConnectorInstanceId("connector-1"),
  capabilityInstanceRef: asConnectedCapabilityInstanceId("instance-1"),
  transportId,
  commandRef: "orders.read",
  idempotencyKey: asIdempotencyKey("idem-1"),
  authorization: asAuthorizationContextRef("authz-1"),
  requestedAt: asUtcTimestamp("2026-10-05T11:00:00Z"),
});

describe("transport router (coverage plumbing)", () => {
  it("binds TEST-DOUBLE adapters across every transport family and reports full coverage", () => {
    const router = createTransportRouter();
    const distinctTransportIds = [...new Set(CONNECTOR_TRANSPORTS.map((descriptor) => descriptor.id))];
    for (const transportId of distinctTransportIds) {
      router.bind(
        asConnectorInstanceId(`connector-${transportId}`),
        new TestDoubleConnectorAdapter(doubleDescriptor(`double-${transportId}`, transportId)),
      );
    }
    const coverage = router.coverage();
    expect(coverage.familiesTotal).toBe(REQUIRED_FAMILIES.length);
    expect(coverage.familiesBound).toBe(REQUIRED_FAMILIES.length);
    expect(coverage.unboundFamilyIds).toEqual([]);
    expect(coverage.bindingCount).toBe(distinctTransportIds.length);
    expect(router.bindings().length).toBe(distinctTransportIds.length);
  });

  it("coverage honestly reports unbound families before any binding", () => {
    const router = createTransportRouter();
    const coverage = router.coverage();
    expect(coverage.familiesTotal).toBe(REQUIRED_FAMILIES.length);
    expect(coverage.familiesBound).toBe(0);
    expect([...coverage.unboundFamilyIds].sort()).toEqual([...REQUIRED_FAMILIES].sort());
  });

  it("validates commands only on command-capable transports", () => {
    const router = createTransportRouter();
    for (const descriptor of CONNECTOR_TRANSPORTS) {
      const decision = router.validateCommand(commandRequest(descriptor.id));
      if (descriptor.supportsCommands) {
        expect(decision.valid, descriptor.id).toBe(true);
      } else {
        expect(decision.valid, descriptor.id).toBe(false);
        if (!decision.valid) {
          expect(decision.reason).toContain("observation-only");
        }
      }
    }
  });

  it("rejects unknown transports for commands and observations", () => {
    const router = createTransportRouter();
    const decision = router.validateCommand(commandRequest("carrier-pigeon"));
    expect(decision.valid).toBe(false);
    expect(() =>
      router.ingestObservation({ kind: "review", rawText: "x", sourceTransportId: "carrier-pigeon" }),
    ).toThrow(/unknown transport/);
  });

  it("ingest sanitizes untrusted content on EVERY transport (fail-closed)", () => {
    const router = createTransportRouter();
    for (const descriptor of CONNECTOR_TRANSPORTS) {
      if (!descriptor.supportsObservations) continue;
      const result = router.ingestObservation({
        kind: "product-description",
        rawText: `Cheap widget <script>alert("x")</script> onerror="boom"`,
        sourceTransportId: descriptor.id,
      });
      expect(result.sanitized.inertText, descriptor.id).not.toContain("<script");
      expect(result.sanitized.inertText, descriptor.id).not.toContain("onerror");
      expect(result.changed, descriptor.id).toBe(true);
    }
  });

  it("ingest routes physical-edge and live-commerce observations with sanitization", () => {
    const router = createTransportRouter();
    const edgeIngest = router.ingestObservation({
      kind: "web-page",
      rawText: "shelf note <iframe src='https://evil.example'></iframe>",
      sourceTransportId: "physical-edge",
    });
    expect(edgeIngest.sanitized.inertText).not.toContain("<iframe");
    expect(edgeIngest.sanitized.inertText).not.toContain("evil.example");
    const liveIngest = router.ingestObservation({
      kind: "live-stream-event",
      rawText: "bid placed javascript:void(0)",
      sourceTransportId: "live-commerce-stream",
    });
    expect(liveIngest.sanitized.inertText).not.toContain("javascript:");
  });

  it("refuses rebinding the same connector and unknown transports at bind time", () => {
    const router = createTransportRouter();
    const connectorId = asConnectorInstanceId("connector-dup");
    router.bind(connectorId, new TestDoubleConnectorAdapter(doubleDescriptor("double-1", "rest")));
    expect(() =>
      router.bind(connectorId, new TestDoubleConnectorAdapter(doubleDescriptor("double-2", "cli"))),
    ).toThrow(/already bound/);
    expect(() =>
      router.bind(
        asConnectorInstanceId("connector-bad"),
        new TestDoubleConnectorAdapter(doubleDescriptor("double-3", "telepathy")),
      ),
    ).toThrow(/unknown transport/);
  });
});
