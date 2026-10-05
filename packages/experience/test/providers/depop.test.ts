/**
 * Runtime test — Depop adapter fixture-driven CI suite (W3-003
 * acceptance scenario 1): OAuth auth, happy path, `max_id` cursor
 * pagination, throttle backoff and error taxonomy against recorded
 * fixtures. Permission-matrix line: OPTIMIZED_MULTI_PROVIDER is BLOCKED.
 */

import { describe, expect, it } from "vitest";
import { createDepopAdapter, type DepopAdapter } from "../../src/runtime/providers/depop";
import { ExecutionMode } from "@unicom/agent/capability";
import { assertModePermitted, permittedModesFor } from "../../src/runtime/providers/matrix";
import { asIdempotencyKey } from "../../src/runtime/ids";
import { adapterCredential, createProviderRig, type ProviderRig } from "../fixtures/providers/rig";
import {
  depopFixtureRoutes,
  DEPOP_ME_OK,
  DEPOP_ME_UNAUTHORIZED,
  DEPOP_THROTTLED,
  DEPOP_LISTING_CONFLICT,
} from "../fixtures/providers/depop-fixtures";

const ADAPTER_ID = "depop-public-api";
const PERMISSIONS = ["items:read", "listings:write"];

function rigAdapter(routes = depopFixtureRoutes): { adapter: DepopAdapter; rig: ProviderRig } {
  const rig = createProviderRig(routes, [
    ["payload-listing-1", { title: "Fixture jacket", description: "Vintage denim", price: "45.00", currency: "USD" }],
    ["payload-listing-bad", { title: "Bad price", description: "x", price: 45, currency: "USD" }],
    ["payload-delete-1", { listingId: "d-item-1" }],
  ]);
  const adapter = createDepopAdapter({
    http: rig.player, vault: rig.vault, payloadResolver: rig.payloadResolver,
    clock: rig.clock, sleeper: rig.sleeper.sleep,
  });
  return { adapter, rig };
}

async function connect(rig: ProviderRig, adapter: DepopAdapter, connectorId: string, options: { capability?: string; permissions?: readonly string[] } = {}) {
  const sealed = rig.vault.seal(adapterCredential(ADAPTER_ID, "account-depop-1", "depop-oauth-token-fixture"));
  return adapter.connect({
    connectorId: connectorId as never,
    accountRef: "account-depop-1",
    sealedCredential: sealed,
    credentialScope: "items.read listings.write" as never,
    grantedPermissions: options.permissions ?? PERMISSIONS,
    capabilityDefinitionId: options.capability,
  });
}

describe("Depop adapter — fixture-driven CI (scenario 1)", () => {
  it("auth: valid OAuth token connects via /api/v1/me; Bearer carried", async () => {
    const { adapter, rig } = rigAdapter();
    const outcome = await connect(rig, adapter, "connector-1-depop");
    expect(outcome.status).toBe("connected");
    if (outcome.status !== "connected") return;
    expect(outcome.connectedInstance.authorizedExecutionModes).toEqual([...permittedModesFor("depop")]);
    expect(rig.player.requests[0]?.headers.Authorization).toBe("Bearer depop-oauth-token-fixture");
  });

  it("auth: expired token → customer-action-required", async () => {
    const rig = createProviderRig([
      { method: "GET", pathPattern: /\/api\/v1\/me$/, responses: [DEPOP_ME_UNAUTHORIZED] },
    ]);
    const adapter = createDepopAdapter({
      http: rig.player, vault: rig.vault, payloadResolver: rig.payloadResolver,
      clock: rig.clock, sleeper: rig.sleeper.sleep,
    });
    const sealed = rig.vault.seal(adapterCredential(ADAPTER_ID, "account-1", "expired"));
    const outcome = await adapter.connect({
      connectorId: "connector-2" as never, accountRef: "account-1", sealedCredential: sealed,
      credentialScope: "items.read" as never, grantedPermissions: PERMISSIONS,
    });
    expect(outcome.status).toBe("customer-action-required");
    if (outcome.status === "customer-action-required") {
      expect(outcome.note).toContain("authentication-invalid");
    }
  });

  it("happy path: observation NOMINAL; create-listing succeeds with the listing id", async () => {
    const { adapter, rig } = rigAdapter();
    await connect(rig, adapter, "connector-1-depop", { capability: "commerce.listings.manage" });
    const observation = await adapter.observe();
    expect(observation.observation.status).toBe("NOMINAL");
    expect(observation.observation.providerStateDetail).toContain("max_id cursor");

    const outcome = await adapter.execute({
      commandRef: "create-listing",
      idempotencyKey: asIdempotencyKey("depop-listing-key-1"),
      connectedInstanceId: "depop-instance-connector-1-depop-commerce.listings.manage",
      payloadRef: "payload-listing-1",
    });
    expect(outcome.outcome).toBe("succeeded");
    expect(outcome.providerObjectIds).toEqual(["d-listing-99"]);
    expect(rig.player.requestsFor("POST", /listings/)[0]?.body).toContain("Vintage denim");
  });

  it("pagination: max_id feed cursor advances until next_max_id is absent", async () => {
    const { adapter, rig } = rigAdapter();
    await connect(rig, adapter, "connector-1-depop");
    const pages = await adapter.listAllItems(3, 10);
    expect(pages).toHaveLength(3);
    expect(pages[0]?.maxIdCursor).toBe("MAX-2");
    expect(pages[1]?.requestPath).toContain("max_id=MAX-2");
    expect(pages[2]?.itemIds).toEqual(["d-item-7"]);
    expect(pages[2]?.maxIdCursor).toBeUndefined();
    expect(rig.player.requestsFor("GET", /\/api\/v1\/items/)).toHaveLength(3);
  });

  it("rate-limit backoff: 429 → Retry-After (1 s) honored → retry succeeds", async () => {
    const rig = createProviderRig([
      { method: "GET", pathPattern: /\/api\/v1\/me$/, responses: [DEPOP_THROTTLED, DEPOP_ME_OK] },
    ]);
    const adapter = createDepopAdapter({
      http: rig.player, vault: rig.vault, payloadResolver: rig.payloadResolver,
      clock: rig.clock, sleeper: rig.sleeper.sleep,
    });
    const sealed = rig.vault.seal(adapterCredential(ADAPTER_ID, "account-1", "tok"));
    const outcome = await adapter.connect({
      connectorId: "connector-3" as never, accountRef: "account-1", sealedCredential: sealed,
      credentialScope: "items.read" as never, grantedPermissions: PERMISSIONS,
    });
    expect(outcome.status).toBe("connected");
    expect(rig.sleeper.delays).toEqual([1000]);
    expect(rig.player.requestsFor("GET", /\/me$/)).toHaveLength(2);
  });

  it("error taxonomy: 409 duplicate listing → state-conflict", async () => {
    const rig = createProviderRig([
      { method: "GET", pathPattern: /\/api\/v1\/me$/, responses: [DEPOP_ME_OK] },
      { method: "POST", pathPattern: /\/api\/v1\/listings$/, responses: [DEPOP_LISTING_CONFLICT] },
    ], [["payload-listing-1", { title: "t", description: "d", price: "45.00", currency: "USD" }]]);
    const adapter = createDepopAdapter({
      http: rig.player, vault: rig.vault, payloadResolver: rig.payloadResolver,
      clock: rig.clock, sleeper: rig.sleeper.sleep,
    });
    const sealed = rig.vault.seal(adapterCredential(ADAPTER_ID, "account-1", "tok"));
    await adapter.connect({
      connectorId: "connector-4" as never, accountRef: "account-1", sealedCredential: sealed,
      credentialScope: "items.read listings.write" as never, grantedPermissions: PERMISSIONS,
    });
    const outcome = await adapter.execute({
      commandRef: "create-listing",
      idempotencyKey: asIdempotencyKey("depop-conflict"),
      connectedInstanceId: "depop-instance-connector-4-commerce.catalog.observe",
      payloadRef: "payload-listing-1",
    });
    expect(outcome.outcome).toBe("failed-recoverable");
    expect(outcome.note).toContain("state-conflict");
  });

  it("money is an exact decimal string: float prices rejected pre-provider", async () => {
    const { adapter, rig } = rigAdapter();
    await connect(rig, adapter, "connector-1-depop");
    const outcome = await adapter.execute({
      commandRef: "create-listing",
      idempotencyKey: asIdempotencyKey("depop-float"),
      connectedInstanceId: "depop-instance-connector-1-depop-commerce.catalog.observe",
      payloadRef: "payload-listing-bad",
    });
    expect(outcome.outcome).toBe("failed-recoverable");
    expect(outcome.note).toContain('"price"');
    expect(rig.player.requestsFor("POST", /listings/)).toHaveLength(0);
  });

  it("idempotency: repeated key replays without a second provider call", async () => {
    const { adapter, rig } = rigAdapter();
    await connect(rig, adapter, "connector-1-depop", { capability: "commerce.listings.manage" });
    const input = {
      commandRef: "create-listing",
      idempotencyKey: asIdempotencyKey("depop-idem"),
      connectedInstanceId: "depop-instance-connector-1-depop-commerce.listings.manage",
      payloadRef: "payload-listing-1",
    };
    await adapter.execute(input);
    const replay = await adapter.execute(input);
    expect(replay.note).toContain("idempotent replay");
    expect(rig.player.requestsFor("POST", /listings/)).toHaveLength(1);
  });

  it("capability scope: missing listings:write blocks before any provider call", async () => {
    const { adapter, rig } = rigAdapter();
    await connect(rig, adapter, "connector-5", { permissions: ["items:read"] });
    const blocked = await adapter.execute({
      commandRef: "create-listing",
      idempotencyKey: asIdempotencyKey("depop-blocked"),
      connectedInstanceId: "depop-instance-connector-5-commerce.catalog.observe",
      payloadRef: "payload-listing-1",
    });
    expect(blocked.outcome).toBe("failed-recoverable");
    expect(blocked.note).toContain('permission "listings:write"');
    expect(blocked.providerStatePreserved).toBe(true);
    expect(rig.player.requestsFor("POST", /listings/)).toHaveLength(0);
  });

  it("permission matrix: OPTIMIZED_MULTI_PROVIDER explicitly BLOCKED with rationale", () => {
    expect(permittedModesFor("depop")).toEqual([ExecutionMode.PASS_THROUGH_NATIVE, ExecutionMode.COMPOSED]);
    const blocked = assertModePermitted("depop", ExecutionMode.OPTIMIZED_MULTI_PROVIDER);
    expect(blocked.permitted).toBe(false);
    expect(blocked.rationale).toContain("no bulk or optimized operations");
  });
});
