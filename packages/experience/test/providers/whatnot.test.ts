/**
 * Runtime test — Whatnot adapter fixture-driven CI suite (W3-003
 * acceptance scenario 1): Bearer auth (including age-gating
 * customer-action taxonomy), happy path, show-listings `cursor`
 * pagination, throttle backoff and live-stream error taxonomy against
 * recorded fixtures. Permission-matrix line: ONLY PASS_THROUGH_NATIVE is
 * permitted — COMPOSED and OPTIMIZED_MULTI_PROVIDER are BLOCKED.
 */

import { describe, expect, it } from "vitest";
import { createWhatnotAdapter, type WhatnotAdapter } from "../../src/runtime/providers/whatnot";
import { classifyProviderError } from "../../src/runtime/providers/provider-errors";
import { ExecutionMode } from "@unicom/agent/capability";
import { assertModePermitted, permittedModesFor } from "../../src/runtime/providers/matrix";
import { asIdempotencyKey } from "../../src/runtime/ids";
import { adapterCredential, createProviderRig, type ProviderRig } from "../fixtures/providers/rig";
import {
  whatnotFixtureRoutes,
  WHATNOT_ME_OK,
  WHATNOT_ME_UNAUTHORIZED,
  WHATNOT_AGE_GATED,
  WHATNOT_THROTTLED,
  WHATNOT_OUTBID,
  WHATNOT_LOT_CLOSED,
} from "../fixtures/providers/whatnot-fixtures";

const ADAPTER_ID = "whatnot-live-commerce";
const PERMISSIONS = ["shows:read", "live:bid", "live:buy-now"];

function rigAdapter(routes = whatnotFixtureRoutes): { adapter: WhatnotAdapter; rig: ProviderRig } {
  const rig = createProviderRig(routes, [
    ["payload-bid-1", { streamId: "wn-stream-9", listingId: "wn-lot-1", bidAmount: "13.00", currency: "USD" }],
    ["payload-bid-bad", { streamId: "wn-stream-9", listingId: "wn-lot-1", bidAmount: 13, currency: "USD" }],
    ["payload-buy-1", { streamId: "wn-stream-9", listingId: "wn-lot-2", quantity: "1" }],
  ]);
  const adapter = createWhatnotAdapter({
    http: rig.player, vault: rig.vault, payloadResolver: rig.payloadResolver,
    clock: rig.clock, sleeper: rig.sleeper.sleep,
  });
  return { adapter, rig };
}

async function connect(rig: ProviderRig, adapter: WhatnotAdapter, connectorId: string, options: { capability?: string; permissions?: readonly string[] } = {}) {
  const sealed = rig.vault.seal(adapterCredential(ADAPTER_ID, "account-whatnot-1", "whatnot-session-token-fixture"));
  return adapter.connect({
    connectorId: connectorId as never,
    accountRef: "account-whatnot-1",
    sealedCredential: sealed,
    credentialScope: "shows.read live.bid live.buy-now" as never,
    grantedPermissions: options.permissions ?? PERMISSIONS,
    capabilityDefinitionId: options.capability,
  });
}

describe("Whatnot adapter — fixture-driven CI (scenario 1)", () => {
  it("auth: valid session token connects; live-commerce transport bound", async () => {
    const { adapter, rig } = rigAdapter();
    const outcome = await connect(rig, adapter, "connector-1-whatnot");
    expect(outcome.status).toBe("connected");
    if (outcome.status !== "connected") return;
    // Permission matrix, typed: ONLY pass-through native survives.
    expect(outcome.connectedInstance.authorizedExecutionModes).toEqual([...permittedModesFor("whatnot")]);
    expect(outcome.connectedInstance.authorizedExecutionModes).toEqual([ExecutionMode.PASS_THROUGH_NATIVE]);
    expect(rig.player.requests[0]?.headers.Authorization).toBe("Bearer whatnot-session-token-fixture");
    expect(adapter.descriptor.transportId).toBe("live-commerce-stream");
  });

  it("auth: expired session → customer-action-required", async () => {
    const rig = createProviderRig([
      { method: "GET", pathPattern: /\/api\/v1\/me$/, responses: [WHATNOT_ME_UNAUTHORIZED] },
    ]);
    const adapter = createWhatnotAdapter({
      http: rig.player, vault: rig.vault, payloadResolver: rig.payloadResolver,
      clock: rig.clock, sleeper: rig.sleeper.sleep,
    });
    const sealed = rig.vault.seal(adapterCredential(ADAPTER_ID, "account-1", "expired"));
    const outcome = await adapter.connect({
      connectorId: "connector-2" as never, accountRef: "account-1", sealedCredential: sealed,
      credentialScope: "shows.read" as never, grantedPermissions: PERMISSIONS,
    });
    expect(outcome.status).toBe("customer-action-required");
  });

  it("error taxonomy: 403 verification_required maps to customer-action-required class", () => {
    // Classification-level check: in-band provider code preserved.
    const classified = classifyProviderError(
      { status: 403, body: WHATNOT_AGE_GATED.body },
      (body) => {
        const parsed = JSON.parse(body) as { error?: { code?: string } };
        return parsed.error?.code;
      },
    );
    expect(classified.errorClass).toBe("customer-action-required");
    expect(classified.providerErrorCode).toBe("verification_required");
  });

  it("happy path: observation NOMINAL over show listings; in-stream bid succeeds with bid id", async () => {
    const { adapter, rig } = rigAdapter();
    await connect(rig, adapter, "connector-1-whatnot", { capability: "live.commerce.execute" });
    const observation = await adapter.observe();
    expect(observation.observation.status).toBe("NOMINAL");
    expect(observation.observation.providerStateDetail).toContain("cursor pagination");
    expect(observation.untrustedPayloads?.[0]?.sourceTransportId).toBe("live-commerce-stream");

    const outcome = await adapter.execute({
      commandRef: "place-bid",
      idempotencyKey: asIdempotencyKey("whatnot-bid-key-1"),
      connectedInstanceId: "whatnot-instance-connector-1-whatnot-live.commerce.execute",
      payloadRef: "payload-bid-1",
    });
    expect(outcome.outcome).toBe("succeeded");
    expect(outcome.providerObjectIds).toEqual(["wn-bid-77"]);
    expect(rig.player.requestsFor("POST", /\/bid$/)[0]?.path).toBe("/api/v1/live/streams/wn-stream-9/bid");
  });

  it("pagination: show listings follow next_cursor tokens", async () => {
    const { adapter, rig } = rigAdapter();
    await connect(rig, adapter, "connector-1-whatnot");
    const pages = await adapter.listShowListings("fixture-show", 3, 10);
    expect(pages).toHaveLength(3);
    expect(pages[0]?.nextCursor).toBe("CURSOR-2");
    expect(pages[1]?.requestPath).toContain("cursor=CURSOR-2");
    expect(pages[2]?.listingIds).toEqual(["wn-lot-6"]);
    expect(pages[2]?.nextCursor).toBeUndefined();
    expect(rig.player.requestsFor("GET", /shows\/fixture-show\/listings/)).toHaveLength(3);
  });

  it("rate-limit backoff: 429 → Retry-After (1 s) honored → retry succeeds", async () => {
    const rig = createProviderRig([
      { method: "GET", pathPattern: /\/api\/v1\/me$/, responses: [WHATNOT_THROTTLED, WHATNOT_ME_OK] },
    ]);
    const adapter = createWhatnotAdapter({
      http: rig.player, vault: rig.vault, payloadResolver: rig.payloadResolver,
      clock: rig.clock, sleeper: rig.sleeper.sleep,
    });
    const sealed = rig.vault.seal(adapterCredential(ADAPTER_ID, "account-1", "tok"));
    const outcome = await adapter.connect({
      connectorId: "connector-3" as never, accountRef: "account-1", sealedCredential: sealed,
      credentialScope: "shows.read" as never, grantedPermissions: PERMISSIONS,
    });
    expect(outcome.status).toBe("connected");
    expect(rig.sleeper.delays).toEqual([1000]);
    expect(rig.player.requestsFor("GET", /\/me$/)).toHaveLength(2);
  });

  it("error taxonomy: 409 OUTBID → state-conflict; 404 LOT_CLOSED → not-found", async () => {
    const rig = createProviderRig([
      { method: "GET", pathPattern: /\/api\/v1\/me$/, responses: [WHATNOT_ME_OK] },
      { method: "POST", pathPattern: /\/bid$/, responses: [WHATNOT_OUTBID] },
      { method: "POST", pathPattern: /\/buy-now$/, responses: [WHATNOT_LOT_CLOSED] },
    ], [
      ["payload-bid-1", { streamId: "s", listingId: "l", bidAmount: "13.00", currency: "USD" }],
      ["payload-buy-1", { streamId: "s", listingId: "l", quantity: "1" }],
    ]);
    const adapter = createWhatnotAdapter({
      http: rig.player, vault: rig.vault, payloadResolver: rig.payloadResolver,
      clock: rig.clock, sleeper: rig.sleeper.sleep,
    });
    const sealed = rig.vault.seal(adapterCredential(ADAPTER_ID, "account-1", "tok"));
    await adapter.connect({
      connectorId: "connector-4" as never, accountRef: "account-1", sealedCredential: sealed,
      credentialScope: "shows.read live.bid live.buy-now" as never, grantedPermissions: PERMISSIONS,
    });
    const outbid = await adapter.execute({
      commandRef: "place-bid",
      idempotencyKey: asIdempotencyKey("whatnot-outbid"),
      connectedInstanceId: "whatnot-instance-connector-4-commerce.catalog.observe",
      payloadRef: "payload-bid-1",
    });
    expect(outbid.outcome).toBe("failed-recoverable");
    expect(outbid.note).toContain("state-conflict");
    expect(outbid.note).toContain("OUTBID");

    const closed = await adapter.execute({
      commandRef: "buy-now",
      idempotencyKey: asIdempotencyKey("whatnot-closed"),
      connectedInstanceId: "whatnot-instance-connector-4-commerce.catalog.observe",
      payloadRef: "payload-buy-1",
    });
    expect(closed.outcome).toBe("failed-recoverable");
    expect(closed.note).toContain("not-found");
  });

  it("money is an exact decimal string: float bids rejected pre-provider", async () => {
    const { adapter, rig } = rigAdapter();
    await connect(rig, adapter, "connector-1-whatnot");
    const outcome = await adapter.execute({
      commandRef: "place-bid",
      idempotencyKey: asIdempotencyKey("whatnot-float"),
      connectedInstanceId: "whatnot-instance-connector-1-whatnot-commerce.catalog.observe",
      payloadRef: "payload-bid-bad",
    });
    expect(outcome.outcome).toBe("failed-recoverable");
    expect(outcome.note).toContain('"bidAmount"');
    expect(rig.player.requestsFor("POST", /\/bid$/)).toHaveLength(0);
  });

  it("idempotency: repeated bid key replays without a second provider call", async () => {
    const { adapter, rig } = rigAdapter();
    await connect(rig, adapter, "connector-1-whatnot", { capability: "live.commerce.execute" });
    const input = {
      commandRef: "place-bid",
      idempotencyKey: asIdempotencyKey("whatnot-idem"),
      connectedInstanceId: "whatnot-instance-connector-1-whatnot-live.commerce.execute",
      payloadRef: "payload-bid-1",
    };
    await adapter.execute(input);
    const replay = await adapter.execute(input);
    expect(replay.note).toContain("idempotent replay");
    expect(rig.player.requestsFor("POST", /\/bid$/)).toHaveLength(1);
  });

  it("capability scope: missing live:bid blocks before any provider call", async () => {
    const { adapter, rig } = rigAdapter();
    await connect(rig, adapter, "connector-5", { permissions: ["shows:read", "live:buy-now"] });
    const blocked = await adapter.execute({
      commandRef: "place-bid",
      idempotencyKey: asIdempotencyKey("whatnot-blocked"),
      connectedInstanceId: "whatnot-instance-connector-5-commerce.catalog.observe",
      payloadRef: "payload-bid-1",
    });
    expect(blocked.outcome).toBe("failed-recoverable");
    expect(blocked.note).toContain('permission "live:bid"');
    expect(blocked.providerStatePreserved).toBe(true);
    expect(rig.player.requestsFor("POST", /\/bid$/)).toHaveLength(0);
  });

  it("permission matrix: COMPOSED and OPTIMIZED_MULTI_PROVIDER explicitly BLOCKED with rationale", () => {
    expect(permittedModesFor("whatnot")).toEqual([ExecutionMode.PASS_THROUGH_NATIVE]);
    for (const mode of [ExecutionMode.COMPOSED, ExecutionMode.OPTIMIZED_MULTI_PROVIDER]) {
      const blocked = assertModePermitted("whatnot", mode);
      expect(blocked.permitted).toBe(false);
      expect(blocked.rationale).toBeDefined();
    }
  });
});
