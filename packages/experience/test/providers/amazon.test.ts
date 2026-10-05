/**
 * Runtime test — Amazon SP-API adapter fixture-driven CI suite (W3-003
 * acceptance scenario 1): LWA auth, happy path, NextPageToken pagination,
 * QuotaExceeded backoff and error taxonomy against recorded fixtures.
 * Permission-matrix line: OPTIMIZED_MULTI_PROVIDER is BLOCKED.
 */

import { describe, expect, it } from "vitest";
import { createAmazonSpApiAdapter, type AmazonSpApiAdapter } from "../../src/runtime/providers/amazon-spapi";
import { ExecutionMode } from "@unicom/agent/capability";
import { assertModePermitted, permittedModesFor } from "../../src/runtime/providers/matrix";
import { asIdempotencyKey } from "../../src/runtime/ids";
import { adapterCredential, createProviderRig, type ProviderRig } from "../fixtures/providers/rig";
import {
  amazonFixtureRoutes,
  AMAZON_LWA_TOKEN_REJECTED,
  AMAZON_PARTICIPATIONS_OK,
  AMAZON_PARTICIPATIONS_FORBIDDEN,
  AMAZON_THROTTLED,
  AMAZON_INVALID_INPUT,
} from "../fixtures/providers/amazon-fixtures";

const ADAPTER_ID = "amazon-spapi-SELLERFIX1";
const PERMISSIONS = ["role:orders", "role:listings"];

function rigAdapter(routes = amazonFixtureRoutes): { adapter: AmazonSpApiAdapter; rig: ProviderRig } {
  const rig = createProviderRig(routes, [
    ["payload-listing-1", { sku: "FIXTURE-SKU-1", productType: "PRODUCT", condition: "new_new", price: "199.99" }],
    ["payload-order-1", { orderId: "111-2223334-5556677", packageRef: "pkg-fixture-1" }],
  ]);
  const adapter = createAmazonSpApiAdapter({
    http: rig.player, vault: rig.vault, payloadResolver: rig.payloadResolver,
    clock: rig.clock, sellerId: "SELLERFIX1", lwaClientId: "amzn1.application-oa2-client.fixture",
    sleeper: rig.sleeper.sleep,
  });
  return { adapter, rig };
}

async function connect(rig: ProviderRig, adapter: AmazonSpApiAdapter, connectorId: string, options: { capability?: string; permissions?: readonly string[] } = {}) {
  const sealed = rig.vault.seal(adapterCredential(ADAPTER_ID, "account-amazon-1", "amzn1.rt refreshToken.fixture"));
  return adapter.connect({
    connectorId: connectorId as never,
    accountRef: "account-amazon-1",
    sealedCredential: sealed,
    credentialScope: "sellingpartnerapi" as never,
    grantedPermissions: options.permissions ?? PERMISSIONS,
    capabilityDefinitionId: options.capability,
  });
}

describe("Amazon SP-API adapter — fixture-driven CI (scenario 1)", () => {
  it("auth: LWA refresh-token exchange + marketplace participations connect; SP-API header carries the exchanged token", async () => {
    const { adapter, rig } = rigAdapter();
    const outcome = await connect(rig, adapter, "connector-1-amazon");
    expect(outcome.status).toBe("connected");
    if (outcome.status !== "connected") return;
    // Permission matrix, typed: OPTIMIZED_MULTI_PROVIDER is BLOCKED for SP-API.
    expect(outcome.connectedInstance.authorizedExecutionModes).toEqual([...permittedModesFor("amazon-spapi")]);
    expect(outcome.connectedInstance.authorizedExecutionModes).not.toContain(ExecutionMode.OPTIMIZED_MULTI_PROVIDER);
    // The LWA exchange posted the REAL grant_type and the refresh token.
    const tokenCall = rig.player.requestsFor("POST", /auth\/o2\/token/)[0];
    expect(tokenCall?.body).toContain("grant_type=refresh_token");
    expect(tokenCall?.body).toContain("refresh_token=amzn1.rt+refreshToken.fixture");
    expect(tokenCall?.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    // The SP-API call carried the exchanged access token.
    const sellersCall = rig.player.requestsFor("GET", /marketplaceParticipations/)[0];
    expect(sellersCall?.headers["x-amz-access-token"]).toBe("Atza|IwEBIA...fixture-token");
  });

  it("auth: revoked refresh token → customer-action-required", async () => {
    const rig = createProviderRig([
      { method: "POST", pathPattern: /auth\/o2\/token$/, responses: [AMAZON_LWA_TOKEN_REJECTED] },
    ]);
    const adapter = createAmazonSpApiAdapter({
      http: rig.player, vault: rig.vault, payloadResolver: rig.payloadResolver,
      clock: rig.clock, sellerId: "SELLERFIX1", lwaClientId: "cli", sleeper: rig.sleeper.sleep,
    });
    const sealed = rig.vault.seal(adapterCredential(ADAPTER_ID, "account-1", "revoked-refresh"));
    const outcome = await adapter.connect({
      connectorId: "connector-2" as never, accountRef: "account-1", sealedCredential: sealed,
      credentialScope: "spapi" as never, grantedPermissions: PERMISSIONS,
    });
    expect(outcome.status).toBe("customer-action-required");
    if (outcome.status === "customer-action-required") {
      expect(outcome.note).toContain("LWA token exchange failed");
    }
  });

  it("auth: 403 role revoked → customer-action-required (authorization taxonomy)", async () => {
    const rig = createProviderRig([
      { method: "POST", pathPattern: /auth\/o2\/token$/, responses: [{ status: 200, body: JSON.stringify({ access_token: "Atza|ok" }) }] },
      { method: "GET", pathPattern: /marketplaceParticipations$/, responses: [AMAZON_PARTICIPATIONS_FORBIDDEN] },
    ]);
    const adapter = createAmazonSpApiAdapter({
      http: rig.player, vault: rig.vault, payloadResolver: rig.payloadResolver,
      clock: rig.clock, sellerId: "SELLERFIX1", lwaClientId: "cli", sleeper: rig.sleeper.sleep,
    });
    const sealed = rig.vault.seal(adapterCredential(ADAPTER_ID, "account-1", "refresh"));
    const outcome = await adapter.connect({
      connectorId: "connector-3" as never, accountRef: "account-1", sealedCredential: sealed,
      credentialScope: "spapi" as never, grantedPermissions: PERMISSIONS,
    });
    expect(outcome.status).toBe("customer-action-required");
    if (outcome.status === "customer-action-required") {
      expect(outcome.note).toContain("authorization-denied");
    }
  });

  it("happy path: observation NOMINAL over the Orders API; listing upsert succeeds", async () => {
    const { adapter, rig } = rigAdapter();
    await connect(rig, adapter, "connector-1-amazon", { capability: "commerce.listings.manage" });
    const observation = await adapter.observe();
    expect(observation.observation.status).toBe("NOMINAL");
    expect(observation.observation.providerStateDetail).toContain("NextPageToken pagination");

    const outcome = await adapter.execute({
      commandRef: "upsert-listing",
      idempotencyKey: asIdempotencyKey("amazon-listing-key-1"),
      connectedInstanceId: "amazon-instance-connector-1-amazon-commerce.listings.manage",
      payloadRef: "payload-listing-1",
    });
    expect(outcome.outcome).toBe("succeeded");
    expect(outcome.providerObjectIds).toEqual(["FIXTURE-SKU-1"]);
    expect(rig.player.requestsFor("PUT", /listings\/2021-08-01/)[0]?.path).toContain("/items/SELLERFIX1/FIXTURE-SKU-1");
  });

  it("pagination: Orders follow NextPageToken → PageToken cursors", async () => {
    const { adapter, rig } = rigAdapter();
    await connect(rig, adapter, "connector-1-amazon");
    const pages = await adapter.listAllOrders(10);
    expect(pages).toHaveLength(2);
    expect(pages[0]?.nextPageToken).toBe("PAGE-TOKEN-2");
    expect(pages[0]?.amazonOrderIds).toEqual(["111-2223334-5556667", "111-2223334-5556677"]);
    expect(pages[1]?.requestPath).toContain("PageToken=PAGE-TOKEN-2");
    expect(pages[1]?.nextPageToken).toBeUndefined();
    expect(pages[1]?.amazonOrderIds).toEqual(["111-2223334-5556688", "111-2223334-5556699"]);
    expect(rig.player.requestsFor("GET", /orders\/v0\/orders/)).toHaveLength(2);
  });

  it("rate-limit backoff: QuotaExceeded 429 honors Retry-After (3 s) then succeeds", async () => {
    const rig = createProviderRig([
      { method: "POST", pathPattern: /auth\/o2\/token$/, responses: [{ status: 200, body: JSON.stringify({ access_token: "Atza|t" }) }] },
      { method: "GET", pathPattern: /marketplaceParticipations$/, responses: [AMAZON_THROTTLED, AMAZON_PARTICIPATIONS_OK] },
    ]);
    const adapter = createAmazonSpApiAdapter({
      http: rig.player, vault: rig.vault, payloadResolver: rig.payloadResolver,
      clock: rig.clock, sellerId: "SELLERFIX1", lwaClientId: "cli", sleeper: rig.sleeper.sleep,
    });
    const sealed = rig.vault.seal(adapterCredential(ADAPTER_ID, "account-1", "refresh"));
    const outcome = await adapter.connect({
      connectorId: "connector-4" as never, accountRef: "account-1", sealedCredential: sealed,
      credentialScope: "spapi" as never, grantedPermissions: PERMISSIONS,
    });
    expect(outcome.status).toBe("connected");
    expect(rig.sleeper.delays).toEqual([3000]);
    expect(rig.player.requestsFor("GET", /marketplaceParticipations/)).toHaveLength(2);
  });

  it("error taxonomy: 400 InvalidInput → bad-request; 5xx → provider-internal with UNKNOWN preservation", async () => {
    const rig = createProviderRig([
      { method: "POST", pathPattern: /auth\/o2\/token$/, responses: [{ status: 200, body: JSON.stringify({ access_token: "Atza|t" }) }] },
      { method: "GET", pathPattern: /marketplaceParticipations$/, responses: [{ status: 200, body: "[]" }] },
      { method: "PUT", pathPattern: /listings\/2021-08-01\/items\/[^/]+\/[^/]+\?.*$/, responses: [AMAZON_INVALID_INPUT] },
      { method: "GET", pathPattern: /orders\/v0\/orders\?.*$/, responses: [{ status: 500, body: JSON.stringify({ errors: [{ code: "InternalServiceException" }] }) }] },
    ], [["payload-listing-1", { sku: "FIXTURE-SKU-1", productType: "PRODUCT", condition: "new_new" }]]);
    const adapter = createAmazonSpApiAdapter({
      http: rig.player, vault: rig.vault, payloadResolver: rig.payloadResolver,
      clock: rig.clock, sellerId: "SELLERFIX1", lwaClientId: "cli", sleeper: rig.sleeper.sleep,
    });
    const sealed = rig.vault.seal(adapterCredential(ADAPTER_ID, "account-1", "refresh"));
    await adapter.connect({
      connectorId: "connector-5" as never, accountRef: "account-1", sealedCredential: sealed,
      credentialScope: "spapi" as never, grantedPermissions: PERMISSIONS,
    });
    const badRequest = await adapter.execute({
      commandRef: "upsert-listing",
      idempotencyKey: asIdempotencyKey("amazon-400"),
      connectedInstanceId: "amazon-instance-connector-5-commerce.catalog.observe",
      payloadRef: "payload-listing-1",
    });
    expect(badRequest.outcome).toBe("failed-recoverable");
    expect(badRequest.note).toContain("bad-request");
    expect(badRequest.note).toContain("InvalidInput");

    const observation = await adapter.observe();
    expect(observation.observation.status).toBe("UNKNOWN");
  });

  it("idempotency: repeated key replays without a second provider call", async () => {
    const { adapter, rig } = rigAdapter();
    await connect(rig, adapter, "connector-1-amazon", { capability: "commerce.orders.execute" });
    const input = {
      commandRef: "confirm-order",
      idempotencyKey: asIdempotencyKey("amazon-idem"),
      connectedInstanceId: "amazon-instance-connector-1-amazon-commerce.orders.execute",
      payloadRef: "payload-order-1",
    };
    const first = await adapter.execute(input);
    const replay = await adapter.execute(input);
    expect(first.outcome).toBe("succeeded");
    expect(replay.note).toContain("idempotent replay");
    expect(rig.player.requestsFor("POST", /\/shipment$/)).toHaveLength(1);
  });

  it("capability scope: missing role:listings blocks before any provider call", async () => {
    const { adapter, rig } = rigAdapter();
    await connect(rig, adapter, "connector-6", { permissions: ["role:orders"] });
    const blocked = await adapter.execute({
      commandRef: "upsert-listing",
      idempotencyKey: asIdempotencyKey("amazon-blocked"),
      connectedInstanceId: "amazon-instance-connector-6-commerce.catalog.observe",
      payloadRef: "payload-listing-1",
    });
    expect(blocked.outcome).toBe("failed-recoverable");
    expect(blocked.note).toContain('permission "role:listings"');
    expect(blocked.providerStatePreserved).toBe(true);
    expect(rig.player.requestsFor("PUT", /listings/)).toHaveLength(0);
  });

  it("permission matrix: OPTIMIZED_MULTI_PROVIDER explicitly BLOCKED with rationale", () => {
    expect(permittedModesFor("amazon-spapi")).toEqual([ExecutionMode.PASS_THROUGH_NATIVE, ExecutionMode.COMPOSED]);
    const blocked = assertModePermitted("amazon-spapi", ExecutionMode.OPTIMIZED_MULTI_PROVIDER);
    expect(blocked.permitted).toBe(false);
    expect(blocked.rationale).toContain("restricted to granted roles");
  });
});
