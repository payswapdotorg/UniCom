/**
 * Runtime test — reconciliation journey (W3-004 acceptance scenario 5):
 * edge counts vs system counts vs POS deltas reconcile with UNKNOWN
 * preservation, and a variance is an EXPLICIT JOURNALED state. The system
 * counts come from the REAL commerce kernel's inventory facts (the
 * @unicom/commerce seam); the fold drives the REAL kernel's
 * reconciliation commands; the dispositions land as immutable
 * reconciliation records with explicit variance units.
 */

import { describe, expect, it } from "vitest";
import { createReconciliationJourneyPlanner } from "../src/runtime/edge/reconciliation-journey";
import { CommerceKernelLane, unknownResolution } from "./fixtures/commerce/kernel-rig";

const makeClock = (baseIso: string) => () => baseIso;

describe("Reconciliation journey — scenario 5", () => {
  it("edge vs system vs POS deltas: balanced subjects confirm; variances journal explicitly and hold as DISCREPANCY; UNKNOWN survives end-to-end", async () => {
    const lane = new CommerceKernelLane();
    // Canonical seeding: system counts through the real kernel.
    await lane.receiveStock("sku-milk", "store-1", 26);
    await lane.receiveStock("sku-bread", "store-1", 20);
    await lane.receiveStock("sku-apples", "store-1", 20);

    // POS deltas captured at the registers but NOT yet synced into the kernel.
    const posDeltas = new Map<string, { resolved: "OBSERVED"; value: number } | { resolved: "UNKNOWN"; reason: string }>([
      ["sku-milk|store-1", { resolved: "OBSERVED", value: 2 }],
      ["sku-bread|store-1", { resolved: "OBSERVED", value: 2 }],
      // The apples POS export failed mid-batch — sold units are UNKNOWN.
      ["sku-apples|store-1", { resolved: "UNKNOWN", reason: "PARTIAL_DATA: POS export truncated mid-batch" }],
    ]);

    // Edge counts from the shift's mobile count observations.
    const edgeCounts = new Map<string, { resolved: "OBSERVED"; value: number }>([
      ["sku-milk|store-1", { resolved: "OBSERVED", value: 24 }],
      ["sku-bread|store-1", { resolved: "OBSERVED", value: 16 }],
      ["sku-apples|store-1", { resolved: "OBSERVED", value: 20 }],
    ]);

    const planner = createReconciliationJourneyPlanner({ toleranceUnits: 0, clock: makeClock("2026-10-07T13:00:00Z") });
    const plan = planner.plan({
      subjects: ["sku-milk|store-1", "sku-bread|store-1", "sku-apples|store-1"],
      edgeCountOf: (key) => edgeCounts.get(key),
      systemCountOf: (key) => lane.facts().inventory.level(key.split("|")[0] as never, key.split("|")[1] as never)?.onHand,
      posDeltasOf: (key) => posDeltas.get(key),
    });

    // Milk: edge 24 === system 26 − sold 2 → BALANCED.
    expect(plan.subjects[0]).toMatchObject({ subjectKey: "sku-milk|store-1", status: "balanced", varianceUnits: 0 });
    // Bread: edge 16 vs expected 18 (20 − 2) → VARIANCE −2, journaled.
    expect(plan.subjects[1]).toMatchObject({ subjectKey: "sku-bread|store-1", status: "variance", varianceUnits: -2 });
    // Apples: POS sync UNKNOWN → variance UNKNOWN — NEVER a guess.
    expect(plan.subjects[2]).toMatchObject({ subjectKey: "sku-apples|store-1", status: "unknown" });
    expect(plan.balanced).toBe(1);
    expect(plan.variance).toBe(1);
    expect(plan.unknown).toBe(1);
    // The variance journal: every decision journaled with its rationale.
    const breadEntry = plan.journal.find((entry) => entry.subjectKey === "sku-bread|store-1");
    expect(breadEntry?.status).toBe("variance");
    expect(breadEntry?.varianceUnits).toBe(-2);
    expect(breadEntry?.rationale).toContain("VARIANCE");
    expect(breadEntry?.journaledAt).toBe("2026-10-07T13:00:00Z");
    const applesEntry = plan.journal.find((entry) => entry.subjectKey === "sku-apples|store-1");
    expect(applesEntry?.status).toBe("unknown");
    expect(applesEntry?.rationale).toContain("never a guess");

    // --- The fold drives the REAL kernel, per the plan's decisions ---
    // 1. Sync the OBSERVED POS deltas (sold units leave canonical stock).
    await lane.reconcilePosSync({ observationId: "possync-milk-1", skuId: "sku-milk", locationId: "store-1", unitsSold: 2, observedAt: "2026-10-07T12:55:00Z" });
    await lane.reconcilePosSync({ observationId: "possync-bread-1", skuId: "sku-bread", locationId: "store-1", unitsSold: 2, observedAt: "2026-10-07T12:55:00Z" });
    // 2. The UNKNOWN apples POS sync folds NOT_PROMOTED_UNKNOWN.
    await lane.reconcilePosSync({
      observationId: "possync-apples-1",
      skuId: "sku-apples",
      locationId: "store-1",
      unitsSold: 0,
      observedAt: "2026-10-07T12:55:00Z",
      resolution: unknownResolution("PARTIAL_DATA"),
    });
    let facts = lane.facts();
    expect(facts.inventory.level("sku-milk" as never, "store-1" as never)?.onHand).toBe(24);
    expect(facts.inventory.level("sku-bread" as never, "store-1" as never)?.onHand).toBe(18);
    expect(facts.inventory.level("sku-apples" as never, "store-1" as never)?.onHand).toBe(20);

    // 3. Reconcile the edge counts per the plan:
    //    balanced → CONFIRMED; variance → DISCREPANCY_HOLD; unknown → NOT_PROMOTED_UNKNOWN.
    await lane.reconcileCount({
      observationId: "count-milk-journey-1",
      skuId: "sku-milk",
      locationId: "store-1",
      kind: "CYCLE_COUNT",
      observedAt: "2026-10-07T13:01:00Z",
      resolution: { resolved: "OBSERVED", value: 24 },
    });
    await lane.reconcileCount({
      observationId: "count-bread-journey-1",
      skuId: "sku-bread",
      locationId: "store-1",
      kind: "CYCLE_COUNT",
      observedAt: "2026-10-07T13:02:00Z",
      resolution: { resolved: "OBSERVED", value: 16 },
    });
    await lane.reconcileCount({
      observationId: "count-apples-journey-1",
      skuId: "sku-apples",
      locationId: "store-1",
      kind: "CYCLE_COUNT",
      observedAt: "2026-10-07T13:03:00Z",
      resolution: unknownResolution("CONFLICTING_OBSERVATIONS"),
    });

    facts = lane.facts();
    // Milk: CONFIRMED — no change, no discrepancy (the count fold's record;
    // the earlier PROMOTED record is the POS sync itself).
    expect(facts.inventory.level("sku-milk" as never, "store-1" as never)?.onHand).toBe(24);
    expect(facts.reconciliation.recordsForLevel("sku-milk" as never, "store-1" as never).some((record) => record.disposition === "CONFIRMED")).toBe(true);
    // Bread: DISCREPANCY_HOLD — canonical state unchanged, the variance is
    // an explicit journaled state in the immutable record.
    expect(facts.inventory.level("sku-bread" as never, "store-1" as never)?.onHand).toBe(18);
    const breadRecords = facts.reconciliation.recordsForLevel("sku-bread" as never, "store-1" as never);
    expect(breadRecords.some((record) => record.disposition === "DISCREPANCY_HOLD" && record.varianceUnits === -2)).toBe(true);
    // Apples: UNKNOWN PRESERVED end-to-end — the seam's count-observation
    // fact is UNKNOWN, never promoted, never collapsed (INVARIANT 10).
    expect(facts.inventory.countObservation("sku-apples" as never, "store-1" as never)).toEqual({ resolved: "UNKNOWN" });
    expect(facts.reconciliation.recordsForLevel("sku-apples" as never, "store-1" as never).some((record) => record.disposition === "NOT_PROMOTED_UNKNOWN")).toBe(true);
  });

  it("a POS sync that would drive stock negative is an explicit DISCREPANCY_NEGATIVE — never a silent clamp", async () => {
    const lane = new CommerceKernelLane();
    await lane.receiveStock("sku-eggs", "store-1", 3);
    await lane.reconcilePosSync({
      observationId: "possync-eggs-oversold",
      skuId: "sku-eggs",
      locationId: "store-1",
      unitsSold: 5,
      observedAt: "2026-10-07T13:10:00Z",
    });
    expect(lane.facts().inventory.level("sku-eggs" as never, "store-1" as never)?.onHand).toBe(3);
    const records = lane.facts().reconciliation.recordsForLevel("sku-eggs" as never, "store-1" as never);
    expect(records[0]?.disposition).toBe("DISCREPANCY_NEGATIVE");
    expect(records[0]?.varianceUnits).toBe(5);
  });

  it("missing inputs are UNKNOWN, never zero: no POS sync in the window keeps the variance UNKNOWN", () => {
    const planner = createReconciliationJourneyPlanner({ toleranceUnits: 0, clock: makeClock("2026-10-07T13:20:00Z") });
    const plan = planner.plan({
      subjects: ["sku-x|store-1"],
      edgeCountOf: () => ({ resolved: "OBSERVED", value: 10 }),
      systemCountOf: () => 10,
      posDeltasOf: () => undefined,
    });
    expect(plan.unknown).toBe(1);
    expect(plan.subjects[0]?.status).toBe("unknown");
    expect(plan.journal[0]?.rationale).toContain("sold units unknown");
  });
});
