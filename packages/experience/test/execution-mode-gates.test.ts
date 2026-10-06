/**
 * Runtime test — execution-mode gates on the W3-004 connector paths
 * (W3-004 acceptance scenario 8): every NEW connector path enforces the
 * W3-003 mode-permission matrix and the capability-scope gates —
 *
 * - the browser-only mobile-count path REJECTS OPTIMIZED_MULTI_PROVIDER
 *   (documented matrix rationale: the isolated session IS the rail);
 * - the POS import path blocks out-of-scope imports BEFORE any provider
 *   call, at BOTH the kernel gate (journey preconditions) and the adapter's
 *   own capability-scope check;
 * - a connector operating OUTSIDE its implemented capability surface is
 *   rejected — the journey has no candidate instance for the step.
 */

import { describe, expect, it } from "vitest";
import { ExecutionMode } from "@unicom/agent/capability";
import { createBrowserSessionRuntime } from "../src/runtime/browser/session-runtime";
import { createBrowserOnlyConnectorAdapter, type BrowserProviderClient, type BrowserProviderCall, type BrowserProviderCallResult } from "../src/runtime/connector/browser-only";
import { createConnectorRuntime } from "../src/runtime/connector/runtime";
import { createCredentialVault } from "../src/runtime/connector/vault";
import { createProviderJourneyRunner } from "../src/runtime/connector/journey";
import { createConnectorTelemetry } from "../src/runtime/connector/telemetry";
import { CAPABILITY_CATALOG_OBSERVE, CAPABILITY_ORDERS_EXECUTE, CAPABILITY_POS_IMPORT } from "../src/runtime/providers/capabilities";
import { providerImplementationOf } from "../src/runtime/providers/capabilities";
import { assertModePermitted, FirstProviderId } from "../src/runtime/providers/matrix";
import { createPosImportAdapter } from "../src/runtime/providers/pos-import";
import { createPosImportBatchStore } from "../src/runtime/connector/pos-import";
import { asAuthorizationContextRef, asBrowserRouteCapabilityRef, asIdempotencyKey, asPrincipalRef } from "../src/runtime/ids";
import type { BrowserSessionHandle } from "../src/contract";
import { FixturePlayer, PayloadStore, RecordingSleeper } from "./fixtures/providers/player";
import { posStore1Routes } from "./fixtures/providers/pos-fixtures";

const PROVIDER_ORIGIN = "https://count-pwa.store-backoffice.example";
const PRINCIPAL = asPrincipalRef("principal-gate-checker-1");
const AUTH = asAuthorizationContextRef("authorization-gates-1");

/** ⚠ TEST DOUBLE: the count-PWA page (authorizes through the session). */
class FixtureCountPwaPages implements BrowserProviderClient {
  constructor(private readonly sessions: ReturnType<typeof createBrowserSessionRuntime>) {}
  async perform(handle: BrowserSessionHandle | undefined, call: BrowserProviderCall): Promise<BrowserProviderCallResult> {
    if (handle === undefined) return { authorized: false, reason: "no browser session bound", httpLikeStatus: 401 };
    const decision = this.sessions.authorizeAction(handle, call.action as never, call.origin);
    if (!decision.authorized) return { authorized: false, reason: decision.reason, httpLikeStatus: 403 };
    return { authorized: true, reason: "within the session's own scope", httpLikeStatus: 200 };
  }
}

describe("Execution-mode gates on W3-004 connector paths — scenario 8", () => {
  it("the browser-only mobile-count path REJECTS OPTIMIZED_MULTI_PROVIDER per the documented matrix", async () => {
    const clock = (() => {
      let ticks = 0;
      return () => new Date(Date.parse("2026-10-07T18:00:00Z") + ticks++ * 1000).toISOString();
    })();
    const vault = createCredentialVault({ clock });
    const sessions = createBrowserSessionRuntime({ vault, clock, browserAdapterId: "browser-only-StoreCountPwa" });
    const pages = new FixtureCountPwaPages(sessions);
    const adapter = createBrowserOnlyConnectorAdapter({
      vault,
      client: pages,
      payloadResolver: { resolve: () => ({}) },
      clock,
      providerLabel: "StoreCountPwa",
      providerOrigins: [PROVIDER_ORIGIN],
      capabilities: [CAPABILITY_CATALOG_OBSERVE],
      implementations: [providerImplementationOf(FirstProviderId.BROWSER_ONLY, CAPABILITY_CATALOG_OBSERVE, ["BROWSER_AUTOMATION"])],
    });
    const runtime = createConnectorRuntime({ vault, clock });
    const telemetry = createConnectorTelemetry({ clock });
    const runner = createProviderJourneyRunner({ runtime, telemetry, clock });

    const handle = sessions.openSession({
      principal: PRINCIPAL,
      routeCapability: asBrowserRouteCapabilityRef("browser-route-count-pwa"),
      allowedOrigins: [PROVIDER_ORIGIN],
      allowedActions: ["navigate", "read-listings", "read-catalog"] as never,
      ttlSeconds: 3600,
    });
    adapter.bindSession(handle);
    const connector = runtime.register(adapter);
    const connected = await runtime.connect({
      connectorId: connector.connectorId,
      accountRef: "account-count-pwa-1",
      credential: { kind: "token", material: handle.sessionId as string, forAdapterId: adapter.descriptor.adapterId, forAccountRef: "account-count-pwa-1" },
      grantedPermissions: ["browser:read"],
      credentialScope: "browser.session",
      capabilityDefinitionId: CAPABILITY_CATALOG_OBSERVE.capabilityDefinitionId,
    });
    expect(connected.lifecycle).toBe("connected");

    // The connected instance carries the MATRIX-DERIVED mode grants —
    // OPTIMIZED is absent because the matrix row blocks it.
    const instance = connected.connectedInstances[0];
    expect(instance?.authorizedExecutionModes).toEqual([ExecutionMode.PASS_THROUGH_NATIVE, ExecutionMode.COMPOSED]);
    const matrix = assertModePermitted("browser-only", ExecutionMode.OPTIMIZED_MULTI_PROVIDER);
    expect(matrix.permitted).toBe(false);
    expect(matrix.rationale).toContain("isolated browser session");

    // The mobile-count journey in OPTIMIZED mode is REJECTED — an explicit
    // block with the kernel reason, never a silent gap.
    const result = await runner.run({
      journeyRef: "gate-browser-only-optimized",
      mode: ExecutionMode.OPTIMIZED_MULTI_PROVIDER,
      steps: [
        {
          stepRef: "step-read-count-screen",
          capabilityDefinitionId: CAPABILITY_CATALOG_OBSERVE.capabilityDefinitionId as never,
          preconditions: {
            requiresConnectedInstance: true,
            requiredCredentialScope: "browser.session" as never,
            requiredPermissions: ["browser:read"] as never,
            requiresCommercialTermsAccepted: true,
            requiresCurrentObservation: true,
          },
          commandRef: "submit-form",
          payloadRef: "count-screen-payload",
        },
      ],
      connectorIds: [connector.connectorId as never],
      requestedBy: PRINCIPAL,
      authorization: AUTH,
      idempotencySeed: "seed-gate-browser-optimized",
    });
    expect(result.modeBlocked).toBe(true);
    expect(result.dispatch.journeyOutcome).toBe("failed-recoverable");
    expect(result.dispatch.plannedSteps[0]?.executability.status).toBe("NOT_EXECUTABLE");
    if (result.dispatch.plannedSteps[0]?.executability.status === "NOT_EXECUTABLE") {
      expect(result.dispatch.plannedSteps[0].executability.reasons).toContain("EXECUTION_MODE_NOT_SUPPORTED");
    }
    // And the forbidden mode is recorded in the journey's evidence.
    expect(result.evidenceRecord.evidenceSummaries.join(" ")).toContain("EXECUTION_MODE_NOT_SUPPORTED");
  });

  it("the POS import path blocks an out-of-scope import at the ADAPTER boundary too — before any provider call", async () => {
    const clock = (() => {
      let ticks = 0;
      return () => new Date(Date.parse("2026-10-07T18:30:00Z") + ticks++ * 1000).toISOString();
    })();
    const vault = createCredentialVault({ clock });
    const player = new FixturePlayer(posStore1Routes);
    const payloads = new PayloadStore([["pos-import:inventory", {}]]);
    const adapter = createPosImportAdapter({
      http: player,
      vault,
      sink: createPosImportBatchStore(),
      payloadResolver: payloads,
      clock,
      backOfficeRef: "store-1",
      sleeper: new RecordingSleeper().sleep,
    });
    const runtime = createConnectorRuntime({ vault, clock });
    const registered = runtime.register(adapter);
    // Connected granting ONLY the catalog scope — inventory was never granted.
    await runtime.connect({
      connectorId: registered.connectorId,
      accountRef: "backoffice-store-1",
      credential: { kind: "api-secret", material: "pos-backoffice-token-store-1", forAdapterId: "pos-import-store-1", forAccountRef: "backoffice-store-1" },
      grantedPermissions: ["pos:items:read"],
      credentialScope: "pos.import",
      capabilityDefinitionId: CAPABILITY_POS_IMPORT.capabilityDefinitionId,
    });
    const instanceId = runtime.connector(registered.connectorId)?.connectedInstances[0]?.connectedInstanceId ?? "";
    const outcome = await adapter.execute({
      commandRef: "import-inventory",
      idempotencyKey: asIdempotencyKey("adapter-scope-gate-1"),
      connectedInstanceId: instanceId,
      payloadRef: "pos-import:inventory",
    });
    // The ADAPTER's own capability-scope check blocks the command...
    expect(outcome.outcome).toBe("failed-recoverable");
    expect(outcome.note).toContain("capability scope blocked");
    expect(outcome.providerStatePreserved).toBe(true);
    // ...and the provider was NEVER called (no inventory pull on the wire).
    expect(player.requestsFor("GET", /\/pos\/v1\/inventory\/levels/)).toHaveLength(0);
  });

  it("a connector operating OUTSIDE its implemented capability surface is rejected — no candidate instance for the step", async () => {
    const clock = (() => {
      let ticks = 0;
      return () => new Date(Date.parse("2026-10-07T19:00:00Z") + ticks++ * 1000).toISOString();
    })();
    const vault = createCredentialVault({ clock });
    const player = new FixturePlayer(posStore1Routes);
    const payloads = new PayloadStore([["pos-import:catalog", {}]]);
    const adapter = createPosImportAdapter({
      http: player,
      vault,
      sink: createPosImportBatchStore(),
      payloadResolver: payloads,
      clock,
      backOfficeRef: "store-1",
      sleeper: new RecordingSleeper().sleep,
    });
    const runtime = createConnectorRuntime({ vault, clock });
    const telemetry = createConnectorTelemetry({ clock });
    const runner = createProviderJourneyRunner({ runtime, telemetry, clock });
    const registered = runtime.register(adapter);
    await runtime.connect({
      connectorId: registered.connectorId,
      accountRef: "backoffice-store-1",
      credential: { kind: "api-secret", material: "pos-backoffice-token-store-1", forAdapterId: "pos-import-store-1", forAccountRef: "backoffice-store-1" },
      grantedPermissions: ["pos:items:read", "pos:inventory:read"],
      credentialScope: "pos.import",
      capabilityDefinitionId: CAPABILITY_POS_IMPORT.capabilityDefinitionId,
    });

    // An ORDER-EXECUTION journey against the POS import connector: the
    // adapter implements NO order capability — the journey is rejected.
    const result = await runner.run({
      journeyRef: "gate-out-of-capability-1",
      mode: ExecutionMode.PASS_THROUGH_NATIVE,
      steps: [
        {
          stepRef: "step-create-order-on-pos",
          capabilityDefinitionId: CAPABILITY_ORDERS_EXECUTE.capabilityDefinitionId as never,
          preconditions: {
            requiresConnectedInstance: true,
            requiredCredentialScope: "orders.write" as never,
            requiredPermissions: ["write_orders"] as never,
            requiresCommercialTermsAccepted: true,
            requiresCurrentObservation: true,
          },
          commandRef: "create-order",
          payloadRef: "order-payload",
        },
      ],
      connectorIds: [registered.connectorId as never],
      requestedBy: PRINCIPAL,
      authorization: AUTH,
      idempotencySeed: "seed-gate-out-of-capability",
    });
    expect(result.dispatch.journeyOutcome).toBe("failed-recoverable");
    expect(result.dispatch.plannedSteps[0]?.executability.status).toBe("NOT_EXECUTABLE");
    if (result.dispatch.plannedSteps[0]?.executability.status === "NOT_EXECUTABLE") {
      expect(result.dispatch.plannedSteps[0].executability.reasons).toContain("CATALOG_ONLY_NO_CONNECTED_INSTANCE");
    }
    // Nothing executed: the provider saw no order traffic at all.
    expect(player.requests.filter((request) => request.method === "POST")).toHaveLength(0);
  });

  it("the extended permission matrix stays consistent for the W3-004 rows", () => {
    expect(assertModePermitted("pos-import", ExecutionMode.PASS_THROUGH_NATIVE).permitted).toBe(true);
    expect(assertModePermitted("pos-import", ExecutionMode.COMPOSED).permitted).toBe(true);
    expect(assertModePermitted("pos-import", ExecutionMode.OPTIMIZED_MULTI_PROVIDER).permitted).toBe(true);
    expect(assertModePermitted("browser-only", ExecutionMode.PASS_THROUGH_NATIVE).permitted).toBe(true);
    expect(assertModePermitted("browser-only", ExecutionMode.COMPOSED).permitted).toBe(true);
    expect(assertModePermitted("browser-only", ExecutionMode.OPTIMIZED_MULTI_PROVIDER).permitted).toBe(false);
    // Unknown providers fail CLOSED (never a silent grant).
    expect(assertModePermitted("not-a-provider", ExecutionMode.PASS_THROUGH_NATIVE).permitted).toBe(false);
  });
});
