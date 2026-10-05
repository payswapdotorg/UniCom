/**
 * W1-002 runtime scenario 4 (twin of W1-001 scenario 4): barcode count
 * observation reconciled into canonical inventory on the real kernel —
 * the ONLY promotion path is the deterministic reconciliation command,
 * and every outcome (PROMOTED, DISCREPANCY_HOLD, NOT_PROMOTED_UNKNOWN,
 * NOT_PROMOTED_KIND) is an auditable recorded fact.
 */
import { describe, expect, it } from "vitest";
import { CommerceKernel, makeId, type CountReconciliationPolicy, type InventoryCountObservation } from "../../contract.js";
import { env, mustExecute } from "./support/envelopes.js";

const milk = makeId<"SkuId">("sku-milk-1l");
const loc = makeId<"LocationId">("loc-market-1");
const policy: CountReconciliationPolicy = { toleranceUnits: 2, promoteWithinTolerance: true };

function countObs(observedCount: number, kind: InventoryCountObservation["kind"], observationId: string): InventoryCountObservation {
  return {
    observationId: makeId<"ObservationId">(observationId),
    kind,
    skuId: milk,
    locationId: loc,
    observedAt: "2026-10-05T08:30:00Z",
    source: { sourceType: "SCANNER", sourceRef: "phone-01" },
    resolution: { resolved: "OBSERVED", value: observedCount },
  };
}

describe("runtime scenario 4 — barcode count reconciliation (real kernel)", () => {
  it("promotes a within-tolerance barcode count and records the variance", async () => {
    const kernel = new CommerceKernel();
    await mustExecute(kernel, env({ type: "RECEIVE_STOCK", skuId: milk, locationId: loc, units: 40, reason: "RECEIVING" }));
    await mustExecute(kernel, env({ type: "RECONCILE_POS_SYNC", observation: {
      observationId: makeId<"ObservationId">("obs-pos-1"),
      kind: "POS_SYNC",
      skuId: milk,
      locationId: loc,
      observedAt: "2026-10-05T09:00:00Z",
      source: { sourceType: "POS", sourceRef: "pos-01" },
      resolution: { resolved: "OBSERVED", value: { unitsSold: 7 } },
    } }));
    expect(kernel.view().level(milk, loc)?.onHand).toBe(33);

    const reconciled = await mustExecute(kernel, env({
      type: "RECONCILE_COUNT_OBSERVATION",
      observation: countObs(32, "BARCODE_COUNT", "obs-bar-1"),
      policy,
    }));
    expect(kernel.view().level(milk, loc)).toMatchObject({ onHand: 32, revision: 3 });
    const record = kernel.view().allReconciliationRecords().find((candidate) => candidate.observationId === "obs-bar-1");
    expect(reconciled.receipt.subjectRefs).toContain(`RECONCILIATION_RECORD:${record?.reconciliationRecordId}`);
    expect(record).toMatchObject({ disposition: "PROMOTED", varianceUnits: -1, skuId: milk, locationId: loc });
    expect(kernel.journalIsValid()).toBe(true);
  });

  it("UNKNOWN observations never promote — state unchanged, reason recorded", async () => {
    const kernel = new CommerceKernel();
    await mustExecute(kernel, env({ type: "RECEIVE_STOCK", skuId: milk, locationId: loc, units: 40, reason: "RECEIVING" }));
    const ambiguous: InventoryCountObservation = {
      ...countObs(30, "BARCODE_COUNT", "obs-unknown-1"),
      resolution: { resolved: "UNKNOWN", reason: "PARTIAL_DATA", providerNativeStatus: "SCAN_INTERRUPTED" },
    };
    const outcome = await mustExecute(kernel, env({ type: "RECONCILE_COUNT_OBSERVATION", observation: ambiguous, policy }));
    expect(outcome.status).toBe("EXECUTED");
    expect(kernel.view().level(milk, loc)?.onHand).toBe(40);
    const record = kernel.view().allReconciliationRecords().find((candidate) => candidate.observationId === "obs-unknown-1");
    expect(record?.disposition).toBe("NOT_PROMOTED_UNKNOWN");
    expect(kernel.events().filter((event) => event.kind === "INVENTORY_RECONCILED")).toHaveLength(0);
  });

  it("counts beyond tolerance hold as DISCREPANCY (no silent overwrite)", async () => {
    const kernel = new CommerceKernel();
    await mustExecute(kernel, env({ type: "RECEIVE_STOCK", skuId: milk, locationId: loc, units: 40, reason: "RECEIVING" }));
    await mustExecute(kernel, env({
      type: "RECONCILE_COUNT_OBSERVATION",
      observation: countObs(22, "CYCLE_COUNT", "obs-cycle-1"),
      policy,
    }));
    expect(kernel.view().level(milk, loc)?.onHand).toBe(40);
    expect(kernel.view().allReconciliationRecords().find((candidate) => candidate.observationId === "obs-cycle-1")).toMatchObject({ disposition: "DISCREPANCY_HOLD", varianceUnits: -18 });
  });

  it("visual estimates and supplier reports never become canonical", async () => {
    const kernel = new CommerceKernel();
    await mustExecute(kernel, env({ type: "RECEIVE_STOCK", skuId: milk, locationId: loc, units: 40, reason: "RECEIVING" }));
    await mustExecute(kernel, env({
      type: "RECONCILE_COUNT_OBSERVATION",
      observation: countObs(38, "VISUAL_ESTIMATE", "obs-visual-1"),
      policy,
    }));
    expect(kernel.view().allReconciliationRecords().find((candidate) => candidate.observationId === "obs-visual-1")?.disposition).toBe("NOT_PROMOTED_KIND");
    await mustExecute(kernel, env({
      type: "RECONCILE_COUNT_OBSERVATION",
      observation: countObs(38, "SUPPLIER_REPORT", "obs-supplier-1"),
      policy,
    }));
    expect(kernel.view().allReconciliationRecords().find((candidate) => candidate.observationId === "obs-supplier-1")?.disposition).toBe("NOT_PROMOTED_KIND");
    expect(kernel.view().level(milk, loc)?.onHand).toBe(40);
  });
});
