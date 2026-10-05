/**
 * Runtime test — capability-scoped adapter authority & provider state
 * preservation (W3-003 acceptance scenario 8): adapters never mutate
 * provider state outside the granted capability scope, with the W2-002
 * kernel gate enforcement asserted at the dispatch layer AND the
 * adapter's own boundary check asserted at the provider-call layer.
 */

import { describe, expect, it } from "vitest";
import { ExecutionMode } from "@unicom/agent/capability";
import { evaluateCapabilityExecutability } from "@unicom/agent/capability";
import { createConnectorRuntime } from "../src/runtime/connector/runtime";
import { createCredentialVault } from "../src/runtime/connector/vault";
import { createShopifyAdapter } from "../src/runtime/providers/shopify";
import { createEbayAdapter } from "../src/runtime/providers/ebay";
import { CAPABILITY_ORDERS_EXECUTE } from "../src/runtime/providers/capabilities";
import { asIdempotencyKey } from "../src/runtime/ids";
import { FixturePlayer, PayloadStore } from "./fixtures/providers/player";
import { shopifyFixtureRoutes } from "./fixtures/providers/shopify-fixtures";
import { ebayFixtureRoutes } from "./fixtures/providers/ebay-fixtures";

function createRig(routes: Parameters<typeof shopifyFixtureRoutes.slice>[0], payloads: [string, Record<string, unknown>][] = []) {
  const clock = (() => {
    let ticks = 0;
    return () => new Date(Date.parse("2026-10-06T12:00:00Z") + ticks++ * 1000).toISOString();
  })();
  const vault = createCredentialVault({ clock });
  const payloadResolver = new PayloadStore(payloads);
  const player = new FixturePlayer(routes);
  const runtime = createConnectorRuntime({ vault, clock });
  return { clock, vault, payloadResolver, player, runtime };
}

describe("Capability-scope enforcement & provider state preservation (scenario 8)", () => {
  it("the W2-002 kernel gate rejects execution when a required permission is NOT granted (typed executability)", async () => {
    const rig = createRig(shopifyFixtureRoutes, [
      ["scope-order-1", { currency: "USD", variantId: "80419992", quantity: "1" }],
    ]);
    const adapter = createShopifyAdapter({
      http: rig.player, vault: rig.vault, payloadResolver: rig.payloadResolver, clock: rig.clock,
      shopDomain: "connors-store.myshopify.com", sleeper: async () => undefined,
    });
    const connector = rig.runtime.register(adapter);
    const sealed = rig.vault.seal({
      kind: "api-secret", material: "shpat_scope_token",
      forAdapterId: adapter.descriptor.adapterId, forAccountRef: "account-scope",
    });
    await rig.runtime.connect({
      connectorId: connector.connectorId,
      accountRef: "account-scope",
      credential: { kind: "api-secret", material: "shpat_scope_token", forAdapterId: adapter.descriptor.adapterId, forAccountRef: "account-scope" },
      grantedPermissions: ["read_products", "read_orders"], // NO write_orders
      credentialScope: "read_products read_orders",
      capabilityDefinitionId: CAPABILITY_ORDERS_EXECUTE.capabilityDefinitionId,
    });
    expect(sealed).toBeDefined();

    // Kernel gate, directly: the connected instance + a current observation
    // are STILL not executable without the write permission.
    const instance = rig.runtime.connector(connector.connectorId)?.connectedInstances[0];
    const observation = await adapter.observe();
    const executability = evaluateCapabilityExecutability({
      preconditions: {
        requiresConnectedInstance: true,
        requiredCredentialScope: "read_products write_orders" as never,
        requiredPermissions: ["read_products", "write_orders"] as never,
        requiresCommercialTermsAccepted: true,
        requiresCurrentObservation: true,
      },
      connectedInstance: instance,
      observation: observation.observation,
      requestedExecutionMode: ExecutionMode.PASS_THROUGH_NATIVE,
    });
    expect(executability.status).toBe("NOT_EXECUTABLE");
    if (executability.status === "NOT_EXECUTABLE") {
      expect(executability.reasons).toContain("MISSING_PERMISSION");
    }
  });

  it("adapter-boundary scope block: no provider call occurs and provider state is preserved", async () => {
    const rig = createRig(shopifyFixtureRoutes, [
      ["scope-order-1", { currency: "USD", variantId: "80419992", quantity: "1" }],
    ]);
    const adapter = createShopifyAdapter({
      http: rig.player, vault: rig.vault, payloadResolver: rig.payloadResolver, clock: rig.clock,
      shopDomain: "connors-store.myshopify.com", sleeper: async () => undefined,
    });
    const connector = rig.runtime.register(adapter);
    const connected = await rig.runtime.connect({
      connectorId: connector.connectorId,
      accountRef: "account-scope",
      credential: { kind: "api-secret", material: "shpat_scope_token", forAdapterId: adapter.descriptor.adapterId, forAccountRef: "account-scope" },
      grantedPermissions: ["read_products", "read_orders"],
      credentialScope: "read_products read_orders",
      capabilityDefinitionId: CAPABILITY_ORDERS_EXECUTE.capabilityDefinitionId,
    });
    expect(connected.lifecycle).toBe("connected");
    const instanceId = connected.connectedInstances[0]?.connectedInstanceId ?? "";

    const outcome = await adapter.execute({
      commandRef: "create-order",
      idempotencyKey: asIdempotencyKey("scope-blocked-order"),
      connectedInstanceId: instanceId,
      payloadRef: "scope-order-1",
    });
    expect(outcome.outcome).toBe("failed-recoverable");
    expect(outcome.note).toContain('permission "write_orders"');
    expect(outcome.providerStatePreserved).toBe(true);
    // ZERO consequential provider calls: only the auth probe happened.
    expect(rig.player.requestsFor("POST", /orders\.json/)).toHaveLength(0);
    expect(rig.player.requests.every((call) => call.method === "GET")).toBe(true);
  });

  it("successful scoped execution reports provider state preserved; ambiguous 5xx reports UNKNOWN, never guessed", async () => {
    const rig = createRig([
      { method: "GET", pathPattern: /shop\.json$/, responses: [{ status: 200, body: JSON.stringify({ shop: { currency: "USD" } }) }] },
      { method: "POST", pathPattern: /orders\.json$/, responses: [{ status: 201, body: JSON.stringify({ order: { id: 450789469 } }) }] },
      { method: "PUT", pathPattern: /products\/\d+\.json$/, responses: [{ status: 500, body: "{}" }] },
    ], [
      ["scope-order-1", { currency: "USD", variantId: "80419992", quantity: "1" }],
      ["scope-price-1", { productId: "632910392", price: "41.94" }],
    ]);
    const adapter = createShopifyAdapter({
      http: rig.player, vault: rig.vault, payloadResolver: rig.payloadResolver, clock: rig.clock,
      shopDomain: "connors-store.myshopify.com", sleeper: async () => undefined,
    });
    const connector = rig.runtime.register(adapter);
    const connected = await rig.runtime.connect({
      connectorId: connector.connectorId,
      accountRef: "account-scope-ok",
      credential: { kind: "api-secret", material: "shpat_scope_ok", forAdapterId: adapter.descriptor.adapterId, forAccountRef: "account-scope-ok" },
      grantedPermissions: ["read_products", "write_products", "read_orders", "write_orders"],
      credentialScope: "read_products write_products read_orders write_orders",
      capabilityDefinitionId: CAPABILITY_ORDERS_EXECUTE.capabilityDefinitionId,
    });
    const instanceId = connected.connectedInstances[0]?.connectedInstanceId ?? "";

    const success = await adapter.execute({
      commandRef: "create-order", idempotencyKey: asIdempotencyKey("scope-ok-order"),
      connectedInstanceId: instanceId, payloadRef: "scope-order-1",
    });
    expect(success.outcome).toBe("succeeded");
    expect(success.providerStatePreserved).toBe(true);

    // A 5xx during a consequential PUT leaves provider state AMBIGUOUS —
    // "unknown", never a guessed "preserved" and never collapsed to failure.
    const ambiguous = await adapter.execute({
      commandRef: "update-product", idempotencyKey: asIdempotencyKey("scope-ambiguous"),
      connectedInstanceId: instanceId, payloadRef: "scope-price-1",
    });
    expect(ambiguous.outcome).toBe("failed-recoverable");
    expect(ambiguous.providerStatePreserved).toBe("unknown");
  });

  it("eBay adapter holds only canonical W2-vocabulary capability definitions (no second vocabulary)", () => {
    const rig = createRig(ebayFixtureRoutes);
    const adapter = createEbayAdapter({
      http: rig.player, vault: rig.vault, payloadResolver: rig.payloadResolver, clock: rig.clock,
      sleeper: async () => undefined,
    });
    for (const definition of adapter.descriptor.capabilityDefinitions) {
      // Canonical structural law: transport-neutral catalog entries with
      // explicit execution modes, typed by @unicom/agent/capability.
      expect(definition.transportNeutral).toBe(true);
      expect(definition.supportedExecutionModes.length).toBeGreaterThan(0);
      expect(definition.capabilityDefinitionId).toMatch(/^(commerce|live)\./);
    }
    for (const implementation of adapter.descriptor.providerImplementations) {
      // Implementation modes are the matrix ∩ capability modes — the typed
      // form of the documented permission matrix.
      expect(implementation.providerId).toBe("ebay");
      expect(implementation.transports.length).toBeGreaterThan(0);
    }
  });

  it("runtime execution evidence records provider state preservation for every executed command", async () => {
    const rig = createRig(shopifyFixtureRoutes, [
      ["scope-order-1", { currency: "USD", variantId: "80419992", quantity: "1" }],
    ]);
    const adapter = createShopifyAdapter({
      http: rig.player, vault: rig.vault, payloadResolver: rig.payloadResolver, clock: rig.clock,
      shopDomain: "connors-store.myshopify.com", sleeper: async () => undefined,
    });
    const connector = rig.runtime.register(adapter);
    await rig.runtime.connect({
      connectorId: connector.connectorId,
      accountRef: "account-evidence",
      credential: { kind: "api-secret", material: "shpat_evidence", forAdapterId: adapter.descriptor.adapterId, forAccountRef: "account-evidence" },
      grantedPermissions: ["read_products", "write_orders"],
      credentialScope: "read_products write_orders",
      capabilityDefinitionId: CAPABILITY_ORDERS_EXECUTE.capabilityDefinitionId,
    });
    const { evidence } = await rig.runtime.execute(
      {
        requestId: "request-scope-1",
        connectorId: connector.connectorId,
        capabilityInstanceRef: connectedInstanceIdOf(rig, connector.connectorId),
        transportId: "rest",
        commandRef: "create-order",
        idempotencyKey: asIdempotencyKey("scope-evidence-order"),
        authorization: "authorization-scope-1" as never,
        requestedAt: rig.clock(),
      },
      { requestedBy: "principal-scope" as never, payloadRef: "scope-order-1" },
    );
    expect(evidence.outcome).toBe("succeeded");
    expect(evidence.providerStatePreserved).toBe(true);
    expect(evidence.providerObjectIds).toEqual(["450789469"]);
    expect(evidence.capabilityRefs.length).toBeGreaterThan(0);
    expect(evidence.taskId).toMatch(/^task-/);
  });
});

function connectedInstanceIdOf(rig: ReturnType<typeof createRig>, connectorId: string): string {
  const instance = rig.runtime.connector(connectorId as never)?.connectedInstances[0];
  if (instance === undefined) throw new Error("no connected instance");
  return instance.connectedInstanceId;
}
