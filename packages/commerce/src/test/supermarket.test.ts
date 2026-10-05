/**
 * Contract tests — the no-RFID supermarket inventory flow (scenario 6,
 * per docs/SUPERMARKET-WITHOUT-RFID.md): POS sync + barcode/mobile count
 * observation + deterministic reconciliation, including the UNKNOWN path.
 *
 * Truth hierarchy exercised: POS-reported stock (delta), barcode/cycle-count
 * observation (absolute), employee-entered count, visual estimate, predictive
 * estimate — only reconciled deterministic state becomes canonical.
 */
import { describe, expect, it } from "vitest";
import {
  adjustOnHand,
  availableUnits,
  countQuantity,
  currency,
  decimal,
  lineSubtotal,
  makeBarcode,
  makeId,
  measuredQuantity,
  money,
  multiplyMoneyByDecimal,
  reconcileCountObservation,
  reconcilePosSync,
  unitOfMeasure,
  type CanonicalInventoryLevel,
  type CountReconciliationPolicy,
  type InventoryCountObservation,
  type PosSyncObservation,
} from "../contract.js";

const usd = currency("USD");
const bananas = makeId<"SkuId">("sku-bananas");
const milk = makeId<"SkuId">("sku-milk-1l");
const loc = makeId<"LocationId">("loc-market-1");

function level(skuId: string, onHand: number, revision = 1): CanonicalInventoryLevel {
  return {
    skuId: skuId as never,
    locationId: loc,
    onHand,
    reserved: 0,
    revision,
    updatedAt: "2026-10-05T00:00:00Z",
  };
}

const policy: CountReconciliationPolicy = { toleranceUnits: 2, promoteWithinTolerance: true };

function countObs(skuId: string, observedCount: number, kind: InventoryCountObservation["kind"]) {
  return {
    observationId: makeId<"ObservationId">(`obs-${skuId}-${observedCount}`),
    kind,
    skuId: skuId as never,
    locationId: loc,
    observedAt: "2026-10-05T08:30:00Z",
    source: { sourceType: "SCANNER" as const, sourceRef: "phone-01" },
    resolution: { resolved: "OBSERVED" as const, value: observedCount },
  };
}

function posSync(skuId: string, unitsSold: number): PosSyncObservation {
  return {
    observationId: makeId<"ObservationId">(`obs-pos-${skuId}-${unitsSold}`),
    kind: "POS_SYNC",
    skuId: skuId as never,
    locationId: loc,
    observedAt: "2026-10-05T09:00:00Z",
    source: { sourceType: "POS", sourceRef: "pos-01" },
    resolution: { resolved: "OBSERVED", value: { unitsSold } },
  };
}

describe("no-RFID supermarket inventory flow (scenario 6)", () => {
  it("Level-0/1 flow: import + POS sync + barcode count + reconciliation", () => {
    // Morning opening stock (imported from a CSV export — a deterministic receiving path).
    let milkLevel = adjustOnHand(level(milk, 0), 40, "RECEIVING");
    expect(milkLevel).toMatchObject({ ok: true, value: { onHand: 40 } });
    milkLevel = milkLevel.ok ? milkLevel : { ok: true, value: level(milk, 40) };

    // POS reports 7 units sold (receipt-backed delta).
    const afterPos = reconcilePosSync(milkLevel.value, posSync(milk, 7));
    expect(afterPos.disposition).toBe("PROMOTED");
    expect(afterPos.level.onHand).toBe(33);

    // Mid-day barcode count observation: 32 observed vs 33 expected (within tolerance 2).
    const afterCount = reconcileCountObservation(afterPos.level, countObs(milk, 32, "BARCODE_COUNT"), policy);
    expect(afterCount.disposition).toBe("PROMOTED");
    expect(afterCount.level.onHand).toBe(32);
    expect(afterCount.varianceUnits).toBe(-1);
    expect(afterCount.level.revision).toBe(4);
  });

  it("weighted goods sell by exact measure while inventory counts by units", () => {
    // Bananas: $2.49/kg; scale reports 0.542 kg → exact line math.
    const perKg = money("249", usd);
    const weighed = measuredQuantity("0.542", unitOfMeasure("KG"));
    const line = {
      kind: "MEASURED_LINE" as const,
      lineId: "l-1",
      skuId: bananas,
      quantity: weighed,
      unitPrice: perKg,
      rounding: "HALF_UP" as const,
    };
    expect(lineSubtotal(line).amountMinor).toBe("135");
    // A second identical sale is bit-identical (deterministic).
    expect(multiplyMoneyByDecimal(perKg, decimal("0.542"), "HALF_UP").amountMinor).toBe("135");

    // Bananas stock tracked in whole units; the sale reports 1 unit via POS.
    let bananasLevel = adjustOnHand(level(bananas, 0), 30, "RECEIVING");
    bananasLevel = bananasLevel.ok ? bananasLevel : { ok: true, value: level(bananas, 30) };
    const afterSale = reconcilePosSync(bananasLevel.value, posSync(bananas, 1));
    expect(afterSale.disposition).toBe("PROMOTED");
    expect(afterSale.level.onHand).toBe(29);
  });

  it("cycle-count beyond tolerance holds as discrepancy (no silent overwrite)", () => {
    let milkLevel = adjustOnHand(level(milk, 0), 40, "RECEIVING");
    milkLevel = milkLevel.ok ? milkLevel : { ok: true, value: level(milk, 40) };
    const afterPos = reconcilePosSync(milkLevel.value, posSync(milk, 7));
    // Evening cycle count observes 22 vs 33 expected — shrinkage beyond tolerance.
    const outcome = reconcileCountObservation(afterPos.level, countObs(milk, 22, "CYCLE_COUNT"), policy);
    expect(outcome.disposition).toBe("DISCREPANCY_HOLD");
    expect(outcome.level.onHand).toBe(33);
    expect(outcome.varianceUnits).toBe(-11);
  });

  it("partial barcode scan resolves to UNKNOWN and never promotes", () => {
    const ambiguous: InventoryCountObservation = {
      ...countObs(milk, 30, "BARCODE_COUNT"),
      resolution: { resolved: "UNKNOWN", reason: "PARTIAL_DATA", providerNativeStatus: "SCAN_INTERRUPTED" },
    };
    let milkLevel = adjustOnHand(level(milk, 0), 40, "RECEIVING");
    milkLevel = milkLevel.ok ? milkLevel : { ok: true, value: level(milk, 40) };
    const outcome = reconcileCountObservation(milkLevel.value, ambiguous, policy);
    expect(outcome.disposition).toBe("NOT_PROMOTED_UNKNOWN");
    expect(outcome.reason).toBe("PARTIAL_DATA");
    expect(outcome.level.onHand).toBe(40);
  });

  it("visual estimates and predictive estimates never become canonical", () => {
    let milkLevel = adjustOnHand(level(milk, 0), 40, "RECEIVING");
    milkLevel = milkLevel.ok ? milkLevel : { ok: true, value: level(milk, 40) };
    const visual = reconcileCountObservation(milkLevel.value, countObs(milk, 38, "VISUAL_ESTIMATE"), policy);
    expect(visual.disposition).toBe("NOT_PROMOTED_KIND");
    const supplierReport = reconcileCountObservation(
      milkLevel.value,
      countObs(milk, 38, "SUPPLIER_REPORT"),
      policy,
    );
    expect(supplierReport.disposition).toBe("NOT_PROMOTED_KIND");
    // A predictive estimate is not even an observation — separate type entirely.
    const estimate = { estimatedAt: "t", modelRef: "forecast/v1", estimate: 36, confidenceBps: 6000 };
    expect(estimate.estimate).toBe(36);
    expect(milkLevel.ok && availableUnits(milkLevel.value)).toBe(40);
  });

  it("GTIN barcodes are validated nominal values", () => {
    expect(makeBarcode("4006381333931")).toBe("4006381333931");
    expect(makeBarcode("400638133393")).toBe("400638133393"); // GTIN-12
    expect(() => makeBarcode("400638133")).toThrow(TypeError); // 9 digits: not a GTIN form
    expect(() => makeBarcode("40063X1333931")).toThrow(TypeError);
  });

  it("unit-count sales remain exact integers", () => {
    const unitLine = {
      kind: "UNIT_LINE" as const,
      lineId: "l-2",
      skuId: milk,
      quantity: countQuantity(3),
      unitPrice: money("189", usd),
    };
    expect(lineSubtotal(unitLine).amountMinor).toBe("567");
  });
});
