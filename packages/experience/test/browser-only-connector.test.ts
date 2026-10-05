/**
 * Runtime test — browser-only connector (W3-003 acceptance scenario 4):
 * the ENTIRE provider interaction completes inside the W3-002 browser
 * session runtime; the server side sees NO provider credentials
 * (asserted by the vault's fail-closed deep VALUE scan over every
 * server-visible structure), and every provider call is authorized
 * against the session's own scope.
 */

import { describe, expect, it } from "vitest";
import { createBrowserSessionRuntime } from "../src/runtime/browser/session-runtime";
import { createBrowserOnlyConnectorAdapter, type BrowserProviderClient, type BrowserProviderCall, type BrowserProviderCallResult } from "../src/runtime/connector/browser-only";
import { createConnectorRuntime } from "../src/runtime/connector/runtime";
import { createCredentialVault } from "../src/runtime/connector/vault";
import { CAPABILITY_CATALOG_OBSERVE, CAPABILITY_LISTINGS_MANAGE } from "../src/runtime/providers/capabilities";
import { providerImplementationOf } from "../src/runtime/providers/capabilities";
import { asIdempotencyKey, asBrowserRouteCapabilityRef, asPrincipalRef } from "../src/runtime/ids";
import { toModelContextMaterial } from "@unicom/agent";
import type { BrowserSessionHandle } from "../src/connector/browser-session";

const PROVIDER_ORIGIN = "https://backoffice.no-api-provider.example";

/**
 * ⚠ TEST DOUBLE: a browser-page fixture implementing the
 * BrowserProviderClient port. It stands in for a real controlled browser:
 * every call is authorized through the session runtime's OWN
 * authorizeAction, and the "page" keeps the provider LOGIN inside the
 * session's isolated storage partition — the credential value NEVER
 * crosses back over the port.
 */
class FixtureBrowserPages implements BrowserProviderClient {
  readonly authorizedCalls: BrowserProviderCall[] = [];
  readonly refusedCalls: BrowserProviderCall[] = [];
  private readonly sessions: {
    authorize: (handle: BrowserSessionHandle, action: string, origin: string) => { authorized: boolean; reason: string };
  };

  constructor(sessions: ReturnType<typeof createBrowserSessionRuntime>) {
    this.sessions = sessions;
  }

  async perform(handle: BrowserSessionHandle | undefined, call: BrowserProviderCall): Promise<BrowserProviderCallResult> {
    if (handle === undefined) {
      return { authorized: false, reason: "no browser session bound", httpLikeStatus: 401 };
    }
    // THE authorization path — the adapter's only route to the provider.
    const decision = this.sessions.authorizeAction(handle, call.action as never, call.origin);
    if (!decision.authorized) {
      this.refusedCalls.push(call);
      return { authorized: false, reason: decision.reason, httpLikeStatus: 403 };
    }
    this.authorizedCalls.push(call);
    if (call.action === "read-catalog" || call.action === "read-listings") {
      return {
        authorized: true,
        reason: "within the session's own scope",
        httpLikeStatus: 200,
        untrustedPageContent: '<div class="listing">Widget A — <script>alert("xss-attempt")</script></div>',
      };
    }
    if (call.action === "place-order" || call.action === "submit-form") {
      return { authorized: true, reason: "within the session's own scope", httpLikeStatus: 200 };
    }
    return { authorized: false, reason: "unsupported action", httpLikeStatus: 400 };
  }
}

function createBrowserRig() {
  const clock = (() => {
    let ticks = 0;
    return () => new Date(Date.parse("2026-10-06T13:00:00Z") + ticks++ * 1000).toISOString();
  })();
  const vault = createCredentialVault({ clock });
  const sessions = createBrowserSessionRuntime({ vault, clock, browserAdapterId: "browser-only-FixtureBackOffice" });
  const pages = new FixtureBrowserPages(sessions);
  const payloads = new Map<string, Record<string, unknown>>([
    ["browser-order-1", { path: "/orders/new", orderRef: "provider-order-77" }],
  ]);
  const adapter = createBrowserOnlyConnectorAdapter({
    vault,
    client: pages,
    payloadResolver: { resolve: (ref) => payloads.get(ref) },
    clock,
    providerLabel: "FixtureBackOffice",
    providerOrigins: [PROVIDER_ORIGIN],
    capabilities: [CAPABILITY_CATALOG_OBSERVE, CAPABILITY_LISTINGS_MANAGE],
    implementations: [
      providerImplementationOf("depop", CAPABILITY_CATALOG_OBSERVE, ["BROWSER_AUTOMATION"]),
      providerImplementationOf("depop", CAPABILITY_LISTINGS_MANAGE, ["BROWSER_AUTOMATION"]),
    ],
  });
  const runtime = createConnectorRuntime({ vault, clock });
  return { clock, vault, sessions, pages, adapter, runtime };
}

/** The user-side flow: open a session and log in to the provider INSIDE it. */
function openLoggedInSession(rig: ReturnType<typeof createBrowserRig>): BrowserSessionHandle {
  const handle = rig.sessions.openSession({
    principal: asPrincipalRef("principal-merchant-browser"),
    routeCapability: asBrowserRouteCapabilityRef("browser-route-backoffice"),
    allowedOrigins: [PROVIDER_ORIGIN],
    allowedActions: ["navigate", "read-listings", "read-catalog", "place-order", "submit-form"],
    ttlSeconds: 3600,
  });
  // The USER types the provider password into the PAGE — it lives only in
  // the session's isolated storage partition from here on.
  rig.sessions.writeToSession(handle, "login-credential", "provider-password-S3cret!");
  // The page materializes a session cookie; the browser runtime captures
  // and seals it straight into the vault (nothing is returned).
  rig.sessions.captureBrowserMaterial(handle, { kind: "cookie", value: "provider-session-cookie-xyz" });
  return handle;
}

describe("Browser-only connector — scenario 4", () => {
  it("the full provider journey runs inside the isolated session; connect binds via the vaulted session reference", async () => {
    const rig = createBrowserRig();
    const handle = openLoggedInSession(rig);
    rig.adapter.bindSession(handle);
    const connector = rig.runtime.register(rig.adapter);
    const connected = await rig.runtime.connect({
      connectorId: connector.connectorId,
      accountRef: "account-browser-1",
      credential: {
        kind: "token",
        material: handle.sessionId as string,
        forAdapterId: rig.adapter.descriptor.adapterId,
        forAccountRef: "account-browser-1",
      },
      grantedPermissions: ["browser:read", "browser:place-order"],
      credentialScope: "browser.session",
      capabilityDefinitionId: CAPABILITY_LISTINGS_MANAGE.capabilityDefinitionId,
    });
    expect(connected.lifecycle).toBe("connected");
    const instanceId = connected.connectedInstances[0]?.connectedInstanceId ?? "";

    // Observe + execute through the session.
    const observation = await rig.adapter.observe();
    expect(observation.observation.status).toBe("NOMINAL");
    expect(observation.untrustedPayloads?.[0]?.sourceTransportId).toBe("browser");

    const outcome = await rig.adapter.execute({
      commandRef: "place-order",
      idempotencyKey: asIdempotencyKey("browser-order-key-1"),
      connectedInstanceId: instanceId,
      payloadRef: "browser-order-1",
    });
    expect(outcome.outcome).toBe("succeeded");
    expect(outcome.providerObjectIds).toEqual(["provider-order-77"]);
    // EVERY provider interaction went through the session, authorized.
    expect(rig.pages.authorizedCalls.length).toBeGreaterThanOrEqual(3);
    expect(rig.pages.authorizedCalls.every((call) => call.origin === PROVIDER_ORIGIN)).toBe(true);
    expect(rig.pages.refusedCalls).toHaveLength(0);
  });

  it("server side sees NO provider credentials — deep fail-closed value scan over every server-visible structure", async () => {
    const rig = createBrowserRig();
    const handle = openLoggedInSession(rig);
    rig.adapter.bindSession(handle);
    const connector = rig.runtime.register(rig.adapter);
    const connected = await rig.runtime.connect({
      connectorId: connector.connectorId,
      accountRef: "account-browser-2",
      credential: {
        kind: "token",
        material: handle.sessionId as string,
        forAdapterId: rig.adapter.descriptor.adapterId,
        forAccountRef: "account-browser-2",
      },
      grantedPermissions: ["browser:read", "browser:place-order"],
      credentialScope: "browser.session",
    });
    const instanceId = connected.connectedInstances[0]?.connectedInstanceId ?? "";
    const outcome = await rig.adapter.execute({
      commandRef: "place-order",
      idempotencyKey: asIdempotencyKey("browser-order-key-2"),
      connectedInstanceId: instanceId,
      payloadRef: "browser-order-1",
    });
    expect(outcome.outcome).toBe("succeeded");

    // The vault holds the sealed cookie + the session-scoped login value.
    expect(rig.vault.sealedCount).toBeGreaterThanOrEqual(2);
    // Deep VALUE scan: neither the provider password NOR the captured
    // cookie appears in ANY server-visible structure — adapter evidence,
    // runtime state, execution log, call records, model-context material.
    const serverVisible = [
      outcome,
      rig.runtime.connector(connector.connectorId),
      rig.runtime.executionLog(),
      rig.pages.authorizedCalls,
      rig.pages.refusedCalls,
    ];
    for (const structure of serverVisible) {
      expect(rig.vault.containsSealedMaterial(structure)).toBe(false);
    }
    // The session's own storage DOES hold the login (inside the partition
    // only) — proving the scan would have caught a leak.
    expect(rig.sessions.readFromSession(handle, "login-credential")).toBe("provider-password-S3cret!");
    // Model-context material stays clean (the only path toward model context).
    const cleared = toModelContextMaterial(
      {
        connectorLabel: rig.adapter.descriptor.userLabel,
        outcomeNote: outcome.note ?? "",
        evidence: outcome.evidenceSummaries ?? [],
      },
      rig.clock(),
    );
    expect(rig.vault.containsSealedMaterial(cleared)).toBe(false);
  });

  it("session-scope violations refuse the provider call (isolation enforced, not conventional)", async () => {
    const rig = createBrowserRig();
    // A session WITHOUT place-order authority in its OWN scope (the
    // adapter-level grant IS present — this asserts the session boundary).
    const handle = rig.sessions.openSession({
      principal: asPrincipalRef("principal-merchant-browser"),
      routeCapability: asBrowserRouteCapabilityRef("browser-route-backoffice"),
      allowedOrigins: [PROVIDER_ORIGIN],
      allowedActions: ["navigate", "read-catalog", "read-listings"],
    });
    rig.adapter.bindSession(handle);
    const connector = rig.runtime.register(rig.adapter);
    const connected = await rig.runtime.connect({
      connectorId: connector.connectorId,
      accountRef: "account-browser-3",
      credential: {
        kind: "token",
        material: handle.sessionId as string,
        forAdapterId: rig.adapter.descriptor.adapterId,
        forAccountRef: "account-browser-3",
      },
      grantedPermissions: ["browser:read", "browser:place-order"],
      credentialScope: "browser.session",
    });
    const instanceId = connected.connectedInstances[0]?.connectedInstanceId ?? "";
    const refused = await rig.adapter.execute({
      commandRef: "place-order",
      idempotencyKey: asIdempotencyKey("browser-order-refused"),
      connectedInstanceId: instanceId,
      payloadRef: "browser-order-1",
    });
    expect(refused.outcome).toBe("awaiting-customer-action");
    expect(refused.note).toContain("session scope refused");
    expect(rig.pages.refusedCalls).toHaveLength(1);

    // A session authorized for the action but pointed at a FOREIGN origin
    // is refused at the CONNECTION PROBE — the provider origin is fixed and
    // the session's scope simply does not cover it (fail-closed connect).
    const foreign = rig.sessions.openSession({
      principal: asPrincipalRef("principal-merchant-browser"),
      routeCapability: asBrowserRouteCapabilityRef("browser-route-backoffice"),
      allowedOrigins: ["https://other.example"],
      allowedActions: ["place-order", "read-catalog"],
    });
    rig.adapter.bindSession(foreign);
    const connectorTwo = rig.runtime.register(rig.adapter);
    const connectedTwo = await rig.runtime.connect({
      connectorId: connectorTwo.connectorId,
      accountRef: "account-browser-4",
      credential: {
        kind: "token",
        material: foreign.sessionId as string,
        forAdapterId: rig.adapter.descriptor.adapterId,
        forAccountRef: "account-browser-4",
      },
      grantedPermissions: ["browser:read", "browser:place-order"],
      credentialScope: "browser.session",
    });
    expect(connectedTwo.lifecycle).toBe("customer-action-required");
    expect(connectedTwo.connectedInstances).toHaveLength(0);
    expect(rig.pages.refusedCalls).toHaveLength(2);
  });

  it("capability scope: place-order without the browser route grant blocks pre-provider", async () => {
    const rig = createBrowserRig();
    const handle = openLoggedInSession(rig);
    rig.adapter.bindSession(handle);
    const connector = rig.runtime.register(rig.adapter);
    const connected = await rig.runtime.connect({
      connectorId: connector.connectorId,
      accountRef: "account-browser-5",
      credential: {
        kind: "token",
        material: handle.sessionId as string,
        forAdapterId: rig.adapter.descriptor.adapterId,
        forAccountRef: "account-browser-5",
      },
      grantedPermissions: ["browser:read"], // NO browser:place-order
      credentialScope: "browser.session",
    });
    const blocked = await rig.adapter.execute({
      commandRef: "place-order",
      idempotencyKey: asIdempotencyKey("browser-order-blocked"),
      connectedInstanceId: connected.connectedInstances[0]?.connectedInstanceId ?? "",
      payloadRef: "browser-order-1",
    });
    expect(blocked.outcome).toBe("failed-recoverable");
    expect(blocked.note).toContain("browser:place-order");
    expect(blocked.providerStatePreserved).toBe(true);
    expect(rig.pages.authorizedCalls.filter((call) => call.action === "place-order")).toHaveLength(0);
  });

  it("connect without a bound live session demands customer action (no silent server-side fallback)", async () => {
    const rig = createBrowserRig();
    const connector = rig.runtime.register(rig.adapter);
    const outcome = await rig.runtime.connect({
      connectorId: connector.connectorId,
      accountRef: "account-browser-6",
      credential: {
        kind: "token",
        material: "browser-session-nonexistent",
        forAdapterId: rig.adapter.descriptor.adapterId,
        forAccountRef: "account-browser-6",
      },
      grantedPermissions: ["browser:read"],
      credentialScope: "browser.session",
    });
    expect(outcome.lifecycle).toBe("customer-action-required");
    expect(rig.pages.authorizedCalls).toHaveLength(0);
  });
});
