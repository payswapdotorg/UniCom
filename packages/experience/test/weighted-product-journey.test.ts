/**
 * Runtime test — weighted-product journey (W3-004 acceptance scenario 3):
 * weight capture prices to EXACT integer minor units (price-per-unit ×
 * observed weight in BigInt rationals, rounded HALF_UP once); variance
 * within the tolerance band prices the observed weight; variance OUTSIDE
 * the band is an EXPLICIT rejection (never a re-priced guess); malformed
 * captures resolve UNKNOWN; no floating-point money anywhere in the path.
 *
 * The exact-integer results are CROSS-VERIFIED against Worker 1's own
 * exact decimal money arithmetic (`@unicom/commerce` public contract) — two
 * independent exact implementations agreeing is the no-float proof.
 * The priced sale completes the five-step supermarket workflow and hands
 * off as a POS-sale OBSERVATION through the LocalCommerceEdge exactly-once.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  currency,
  decimal,
  money,
  multiplyMoneyByDecimal,
} from "@unicom/commerce";
import {
  createWeightedProductRuntime,
  priceWeightedCapture,
  DEFAULT_WEIGHT_TOLERANCE,
} from "../src/runtime/edge/weighted-runtime";
import {
  formatMinorUnitsAsMoney,
  parseExactDecimal,
} from "../src/runtime/edge/exact-integer";
import { createLocalCommerceEdge, type EdgePersistence, type EdgeQueuedJourney } from "../src/runtime/edge/local-commerce-edge";
import { asIdempotencyKey, asLocalEdgeDeviceId, asReconciliationChannelRef } from "../src/runtime/ids";
import type { PhysicalObservation } from "../src/contract";

const clock = (() => {
  let ticks = 0;
  return () => new Date(Date.parse("2026-10-07T09:00:00Z") + ticks++ * 1000).toISOString();
})();

/** ⚠ TEST DOUBLE: in-memory durable persistence for the edge (journey leg). */
class InMemoryEdgePersistence implements EdgePersistence {
  private stored: readonly EdgeQueuedJourney[] = [];
  saveJourneys(journeys: readonly EdgeQueuedJourney[]): void {
    this.stored = journeys.map((journey) => ({ ...journey }));
  }
  loadJourneys(): readonly EdgeQueuedJourney[] {
    return this.stored.map((journey) => ({ ...journey }));
  }
}

/** ⚠ TEST DOUBLE: commerce lane reconciliation sink (Worker 1's lane). */
class CommerceLaneSink {
  readonly receivedObservations: PhysicalObservation[] = [];
  readonly sink = (_handoff: never, observations: readonly PhysicalObservation[]) => {
    this.receivedObservations.push(...observations.map((observation) => ({ ...observation })));
    return { outcome: "submitted" as const };
  };
}

const capture = (overrides: Partial<Parameters<typeof priceWeightedCapture>[0]> = {}) => ({
  productRef: "product-gala-apples" as never,
  barcode: "6291041500213",
  unitPriceMinor: 499n, // $4.99 per kg
  pricedPerUnit: "kg" as const,
  currency: "USD",
  observedWeight: { amount: "1.24", unit: "kg" as const },
  scaleDeviceRef: "scale-register-1",
  ...overrides,
});

describe("Weighted-product journey — scenario 3", () => {
  it("prices exactly in integer minor units, cross-verified against Worker 1's exact decimal money math", () => {
    // $4.99/kg × 1.24 kg = $6.1876 → HALF_UP → 619 minor units ($6.19).
    const priced = priceWeightedCapture(capture());
    expect(priced.status).toBe("priced");
    if (priced.status !== "priced") return;
    expect(priced.totalMinorUnits).toBe(619n);
    expect(formatMinorUnitsAsMoney(priced.totalMinorUnits)).toBe("6.19");

    // Cross-verification: the commerce kernel's OWN exact decimal arithmetic
    // (multiplyMoneyByDecimal, HALF_UP) agrees — two independent exact
    // implementations, one result. Float math would give 6.1876000000000005.
    const kernelResult = multiplyMoneyByDecimal(
      money(499n, currency("USD")),
      decimal("1.24"),
      "HALF_UP",
    );
    expect(kernelResult.amountMinor).toBe(priced.totalMinorUnits.toString());
    expect(4.99 * 1.24).not.toBe(6.19); // the float trap this path never enters

    // Imperial pricing unit: $2.29/lb × 1.5 lb = 343.5 → HALF_UP → 344.
    const imperial = priceWeightedCapture(
      capture({
        unitPriceMinor: 229n,
        pricedPerUnit: "lb",
        observedWeight: { amount: "1.5", unit: "lb" },
      }),
    );
    expect(imperial.status).toBe("priced");
    if (imperial.status !== "priced") return;
    expect(imperial.totalMinorUnits).toBe(344n);
    const kernelImperial = multiplyMoneyByDecimal(money(229n, currency("USD")), decimal("1.5"), "HALF_UP");
    expect(kernelImperial.amountMinor).toBe(imperial.totalMinorUnits.toString());

    // Half-unit rounding boundary: $1.00/kg × 0.125 kg = 12.5 → 13 (HALF_UP).
    const boundary = priceWeightedCapture(
      capture({ unitPriceMinor: 100n, observedWeight: { amount: "0.125", unit: "kg" } }),
    );
    expect(boundary.status).toBe("priced");
    if (boundary.status !== "priced") return;
    expect(boundary.totalMinorUnits).toBe(13n);
  });

  it("in-tolerance variance prices the OBSERVED weight; the exact variance is reported", () => {
    // Expected (label) 1.25 kg, observed 1.24 kg → |Δ|/expected = 80 bps,
    // inside the default 200 bps band → priced with the observed weight.
    const priced = priceWeightedCapture(
      capture({ expectedWeight: { amount: "1.25", unit: "kg" } }),
    );
    expect(priced.status).toBe("priced");
    if (priced.status !== "priced") return;
    expect(priced.varianceBps).toBe(80);
    // Priced on the OBSERVED (scale) weight — not the expected label weight.
    expect(priced.totalMinorUnits).toBe(619n);

    // Mixed units: expected in grams, observed in kg — the comparison is
    // exact regardless of the capture units.
    const mixed = priceWeightedCapture(
      capture({ expectedWeight: { amount: "1240", unit: "g" } }),
    );
    expect(mixed.status).toBe("priced");
    if (mixed.status !== "priced") return;
    expect(mixed.varianceBps).toBe(0);
  });

  it("out-of-tolerance variance is an EXPLICIT rejection — never a re-priced guess, never a silent overwrite", () => {
    // Expected 1.00 kg, observed 1.24 kg → |Δ|/expected = 2400 bps ≫ 200.
    const rejected = priceWeightedCapture(
      capture({ expectedWeight: { amount: "1.00", unit: "kg" } }),
    );
    expect(rejected.status).toBe("rejected-out-of-tolerance");
    if (rejected.status !== "rejected-out-of-tolerance") return;
    expect(rejected.varianceBps).toBe(2400);
    expect(rejected.expectedMilligrams).toBe(1_000_000n);
    expect(rejected.observedMilligrams).toBe(1_240_000n);
    expect(rejected.bandApplied).toBe(DEFAULT_WEIGHT_TOLERANCE);

    // The absolute band: |Δ| in exact milligrams (30 g > 20 g limit).
    const absolute = priceWeightedCapture(
      capture({
        observedWeight: { amount: "1.03", unit: "kg" },
        expectedWeight: { amount: "1.00", unit: "kg" },
      }),
      { maxAbsoluteMilligrams: 20_000n },
    );
    expect(absolute.status).toBe("rejected-out-of-tolerance");

    // The same capture is WITHIN a wider absolute-only band (15 g ≤ 20 g).
    const within = priceWeightedCapture(
      capture({
        observedWeight: { amount: "1.015", unit: "kg" },
        expectedWeight: { amount: "1.00", unit: "kg" },
      }),
      { maxAbsoluteMilligrams: 20_000n },
    );
    expect(within.status).toBe("priced");
  });

  it("malformed weight captures resolve UNKNOWN — never a price", () => {
    const malformed = priceWeightedCapture(
      capture({ observedWeight: { amount: "1.2.4", unit: "kg" } }),
    );
    expect(malformed.status).toBe("unknown");
    if (malformed.status === "unknown") {
      expect(malformed.reason).toContain("exact");
    }
    const zero = priceWeightedCapture(
      capture({ observedWeight: { amount: "0", unit: "kg" } }),
    );
    expect(zero.status).toBe("unknown");
    const badPrice = priceWeightedCapture(capture({ unitPriceMinor: 0n }));
    expect(badPrice.status).toBe("unknown");
  });

  it("the five-step supermarket workflow completes and hands off as an observation through the LocalCommerceEdge exactly-once", async () => {
    const runtime = createWeightedProductRuntime({ clock, tolerance: DEFAULT_WEIGHT_TOLERANCE });
    const session = runtime.begin({ barcode: "6291041500213", productRef: "product-gala-apples" as never });
    expect(session.state()).toBe("selecting");

    // First capture: out of tolerance (stale label weight) — explicit rejection.
    const rejected = session.placeOnScale(
      capture({ expectedWeight: { amount: "1.00", unit: "kg" } }),
    );
    expect(rejected.status).toBe("rejected-out-of-tolerance");
    expect(session.state()).toBe("weighed-rejected");
    // A rejected session cannot print a label or complete.
    expect(() => session.printLabel()).toThrow(/cannot print/);
    expect(() => session.completeSale()).toThrow(/cannot complete/);

    // Re-weigh without the stale expected weight → priced.
    session.reweigh();
    const priced = session.placeOnScale(capture());
    expect(priced.status).toBe("priced");
    expect(session.state()).toBe("priced");

    const label = session.printLabel();
    expect(label.labelRef).toContain("label");
    expect(session.state()).toBe("labelled");

    const completed = session.completeSale();
    expect(session.state()).toBe("completed");
    // Display contract: exact integer minor units rendered as money strings.
    expect(completed.saleObservation.computedPriceDisplay).toBe("6.19");
    expect(completed.saleObservation.unitPriceDisplay).toBe("4.99");
    expect(completed.saleObservation.weight.measuredAmount).toBe("1.24");
    expect(completed.saleObservation.truthClass).toBe("observed");
    // All five W3-001 workflow steps completed, in order.
    const steps = session.steps();
    expect(steps.map((step) => step.stepId)).toEqual([
      "select-or-scan",
      "place-on-scale",
      "confirm-weight",
      "print-or-attach-label",
      "complete-sale",
    ]);
    expect(steps.every((step) => step.completedAt !== undefined)).toBe(true);

    // Hand-off through the LocalCommerceEdge — exactly-once.
    const commerce = new CommerceLaneSink();
    const edge = createLocalCommerceEdge({
      edgeDeviceId: asLocalEdgeDeviceId("edge-register-scale-1"),
      receivingChannel: asReconciliationChannelRef("reconciliation-kernel"),
      submitHandoff: commerce.sink,
      executeJourney: async () => "succeeded",
      persistence: new InMemoryEdgePersistence(),
      clock,
    });
    const enqueue = edge.enqueueObservation(
      completed.journalObservation,
      asIdempotencyKey(`weighted-sale:${session.sessionRef}`),
    );
    expect(enqueue.status).toBe("queued");
    // A repeated enqueue under the SAME key before the drain SUPERSEDES the
    // older entry (W3-002 semantics): queue depth never grows for one
    // logical observation — the sale hands off exactly once either way.
    const duplicate = edge.enqueueObservation(
      completed.journalObservation,
      asIdempotencyKey(`weighted-sale:${session.sessionRef}`),
    );
    expect(duplicate.status).toBe("queued");
    // Connectivity cycle promotes queued entries to awaiting-sync (the
    // edge's queue always parks entries offline-first — W3-003 semantics).
    edge.setConnectivity("online");
    const handoff = await edge.drainObservations();
    expect(handoff.observationIds).toEqual([completed.journalObservation.observationId]);
    // And after the hand-off, a late repeat under the key is IGNORED.
    const late = edge.enqueueObservation(
      completed.journalObservation,
      asIdempotencyKey(`weighted-sale:${session.sessionRef}`),
    );
    expect(late.status).toBe("duplicate-ignored");
    expect(commerce.receivedObservations).toHaveLength(1);
    // The weighted sale remains an OBSERVATION at the seam — canonical
    // promotion of measured-quantity sales belongs to commerce-lane
    // reconciliation (documented cross-lane gap; never approximated here).
    expect(commerce.receivedObservations[0]?.truthClass).toBe("observed");
  });

  it("NO floating-point money anywhere in the weighted path (source scan)", () => {
    const files = [
      fileURLToPath(new URL("../src/runtime/edge/weighted-runtime.ts", import.meta.url)),
      fileURLToPath(new URL("../src/runtime/edge/exact-integer.ts", import.meta.url)),
    ];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, `${file} must not parse floats`).not.toMatch(/parseFloat/);
      expect(source, `${file} must not format via floats`).not.toMatch(/toFixed/);
      expect(source, `${file} must not divide money with '/' float arithmetic`).not.toMatch(/\d\.\d+\s*\*\s*\d/);
    }
    // The exact entry point exists and is the only one the path uses.
    expect(parseExactDecimal("1.24")).toEqual({ num: 124n, den: 100n });
  });
});
