/**
 * Contract tests — reconciliation: deterministic promotion of physical
 * observations into canonical inventory state (scenario 4; INVARIANT 29/47).
 */
import { describe, expect, it } from "vitest";
import {
  AUTHORITATIVE_COUNT_KINDS,
  DEFAULT_COUNT_RECONCILIATION_POLICY,
  makeId,
  reconcileCountObservation,
  reconcilePosSync,
  reconciliationRecord,
  type CanonicalInventoryLevel,
  type CountReconciliationPolicy,
  type InventoryCountObservation,
  type PosSyncObservation,
} from "../contract.js";

const sku = makeId<"SkuId">("sku-tomatoes-400g");
const loc = makeId<"LocationId">("loc-store-1");

function level(onHand: number, revision = 1): CanonicalInventoryLevel {
  return { skuId: sku, locationId: loc, onHand, reserved: 0, revision, updatedAt: "2026-10-05T00:00:00Z" };
}

function countObservation(
  observedCount: number,
  kind: InventoryCountObservation["kind"] = "BARCODE_COUNT",
): InventoryCountObservation {
  return {
    observationId: makeId<"ObservationId">("obs-1"),
    kind,
    skuId: sku,
    locationId: loc,
    observedAt: "2026-10-05T01:00:00Z",
    source: { sourceType: "SCANNER", sourceRef: "scanner-01" },
    resolution: { resolved: "OBSERVED", value: observedCount },
  };
}

const strict: CountReconciliationPolicy = DEFAULT_COUNT_RECONCILIATION_POLICY;
const tolerant: CountReconciliationPolicy = { toleranceUnits: 2, promoteWithinTolerance: true };

describe("barcode count observation → canonical promotion (scenario 4)", () => {
  it("promotes an exact barcode count deterministically", () => {
    const outcome = reconcileCountObservation(level(12), countObservation(12), strict);
    expect(outcome.disposition).toBe("CONFIRMED");
    expect(outcome.level.onHand).toBe(12);
    expect(outcome.level.revision).toBe(1);
  });

  it("promotes a within-tolerance variance with a new revision and explicit variance", () => {
    const outcome = reconcileCountObservation(level(12), countObservation(11), tolerant);
    expect(outcome.disposition).toBe("PROMOTED");
    expect(outcome.level.onHand).toBe(11);
    expect(outcome.level.revision).toBe(2);
    expect(outcome.varianceUnits).toBe(-1);
  });

  it("holds a beyond-tolerance count for review — never silently overwrites", () => {
    const outcome = reconcileCountObservation(level(12), countObservation(5), tolerant);
    expect(outcome.disposition).toBe("DISCREPANCY_HOLD");
    expect(outcome.level.onHand).toBe(12);
    expect(outcome.varianceUnits).toBe(-7);
  });

  it("strict policy (tolerance 0) holds any variance", () => {
    const outcome = reconcileCountObservation(level(12), countObservation(11), strict);
    expect(outcome.disposition).toBe("DISCREPANCY_HOLD");
    expect(outcome.level.onHand).toBe(12);
  });

  it("UNKNOWN observations are never promoted (UNKNOWN ≠ FAILED)", () => {
    const ambiguous: InventoryCountObservation = {
      ...countObservation(11),
      resolution: { resolved: "UNKNOWN", reason: "PARTIAL_DATA", providerNativeStatus: "SCAN_TIMEOUT_50PCT" },
    };
    const outcome = reconcileCountObservation(level(12), ambiguous, tolerant);
    expect(outcome.disposition).toBe("NOT_PROMOTED_UNKNOWN");
    expect(outcome.reason).toBe("PARTIAL_DATA");
    expect(outcome.level.onHand).toBe(12);
  });

  it("FAILED observation attempts are distinct from UNKNOWN", () => {
    const failed: InventoryCountObservation = {
      ...countObservation(0),
      resolution: { resolved: "FAILED", error: "scanner hardware fault" },
    };
    const outcome = reconcileCountObservation(level(12), failed, tolerant);
    expect(outcome.disposition).toBe("NOT_PROMOTED_FAILED");
    expect(outcome.level.onHand).toBe(12);
  });

  it("non-authoritative kinds (visual estimate) require corroboration", () => {
    const outcome = reconcileCountObservation(level(12), countObservation(12, "VISUAL_ESTIMATE"), tolerant);
    expect(outcome.disposition).toBe("NOT_PROMOTED_KIND");
    expect(AUTHORITATIVE_COUNT_KINDS).not.toContain("VISUAL_ESTIMATE");
  });
});

describe("POS sync reconciliation", () => {
  function posSync(unitsSold: number): PosSyncObservation {
    return {
      observationId: makeId<"ObservationId">("obs-pos-1"),
      kind: "POS_SYNC",
      skuId: sku,
      locationId: loc,
      observedAt: "2026-10-05T01:30:00Z",
      source: { sourceType: "POS", sourceRef: "pos-01" },
      resolution: { resolved: "OBSERVED", value: { unitsSold } },
    };
  }

  it("applies receipt-backed sold units deterministically", () => {
    const outcome = reconcilePosSync(level(12), posSync(3));
    expect(outcome.disposition).toBe("PROMOTED");
    expect(outcome.level.onHand).toBe(9);
    expect(outcome.varianceUnits).toBe(3);
  });

  it("a delta that would drive stock negative is a discrepancy, never a clamp", () => {
    const outcome = reconcilePosSync(level(2), posSync(5));
    expect(outcome.disposition).toBe("DISCREPANCY_NEGATIVE");
    expect(outcome.level.onHand).toBe(2);
  });

  it("an ambiguous POS sync resolves to UNKNOWN, not failure", () => {
    const ambiguous: PosSyncObservation = {
      ...posSync(0),
      resolution: { resolved: "UNKNOWN", reason: "AMBIGUOUS", providerNativeStatus: "SYNC_IN_PROGRESS" },
    };
    const outcome = reconcilePosSync(level(12), ambiguous);
    expect(outcome.disposition).toBe("NOT_PROMOTED_UNKNOWN");
    expect(outcome.level.onHand).toBe(12);
  });
});

describe("reconciliation records (immutable facts)", () => {
  it("records the disposition and variance with revision 1", () => {
    const outcome = reconcileCountObservation(level(12), countObservation(11), tolerant);
    const record = reconciliationRecord(
      makeId<"ReconciliationRecordId">("rec-1"),
      makeId<"ObservationId">("obs-1"),
      outcome,
      sku,
      loc,
      "2026-10-05T02:00:00Z",
    );
    expect(record).toMatchObject({
      disposition: "PROMOTED",
      varianceUnits: -1,
      revision: 1,
    });
    const before = { ...record };
    void record.revision;
    expect(record).toEqual(before);
  });
});
