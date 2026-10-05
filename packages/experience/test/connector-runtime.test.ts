/**
 * Runtime test — connector adapter lifecycle, health observation and
 * execution evidence on REAL runtime paths (W3-002 acceptance scenario 1).
 *
 * register → connect → observe → execute → disconnect against the real
 * ConnectorRuntime with a clearly-marked TEST DOUBLE adapter. Health law:
 * an incomplete probe is UNKNOWN, never down (UNKNOWN ≠ FAILED); provider
 * states and customer-action notes are preserved verbatim.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  createConnectorRuntime,
  type ConnectorRuntime,
} from "../src/runtime/connector/runtime";
import { createCredentialVault } from "../src/runtime/connector/vault";
import type { ConnectorCommandRequest } from "../src/contract";
import { asIdempotencyKey, asPrincipalRef, asAuthorizationContextRef, asConnectorInstanceId, asConnectedCapabilityInstanceId } from "../src/runtime/ids";
import {
  TestDoubleConnectorAdapter,
  doubleDescriptor,
  fixedClock,
  resetClock,
} from "./doubles";
import { utc } from "./branded";

const CLOCK_BASE = "2026-10-05T11:00:00Z";

function buildRuntime(): {
  runtime: ConnectorRuntime;
  adapter: TestDoubleConnectorAdapter;
} {
  const vault = createCredentialVault({ clock: fixedClock(CLOCK_BASE) });
  const runtime = createConnectorRuntime({ vault, clock: fixedClock(CLOCK_BASE) });
  const adapter = new TestDoubleConnectorAdapter(doubleDescriptor("double-a", "rest"));
  return { runtime, adapter };
}

describe("connector adapter lifecycle (real runtime)", () => {
  beforeEach(() => resetClock());

  it("registers an adapter and tracks it as registered-not-observed with UNKNOWN health", () => {
    const { runtime, adapter } = buildRuntime();
    const connector = runtime.register(adapter);
    expect(connector.lifecycle).toBe("registered");
    expect(connector.connectorId).toContain("double-a");
    // Unobserved connectors are UNKNOWN, never assumed healthy or down.
    const report = runtime.healthReport();
    expect(report).toHaveLength(1);
    expect(report[0]?.health.status).toBe("unknown");
  });

  it("connects only after vaulting the credential; the adapter receives the sealed handle", async () => {
    const { runtime, adapter } = buildRuntime();
    const connector = runtime.register(adapter);
    const connected = await runtime.connect({
      connectorId: connector.connectorId,
      accountRef: "account-1",
      credential: {
        kind: "api-secret",
        material: "super-secret-api-key-1",
        forAdapterId: "double-a",
        forAccountRef: "account-1",
      },
      grantedPermissions: ["orders.read"],
      credentialScope: "orders.read orders.write",
    });
    expect(connected.lifecycle).toBe("connected");
    expect(connected.connectedInstances).toHaveLength(1);
    expect(connected.sealedCredential).toBeDefined();
    // The adapter got the opaque handle — never the raw material.
    const context = adapter.recordedCalls().connectContexts[0];
    expect(context?.sealedCredential).toBe(connected.sealedCredential);
    expect(JSON.stringify(context)).not.toContain("super-secret-api-key-1");
  });

  it("refuses a credential sealed for a different adapter boundary", async () => {
    const { runtime } = buildRuntime();
    const connector = runtime.register(
      new TestDoubleConnectorAdapter(doubleDescriptor("double-a", "rest")),
    );
    await expect(
      runtime.connect({
        connectorId: connector.connectorId,
        accountRef: "account-1",
        credential: {
          kind: "api-secret",
          material: "secret",
          forAdapterId: "some-other-adapter",
          forAccountRef: "account-1",
        },
        grantedPermissions: [],
        credentialScope: "orders.read",
      }),
    ).rejects.toThrow("credential scope does not match");
  });

  it("preserves customer-action-required connection outcomes as first-class state", async () => {
    const vault = createCredentialVault({ clock: fixedClock(CLOCK_BASE) });
    const runtime = createConnectorRuntime({ vault, clock: fixedClock(CLOCK_BASE) });
    const adapter = new TestDoubleConnectorAdapter(doubleDescriptor("double-b", "browser"), {
      connectOutcome: { status: "customer-action-required", note: "user must approve login" },
    });
    const connector = runtime.register(adapter);
    const afterConnect = await runtime.connect({
      connectorId: connector.connectorId,
      accountRef: "account-2",
      credential: { kind: "cookie", material: "c", forAdapterId: "double-b", forAccountRef: "account-2" },
      grantedPermissions: [],
      credentialScope: "read",
    });
    expect(afterConnect.lifecycle).toBe("customer-action-required");
  });

  it("observe() maps a healthy probe to a healthy snapshot with evidence", async () => {
    const { runtime, adapter } = buildRuntime();
    const connector = runtime.register(adapter);
    await runtime.connect({
      connectorId: connector.connectorId,
      accountRef: "account-1",
      credential: { kind: "api-secret", material: "s", forAdapterId: "double-a", forAccountRef: "account-1" },
      grantedPermissions: [],
      credentialScope: "orders.read",
    });
    const { health, observation } = await runtime.observe(connector.connectorId);
    expect(health.status).toBe("healthy");
    expect(health.evidence.length).toBeGreaterThan(0);
    expect(observation?.status).toBe("NOMINAL");
    expect(adapter.recordedCalls().probeCount).toBe(1);
    expect(adapter.recordedCalls().observeCount).toBe(1);
  });

  it("observe() maps a THROWN probe to status unknown — never down (UNKNOWN ≠ FAILED)", async () => {
    const vault = createCredentialVault({ clock: fixedClock(CLOCK_BASE) });
    const runtime = createConnectorRuntime({ vault, clock: fixedClock(CLOCK_BASE) });
    const adapter = new TestDoubleConnectorAdapter(doubleDescriptor("double-c", "rest"), {
      probeThrows: new Error("probe never settled"),
    });
    const connector = runtime.register(adapter);
    const { health } = await runtime.observe(connector.connectorId);
    expect(health.status).toBe("unknown");
    expect(health.status).not.toBe("down");
    expect(health.degradedReasons).toEqual([]);
    expect(health.evidence[0]?.summary).toContain("probe never settled");
  });

  it("observe() preserves provider-degraded and customer-action health states verbatim", async () => {
    const vault = createCredentialVault({ clock: fixedClock(CLOCK_BASE) });
    const runtime = createConnectorRuntime({ vault, clock: fixedClock(CLOCK_BASE) });
    const adapter = new TestDoubleConnectorAdapter(doubleDescriptor("double-d", "rest"), {
      probeResult: {
        status: "customer-action-required",
        customerActionNotes: ["re-authorize the connected account"],
      },
    });
    const connector = runtime.register(adapter);
    const { health } = await runtime.observe(connector.connectorId);
    expect(health.status).toBe("customer-action-required");
    expect(health.customerActionNotes).toEqual(["re-authorize the connected account"]);
  });

  it("execute() enforces connected lifecycle and command-capable transports, and records evidence", async () => {
    const { runtime, adapter } = buildRuntime();
    const connector = runtime.register(adapter);
    // Before connect: execute refuses.
    const command = (transportId: string): ConnectorCommandRequest => ({
      requestId: "req-1",
      connectorId: connector.connectorId,
      capabilityInstanceRef: asConnectedCapabilityInstanceId("test-double-instance-double-a-account-1"),
      transportId,
      commandRef: "orders.read",
      idempotencyKey: asIdempotencyKey("idem-1"),
      authorization: asAuthorizationContextRef("authz-1"),
      requestedAt: utc("2026-10-05T11:05:00Z"),
    });
    await expect(
      runtime.execute(command("rest"), { requestedBy: asPrincipalRef("principal-1"), payloadRef: "payload-1" }),
    ).rejects.toThrow("not connected");
    await runtime.connect({
      connectorId: connector.connectorId,
      accountRef: "account-1",
      credential: { kind: "api-secret", material: "s", forAdapterId: "double-a", forAccountRef: "account-1" },
      grantedPermissions: [],
      credentialScope: "orders.read",
    });
    // Observation-only transport refuses commands.
    await expect(
      runtime.execute(command("csv-feed"), { requestedBy: asPrincipalRef("principal-1"), payloadRef: "payload-1" }),
    ).rejects.toThrow("does not support commands");
    // Command-capable transport executes and records evidence.
    const { outcome, evidence } = await runtime.execute(command("rest"), {
      requestedBy: asPrincipalRef("principal-1"),
      payloadRef: "payload-1",
    });
    expect(outcome.outcome).toBe("succeeded");
    expect(evidence.principal).toBe("principal-1");
    expect(evidence.connectorId).toBe(connector.connectorId);
    expect(evidence.outcome).toBe("succeeded");
    expect(evidence.providerStatePreserved).toBe(true);
    expect(evidence.correlationId).toContain("idem-1");
    expect(evidence.connectedInstanceRefs[0]).toBe("test-double-instance-double-a-account-1");
    expect(runtime.executionLog()).toHaveLength(1);
  });

  it("disconnect() transitions lifecycle and clears connected instances", async () => {
    const { runtime, adapter } = buildRuntime();
    const connector = runtime.register(adapter);
    await runtime.connect({
      connectorId: connector.connectorId,
      accountRef: "account-1",
      credential: { kind: "api-secret", material: "s", forAdapterId: "double-a", forAccountRef: "account-1" },
      grantedPermissions: [],
      credentialScope: "orders.read",
    });
    const disconnected = await runtime.disconnect(connector.connectorId);
    expect(disconnected.lifecycle).toBe("disconnected");
    expect(disconnected.connectedInstances).toHaveLength(0);
    expect(adapter.recordedCalls().disconnectCount).toBe(1);
  });

  it("unknown connector ids are refused everywhere (no silent fallbacks)", () => {
    const { runtime } = buildRuntime();
    expect(runtime.connector(asConnectorInstanceId("nope"))).toBeUndefined();
    expect(() => runtime.healthReport()).not.toThrow();
  });
});
