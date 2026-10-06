/**
 * Runtime test — connector health surface (W3-005 acceptance scenario 3).
 *
 * Per-connector status / last-contact / error / recovery surfaces POPULATED
 * BY EXECUTION-MODE JOURNEY STATES: real journeys run through the canonical
 * W3-003 journey runner (observe → decide → execute → evidence) over the
 * real W3-002 ConnectorRuntime with a clearly-marked TEST DOUBLE adapter;
 * the health surface is then composed from the W3-003 telemetry records the
 * runner wrote. UNKNOWN is never collapsed into failure; customer-action
 * notes are preserved verbatim.
 */

import { describe, expect, it } from "vitest";
import { ExecutionMode } from "@unicom/agent/capability";
import { createConnectorRuntime } from "../src/runtime/connector/runtime";
import { createCredentialVault } from "../src/runtime/connector/vault";
import { createConnectorTelemetry } from "../src/runtime/connector/telemetry";
import { createProviderJourneyRunner } from "../src/runtime/connector/journey";
import { buildConnectorHealthSurface } from "../src/runtime/surfaces/connector-health";
import { asAuthorizationContextRef, asPrincipalRef, asCapabilityDefinitionId } from "../src/runtime/ids";
import { credentialScope } from "@unicom/agent";
import { TestDoubleConnectorAdapter, doubleDescriptor } from "./doubles";
import { utc } from "./branded";

const CLOCK_BASE = "2026-10-08T14:00:00Z";

/** Instance-scoped fixed clock (avoids the shared-counter hazard). */
const makeClock = (baseIso: string) => {
  let ticks = 0;
  return () => new Date(Date.parse(baseIso) + ticks++ * 1000).toISOString();
};

const PRINCIPAL = asPrincipalRef("principal-health-viewer-1");
const AUTH = asAuthorizationContextRef("authorization-health-1");

interface Rig {
  clock: () => string;
  runtime: ReturnType<typeof createConnectorRuntime>;
  telemetry: ReturnType<typeof createConnectorTelemetry>;
  runner: ReturnType<typeof createProviderJourneyRunner>;
}

function rig(): Rig {
  const clock = makeClock(CLOCK_BASE);
  const runtime = createConnectorRuntime({ vault: createCredentialVault({ clock }), clock });
  const telemetry = createConnectorTelemetry({ clock });
  const runner = createProviderJourneyRunner({ runtime, telemetry, clock });
  return { clock, runtime, telemetry, runner };
}

const connect = async (
  runtime: ReturnType<typeof createConnectorRuntime>,
  adapter: TestDoubleConnectorAdapter,
) => {
  const connector = runtime.register(adapter);
  await runtime.connect({
    connectorId: connector.connectorId,
    // account-1: the double's default observation binds to this account —
    // keeping it lets the executability gate see a CURRENT observation.
    accountRef: "account-1",
    credential: {
      kind: "api-secret",
      material: "secret-material-health-1",
      forAdapterId: adapter.descriptor.adapterId,
      forAccountRef: "account-1",
    },
    grantedPermissions: ["orders.read", "orders.write"],
    credentialScope: "orders.read orders.write",
  });
  return connector.connectorId;
};

const journeySteps = (adapterId: string) => [
  {
    stepRef: "step-sync-orders",
    capabilityDefinitionId: asCapabilityDefinitionId(`cap-${adapterId}`),
    preconditions: {
      requiresConnectedInstance: true,
      requiredCredentialScope: credentialScope("orders.read orders.write"),
      requiredPermissions: ["orders.read", "orders.write"],
      requiresCommercialTermsAccepted: true,
      requiresCurrentObservation: true,
    },
    commandRef: "orders.sync",
    payloadRef: "payload-orders-sync",
  },
];

describe("connector health surface — scenario 3 (fed by execution-mode journeys)", () => {
  it("a SUCCEEDED journey populates status, last-contact and journey summaries; no error, no recovery needed", async () => {
    const { clock, runtime, telemetry, runner } = rig();
    const adapter = new TestDoubleConnectorAdapter(doubleDescriptor("health-ok", "rest"));
    const connectorId = await connect(runtime, adapter);

    const result = await runner.run({
      journeyRef: "health-ok-pass-through",
      mode: ExecutionMode.PASS_THROUGH_NATIVE,
      steps: journeySteps("health-ok"),
      connectorIds: [connectorId],
      requestedBy: PRINCIPAL,
      authorization: AUTH,
      idempotencySeed: "seed-health-ok",
    });
    expect(result.dispatch.journeyOutcome).toBe("succeeded");

    const view = buildConnectorHealthSurface({
      connectors: runtime.healthReport().map((entry) => ({
        connectorId: entry.connectorId,
        providerDisplayName: "Test Double Channel",
        health: entry.health,
      })),
      telemetry,
      generatedAt: utc(clock()),
    });

    const entry = view.entries.find((item) => item.connectorId === connectorId);
    expect(entry).toBeDefined();
    expect(entry?.health.status).toBe("healthy");
    expect(entry?.lastContact.lastJourneyOutcome).toBe("succeeded");
    expect(entry?.lastContact.lastJourneyAt).toBeTypeOf("string");
    expect(entry?.lastContact.lastCheckedAt).toBeTypeOf("string");
    expect(entry?.lastError).toBeUndefined();
    expect(entry?.recovery.actions).toEqual([]);
    expect(entry?.recentJourneys.length).toBe(1);
    expect(entry?.recentJourneys[0]?.mode).toBe("PASS_THROUGH_NATIVE");
    expect(entry?.recentJourneys[0]?.outcome).toBe("succeeded");
    expect(entry?.recentJourneys[0]?.blockedSteps).toEqual([]);
  });

  it("a FAILED-RECOVERABLE journey populates the typed error surface and a retry recovery action", async () => {
    const { clock, runtime, telemetry, runner } = rig();
    const adapter = new TestDoubleConnectorAdapter(doubleDescriptor("health-flaky", "rest"), {
      executeOutcome: {
        outcome: "failed-recoverable",
        note: "provider returned 503",
        providerStatePreserved: true,
        evidenceSummaries: ["provider 503 during orders sync"],
      },
    });
    const connectorId = await connect(runtime, adapter);

    const result = await runner.run({
      journeyRef: "health-flaky-pass-through",
      mode: ExecutionMode.PASS_THROUGH_NATIVE,
      steps: journeySteps("health-flaky"),
      connectorIds: [connectorId],
      requestedBy: PRINCIPAL,
      authorization: AUTH,
      idempotencySeed: "seed-health-flaky",
    });
    expect(result.dispatch.journeyOutcome).toBe("failed-recoverable");

    const view = buildConnectorHealthSurface({
      connectors: runtime.healthReport().map((entry) => ({
        connectorId: entry.connectorId,
        providerDisplayName: "Test Double Channel",
        health: entry.health,
      })),
      telemetry,
      generatedAt: utc(clock()),
    });

    const entry = view.entries.find((item) => item.connectorId === connectorId);
    expect(entry?.lastError?.errorClass).toBe("failed-recoverable");
    expect(entry?.lastError?.summary).toContain("health-flaky-pass-through");
    expect(entry?.lastError?.summary).toContain("failed-recoverable");
    expect(entry?.lastError?.stepRefs).toContain("step-sync-orders");
    expect(entry?.lastError?.evidence.length).toBeGreaterThan(0);
    const retry = entry?.recovery.actions.find((action) => action.kind === "retry-journey");
    expect(retry).toBeDefined();
    expect(retry?.targetSurfaceId).toBe("connector-studio");
  });

  it("a journey with NO CONNECTED INSTANCE is blocked with the kernel reason and surfaces error + recovery", async () => {
    const { clock, runtime, telemetry, runner } = rig();
    // Registered but NEVER connected: zero connected instances.
    const connector = runtime.register(
      new TestDoubleConnectorAdapter(doubleDescriptor("health-orphan", "rest")),
    );

    const result = await runner.run({
      journeyRef: "health-orphan-composed",
      mode: ExecutionMode.COMPOSED,
      steps: journeySteps("health-orphan"),
      connectorIds: [connector.connectorId],
      requestedBy: PRINCIPAL,
      authorization: AUTH,
      idempotencySeed: "seed-health-orphan",
    });
    expect(result.dispatch.journeyOutcome).toBe("failed-recoverable");
    expect(result.evidenceRecord.evidenceSummaries.join(" ")).toContain(
      "CATALOG_ONLY_NO_CONNECTED_INSTANCE",
    );

    const view = buildConnectorHealthSurface({
      connectors: runtime.healthReport().map((entry) => ({
        connectorId: entry.connectorId,
        providerDisplayName: "Test Double Channel",
        health: entry.health,
      })),
      telemetry,
      generatedAt: utc(clock()),
    });
    const entry = view.entries.find((item) => item.connectorId === connector.connectorId);
    // The journey's own OBSERVE stage probed the connector (healthy), but the
    // DECIDE stage found no connected instance for the step's capability —
    // the block is explicit, never a silent gap.
    expect(entry?.health.status).toBe("healthy");
    expect(entry?.lastError?.errorClass).toBe("failed-recoverable");
    expect(entry?.lastError?.stepRefs).toContain("step-sync-orders");
    const retry = entry?.recovery.actions.find((action) => action.kind === "retry-journey");
    expect(retry).toBeDefined();
  });

  it("a CUSTOMER-ACTION-REQUIRED health snapshot surfaces a typed reauthorize recovery action (notes verbatim)", async () => {
    const { clock, runtime, telemetry } = rig();
    const adapter = new TestDoubleConnectorAdapter(doubleDescriptor("health-reauth", "rest"), {
      probeResult: {
        status: "customer-action-required",
        customerActionNotes: ["provider session expired — log in again"],
        evidenceSummaries: ["provider reports session expired"],
      },
    });
    const connectorId = await connect(runtime, adapter);
    await runtime.observe(connectorId);

    const view = buildConnectorHealthSurface({
      connectors: runtime.healthReport().map((entry) => ({
        connectorId: entry.connectorId,
        providerDisplayName: "Test Double Channel",
        health: entry.health,
      })),
      telemetry,
      generatedAt: utc(clock()),
    });
    const entry = view.entries.find((item) => item.connectorId === connectorId);
    expect(entry?.health.status).toBe("customer-action-required");
    expect(entry?.health.customerActionNotes).toContain("provider session expired — log in again");
    const reauthorize = entry?.recovery.actions.find((action) => action.kind === "reauthorize");
    expect(reauthorize).toBeDefined();
    expect(reauthorize?.rationale).toContain("provider session expired — log in again");
    expect(reauthorize?.userLabel).toBeTypeOf("string");
  });

  it("an INCOMPLETE health probe renders UNKNOWN (never down) with a check-connection action", async () => {
    const { clock, runtime, telemetry } = rig();
    const adapter = new TestDoubleConnectorAdapter(doubleDescriptor("health-unknown", "rest"), {
      probeThrows: new Error("probe timed out"),
    });
    const connectorId = await connect(runtime, adapter);
    await runtime.observe(connectorId);

    const view = buildConnectorHealthSurface({
      connectors: runtime.healthReport().map((entry) => ({
        connectorId: entry.connectorId,
        providerDisplayName: "Test Double Channel",
        health: entry.health,
      })),
      telemetry,
      generatedAt: utc(clock()),
    });
    const entry = view.entries.find((item) => item.connectorId === connectorId);
    expect(entry?.health.status).toBe("unknown");
    expect(entry?.health.status).not.toBe("down");
    expect(entry?.recovery.actions.find((action) => action.kind === "reconnect")).toBeDefined();
  });

  it("every entry carries the full typed surface shape (status, last-contact, recovery, journeys)", async () => {
    const { clock, runtime, telemetry, runner } = rig();
    const adapter = new TestDoubleConnectorAdapter(doubleDescriptor("health-shape", "rest"));
    const connectorId = await connect(runtime, adapter);
    for (const mode of [ExecutionMode.PASS_THROUGH_NATIVE, ExecutionMode.COMPOSED]) {
      await runner.run({
        journeyRef: `health-shape-${mode}`,
        mode,
        steps: journeySteps("health-shape"),
        connectorIds: [connectorId],
        requestedBy: PRINCIPAL,
        authorization: AUTH,
        idempotencySeed: `seed-health-shape-${mode}`,
      });
    }

    const view = buildConnectorHealthSurface({
      connectors: runtime.healthReport().map((entry) => ({
        connectorId: entry.connectorId,
        providerDisplayName: "Test Double Channel",
        health: entry.health,
      })),
      telemetry,
      generatedAt: utc(clock()),
    });
    expect(view.entries.length).toBe(1);
    const entry = view.entries[0];
    if (entry === undefined) throw new Error("entry missing");
    expect(entry.connectorId).toBe(connectorId);
    expect(entry.providerDisplayName).toBe("Test Double Channel");
    expect(entry.health.status).toBe("healthy");
    expect(entry.lastContact.lastJourneyOutcome).toBe("succeeded");
    expect(entry.recovery.actions).toEqual([]);
    // Both execution-mode journeys are summarized, newest first.
    expect(entry.recentJourneys.length).toBe(2);
    const modes = entry.recentJourneys.map((journey) => journey.mode);
    expect(modes).toContain("PASS_THROUGH_NATIVE");
    expect(modes).toContain("COMPOSED");
    expect(view.generatedAt).toBeTypeOf("string");
  });
});
