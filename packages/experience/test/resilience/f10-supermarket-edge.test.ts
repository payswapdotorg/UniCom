/**
 * W2-010 — Family F10: no-RFID supermarket — offline queue / replay,
 * barcode-camera-weighted goods, reconciliation UNKNOWN, contradictory
 * counts. Fixture-contract evidence level.
 *
 * Drives the REAL OfflineObservationQueueRuntime (edge network loss,
 * duplicate-supersede replay, single handoff) and the REAL weighted-goods
 * runtime (exact integer pricing, tolerance bands, explicit UNKNOWN), plus
 * the REAL CommerceKernel count-reconciliation plane (NOT_PROMOTED_UNKNOWN,
 * DISCREPANCY_HOLD with canonical truth never silently overwritten).
 * No runtime is mocked.
 *
 * The VISIBLE dimension is asserted through the typed outcomes a rendered
 * capture/monitor UI would consume: queue health + sync statuses, typed
 * pricing results (priced / rejected-out-of-tolerance / unknown), typed
 * reconciliation dispositions and unchanged canonical availability views.
 */

import { describe, expect, it } from "vitest";
import { makeId } from "./adapters/resilience-rig";
import { availabilityViewOf, createResilienceKernel } from "./adapters/resilience-rig";
import { createOfflineObservationQueue } from "../../src/runtime/edge/offline-queue-runtime";
import { priceWeightedCapture, DEFAULT_WEIGHT_TOLERANCE } from "../../src/runtime/edge/weighted-runtime";
import type { PhysicalObservation, ReconciliationHandoff } from "../../src/contract";
import {
  asIdempotencyKey,
  asLocalEdgeDeviceId,
  asPhysicalObservationId,
  asReconciliationChannelRef,
} from "../../src/runtime/ids";
import { fixedClock } from "../../test/doubles";
import { scenarioById } from "./matrix/oracle";

const family = "F10";
const oracle = (suffix: string) => scenarioById(`W2-010-${family}-${suffix}`);

const CLOCK_BASE = "2026-10-10T09:00:00Z";
const SKU = makeId<"SkuId">("sku-f10-apples");
const LOC = makeId<"LocationId">("loc-f10-produce");

const barcodeObservation = (id: string, code: string): PhysicalObservation => ({
  observationId: asPhysicalObservationId(id),
  kind: "barcode-scan",
  sourceClass: "barcode-scan",
  truthClass: "observed",
  capture: {
    capturedAt: CLOCK_BASE,
    capturedBy: "employee",
    captureMode: "offline",
    deviceRef: asLocalEdgeDeviceId("edge-w2-f10"),
  },
  payload: {
    kind: "barcode-scan",
    scan: { symbology: "ean", code, scanContext: "count" },
  },
});

function newQueue(sink: (handoff: ReconciliationHandoff, observations: readonly PhysicalObservation[]) => { outcome: "submitted" | "unknown" }) {
  return createOfflineObservationQueue({
    edgeDeviceId: asLocalEdgeDeviceId("edge-w2-f10"),
    receivingChannel: asReconciliationChannelRef("reconciliation:w2-f10"),
    submitHandoff: sink,
    clock: fixedClock(CLOCK_BASE),
    syncMode: "manual",
  });
}

describe("W2-010 F10 — no-RFID supermarket: offline queue / weighted goods / reconciliation (fixture-contract)", () => {
  it("F10-S01: offline capture → outage hold → replay resumption with duplicate re-sync — handed off once, superseded never duplicated", async () => {
    expect(oracle("S01").expectedResultClass).toBe("expected-success");
    const handedOff: { handoff: ReconciliationHandoff; observations: readonly PhysicalObservation[] }[] = [];
    const queue = newQueue((handoff, observations) => {
      handedOff.push({ handoff, observations });
      return { outcome: "submitted" };
    });
    // The network is DOWN: three barcode scans queue offline.
    queue.enqueue(barcodeObservation("obs-f10-1", "6291041500213"), asIdempotencyKey("edge:obs-f10-1"));
    queue.enqueue(barcodeObservation("obs-f10-2", "6291041500220"), asIdempotencyKey("edge:obs-f10-2"));
    queue.enqueue(barcodeObservation("obs-f10-3", "6291041500237"), asIdempotencyKey("edge:obs-f10-3"));
    expect(queue.health().queueDepth).toBe(3);
    // The employee re-scans item 2 (a correction): the newer capture
    // SUPERSEDES the older entry under the same logical key — depth stays 3.
    const superseding = queue.enqueue(barcodeObservation("obs-f10-2b", "6291041500220"), asIdempotencyKey("edge:obs-f10-2"));
    expect(superseding.status).toBe("queued");
    expect(queue.health().queueDepth).toBe(3);
    const superseded = queue.entries().find((entry) => entry.observation.observationId === "obs-f10-2");
    expect(superseded?.syncStatus).toBe("duplicate-superseded");
    // VISIBLE during the outage: every entry shows its offline/awaiting-sync state.
    const pending = queue.entries().filter((entry) => entry.syncStatus !== "duplicate-superseded");
    expect(pending.length).toBe(3);
    // Network returns: one handoff carries the three live entries — the
    // superseding scan, never both scans of item 2 (arrival order: the
    // re-scanned entry drains in its re-scan position).
    queue.markOnline();
    const handoff = await queue.drain();
    expect([...handoff.observationIds].sort()).toEqual(["obs-f10-1", "obs-f10-2b", "obs-f10-3"]);
    expect(handoff.observationIds).not.toContain("obs-f10-2");
    expect(handedOff).toHaveLength(1);
    expect(handedOff[0]?.observations).toHaveLength(3);
    // The replayed duplicate re-sync (same key after handoff) is ignored.
    const repeat = queue.enqueue(barcodeObservation("obs-f10-2c", "6291041500220"), asIdempotencyKey("edge:obs-f10-2"));
    expect(repeat.status).toBe("duplicate-ignored");
    expect(queue.health().queueDepth).toBe(0);
  });

  it("F10-S02: weighted goods — exact integer pricing; out-of-tolerance is a typed rejection; malformed captures are UNKNOWN, never guessed", () => {
    expect(oracle("S02").expectedResultClass).toBe("expected-block");
    // Exact pricing: 1.234 kg at $4.99/kg = 615.67 minor → 616 (HALF_UP), no float drift.
    const priced = priceWeightedCapture({
      unitPriceMinor: 499n,
      pricedPerUnit: "kg",
      currency: "USD",
      observedWeight: { amount: "1.234", unit: "kg" },
      scaleDeviceRef: "scale-f10-1",
    });
    expect(priced).toMatchObject({ status: "priced", totalMinorUnits: 616n, currency: "USD" });
    // The expected weight matches → in tolerance with the variance recorded.
    const inBand = priceWeightedCapture({
      unitPriceMinor: 499n,
      pricedPerUnit: "kg",
      currency: "USD",
      observedWeight: { amount: "1.234", unit: "kg" },
      expectedWeight: { amount: "1.24", unit: "kg" },
      scaleDeviceRef: "scale-f10-1",
    });
    expect(inBand).toMatchObject({ status: "priced", varianceBps: 48 });
    // A tampered/wrong scale reading beyond the default ±2% band is a TYPED
    // rejection with the exact variance — the label is never silently repriced.
    const outOfBand = priceWeightedCapture({
      unitPriceMinor: 499n,
      pricedPerUnit: "kg",
      currency: "USD",
      observedWeight: { amount: "1.40", unit: "kg" },
      expectedWeight: { amount: "1.24", unit: "kg" },
      scaleDeviceRef: "scale-f10-1",
    }, DEFAULT_WEIGHT_TOLERANCE);
    expect(outOfBand.status).toBe("rejected-out-of-tolerance");
    if (outOfBand.status === "rejected-out-of-tolerance") {
      expect(outOfBand.varianceBps).toBeGreaterThan(200);
      expect(outOfBand.bandApplied).toEqual(DEFAULT_WEIGHT_TOLERANCE);
    }
    // VISIBLE: malformed/zero captures are UNKNOWN — the register never
    // guesses a price from a bad reading.
    const malformed = priceWeightedCapture({
      unitPriceMinor: 499n,
      pricedPerUnit: "kg",
      currency: "USD",
      observedWeight: { amount: "not-a-number", unit: "kg" },
      scaleDeviceRef: "scale-f10-1",
    });
    expect(malformed).toMatchObject({ status: "unknown" });
    const zero = priceWeightedCapture({
      unitPriceMinor: 499n,
      pricedPerUnit: "kg",
      currency: "USD",
      observedWeight: { amount: "0", unit: "kg" },
      scaleDeviceRef: "scale-f10-1",
    });
    expect(zero).toMatchObject({ status: "unknown", reason: expect.stringContaining("positive") });
    // A zero/negative price is unknown too — never a free item.
    const freeItem = priceWeightedCapture({
      unitPriceMinor: 0n,
      pricedPerUnit: "kg",
      currency: "USD",
      observedWeight: { amount: "1.0", unit: "kg" },
      scaleDeviceRef: "scale-f10-1",
    });
    expect(freeItem).toMatchObject({ status: "unknown" });
  });

  it("F10-S03: reconciliation UNKNOWN — the count folds NOT_PROMOTED_UNKNOWN; availability never silently zeroed", async () => {
    expect(oracle("S03").expectedResultClass).toBe("expected-block");
    const rig = createResilienceKernel();
    await rig.exec({ type: "RECEIVE_STOCK", skuId: SKU, locationId: LOC, units: 10, reason: "PURCHASE_ORDER" });
    const canonicalBefore = rig.kernel.view().level(SKU, LOC);
    // The scale/counter is unreadable — the observation resolves UNKNOWN.
    const outcome = await rig.exec({
      type: "RECONCILE_COUNT_OBSERVATION",
      observation: {
        observationId: makeId<"ObservationId">("obs-f10-s03"),
        kind: "CYCLE_COUNT",
        skuId: SKU,
        locationId: LOC,
        observedAt: "2026-10-11T08:30:00Z",
        source: { sourceType: "EDGE_DEVICE", sourceRef: "edge-f10-scale" },
        resolution: { resolved: "UNKNOWN", reason: "SCALE_UNREADABLE" },
      },
      policy: { toleranceUnits: 0, promoteWithinTolerance: true },
    });
    expect(outcome.status).toBe("EXECUTED"); // the UNKNOWN fact is journaled
    // VISIBLE: the disposition is NOT_PROMOTED_UNKNOWN — the canonical level
    // is untouched and the availability view never renders zero.
    const records = rig.kernel.view().allReconciliationRecords();
    expect(records.at(-1)).toMatchObject({ disposition: "NOT_PROMOTED_UNKNOWN" });
    expect(rig.kernel.view().level(SKU, LOC)).toEqual(canonicalBefore);
    expect(rig.kernel.view().level(SKU, LOC)?.onHand).toBe(10);
    expect(availabilityViewOf(rig.kernel.view().level(SKU, LOC)).displayStatus).toBe("in-stock");
  });

  it("F10-S04: contradictory counts from two devices — BOTH journaled, BOTH held; canonical truth never averaged or overwritten", async () => {
    expect(oracle("S04").expectedResultClass).toBe("expected-block");
    const rig = createResilienceKernel();
    await rig.exec({ type: "RECEIVE_STOCK", skuId: SKU, locationId: LOC, units: 10, reason: "PURCHASE_ORDER" });
    const canonicalBefore = rig.kernel.view().level(SKU, LOC);
    // Device A counts 3; device B counts 6; the system holds 10. Both
    // observations are journaled facts — neither silently wins.
    for (const [device, value] of [["edge-f10-device-a", 3], ["edge-f10-device-b", 6]] as const) {
      const outcome = await rig.exec({
        type: "RECONCILE_COUNT_OBSERVATION",
        observation: {
          observationId: makeId<"ObservationId">(`obs-f10-s04-${device}`),
          kind: "CYCLE_COUNT",
          skuId: SKU,
          locationId: LOC,
          observedAt: "2026-10-11T09:00:00Z",
          source: { sourceType: "EDGE_DEVICE", sourceRef: device },
          resolution: { resolved: "OBSERVED", value },
        },
        policy: { toleranceUnits: 0, promoteWithinTolerance: true },
      });
      expect(outcome.status).toBe("EXECUTED");
    }
    // VISIBLE: two reconciliation records exist — each a policy-coded hold
    // with its own variance — and the canonical level is EXACTLY unchanged.
    const records = rig.kernel.view().allReconciliationRecords();
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ disposition: "DISCREPANCY_HOLD", varianceUnits: -7 });
    expect(records[1]).toMatchObject({ disposition: "DISCREPANCY_HOLD", varianceUnits: -4 });
    expect(rig.kernel.view().level(SKU, LOC)).toEqual(canonicalBefore);
    expect(rig.kernel.view().level(SKU, LOC)?.onHand).toBe(10);
    // The availability view still renders the canonical truth (in-stock),
    // never a blend of the contradictory counts.
    expect(availabilityViewOf(rig.kernel.view().level(SKU, LOC)).displayStatus).toBe("in-stock");
  });
});
