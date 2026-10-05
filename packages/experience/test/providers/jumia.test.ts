/**
 * Runtime test — Jumia Seller Center adapter fixture-driven CI suite
 * (W3-003 acceptance scenario 1): HMAC-signed auth, happy path, page
 * windows + TotalProducts pagination, throttle backoff and the SC-family
 * error taxonomy (HTTP layer AND in-band ErrorResponse.Head) against
 * recorded fixtures.
 */

import { describe, expect, it } from "vitest";
import { createJumiaSellerCenterAdapter, signSellerCenterRequest, type JumiaSellerCenterAdapter } from "../../src/runtime/providers/jumia";
import { ExecutionMode } from "@unicom/agent/capability";
import { assertModePermitted, permittedModesFor } from "../../src/runtime/providers/matrix";
import { asIdempotencyKey } from "../../src/runtime/ids";
import { adapterCredential, createProviderRig, type ProviderRig } from "../fixtures/providers/rig";
import {
  jumiaFixtureRoutes,
  JUMIA_UNAUTHORIZED,
  JUMIA_THROTTLED,
  JUMIA_INBAND_SIGNATURE_ERROR,
} from "../fixtures/providers/jumia-fixtures";

const ADAPTER_ID = "jumia-sellercenter-seller-fixture@example.com";
const PERMISSIONS = ["get_products", "set_status_to_ready_to_ship", "product_create"];

function rigAdapter(routes = jumiaFixtureRoutes): { adapter: JumiaSellerCenterAdapter; rig: ProviderRig } {
  const rig = createProviderRig(routes, [
    ["payload-rts-1", { orderItemId: "fixture-order-item-1" }],
    ["payload-product-1", { sellerSku: "JM-NEW-1", name: "Fixture new product", quantity: "5", price: "2500.00" }],
  ]);
  const adapter = createJumiaSellerCenterAdapter({
    http: rig.player, vault: rig.vault, payloadResolver: rig.payloadResolver,
    clock: rig.clock, userId: "seller-fixture@example.com", sleeper: rig.sleeper.sleep,
  });
  return { adapter, rig };
}

async function connect(rig: ProviderRig, adapter: JumiaSellerCenterAdapter, connectorId: string, options: { capability?: string; permissions?: readonly string[] } = {}) {
  const sealed = rig.vault.seal(adapterCredential(ADAPTER_ID, "account-jumia-1", "jumia-api-key-fixture"));
  return adapter.connect({
    connectorId: connectorId as never,
    accountRef: "account-jumia-1",
    sealedCredential: sealed,
    credentialScope: "sellercenter" as never,
    grantedPermissions: options.permissions ?? PERMISSIONS,
    capabilityDefinitionId: options.capability,
  });
}

describe("Jumia Seller Center adapter — fixture-driven CI (scenario 1)", () => {
  it("auth: signed GetProducts probe connects; the request carries the real SC signature scheme", async () => {
    const { adapter, rig } = rigAdapter();
    const outcome = await connect(rig, adapter, "connector-1-jumia");
    expect(outcome.status).toBe("connected");
    if (outcome.status !== "connected") return;
    expect(outcome.connectedInstance.authorizedExecutionModes).toEqual([...permittedModesFor("jumia")]);
    const probe = rig.player.requests[0];
    expect(probe?.path).toContain("Action=GetProducts");
    expect(probe?.path).toContain("UserID=seller-fixture%40example.com");
    // The Signature param equals the documented SC HMAC over sorted params.
    const query = new URLSearchParams(probe?.path.slice(2) ?? "");
    const params: Record<string, string> = {};
    for (const [key, value] of query.entries()) {
      if (key !== "Signature") params[key] = value;
    }
    expect(query.get("Signature")).toBe(signSellerCenterRequest("jumia-api-key-fixture", params));
    expect(outcome.connectedInstance.commercialEligibility.supportedCurrencies).toContain("NGN");
  });

  it("auth: HTTP 401 → customer-action-required", async () => {
    const rig = createProviderRig([
      { method: "GET", pathPattern: /Action=GetProducts/, responses: [JUMIA_UNAUTHORIZED] },
    ]);
    const adapter = createJumiaSellerCenterAdapter({
      http: rig.player, vault: rig.vault, payloadResolver: rig.payloadResolver,
      clock: rig.clock, userId: "seller-fixture@example.com", sleeper: rig.sleeper.sleep,
    });
    const sealed = rig.vault.seal(adapterCredential(ADAPTER_ID, "account-1", "bad-key"));
    const outcome = await adapter.connect({
      connectorId: "connector-2" as never, accountRef: "account-1", sealedCredential: sealed,
      credentialScope: "sellercenter" as never, grantedPermissions: PERMISSIONS,
    });
    expect(outcome.status).toBe("customer-action-required");
  });

  it("auth: in-band ErrorResponse (signature error) → customer-action-required, code preserved verbatim", async () => {
    const rig = createProviderRig([
      { method: "GET", pathPattern: /Action=GetProducts/, responses: [JUMIA_INBAND_SIGNATURE_ERROR] },
    ]);
    const adapter = createJumiaSellerCenterAdapter({
      http: rig.player, vault: rig.vault, payloadResolver: rig.payloadResolver,
      clock: rig.clock, userId: "seller-fixture@example.com", sleeper: rig.sleeper.sleep,
    });
    const sealed = rig.vault.seal(adapterCredential(ADAPTER_ID, "account-1", "wrongly-keyed"));
    const outcome = await adapter.connect({
      connectorId: "connector-3" as never, accountRef: "account-1", sealedCredential: sealed,
      credentialScope: "sellercenter" as never, grantedPermissions: PERMISSIONS,
    });
    expect(outcome.status).toBe("customer-action-required");
    if (outcome.status === "customer-action-required") {
      expect(outcome.note).toContain("Sender:4");
    }
  });

  it("happy path: observation NOMINAL; SetStatusToReadyToShip succeeds with the order-item id", async () => {
    const { adapter, rig } = rigAdapter();
    await connect(rig, adapter, "connector-1-jumia", { capability: "commerce.orders.execute" });
    const observation = await adapter.observe();
    expect(observation.observation.status).toBe("NOMINAL");
    expect(observation.observation.providerStateDetail).toContain("page windows");

    const outcome = await adapter.execute({
      commandRef: "set-status-to-ready-to-ship",
      idempotencyKey: asIdempotencyKey("jumia-rts-key-1"),
      connectedInstanceId: "jumia-instance-connector-1-jumia-commerce.orders.execute",
      payloadRef: "payload-rts-1",
    });
    expect(outcome.outcome).toBe("succeeded");
    expect(outcome.providerObjectIds).toEqual(["fixture-order-item-1"]);
    expect(rig.player.requestsFor("POST", /SetStatusToReadyToShip/)[0]?.body).toBe("OrderItemIds[]=fixture-order-item-1");
  });

  it("pagination: page windows advance until collected ≥ MetaData.TotalProducts", async () => {
    const { adapter, rig } = rigAdapter();
    await connect(rig, adapter, "connector-1-jumia");
    const pages = await adapter.listAllProducts(3, 10);
    expect(pages).toHaveLength(3);
    expect(pages.map((page) => page.page)).toEqual([1, 2, 3]);
    expect(pages[2]?.sellerSkus).toEqual(["JM-SKU-7", "JM-SKU-8"]);
    expect(pages[0]?.totalProducts).toBe(8);
    expect(rig.player.requestsFor("GET", /Action=GetProducts/)).toHaveLength(3 + 1); // +1 auth probe (per_page=1)
  });

  it("rate-limit backoff: 429 → Retry-After honored → retry succeeds", async () => {
    const rig = createProviderRig([
      { method: "GET", pathPattern: /Action=GetProducts&.*per_page=1&Signature=/, responses: [JUMIA_THROTTLED, { status: 200, body: JSON.stringify({ SuccessResponse: { Head: {}, Body: { Products: [], MetaData: { TotalProducts: 0 } } } }) }] },
    ]);
    const adapter = createJumiaSellerCenterAdapter({
      http: rig.player, vault: rig.vault, payloadResolver: rig.payloadResolver,
      clock: rig.clock, userId: "seller-fixture@example.com", sleeper: rig.sleeper.sleep,
    });
    const sealed = rig.vault.seal(adapterCredential(ADAPTER_ID, "account-1", "key"));
    const outcome = await adapter.connect({
      connectorId: "connector-4" as never, accountRef: "account-1", sealedCredential: sealed,
      credentialScope: "sellercenter" as never, grantedPermissions: PERMISSIONS,
    });
    expect(outcome.status).toBe("connected");
    expect(rig.sleeper.delays).toEqual([2000]);
    expect(rig.player.requestsFor("GET", /GetProducts/)).toHaveLength(2);
  });

  it("money is an exact decimal string: ProductCreate rejects float prices pre-provider", async () => {
    const rig = createProviderRig([
      { method: "GET", pathPattern: /Action=GetProducts&.*per_page=1&Signature=/, responses: [{ status: 200, body: JSON.stringify({ SuccessResponse: { Head: {}, Body: { Products: [], MetaData: { TotalProducts: 0 } } } }) }] },
    ], [["payload-product-bad", { sellerSku: "JM-NEW-1", name: "X", quantity: "5", price: 25.0 }]]);
    const adapter = createJumiaSellerCenterAdapter({
      http: rig.player, vault: rig.vault, payloadResolver: rig.payloadResolver,
      clock: rig.clock, userId: "seller-fixture@example.com", sleeper: rig.sleeper.sleep,
    });
    const sealed = rig.vault.seal(adapterCredential(ADAPTER_ID, "account-1", "key"));
    await adapter.connect({
      connectorId: "connector-5" as never, accountRef: "account-1", sealedCredential: sealed,
      credentialScope: "sellercenter" as never, grantedPermissions: PERMISSIONS,
    });
    const outcome = await adapter.execute({
      commandRef: "product-create",
      idempotencyKey: asIdempotencyKey("jumia-float"),
      connectedInstanceId: "jumia-instance-connector-5-commerce.catalog.observe",
      payloadRef: "payload-product-bad",
    });
    expect(outcome.outcome).toBe("failed-recoverable");
    expect(outcome.note).toContain('"price"');
    expect(rig.player.requestsFor("POST", /ProductCreate/)).toHaveLength(0);
  });

  it("idempotency: repeated key replays without a second provider call", async () => {
    const { adapter, rig } = rigAdapter();
    await connect(rig, adapter, "connector-1-jumia", { capability: "commerce.listings.manage" });
    const input = {
      commandRef: "product-create",
      idempotencyKey: asIdempotencyKey("jumia-idem"),
      connectedInstanceId: "jumia-instance-connector-1-jumia-commerce.listings.manage",
      payloadRef: "payload-product-1",
    };
    const first = await adapter.execute(input);
    const replay = await adapter.execute(input);
    expect(first.outcome).toBe("succeeded");
    expect(replay.note).toContain("idempotent replay");
    expect(rig.player.requestsFor("POST", /ProductCreate/)).toHaveLength(1);
  });

  it("capability scope: missing product_create blocks before any provider call", async () => {
    const { adapter, rig } = rigAdapter();
    await connect(rig, adapter, "connector-6", { permissions: ["get_products", "set_status_to_ready_to_ship"] });
    const blocked = await adapter.execute({
      commandRef: "product-create",
      idempotencyKey: asIdempotencyKey("jumia-blocked"),
      connectedInstanceId: "jumia-instance-connector-6-commerce.catalog.observe",
      payloadRef: "payload-product-1",
    });
    expect(blocked.outcome).toBe("failed-recoverable");
    expect(blocked.note).toContain('permission "product_create"');
    expect(blocked.providerStatePreserved).toBe(true);
    expect(rig.player.requestsFor("POST", /ProductCreate/)).toHaveLength(0);
  });

  it("permission matrix: OPTIMIZED_MULTI_PROVIDER explicitly BLOCKED with rationale", () => {
    expect(permittedModesFor("jumia")).toEqual([ExecutionMode.PASS_THROUGH_NATIVE, ExecutionMode.COMPOSED]);
    const blocked = assertModePermitted("jumia", ExecutionMode.OPTIMIZED_MULTI_PROVIDER);
    expect(blocked.permitted).toBe(false);
    expect(blocked.rationale).toContain("single-marketplace");
  });
});
