/**
 * Runtime test — eBay adapter fixture-driven CI suite (W3-003 acceptance
 * scenario 1): auth, happy path, pagination (offset/limit + total),
 * rate-limit backoff and error taxonomy against recorded fixtures.
 */

import { describe, expect, it } from "vitest";
import { createEbayAdapter, type EbayAdapter } from "../../src/runtime/providers/ebay";
import { ExecutionMode } from "@unicom/agent/capability";
import { permittedModesFor } from "../../src/runtime/providers/matrix";
import { asIdempotencyKey } from "../../src/runtime/ids";
import { adapterCredential, createProviderRig, type ProviderRig } from "../fixtures/providers/rig";
import {
  ebayFixtureRoutes,
  EBAY_IDENTITY_UNAUTHORIZED,
  EBAY_THROTTLED,
  EBAY_STATE_CONFLICT,
} from "../fixtures/providers/ebay-fixtures";

const ADAPTER_ID = "ebay-sell-rest";
const SELL_FULFILLMENT = "https://api.ebay.com/oauth/api_scope/sell.fulfillment";
const PERMISSIONS = [
  "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  SELL_FULFILLMENT,
];

function rigAdapter(routes = ebayFixtureRoutes): { adapter: EbayAdapter; rig: ProviderRig } {
  const rig = createProviderRig(routes, [
    ["payload-fulfill-1", { orderId: "12-03456-67890", orderItemId: "11-02233-44556", quantity: "1" }],
    ["payload-item-1", { sku: "SKU-A1", title: "Fixture widget", condition: "NEW", quantity: "7", price: "19.99", currency: "USD" }],
    ["payload-item-bad", { sku: "SKU-A1", title: "Fixture widget", condition: "NEW", quantity: "7", price: 19.99, currency: "USD" }],
  ]);
  const adapter = createEbayAdapter({
    http: rig.player, vault: rig.vault, payloadResolver: rig.payloadResolver,
    clock: rig.clock, sleeper: rig.sleeper.sleep, marketplace: "EBAY_US",
  });
  return { adapter, rig };
}

async function connect(rig: ProviderRig, adapter: EbayAdapter, connectorId: string, options: { capability?: string; permissions?: readonly string[] } = {}) {
  const sealed = rig.vault.seal(adapterCredential(ADAPTER_ID, "account-ebay-1", "AgAAAA1fixture2token3"));
  return adapter.connect({
    connectorId: connectorId as never,
    accountRef: "account-ebay-1",
    sealedCredential: sealed,
    credentialScope: "sell.inventory sell.fulfillment" as never,
    grantedPermissions: options.permissions ?? PERMISSIONS,
    capabilityDefinitionId: options.capability,
  });
}

describe("eBay adapter — fixture-driven CI (scenario 1)", () => {
  it("auth: valid OAuth user token connects; Bearer header carried on the identity probe", async () => {
    const { adapter, rig } = rigAdapter();
    const material = "AgAAAA1fixture2token3";
    const outcome = await connect(rig, adapter, "connector-1-ebay");
    expect(outcome.status).toBe("connected");
    if (outcome.status !== "connected") return;
    expect(outcome.connectedInstance.authorizedExecutionModes).toEqual([...permittedModesFor("ebay")]);
    expect(rig.player.requests[0]?.headers.Authorization).toBe(`Bearer ${material}`);
    expect(rig.player.requests[0]?.headers["X-EBAY-C-MARKETPLACE-ID"]).toBe("EBAY_US");
    expect(outcome.connectedInstance.providerImplementationId).toBe("impl:ebay:commerce.catalog.observe");
  });

  it("auth: expired token → customer-action-required (401 taxonomy)", async () => {
    const rig = createProviderRig([
      { method: "GET", pathPattern: /identity\/v1\/user\/$/, responses: [EBAY_IDENTITY_UNAUTHORIZED] },
    ]);
    const adapter = createEbayAdapter({
      http: rig.player, vault: rig.vault, payloadResolver: rig.payloadResolver,
      clock: rig.clock, sleeper: rig.sleeper.sleep,
    });
    const sealed = rig.vault.seal(adapterCredential(ADAPTER_ID, "account-1", "expired-token"));
    const outcome = await adapter.connect({
      connectorId: "connector-2" as never, accountRef: "account-1", sealedCredential: sealed,
      credentialScope: "sell.inventory" as never, grantedPermissions: PERMISSIONS,
    });
    expect(outcome.status).toBe("customer-action-required");
  });

  it("happy path: observation NOMINAL; create-fulfillment succeeds with the provider fulfillmentId", async () => {
    const { adapter, rig } = rigAdapter();
    await connect(rig, adapter, "connector-1-ebay", { capability: "commerce.orders.execute" });
    const observation = await adapter.observe();
    expect(observation.observation.status).toBe("NOMINAL");
    expect(observation.observation.providerStateDetail).toContain("total 8");
    expect(observation.untrustedPayloads?.[0]?.rawText).toContain("SKU-A1");

    const outcome = await adapter.execute({
      commandRef: "create-fulfillment",
      idempotencyKey: asIdempotencyKey("ebay-fulfill-key-1"),
      connectedInstanceId: "ebay-instance-connector-1-ebay-commerce.orders.execute",
      payloadRef: "payload-fulfill-1",
    });
    expect(outcome.outcome).toBe("succeeded");
    expect(outcome.providerObjectIds).toEqual(["5000012345"]);
    expect(outcome.providerStatePreserved).toBe(true);
  });

  it("pagination: offset/limit windows advance by limit until offset ≥ total", async () => {
    const { adapter, rig } = rigAdapter();
    await connect(rig, adapter, "connector-1-ebay");
    const pages = await adapter.listAllInventory(3, 10);
    expect(pages).toHaveLength(3);
    expect(pages.map((page) => page.offset)).toEqual([0, 3, 6]);
    expect(pages[2]?.skus).toEqual(["SKU-C1", "SKU-C2"]);
    expect(pages[2]?.total).toBe(8);
    expect(rig.player.requestsFor("GET", /inventory_items/)).toHaveLength(3);
  });

  it("rate-limit backoff: 429 → Retry-After (1 s) honored → retry succeeds", async () => {
    const rig = createProviderRig([
      { method: "GET", pathPattern: /identity\/v1\/user\/$/, responses: [EBAY_THROTTLED, { status: 200, body: "{}" }] },
    ]);
    const adapter = createEbayAdapter({
      http: rig.player, vault: rig.vault, payloadResolver: rig.payloadResolver,
      clock: rig.clock, sleeper: rig.sleeper.sleep,
    });
    const sealed = rig.vault.seal(adapterCredential(ADAPTER_ID, "account-1", "tok"));
    const outcome = await adapter.connect({
      connectorId: "connector-3" as never, accountRef: "account-1", sealedCredential: sealed,
      credentialScope: "sell.inventory" as never, grantedPermissions: PERMISSIONS,
    });
    expect(outcome.status).toBe("connected");
    expect(rig.sleeper.delays).toEqual([1000]);
    expect(rig.player.requestsFor("GET", /identity/)).toHaveLength(2);
  });

  it("rate-limit backoff: exhausted → failed-recoverable rate-limited, provider never executed", async () => {
    const rig = createProviderRig([
      { method: "GET", pathPattern: /identity\/v1\/user\/$/, responses: [{ status: 200, body: "{}" }] },
      { method: "PUT", pathPattern: /inventory_item\/[^/]+$/, responses: [EBAY_THROTTLED] },
    ], [["payload-item-1", { sku: "SKU-A1", title: "t", condition: "NEW", quantity: "7", price: "19.99", currency: "USD" }]]);
    const adapter = createEbayAdapter({
      http: rig.player, vault: rig.vault, payloadResolver: rig.payloadResolver,
      clock: rig.clock, sleeper: rig.sleeper.sleep,
    });
    const sealed = rig.vault.seal(adapterCredential(ADAPTER_ID, "account-1", "tok"));
    await adapter.connect({
      connectorId: "connector-4" as never, accountRef: "account-1", sealedCredential: sealed,
      credentialScope: "sell.inventory" as never, grantedPermissions: PERMISSIONS,
    });
    const outcome = await adapter.execute({
      commandRef: "upsert-inventory-item",
      idempotencyKey: asIdempotencyKey("ebay-throttled"),
      connectedInstanceId: "ebay-instance-connector-4-commerce.catalog.observe",
      payloadRef: "payload-item-1",
    });
    expect(outcome.outcome).toBe("failed-recoverable");
    expect(outcome.note).toContain("rate-limited");
    expect(rig.player.requestsFor("PUT", /inventory_item/)).toHaveLength(4);
  });

  it("error taxonomy: 409 → state-conflict (failed-recoverable)", async () => {
    const rig = createProviderRig([
      { method: "GET", pathPattern: /identity\/v1\/user\/$/, responses: [{ status: 200, body: "{}" }] },
      { method: "PUT", pathPattern: /inventory_item\/[^/]+$/, responses: [EBAY_STATE_CONFLICT] },
    ], [["payload-item-1", { sku: "SKU-A1", title: "t", condition: "NEW", quantity: "7", price: "19.99", currency: "USD" }]]);
    const adapter = createEbayAdapter({
      http: rig.player, vault: rig.vault, payloadResolver: rig.payloadResolver,
      clock: rig.clock, sleeper: rig.sleeper.sleep,
    });
    const sealed = rig.vault.seal(adapterCredential(ADAPTER_ID, "account-1", "tok"));
    await adapter.connect({
      connectorId: "connector-5" as never, accountRef: "account-1", sealedCredential: sealed,
      credentialScope: "sell.inventory" as never, grantedPermissions: PERMISSIONS,
    });
    const outcome = await adapter.execute({
      commandRef: "upsert-inventory-item",
      idempotencyKey: asIdempotencyKey("ebay-conflict"),
      connectedInstanceId: "ebay-instance-connector-5-commerce.catalog.observe",
      payloadRef: "payload-item-1",
    });
    expect(outcome.outcome).toBe("failed-recoverable");
    expect(outcome.note).toContain("state-conflict");
  });

  it("money is an exact decimal string: float prices rejected pre-provider", async () => {
    const { adapter, rig } = rigAdapter();
    await connect(rig, adapter, "connector-1-ebay");
    const outcome = await adapter.execute({
      commandRef: "upsert-inventory-item",
      idempotencyKey: asIdempotencyKey("ebay-float"),
      connectedInstanceId: "ebay-instance-connector-1-ebay-commerce.catalog.observe",
      payloadRef: "payload-item-bad",
    });
    expect(outcome.outcome).toBe("failed-recoverable");
    expect(outcome.note).toContain('"price"');
    expect(rig.player.requestsFor("PUT", /inventory_item/)).toHaveLength(0);
  });

  it("idempotency: repeated key replays without a second provider call", async () => {
    const { adapter, rig } = rigAdapter();
    await connect(rig, adapter, "connector-1-ebay", { capability: "commerce.orders.execute" });
    const input = {
      commandRef: "create-fulfillment",
      idempotencyKey: asIdempotencyKey("ebay-idem"),
      connectedInstanceId: "ebay-instance-connector-1-ebay-commerce.orders.execute",
      payloadRef: "payload-fulfill-1",
    };
    await adapter.execute(input);
    const replay = await adapter.execute(input);
    expect(replay.note).toContain("idempotent replay");
    expect(rig.player.requestsFor("POST", /shipping_fulfillment/)).toHaveLength(1);
  });

  it("capability scope: missing sell.fulfillment scope blocks before any provider call", async () => {
    const { adapter, rig } = rigAdapter();
    await connect(rig, adapter, "connector-6", {
      permissions: ["https://api.ebay.com/oauth/api_scope/commerce.identity.readonly", "https://api.ebay.com/oauth/api_scope/sell.inventory"],
    });
    const blocked = await adapter.execute({
      commandRef: "create-fulfillment",
      idempotencyKey: asIdempotencyKey("ebay-blocked"),
      connectedInstanceId: "ebay-instance-connector-6-commerce.catalog.observe",
      payloadRef: "payload-fulfill-1",
    });
    expect(blocked.outcome).toBe("failed-recoverable");
    expect(blocked.note).toContain(SELL_FULFILLMENT);
    expect(blocked.providerStatePreserved).toBe(true);
    expect(rig.player.requestsFor("POST", /shipping_fulfillment/)).toHaveLength(0);
  });

  it("permission matrix: eBay permits all three canonical modes", () => {
    expect(permittedModesFor("ebay")).toEqual([
      ExecutionMode.PASS_THROUGH_NATIVE,
      ExecutionMode.COMPOSED,
      ExecutionMode.OPTIMIZED_MULTI_PROVIDER,
    ]);
  });
});
