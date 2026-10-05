/**
 * Runtime test — barcode/mobile count journey (W3-004 acceptance scenario
 * 2): edge count observations captured through the browser-only connector
 * (the store's count PWA inside an isolated browser session — no API
 * provider) journal through the LocalCommerceEdge EXACTLY-ONCE and fold into
 * the commerce seam's inventory facts as the CORRECT tri-state value,
 * asserted against the REAL commerce kernel + twin through the public
 * @unicom/commerce contract:
 * - OBSERVED count → CONFIRMED/PROMOTED → facts.countObservation OBSERVED;
 * - UNKNOWN count → NOT_PROMOTED_UNKNOWN → facts.countObservation UNKNOWN;
 * - FAILED count → NOT_PROMOTED_FAILED → facts.countObservation FAILED;
 * - a replayed observation NEVER folds twice (kernel receipt idempotency).
 */

import { describe, expect, it } from "vitest";
import { createBrowserSessionRuntime } from "../src/runtime/browser/session-runtime";
import { createBrowserOnlyConnectorAdapter, type BrowserProviderClient, type BrowserProviderCall, type BrowserProviderCallResult } from "../src/runtime/connector/browser-only";
import { createConnectorRuntime } from "../src/runtime/connector/runtime";
import { createCredentialVault } from "../src/runtime/connector/vault";
import { CAPABILITY_CATALOG_OBSERVE } from "../src/runtime/providers/capabilities";
import { providerImplementationOf } from "../src/runtime/providers/capabilities";
import { FirstProviderId } from "../src/runtime/providers/matrix";
import { createLocalCommerceEdge, type EdgePersistence, type EdgeQueuedJourney } from "../src/runtime/edge/local-commerce-edge";
import { asBrowserRouteCapabilityRef, asIdempotencyKey, asLocalEdgeDeviceId, asPhysicalObservationId, asPrincipalRef, asReconciliationChannelRef } from "../src/runtime/ids";
import type { BrowserSessionHandle } from "../src/contract";
import type { PhysicalObservation } from "../src/contract";
import { CommerceKernelLane, unknownResolution } from "./fixtures/commerce/kernel-rig";

const PROVIDER_ORIGIN = "https://count-pwa.store-backoffice.example";
const EDGE = asLocalEdgeDeviceId("edge-phone-count-1");
const CHANNEL = asReconciliationChannelRef("reconciliation-kernel");
const BARCODE_TO_SKU: Readonly<Record<string, string>> = {
  "6291041500213": "sku-milk",
  "6291041500214": "sku-bread",
  "6291041500215": "sku-apples",
};
const skuOfBarcode = (barcode: string): string => BARCODE_TO_SKU[barcode] ?? `sku-${barcode}`;

/** ⚠ TEST DOUBLE: the count-PWA page inside the isolated session. */
class FixtureCountPwaPages implements BrowserProviderClient {
  readonly authorizedCalls: BrowserProviderCall[] = [];
  constructor(private readonly sessions: ReturnType<typeof createBrowserSessionRuntime>) {}
  async perform(handle: BrowserSessionHandle | undefined, call: BrowserProviderCall): Promise<BrowserProviderCallResult> {
    if (handle === undefined) return { authorized: false, reason: "no browser session bound", httpLikeStatus: 401 };
    const decision = this.sessions.authorizeAction(handle, call.action as never, call.origin);
    if (!decision.authorized) return { authorized: false, reason: decision.reason, httpLikeStatus: 403 };
    this.authorizedCalls.push(call);
    if (call.action === "read-catalog" || call.action === "read-listings") {
      return {
        authorized: true,
        reason: "within the session's own scope",
        httpLikeStatus: 200,
        untrustedPageContent: '<div id="count-screen">Cycle count — aisle 3 <script>steal()</script></div>',
      };
    }
    return { authorized: true, reason: "within the session's own scope", httpLikeStatus: 200 };
  }
}

/** ⚠ TEST DOUBLE: in-memory durable persistence for the edge. */
class InMemoryEdgePersistence implements EdgePersistence {
  private stored: readonly EdgeQueuedJourney[] = [];
  saveJourneys(journeys: readonly EdgeQueuedJourney[]): void {
    this.stored = journeys.map((journey) => ({ ...journey }));
  }
  loadJourneys(): readonly EdgeQueuedJourney[] {
    return this.stored.map((journey) => ({ ...journey }));
  }
}

/** One employee mobile count observation (cycle-count payload). */
function mobileCountObservation(id: string, barcode: string, quantity: string): PhysicalObservation {
  return {
    observationId: asPhysicalObservationId(id),
    kind: "cycle-count",
    sourceClass: "barcode-scan",
    truthClass: "observed",
    capture: {
      capturedAt: "2026-10-07T11:00:00Z" as never,
      capturedBy: "employee",
      captureMode: "online",
      deviceRef: EDGE,
      locationRef: "store-1" as never,
    },
    payload: {
      kind: "cycle-count",
      cycleCount: { countedEntries: [{ barcode, countedQuantity: quantity }] },
    },
  };
}

function makeClock(baseIso: string): () => string {
  let ticks = 0;
  return () => new Date(Date.parse(baseIso) + ticks++ * 1000).toISOString();
}

describe("Barcode/mobile count journey — scenario 2", () => {
  it("counts captured through the browser-only connector journal exactly-once through the LocalCommerceEdge and fold OBSERVED into the commerce seam's inventory facts", async () => {
    // --- The capture surface: the count PWA inside an isolated session ---
    const clock = makeClock("2026-10-07T11:00:00Z");
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
    const handle = sessions.openSession({
      principal: asPrincipalRef("principal-employee-1"),
      routeCapability: asBrowserRouteCapabilityRef("browser-route-count-pwa"),
      allowedOrigins: [PROVIDER_ORIGIN],
      allowedActions: ["navigate", "read-listings", "read-catalog"],
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
    // The count screen reads through the isolated session (untrusted page
    // content sanitized at the boundary).
    const observed = await runtime.observe(connector.connectorId);
    expect(observed.observation?.status).toBe("NOMINAL");
    expect(pages.authorizedCalls.length).toBeGreaterThan(0);

    // --- The commerce lane behind the seam: the REAL kernel ---
    const lane = new CommerceKernelLane();
    await lane.receiveStock("sku-milk", "store-1", 26);
    await lane.receiveStock("sku-bread", "store-1", 20);

    // --- The shift: employee counts two subjects on the phone ---
    const edge = createLocalCommerceEdge({
      edgeDeviceId: EDGE,
      receivingChannel: CHANNEL,
      submitHandoff: lane.sink,
      executeJourney: async () => "succeeded",
      persistence: new InMemoryEdgePersistence(),
      clock,
    });
    const milkCount = mobileCountObservation("obs-count-milk-1", "6291041500213", "26");
    const breadCount = mobileCountObservation("obs-count-bread-1", "6291041500214", "20");
    expect(edge.enqueueObservation(milkCount, asIdempotencyKey("count-shift:milk-1")).status).toBe("queued");
    expect(edge.enqueueObservation(breadCount, asIdempotencyKey("count-shift:bread-1")).status).toBe("queued");
    // EXACTLY-ONCE journaling: a duplicate key never grows the queue.
    expect(edge.enqueueObservation(milkCount, asIdempotencyKey("count-shift:milk-1")).status).toBe("queued");
    expect(edge.health().observationQueue.queueDepth).toBe(2);

    // --- Drain to the commerce lane, fold through the REAL kernel ---
    edge.setConnectivity("online");
    const handoff = await edge.drainObservations();
    expect(handoff.observationIds).toHaveLength(2);
    await lane.reconcile({ skuOfBarcode, location: "store-1" });

    const facts = lane.facts();
    // Milk: counted 26 vs canonical 26 → CONFIRMED (no change).
    expect(facts.inventory.level("sku-milk" as never, "store-1" as never)?.onHand).toBe(26);
    // Bread: counted 20 vs canonical 20 → CONFIRMED.
    expect(facts.inventory.level("sku-bread" as never, "store-1" as never)?.onHand).toBe(20);
    // The seam's count-observation facts: OBSERVED for both subjects.
    expect(facts.inventory.countObservation("sku-milk" as never, "store-1" as never)).toEqual({ resolved: "OBSERVED" });
    expect(facts.inventory.countObservation("sku-bread" as never, "store-1" as never)).toEqual({ resolved: "OBSERVED" });
    // Reconciliation records exist for both folds.
    expect(facts.reconciliation.recordsForLevel("sku-milk" as never, "store-1" as never)).toHaveLength(1);

    // --- EXACTLY-ONCE at the kernel: replaying the same hand-off buffer
    // never folds a second fact (observation ids are the fold's keys). ---
    await lane.reconcile({ skuOfBarcode, location: "store-1" });
    expect(facts.reconciliation.recordsForLevel("sku-milk" as never, "store-1" as never)).toHaveLength(1);

    // And the edge's own late duplicate is ignored post-drain.
    expect(edge.enqueueObservation(milkCount, asIdempotencyKey("count-shift:milk-1")).status).toBe("duplicate-ignored");
  });

  it("a count within tolerance PROMOTES; a count beyond tolerance holds as an explicit DISCREPANCY (never a silent clamp)", async () => {
    const lane = new CommerceKernelLane();
    await lane.receiveStock("sku-apples", "store-1", 20);
    await lane.receiveStock("sku-eggs", "store-1", 30);

    // Within tolerance 5: counted 24 vs 20 → PROMOTED (onHand becomes 24).
    await lane.reconcileCount({
      observationId: "obs-count-apples-promote",
      skuId: "sku-apples",
      locationId: "store-1",
      kind: "BARCODE_COUNT",
      observedAt: "2026-10-07T11:30:00Z",
      resolution: { resolved: "OBSERVED", value: 24 },
    }, { toleranceUnits: 5, promoteWithinTolerance: true });
    expect(lane.facts().inventory.level("sku-apples" as never, "store-1" as never)?.onHand).toBe(24);

    // Beyond tolerance: counted 12 vs 30 → DISCREPANCY_HOLD — canonical
    // state UNCHANGED, the variance is explicit in the record.
    await lane.reconcileCount({
      observationId: "obs-count-eggs-discrepancy",
      skuId: "sku-eggs",
      locationId: "store-1",
      kind: "BARCODE_COUNT",
      observedAt: "2026-10-07T11:35:00Z",
      resolution: { resolved: "OBSERVED", value: 12 },
    }, { toleranceUnits: 5, promoteWithinTolerance: true });
    expect(lane.facts().inventory.level("sku-eggs" as never, "store-1" as never)?.onHand).toBe(30);
    const records = lane.facts().reconciliation.recordsForLevel("sku-eggs" as never, "store-1" as never);
    expect(records[0]?.disposition).toBe("DISCREPANCY_HOLD");
    expect(records[0]?.varianceUnits).toBe(-18);
    // The tri-state fact is still OBSERVED (an observed count that held).
    expect(lane.facts().inventory.countObservation("sku-eggs" as never, "store-1" as never)).toEqual({ resolved: "OBSERVED" });
  });

  it("UNKNOWN and FAILED counts fold to the CORRECT tri-state values — never promoted, never collapsed", async () => {
    const lane = new CommerceKernelLane();
    await lane.receiveStock("sku-unknown-subject", "store-1", 10);
    await lane.receiveStock("sku-failed-subject", "store-1", 10);

    // UNKNOWN (e.g. a partial scan session) → NOT_PROMOTED_UNKNOWN; the
    // seam's fact is UNKNOWN — NOT FAILED, NOT OBSERVED (INVARIANT 10).
    await lane.reconcileCount({
      observationId: "obs-count-unknown-1",
      skuId: "sku-unknown-subject",
      locationId: "store-1",
      kind: "CYCLE_COUNT",
      observedAt: "2026-10-07T12:00:00Z",
      resolution: unknownResolution("PARTIAL_DATA"),
    });
    expect(lane.facts().inventory.level("sku-unknown-subject" as never, "store-1" as never)?.onHand).toBe(10);
    expect(lane.facts().inventory.countObservation("sku-unknown-subject" as never, "store-1" as never)).toEqual({ resolved: "UNKNOWN" });

    // FAILED (the count attempt errored) → NOT_PROMOTED_FAILED; the seam's
    // fact is FAILED — a DISTINCT third state.
    await lane.reconcileCount({
      observationId: "obs-count-failed-1",
      skuId: "sku-failed-subject",
      locationId: "store-1",
      kind: "CYCLE_COUNT",
      observedAt: "2026-10-07T12:05:00Z",
      resolution: { resolved: "FAILED", error: "scanner hardware fault" },
    });
    expect(lane.facts().inventory.countObservation("sku-failed-subject" as never, "store-1" as never)).toEqual({ resolved: "FAILED" });
    expect(lane.facts().inventory.level("sku-failed-subject" as never, "store-1" as never)?.onHand).toBe(10);
  });

  it("kernel receipt idempotency: the SAME count observation replayed returns DUPLICATE with zero new facts", async () => {
    const lane = new CommerceKernelLane();
    await lane.receiveStock("sku-idem", "store-1", 8);
    const input = {
      observationId: "obs-count-idem-1",
      skuId: "sku-idem",
      locationId: "store-1",
      kind: "CYCLE_COUNT" as const,
      observedAt: "2026-10-07T12:10:00Z",
      resolution: { resolved: "OBSERVED" as const, value: 9 },
    };
    const first = await lane.reconcileCount(input, { toleranceUnits: 5, promoteWithinTolerance: true });
    expect(first.status).toBe("EXECUTED");
    expect(lane.facts().inventory.level("sku-idem" as never, "store-1" as never)?.onHand).toBe(9);

    const replay = await lane.reconcileCount(input, { toleranceUnits: 5, promoteWithinTolerance: true });
    expect(replay.status).toBe("DUPLICATE");
    // Zero duplicate facts: one reconciliation record, unchanged level.
    expect(lane.facts().reconciliation.recordsForLevel("sku-idem" as never, "store-1" as never)).toHaveLength(1);
    expect(lane.facts().inventory.level("sku-idem" as never, "store-1" as never)?.onHand).toBe(9);
  });
});
