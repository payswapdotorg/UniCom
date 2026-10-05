/**
 * Runtime test — Shopify adapter fixture-driven CI suite (W3-003
 * acceptance scenario 1): auth, happy path, pagination, rate-limit
 * backoff and error taxonomy against provider-faithful recorded
 * fixtures. The adapter is PRODUCTION code; the fixture player is the
 * clearly-marked TEST DOUBLE wired at the test boundary.
 */

import { describe, expect, it } from "vitest";
import { createShopifyAdapter, type ShopifyAdapter } from "../../src/runtime/providers/shopify";
import { ExecutionMode } from "@unicom/agent/capability";
import { permittedModesFor, assertModePermitted } from "../../src/runtime/providers/matrix";
import { asIdempotencyKey } from "../../src/runtime/ids";
import { adapterCredential, createProviderRig, type ProviderRig } from "../fixtures/providers/rig";
import {
  shopifyFixtureRoutes,
  SHOPIFY_ORDER_UNPROCESSABLE,
  SHOPIFY_SHOP_THROTTLED,
  SHOPIFY_SHOP_UNAUTHORIZED,
  SHOPIFY_INTERNAL_ERROR,
} from "../fixtures/providers/shopify-fixtures";
import { FixturePlayer } from "../fixtures/providers/player";

const ADAPTER_ID = "shopify-connors-store.myshopify.com";
const PERMISSIONS = ["read_products", "write_products", "read_orders", "write_orders"];

function rigAdapter(routes = shopifyFixtureRoutes): {
  adapter: ShopifyAdapter;
  player: FixturePlayer;
  rig: ProviderRig;
} {
  const rig = createProviderRig(routes, [
    ["payload-order-1", { currency: "USD", variantId: "80419992", quantity: "1", note: "fixture journey" }],
    ["payload-price-1", { productId: "632910392", price: "41.94" }],
    ["payload-price-bad", { productId: "632910392", price: 41.94 }],
  ]);
  const adapter = createShopifyAdapter({
    http: rig.player,
    vault: rig.vault,
    payloadResolver: rig.payloadResolver,
    clock: rig.clock,
    shopDomain: "connors-store.myshopify.com",
    sleeper: rig.sleeper.sleep,
  });
  return { adapter, player: rig.player, rig };
}

async function connect(
  rig: ProviderRig,
  adapter: ShopifyAdapter,
  connectorId: string,
  options: {
    capability?: string;
    permissions?: readonly string[];
    scope?: string;
    material?: string;
  } = {},
) {
  const sealed = rig.vault.seal(
    adapterCredential(ADAPTER_ID, "account-shopify-1", options.material ?? "shpat_fixture_token_1"),
  );
  return adapter.connect({
    connectorId: connectorId as never,
    accountRef: "account-shopify-1",
    sealedCredential: sealed,
    credentialScope: (options.scope ?? "read_products write_products read_orders write_orders") as never,
    grantedPermissions: options.permissions ?? PERMISSIONS,
    capabilityDefinitionId: options.capability,
  });
}

describe("Shopify adapter — fixture-driven CI (scenario 1)", () => {
  it("auth: valid token connects and binds matrix-permitted modes", async () => {
    const { adapter, player, rig } = rigAdapter();
    const material = "shpat_fixture_token_1";
    const outcome = await connect(rig, adapter, "connector-1-shopify", { material });
    expect(outcome.status).toBe("connected");
    if (outcome.status !== "connected") return;
    // Permission matrix, typed: Shopify permits ALL three modes.
    expect(outcome.connectedInstance.authorizedExecutionModes).toEqual([...permittedModesFor("shopify")]);
    expect(outcome.connectedInstance.commercialEligibility.supportedCurrencies).toEqual(["USD"]);
    // The auth probe carried the REAL Shopify auth header (presented at the boundary).
    expect(player.requests[0]?.headers["X-Shopify-Access-Token"]).toBe(material);
    expect(player.requests[0]?.path).toBe("/admin/api/2024-01/shop.json");
    expect(rig.vault.auditSurface()[0]?.presentations).toBe(1);
  });

  it("auth: invalid token → customer-action-required (401 taxonomy)", async () => {
    const rig = createProviderRig([
      { method: "GET", pathPattern: /shop\.json$/, responses: [SHOPIFY_SHOP_UNAUTHORIZED] },
    ]);
    const adapter = createShopifyAdapter({
      http: rig.player, vault: rig.vault, payloadResolver: rig.payloadResolver,
      clock: rig.clock, shopDomain: "connors-store.myshopify.com", sleeper: rig.sleeper.sleep,
    });
    const sealed = rig.vault.seal(adapterCredential(ADAPTER_ID, "account-1", "shpat_invalid"));
    const outcome = await adapter.connect({
      connectorId: "connector-2" as never, accountRef: "account-1", sealedCredential: sealed,
      credentialScope: "read_products" as never, grantedPermissions: PERMISSIONS,
    });
    expect(outcome.status).toBe("customer-action-required");
    if (outcome.status === "customer-action-required") {
      expect(outcome.note).toContain("authentication-invalid");
    }
  });

  it("auth: 5xx provider state → unknown (UNKNOWN ≠ FAILED)", async () => {
    const rig = createProviderRig([
      { method: "GET", pathPattern: /shop\.json$/, responses: [{ status: 503, body: "unavailable" }] },
    ]);
    const adapter = createShopifyAdapter({
      http: rig.player, vault: rig.vault, payloadResolver: rig.payloadResolver,
      clock: rig.clock, shopDomain: "connors-store.myshopify.com", sleeper: rig.sleeper.sleep,
    });
    const sealed = rig.vault.seal(adapterCredential(ADAPTER_ID, "account-1", "shpat_x"));
    const outcome = await adapter.connect({
      connectorId: "connector-3" as never, accountRef: "account-1", sealedCredential: sealed,
      credentialScope: "read_products" as never, grantedPermissions: PERMISSIONS,
    });
    expect(outcome.status).toBe("unknown");
  });

  it("happy path: observation NOMINAL with untrusted payload; create-order succeeds with provider object id", async () => {
    const { adapter, rig } = rigAdapter();
    await connect(rig, adapter, "connector-1-shopify", { capability: "commerce.orders.execute" });
    const observation = await adapter.observe();
    expect(observation.observation.status).toBe("NOMINAL");
    expect(observation.observation.freshness).toBe("CURRENT");
    expect(observation.observation.providerStateCode).toBe("OK");
    expect(observation.untrustedPayloads?.[0]?.kind).toBe("product-description");

    const outcome = await adapter.execute({
      commandRef: "create-order",
      idempotencyKey: asIdempotencyKey("shopify-order-key-1"),
      connectedInstanceId: "shopify-instance-connector-1-shopify-commerce.orders.execute",
      payloadRef: "payload-order-1",
    });
    expect(outcome.outcome).toBe("succeeded");
    expect(outcome.providerObjectIds).toEqual(["450789469"]);
    expect(outcome.providerStatePreserved).toBe(true);
    expect(outcome.evidenceSummaries?.[0]).toContain("shopify");
  });

  it("pagination: follows real Link/page_info cursors across pages", async () => {
    const { adapter, player, rig } = rigAdapter();
    await connect(rig, adapter, "connector-1-shopify");
    const pages = await adapter.listAllProducts(2, 10);
    expect(pages).toHaveLength(2);
    expect(pages[0]?.nextCursor).toBe("hijgklmn");
    expect(pages[0]?.productIds).toEqual(["632910392", "921728736"]);
    expect(pages[1]?.requestPath).toContain("page_info=hijgklmn");
    expect(pages[1]?.nextCursor).toBeUndefined();
    expect(pages[1]?.productIds).toEqual(["439654642", "697304814"]);
    // Exactly two provider calls — the cursor trail, no speculative fetches.
    const productCalls = player.requestsFor("GET", /products\.json/);
    expect(productCalls).toHaveLength(2);
  });

  it("rate-limit backoff: 429 honors Retry-After, retries, then succeeds", async () => {
    const rig = createProviderRig([
      { method: "GET", pathPattern: /shop\.json$/, responses: [SHOPIFY_SHOP_THROTTLED, { status: 200, body: JSON.stringify({ shop: { currency: "USD", country_code: "US" } }) }] },
    ]);
    const adapter = createShopifyAdapter({
      http: rig.player, vault: rig.vault, payloadResolver: rig.payloadResolver,
      clock: rig.clock, shopDomain: "connors-store.myshopify.com", sleeper: rig.sleeper.sleep,
    });
    const sealed = rig.vault.seal(adapterCredential(ADAPTER_ID, "account-1", "shpat_t"));
    const outcome = await adapter.connect({
      connectorId: "connector-4" as never, accountRef: "account-1", sealedCredential: sealed,
      credentialScope: "read_products" as never, grantedPermissions: PERMISSIONS,
    });
    expect(outcome.status).toBe("connected");
    // Retry-After: 2 (seconds) → the planned delay is provider-derived (2000 ms).
    expect(rig.sleeper.delays).toEqual([2000]);
    // The 429 attempt + the retried 200 both hit the provider.
    expect(rig.player.requestsFor("GET", /shop\.json/)).toHaveLength(2);
  });

  it("rate-limit backoff: exhausted retries → failed-recoverable rate-limited taxonomy", async () => {
    const rig = createProviderRig(
      [
        { method: "GET", pathPattern: /shop\.json$/, responses: [{ status: 200, body: JSON.stringify({ shop: {} }) }] },
        { method: "POST", pathPattern: /orders\.json$/, responses: [SHOPIFY_SHOP_THROTTLED] },
      ],
      [["payload-order-1", { currency: "USD", variantId: "80419992", quantity: "1" }]],
    );
    const adapter = createShopifyAdapter({
      http: rig.player, vault: rig.vault, payloadResolver: rig.payloadResolver,
      clock: rig.clock, shopDomain: "connors-store.myshopify.com", sleeper: rig.sleeper.sleep,
    });
    const sealed = rig.vault.seal(adapterCredential(ADAPTER_ID, "account-1", "shpat_t"));
    await adapter.connect({
      connectorId: "connector-5" as never, accountRef: "account-1", sealedCredential: sealed,
      credentialScope: "read_products write_orders" as never, grantedPermissions: PERMISSIONS,
    });
    const outcome = await adapter.execute({
      commandRef: "create-order",
      idempotencyKey: asIdempotencyKey("shopify-throttled-key"),
      connectedInstanceId: "shopify-instance-connector-5-commerce.catalog.observe",
      payloadRef: "payload-order-1",
    });
    expect(outcome.outcome).toBe("failed-recoverable");
    expect(outcome.note).toContain("rate-limited");
    // 4 attempts total under the Shopify policy (maxAttempts: 4).
    expect(rig.player.requestsFor("POST", /orders\.json/)).toHaveLength(4);
    expect(rig.sleeper.delays).toEqual([2000, 2000, 2000]);
  });

  it("error taxonomy: 422 → validation-failed; 401 → failed-terminal; 5xx → provider-internal with unknown preservation", async () => {
    const rig = createProviderRig(
      [
        { method: "GET", pathPattern: /shop\.json$/, responses: [{ status: 200, body: JSON.stringify({ shop: {} }) }] },
        { method: "POST", pathPattern: /orders\.json$/, responses: [SHOPIFY_ORDER_UNPROCESSABLE] },
        { method: "PUT", pathPattern: /products\/\d+\.json$/, responses: [SHOPIFY_SHOP_UNAUTHORIZED] },
        { method: "GET", pathPattern: /products\.json\?limit=3$/, responses: [SHOPIFY_INTERNAL_ERROR] },
      ],
      [
        ["payload-order-1", { currency: "USD", variantId: "80419992", quantity: "1" }],
        ["payload-price-1", { productId: "632910392", price: "41.94" }],
      ],
    );
    const adapter = createShopifyAdapter({
      http: rig.player, vault: rig.vault, payloadResolver: rig.payloadResolver,
      clock: rig.clock, shopDomain: "connors-store.myshopify.com", sleeper: rig.sleeper.sleep,
    });
    const sealed = rig.vault.seal(adapterCredential(ADAPTER_ID, "account-1", "shpat_tax"));
    await adapter.connect({
      connectorId: "connector-6" as never, accountRef: "account-1", sealedCredential: sealed,
      credentialScope: "read_products write_orders write_products" as never, grantedPermissions: PERMISSIONS,
    });
    const instanceId = "shopify-instance-connector-6-commerce.catalog.observe";
    const unprocessable = await adapter.execute({
      commandRef: "create-order", idempotencyKey: asIdempotencyKey("tax-422"),
      connectedInstanceId: instanceId, payloadRef: "payload-order-1",
    });
    expect(unprocessable.outcome).toBe("failed-recoverable");
    expect(unprocessable.note).toContain("validation-failed");
    expect(unprocessable.note).toContain("line_items");

    const unauthorized = await adapter.execute({
      commandRef: "update-product", idempotencyKey: asIdempotencyKey("tax-401"),
      connectedInstanceId: instanceId, payloadRef: "payload-price-1",
    });
    expect(unauthorized.outcome).toBe("failed-terminal");
    expect(unauthorized.note).toContain("authentication-invalid");

    const observation = await adapter.observe();
    expect(observation.observation.status).toBe("UNKNOWN");
  });

  it("money is an exact decimal string: float prices rejected pre-provider", async () => {
    const { adapter, player, rig } = rigAdapter();
    await connect(rig, adapter, "connector-1-shopify");
    const outcome = await adapter.execute({
      commandRef: "update-product",
      idempotencyKey: asIdempotencyKey("shopify-float-money"),
      connectedInstanceId: "shopify-instance-connector-1-shopify-commerce.catalog.observe",
      payloadRef: "payload-price-bad",
    });
    expect(outcome.outcome).toBe("failed-recoverable");
    expect(outcome.note).toContain('field "price"');
    expect(player.requestsFor("PUT", /products/)).toHaveLength(0);
  });

  it("idempotency: a repeated key replays the recorded outcome with NO second provider call", async () => {
    const { adapter, player, rig } = rigAdapter();
    await connect(rig, adapter, "connector-1-shopify", { capability: "commerce.orders.execute" });
    const input = {
      commandRef: "create-order",
      idempotencyKey: asIdempotencyKey("shopify-idem-key"),
      connectedInstanceId: "shopify-instance-connector-1-shopify-commerce.orders.execute",
      payloadRef: "payload-order-1",
    };
    const first = await adapter.execute(input);
    const second = await adapter.execute(input);
    expect(first.outcome).toBe("succeeded");
    expect(second.outcome).toBe("succeeded");
    expect(second.note).toContain("idempotent replay");
    expect(player.requestsFor("POST", /orders\.json/)).toHaveLength(1);
  });

  it("capability scope: missing write_orders blocks the command BEFORE any provider call", async () => {
    const { adapter, player, rig } = rigAdapter();
    const outcome = await connect(rig, adapter, "connector-7", {
      permissions: ["read_products"],
      scope: "read_products",
    });
    expect(outcome.status).toBe("connected");
    const blocked = await adapter.execute({
      commandRef: "create-order",
      idempotencyKey: asIdempotencyKey("shopify-blocked"),
      connectedInstanceId: "shopify-instance-connector-7-commerce.catalog.observe",
      payloadRef: "payload-order-1",
    });
    expect(blocked.outcome).toBe("failed-recoverable");
    expect(blocked.note).toContain('requires Shopify permission "write_orders"');
    expect(blocked.providerStatePreserved).toBe(true);
    expect(player.requestsFor("POST", /orders\.json/)).toHaveLength(0);
  });

  it("permission matrix: Shopify permits all three canonical modes", () => {
    expect(permittedModesFor("shopify")).toEqual([
      ExecutionMode.PASS_THROUGH_NATIVE,
      ExecutionMode.COMPOSED,
      ExecutionMode.OPTIMIZED_MULTI_PROVIDER,
    ]);
    for (const mode of permittedModesFor("shopify")) {
      expect(assertModePermitted("shopify", mode).permitted).toBe(true);
    }
  });
});
