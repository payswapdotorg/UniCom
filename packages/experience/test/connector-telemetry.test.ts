/**
 * Runtime test — connector telemetry & journey evidence (W3-003
 * acceptance scenario 7): every journey emits a queryable evidence
 * record (adapter, mode, outcome, timing), queryable from the combined
 * health surface, with per-mode and per-adapter rollups.
 */

import { describe, expect, it } from "vitest";
import { ExecutionMode } from "@unicom/agent/capability";
import { createConnectorTelemetry, createConnectorHealthSurface } from "../src/runtime/connector/telemetry";
import { createConnectorRuntime } from "../src/runtime/connector/runtime";
import { createCredentialVault } from "../src/runtime/connector/vault";
import { createProviderJourneyRunner, type ProviderJourneyRequest } from "../src/runtime/connector/journey";
import { createShopifyAdapter } from "../src/runtime/providers/shopify";
import { CAPABILITY_ORDERS_EXECUTE } from "../src/runtime/providers/capabilities";
import { asAuthorizationContextRef, asPrincipalRef } from "../src/runtime/ids";
import { FixturePlayer, PayloadStore } from "./fixtures/providers/player";
import { shopifyFixtureRoutes } from "./fixtures/providers/shopify-fixtures";

function createRig() {
  const clock = (() => {
    let ticks = 0;
    return () => new Date(Date.parse("2026-10-06T11:00:00Z") + ticks++ * 1000).toISOString();
  })();
  const vault = createCredentialVault({ clock });
  const payloads = new PayloadStore([
    ["telemetry-order-1", { currency: "USD", variantId: "80419992", quantity: "1" }],
  ]);
  const runtime = createConnectorRuntime({ vault, clock });
  const telemetry = createConnectorTelemetry({ clock });
  const runner = createProviderJourneyRunner({ runtime, telemetry, clock });
  const adapter = createShopifyAdapter({
    http: new FixturePlayer(shopifyFixtureRoutes), vault, payloadResolver: payloads, clock,
    shopDomain: "connors-store.myshopify.com", sleeper: async () => undefined,
  });
  const connector = runtime.register(adapter);
  return { runtime, telemetry, runner, connector, clock, adapterId: adapter.descriptor.adapterId };
}

const journeyRequest = (rig: ReturnType<typeof createRig>, mode: ExecutionMode, ref: string): ProviderJourneyRequest => ({
  journeyRef: ref,
  mode,
  steps: [
    {
      stepRef: "step-create-order",
      capabilityDefinitionId: CAPABILITY_ORDERS_EXECUTE.capabilityDefinitionId as never,
      preconditions: {
        requiresConnectedInstance: true,
        requiredCredentialScope: "read_products write_orders" as never,
        requiredPermissions: ["read_products", "write_orders"] as never,
        requiresCommercialTermsAccepted: true,
        requiresCurrentObservation: true,
      },
      commandRef: "create-order",
      payloadRef: "telemetry-order-1",
    },
  ],
  connectorIds: [rig.connector.connectorId as never],
  requestedBy: asPrincipalRef("principal-telemetry-1"),
  authorization: asAuthorizationContextRef("auth-telemetry-1"),
  idempotencySeed: `seed-${ref}`,
});

async function connectShopify(rig: ReturnType<typeof createRig>): Promise<void> {
  await rig.runtime.connect({
    connectorId: rig.connector.connectorId as never,
    accountRef: "account-telemetry",
    credential: {
      kind: "api-secret",
      material: "shpat_telemetry_token",
      forAdapterId: rig.adapterId,
      forAccountRef: "account-telemetry",
    },
    grantedPermissions: ["read_products", "write_products", "read_orders", "write_orders"],
    credentialScope: "read_products write_products read_orders write_orders",
    capabilityDefinitionId: CAPABILITY_ORDERS_EXECUTE.capabilityDefinitionId,
  });
}

describe("Connector telemetry — journey evidence (scenario 7)", () => {
  it("every journey emits an evidence record with adapter, mode, outcome and timing", async () => {
    const rig = createRig();
    await connectShopify(rig);
    const firstResult = await rig.runner.run(journeyRequest(rig, ExecutionMode.PASS_THROUGH_NATIVE, "telemetry-journey-1"));
    const second = await rig.runner.run(journeyRequest(rig, ExecutionMode.COMPOSED, "telemetry-journey-2"));
    expect(firstResult.evidenceRecord.journeyRef).toBe("telemetry-journey-1");
    expect(rig.telemetry.journeyCount).toBe(2);
    const [recordOne, recordTwo] = rig.telemetry.journeyEvidence();
    expect(recordOne?.journeyRef).toBe("telemetry-journey-1");
    expect(recordOne?.adapterIds).toEqual([rig.adapterId]);
    expect(recordOne?.mode).toBe(ExecutionMode.PASS_THROUGH_NATIVE);
    expect(recordOne?.outcome).toBe("succeeded");
    expect(recordOne?.startedAt).toMatch(/^2026-10-06T11:00:\d\d/);
    expect(recordOne?.endedAt >= recordOne?.startedAt).toBe(true);
    expect(recordOne?.stepOutcomes).toHaveLength(1);
    expect(recordTwo?.mode).toBe(ExecutionMode.COMPOSED);
    expect(second.evidenceRecord.correlationId).toContain("telemetry-journey-2");
  });

  it("evidence records are queryable by adapter, mode, outcome and time window", async () => {
    const rig = createRig();
    await connectShopify(rig);
    await rig.runner.run(journeyRequest(rig, ExecutionMode.PASS_THROUGH_NATIVE, "q-journey-1"));
    await rig.runner.run(journeyRequest(rig, ExecutionMode.PASS_THROUGH_NATIVE, "q-journey-2"));
    await rig.runner.run(journeyRequest(rig, ExecutionMode.OPTIMIZED_MULTI_PROVIDER, "q-journey-3"));

    expect(rig.telemetry.journeyEvidence({ adapterId: rig.adapterId as never })).toHaveLength(3);
    expect(rig.telemetry.journeyEvidence({ mode: ExecutionMode.PASS_THROUGH_NATIVE })).toHaveLength(2);
    expect(rig.telemetry.journeyEvidence({ mode: ExecutionMode.OPTIMIZED_MULTI_PROVIDER })).toHaveLength(1);
    expect(rig.telemetry.journeyEvidence({ outcome: "succeeded" })).toHaveLength(3);
    expect(rig.telemetry.journeyEvidence({ adapterId: "other-adapter" as never })).toHaveLength(0);
    // Time-window queries (startedAt ordering over the fixed clock).
    const all = rig.telemetry.journeyEvidence();
    const firstStart = all[0]?.startedAt ?? "";
    expect(rig.telemetry.journeyEvidence({ since: firstStart })).toHaveLength(3);
    expect(rig.telemetry.journeyEvidence({ until: firstStart })).toHaveLength(1);
  });

  it("execution-mode telemetry and per-adapter rollups aggregate correctly", async () => {
    const rig = createRig();
    await connectShopify(rig);
    await rig.runner.run(journeyRequest(rig, ExecutionMode.PASS_THROUGH_NATIVE, "r-journey-1"));
    await rig.runner.run(journeyRequest(rig, ExecutionMode.COMPOSED, "r-journey-2"));
    await rig.runner.run(journeyRequest(rig, ExecutionMode.OPTIMIZED_MULTI_PROVIDER, "r-journey-3"));

    const modeTelemetry = rig.telemetry.executionModeTelemetry();
    expect(modeTelemetry.map((entry) => entry.mode).sort()).toEqual([
      ExecutionMode.COMPOSED,
      ExecutionMode.OPTIMIZED_MULTI_PROVIDER,
      ExecutionMode.PASS_THROUGH_NATIVE,
    ].sort());
    for (const entry of modeTelemetry) {
      expect(entry.journeys).toBe(1);
      expect(entry.succeeded).toBe(1);
      expect(entry.unknown).toBe(0);
    }
    const adapterTelemetry = rig.telemetry.adapterTelemetry();
    expect(adapterTelemetry).toHaveLength(1);
    expect(adapterTelemetry[0]?.adapterId).toBe(rig.adapterId);
    expect(adapterTelemetry[0]?.journeys).toBe(3);
    expect(adapterTelemetry[0]?.lastOutcome).toBe("succeeded");
    expect(adapterTelemetry[0]?.lastJourneyAt).toBeDefined();
  });

  it("journey evidence is queryable from the combined health surface", async () => {
    const rig = createRig();
    await connectShopify(rig);
    await rig.runner.run(journeyRequest(rig, ExecutionMode.PASS_THROUGH_NATIVE, "h-journey-1"));
    await rig.runtime.observe(rig.connector.connectorId as never);

    const surface = createConnectorHealthSurface({
      healthSource: () => rig.runtime.healthReport(),
      adapterOf: (connectorId) =>
        rig.runtime.connector(connectorId)?.adapter.descriptor.adapterId as never,
      telemetry: rig.telemetry,
    });
    // Health report: per-connector snapshots with the adapter labeled.
    const health = surface.healthReport();
    expect(health).toHaveLength(1);
    expect(health[0]?.adapterId).toBe(rig.adapterId);
    expect(health[0]?.health.status).toBe("healthy");
    // Journey evidence + rollups from the SAME surface.
    expect(surface.journeyEvidence({ mode: ExecutionMode.PASS_THROUGH_NATIVE })).toHaveLength(1);
    expect(surface.executionModeTelemetry()[0]?.journeys).toBe(1);
    expect(surface.adapterTelemetry()[0]?.adapterId).toBe(rig.adapterId);
  });

  it("evidence records never carry credential-shaped material (model-context law)", async () => {
    const rig = createRig();
    await connectShopify(rig);
    await rig.runner.run(journeyRequest(rig, ExecutionMode.PASS_THROUGH_NATIVE, "c-journey-1"));
    const records = rig.telemetry.journeyEvidence();
    const serialized = JSON.stringify(records);
    // The sealed token never appears in evidence (deep value scan).
    expect(serialized).not.toContain("shpat_telemetry_token");
    expect(rig.runtime.executionLog().every((entry) => entry.outcome === "succeeded")).toBe(true);
  });
});
