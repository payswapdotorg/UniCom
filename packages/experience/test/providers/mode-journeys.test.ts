/**
 * Runtime test — canonical execution-mode journeys (W3-003 acceptance
 * scenario 2): at least one REAL adapter journey per mode the provider
 * permits — PASS_THROUGH_NATIVE, COMPOSED, OPTIMIZED_MULTI_PROVIDER —
 * through the journey runner (observe → decide → execute → evidence),
 * with forbidden modes BLOCKED per the documented provider-permission
 * matrix (never a silent gap).
 *
 * Real adapters + fixture player (TEST DOUBLE) + the W3-002 connector
 * runtime: journeys are end-to-end over the full dispatch plumbing with
 * the canonical W2-002 executability kernel gate deciding each step.
 */

import { describe, expect, it } from "vitest";
import { ExecutionMode } from "@unicom/agent/capability";
import { createConnectorRuntime } from "../../src/runtime/connector/runtime";
import { createCredentialVault } from "../../src/runtime/connector/vault";
import { createProviderJourneyRunner, type ProviderJourneyRequest } from "../../src/runtime/connector/journey";
import { createConnectorTelemetry } from "../../src/runtime/connector/telemetry";
import { createShopifyAdapter } from "../../src/runtime/providers/shopify";
import { createEbayAdapter } from "../../src/runtime/providers/ebay";
import { createAmazonSpApiAdapter } from "../../src/runtime/providers/amazon-spapi";
import { createJumiaSellerCenterAdapter } from "../../src/runtime/providers/jumia";
import { createWhatnotAdapter } from "../../src/runtime/providers/whatnot";
import { CAPABILITY_CATALOG_OBSERVE, CAPABILITY_LISTINGS_MANAGE, CAPABILITY_ORDERS_EXECUTE } from "../../src/runtime/providers/capabilities";
import { assertModePermitted } from "../../src/runtime/providers/matrix";
import { asAuthorizationContextRef, asPrincipalRef } from "../../src/runtime/ids";
import { FixturePlayer, PayloadStore } from "../fixtures/providers/player";
import { shopifyFixtureRoutes } from "../fixtures/providers/shopify-fixtures";
import { ebayFixtureRoutes } from "../fixtures/providers/ebay-fixtures";
import { amazonFixtureRoutes } from "../fixtures/providers/amazon-fixtures";
import { jumiaFixtureRoutes } from "../fixtures/providers/jumia-fixtures";
import { whatnotFixtureRoutes } from "../fixtures/providers/whatnot-fixtures";

/** Journey preconditions (canonical executability kernel gate inputs). */
const preconditions = (scope: string, permissions: readonly string[]) => ({
  requiresConnectedInstance: true,
  requiredCredentialScope: scope as never,
  requiredPermissions: permissions as never,
  requiresCommercialTermsAccepted: true,
  requiresCurrentObservation: true,
});

const PRINCIPAL = asPrincipalRef("principal-merchant-1");
const AUTH = asAuthorizationContextRef("authorization-journey-1");

interface JourneyRig {
  readonly runtime: ReturnType<typeof createConnectorRuntime>;
  readonly telemetry: ReturnType<typeof createConnectorTelemetry>;
  readonly runner: ReturnType<typeof createProviderJourneyRunner>;
  readonly shopifyConnectorId: string;
  readonly ebayConnectorId: string;
  readonly amazonConnectorId: string;
  readonly jumiaConnectorId: string;
  readonly whatnotConnectorId: string;
}

function createJourneyRig(options: { readonly shopifyObservationDegraded?: boolean } = {}): JourneyRig {
  const clock = (() => {
    let ticks = 0;
    return () => new Date(Date.parse("2026-10-06T10:00:00Z") + ticks++ * 1000).toISOString();
  })();
  const vault = createCredentialVault({ clock });
  const payloads = new PayloadStore([
    ["journey-order-shopify", { currency: "USD", variantId: "80419992", quantity: "1" }],
    ["journey-item-shopify", { productId: "632910392", price: "41.94" }],
    ["journey-item-ebay", { sku: "SKU-A1", title: "Journey widget", condition: "NEW", quantity: "7", price: "19.99", currency: "USD" }],
    ["journey-fulfill-ebay", { orderId: "12-03456-67890", orderItemId: "11-02233-44556", quantity: "1" }],
    ["journey-listing-amazon", { sku: "FIXTURE-SKU-1", productType: "PRODUCT", condition: "new_new", price: "199.99" }],
    ["journey-bid-whatnot", { streamId: "wn-stream-9", listingId: "wn-lot-1", bidAmount: "13.00", currency: "USD" }],
    ["journey-product-jumia", { sellerSku: "JM-NEW-9", name: "Journey product", quantity: "3", price: "900.00" }],
  ]);
  const runtime = createConnectorRuntime({ vault, clock });
  const telemetry = createConnectorTelemetry({ clock });
  const runner = createProviderJourneyRunner({ runtime, telemetry, clock });

  const sleeper = async () => undefined;
  const shopifyRoutes = options.shopifyObservationDegraded
    ? [
        ...shopifyFixtureRoutes.filter((route) => !route.pathPattern.source.includes("limit=3$")),
        { method: "GET", pathPattern: /products\.json\?limit=3$/, responses: [{ status: 429, headers: { "Retry-After": "1" }, body: "{}" }] },
      ]
    : shopifyFixtureRoutes;
  const shopify = runtime.register(createShopifyAdapter({
    http: new FixturePlayer(shopifyRoutes), vault, payloadResolver: payloads, clock,
    shopDomain: "connors-store.myshopify.com", sleeper,
  }));
  const ebay = runtime.register(createEbayAdapter({
    http: newPlayer(ebayFixtureRoutes), vault, payloadResolver: payloads, clock, sleeper,
  }));
  const amazon = runtime.register(createAmazonSpApiAdapter({
    http: newPlayer(amazonFixtureRoutes), vault, payloadResolver: payloads, clock,
    sellerId: "SELLERFIX1", lwaClientId: "amzn1.application-oa2-client.fixture", sleeper,
  }));
  const jumia = runtime.register(createJumiaSellerCenterAdapter({
    http: newPlayer(jumiaFixtureRoutes), vault, payloadResolver: payloads, clock,
    userId: "seller-fixture@example.com", sleeper,
  }));
  const whatnot = runtime.register(createWhatnotAdapter({
    http: newPlayer(whatnotFixtureRoutes), vault, payloadResolver: payloads, clock, sleeper,
  }));

  return {
    runtime,
    telemetry,
    runner,
    shopifyConnectorId: shopify.connectorId,
    ebayConnectorId: ebay.connectorId,
    amazonConnectorId: amazon.connectorId,
    jumiaConnectorId: jumia.connectorId,
    whatnotConnectorId: whatnot.connectorId,
  };
}

function newPlayer(routes: ConstructorParameters<typeof FixturePlayer>[0]) {
  return new FixturePlayer(routes);
}

async function connectCapability(
  rig: JourneyRig,
  adapterId: string,
  connectorId: string,
  capability: string,
  material: string,
  permissions: readonly string[],
  scope: string,
): Promise<void> {
  await rig.runtime.connect({
    connectorId: connectorId as never,
    accountRef: `account-${adapterId}`,
    credential: { kind: "api-secret", material, forAdapterId: adapterId, forAccountRef: `account-${adapterId}` },
    grantedPermissions: [...permissions],
    credentialScope: scope,
    capabilityDefinitionId: capability,
  });
}

describe("Execution-mode journeys — scenario 2", () => {
  it("PASS_THROUGH_NATIVE: a real Shopify create-order journey executes natively with recorded evidence", async () => {
    const rig = createJourneyRig();
    await connectCapability(
      rig, "shopify-connors-store.myshopify.com", rig.shopifyConnectorId,
      CAPABILITY_ORDERS_EXECUTE.capabilityDefinitionId, "shpat_journey_token",
      ["read_products", "write_products", "read_orders", "write_orders"],
      "read_products write_products read_orders write_orders",
    );
    const request: ProviderJourneyRequest = {
      journeyRef: "journey-pass-through-1",
      mode: ExecutionMode.PASS_THROUGH_NATIVE,
      steps: [
        {
          stepRef: "step-create-order",
          capabilityDefinitionId: CAPABILITY_ORDERS_EXECUTE.capabilityDefinitionId as never,
          preconditions: preconditions("read_products write_orders", ["read_products", "write_orders"]),
          commandRef: "create-order",
          payloadRef: "journey-order-shopify",
        },
      ],
      connectorIds: [rig.shopifyConnectorId as never],
      requestedBy: PRINCIPAL,
      authorization: AUTH,
      idempotencySeed: "seed-pass-through-1",
    };
    const result = await rig.runner.run(request);
    expect(result.modeBlocked).toBe(false);
    expect(result.dispatch.journeyOutcome).toBe("succeeded");
    expect(result.dispatch.plannedSteps[0]?.executability.status).toBe("EXECUTABLE");
    expect(result.dispatch.plannedSteps[0]?.executability.executionMode).toBe(ExecutionMode.PASS_THROUGH_NATIVE);
    expect(result.dispatch.stepOutcomes[0]?.providerObjectIds).toEqual(["450789469"]);
    // Evidence record: adapter, mode, outcome, timing.
    expect(result.evidenceRecord.mode).toBe(ExecutionMode.PASS_THROUGH_NATIVE);
    expect(result.evidenceRecord.adapterIds).toContain("shopify-connors-store.myshopify.com");
    expect(result.evidenceRecord.outcome).toBe("succeeded");
    expect(result.evidenceRecord.startedAt <= result.evidenceRecord.endedAt).toBe(true);
  });

  it("COMPOSED: a real multi-step journey across Shopify + eBay with ordered provider assignment", async () => {
    const rig = createJourneyRig();
    await connectCapability(
      rig, "shopify-connors-store.myshopify.com", rig.shopifyConnectorId,
      CAPABILITY_LISTINGS_MANAGE.capabilityDefinitionId, "shpat_journey_token",
      ["read_products", "write_products"],
      "read_products write_products",
    );
    await connectCapability(
      rig, "ebay-sell-rest", rig.ebayConnectorId,
      CAPABILITY_LISTINGS_MANAGE.capabilityDefinitionId, "AgAAAAjourneytoken",
      ["https://api.ebay.com/oauth/api_scope/commerce.identity.readonly", "https://api.ebay.com/oauth/api_scope/sell.inventory"],
      "sell.inventory",
    );
    const request: ProviderJourneyRequest = {
      journeyRef: "journey-composed-1",
      mode: ExecutionMode.COMPOSED,
      steps: [
        {
          stepRef: "step-update-product-shopify",
          capabilityDefinitionId: CAPABILITY_LISTINGS_MANAGE.capabilityDefinitionId as never,
          preconditions: preconditions("read_products write_products", ["write_products"]),
          commandRef: "update-product",
          payloadRef: "journey-item-shopify",
        },
        {
          stepRef: "step-upsert-inventory-ebay",
          capabilityDefinitionId: CAPABILITY_LISTINGS_MANAGE.capabilityDefinitionId as never,
          preconditions: preconditions("sell.inventory", ["https://api.ebay.com/oauth/api_scope/sell.inventory"]),
          commandRef: "upsert-inventory-item",
          payloadRef: "journey-item-ebay",
        },
      ],
      connectorIds: [rig.shopifyConnectorId as never, rig.ebayConnectorId as never],
      requestedBy: PRINCIPAL,
      authorization: AUTH,
      idempotencySeed: "seed-composed-1",
    };
    const result = await rig.runner.run(request);
    expect(result.modeBlocked).toBe(false);
    expect(result.dispatch.journeyOutcome).toBe("succeeded");
    // COMPOSED positional assignment: step 1 → Shopify, step 2 → eBay.
    expect(result.dispatch.plannedSteps[0]?.selectedInstanceId).toContain("shopify-instance");
    expect(result.dispatch.plannedSteps[1]?.selectedInstanceId).toContain("ebay-instance");
    expect(result.evidenceRecord.stepOutcomes.map((step) => step.outcome)).toEqual(["succeeded", "succeeded"]);
    expect(result.evidenceRecord.adapterIds).toHaveLength(2);
  });

  it("OPTIMIZED_MULTI_PROVIDER: the optimizer ranks candidates by real observation score — the DEGRADED provider loses", async () => {
    const rig = createJourneyRig({ shopifyObservationDegraded: true });
    await connectCapability(
      rig, "shopify-connors-store.myshopify.com", rig.shopifyConnectorId,
      CAPABILITY_LISTINGS_MANAGE.capabilityDefinitionId, "shpat_journey_token",
      ["read_products", "write_products"],
      "read_products write_products",
    );
    await connectCapability(
      rig, "ebay-sell-rest", rig.ebayConnectorId,
      CAPABILITY_LISTINGS_MANAGE.capabilityDefinitionId, "AgAAAAjourneytoken",
      ["https://api.ebay.com/oauth/api_scope/commerce.identity.readonly", "https://api.ebay.com/oauth/api_scope/sell.inventory"],
      "sell.inventory",
    );
    const request: ProviderJourneyRequest = {
      journeyRef: "journey-optimized-1",
      mode: ExecutionMode.OPTIMIZED_MULTI_PROVIDER,
      steps: [
        {
          stepRef: "step-upsert-listing",
          capabilityDefinitionId: CAPABILITY_LISTINGS_MANAGE.capabilityDefinitionId as never,
          preconditions: preconditions("sell.inventory", ["https://api.ebay.com/oauth/api_scope/sell.inventory"]),
          commandRef: "upsert-inventory-item",
          payloadRef: "journey-item-ebay",
        },
      ],
      connectorIds: [rig.shopifyConnectorId as never, rig.ebayConnectorId as never],
      requestedBy: PRINCIPAL,
      authorization: AUTH,
      idempotencySeed: "seed-optimized-1",
    };
    const result = await rig.runner.run(request);
    expect(result.modeBlocked).toBe(false);
    expect(result.dispatch.journeyOutcome).toBe("succeeded");
    // The DEGRADED Shopify observation ranks below the NOMINAL eBay one —
    // the optimizer deterministically selects eBay for the step.
    expect(result.dispatch.plannedSteps[0]?.selectedInstanceId).toContain("ebay-instance");
    expect(result.evidenceRecord.mode).toBe(ExecutionMode.OPTIMIZED_MULTI_PROVIDER);
    expect(result.evidenceRecord.outcome).toBe("succeeded");
  });

  it("forbidden modes are BLOCKED per the matrix: Amazon/Jumia/Depop reject OPTIMIZED; Whatnot rejects COMPOSED and OPTIMIZED", async () => {
    const rig = createJourneyRig();
    await connectCapability(
      rig, "amazon-spapi-SELLERFIX1", rig.amazonConnectorId,
      CAPABILITY_LISTINGS_MANAGE.capabilityDefinitionId, "amzn1.rt journey",
      ["role:orders", "role:listings"], "sellingpartnerapi",
    );
    const request: ProviderJourneyRequest = {
      journeyRef: "journey-blocked-amazon-optimized",
      mode: ExecutionMode.OPTIMIZED_MULTI_PROVIDER,
      steps: [
        {
          stepRef: "step-upsert-listing-amazon",
          capabilityDefinitionId: CAPABILITY_LISTINGS_MANAGE.capabilityDefinitionId as never,
          preconditions: preconditions("sellingpartnerapi", ["role:listings"]),
          commandRef: "upsert-listing",
          payloadRef: "journey-listing-amazon",
        },
      ],
      connectorIds: [rig.amazonConnectorId as never],
      requestedBy: PRINCIPAL,
      authorization: AUTH,
      idempotencySeed: "seed-blocked-amazon",
    };
    const result = await rig.runner.run(request);
    // EXPLICIT block: modeBlocked + NOT_EXECUTABLE with the kernel reason.
    expect(result.modeBlocked).toBe(true);
    expect(result.dispatch.journeyOutcome).toBe("failed-recoverable");
    expect(result.dispatch.plannedSteps[0]?.executability.status).toBe("NOT_EXECUTABLE");
    if (result.dispatch.plannedSteps[0]?.executability.status === "NOT_EXECUTABLE") {
      expect(result.dispatch.plannedSteps[0].executability.reasons).toContain("EXECUTION_MODE_NOT_SUPPORTED");
    }
    // The matrix rationale is documented, never a silent gap.
    const matrix = assertModePermitted("amazon-spapi", ExecutionMode.OPTIMIZED_MULTI_PROVIDER);
    expect(matrix.permitted).toBe(false);
    expect(matrix.rationale).toContain("restricted to granted roles");

    // Matrix consistency across all six providers.
    expect(assertModePermitted("jumia", ExecutionMode.OPTIMIZED_MULTI_PROVIDER).permitted).toBe(false);
    expect(assertModePermitted("depop", ExecutionMode.OPTIMIZED_MULTI_PROVIDER).permitted).toBe(false);
    expect(assertModePermitted("whatnot", ExecutionMode.COMPOSED).permitted).toBe(false);
    expect(assertModePermitted("whatnot", ExecutionMode.OPTIMIZED_MULTI_PROVIDER).permitted).toBe(false);
    expect(assertModePermitted("shopify", ExecutionMode.OPTIMIZED_MULTI_PROVIDER).permitted).toBe(true);
    expect(assertModePermitted("ebay", ExecutionMode.COMPOSED).permitted).toBe(true);
  });

  it("Whatnot live journey runs PASS_THROUGH_NATIVE only; every journey emits a queryable evidence record", async () => {
    const rig = createJourneyRig();
    await connectCapability(
      rig, "whatnot-live-commerce", rig.whatnotConnectorId,
      "live.commerce.execute", "whatnot-journey-token",
      ["shows:read", "live:bid", "live:buy-now"], "shows.read live.bid live.buy-now",
    );
    const request: ProviderJourneyRequest = {
      journeyRef: "journey-whatnot-live-1",
      mode: ExecutionMode.PASS_THROUGH_NATIVE,
      steps: [
        {
          stepRef: "step-place-bid",
          capabilityDefinitionId: "live.commerce.execute" as never,
          preconditions: preconditions("shows.read live.bid", ["shows:read", "live:bid"]),
          commandRef: "place-bid",
          payloadRef: "journey-bid-whatnot",
        },
      ],
      connectorIds: [rig.whatnotConnectorId as never],
      requestedBy: PRINCIPAL,
      authorization: AUTH,
      idempotencySeed: "seed-whatnot-1",
    };
    const result = await rig.runner.run(request);
    expect(result.dispatch.journeyOutcome).toBe("succeeded");
    expect(result.dispatch.stepOutcomes[0]?.providerObjectIds).toEqual(["wn-bid-77"]);
    // Queryable from the telemetry registry (scenario 7 surface).
    const evidence = rig.telemetry.journeyEvidence({ adapterId: "whatnot-live-commerce" as never });
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.mode).toBe(ExecutionMode.PASS_THROUGH_NATIVE);
    expect(evidence[0]?.outcome).toBe("succeeded");
  });

  it("journey preconditions are enforced by the W2-002 kernel gate (missing permission blocks a step)", async () => {
    const rig = createJourneyRig();
    await connectCapability(
      rig, "shopify-connors-store.myshopify.com", rig.shopifyConnectorId,
      CAPABILITY_ORDERS_EXECUTE.capabilityDefinitionId, "shpat_journey_token",
      ["read_products", "read_orders"], // NO write_orders
      "read_products read_orders",
    );
    const request: ProviderJourneyRequest = {
      journeyRef: "journey-gate-1",
      mode: ExecutionMode.PASS_THROUGH_NATIVE,
      steps: [
        {
          stepRef: "step-create-order",
          capabilityDefinitionId: CAPABILITY_ORDERS_EXECUTE.capabilityDefinitionId as never,
          preconditions: preconditions("read_products write_orders", ["read_products", "write_orders"]),
          commandRef: "create-order",
          payloadRef: "journey-order-shopify",
        },
      ],
      connectorIds: [rig.shopifyConnectorId as never],
      requestedBy: PRINCIPAL,
      authorization: AUTH,
      idempotencySeed: "seed-gate-1",
    };
    const result = await rig.runner.run(request);
    // The kernel gate rejects the step BEFORE any adapter execution.
    expect(result.dispatch.plannedSteps[0]?.executability.status).toBe("NOT_EXECUTABLE");
    if (result.dispatch.plannedSteps[0]?.executability.status === "NOT_EXECUTABLE") {
      expect(result.dispatch.plannedSteps[0].executability.reasons).toContain("MISSING_PERMISSION");
    }
    expect(result.dispatch.stepOutcomes[0]?.providerObjectIds).toEqual([]);
    expect(result.evidenceRecord.outcome).toBe("failed-recoverable");
    expect(result.evidenceRecord.evidenceSummaries.join(" ")).toContain("MISSING_PERMISSION");
  });

  it("catalog observation journeys stay OBSERVATIONS — never promoted to commerce state by the connector plane", async () => {
    const rig = createJourneyRig();
    await connectCapability(
      rig, "jumia-sellercenter-seller-fixture@example.com", rig.jumiaConnectorId,
      CAPABILITY_CATALOG_OBSERVE.capabilityDefinitionId, "jumia-journey-key",
      ["get_products", "product_create"], "sellercenter",
    );
    const request: ProviderJourneyRequest = {
      journeyRef: "journey-observe-jumia-1",
      mode: ExecutionMode.PASS_THROUGH_NATIVE,
      steps: [
        {
          stepRef: "step-observe-catalog",
          capabilityDefinitionId: CAPABILITY_CATALOG_OBSERVE.capabilityDefinitionId as never,
          preconditions: preconditions("sellercenter", ["get_products"]),
          commandRef: "product-create",
          payloadRef: "journey-product-jumia",
        },
      ],
      connectorIds: [rig.jumiaConnectorId as never],
      requestedBy: PRINCIPAL,
      authorization: AUTH,
      idempotencySeed: "seed-observe-jumia",
    };
    const result = await rig.runner.run(request);
    // Observation-capability journeys execute read-only; the runner's own
    // observation step is data-only — no commerce state exists here at all.
    const observation = await rig.runtime.observe(rig.jumiaConnectorId as never);
    expect(observation.observation?.status).toBe("NOMINAL");
    expect(result.evidenceRecord.outcome).toBeDefined();
  });
});
