/**
 * W1-007 acceptance scenario 4 — forecasting advisory: demand-signal projection
 * → reorder-point opportunity proposal typed as advisory; UNKNOWN preserved;
 * no automatic inventory mutation.
 *
 * Advisory law (W1-007 §scope 4): forecasting output is typed advisory state.
 * PROPOSE_REORDER journals a ReorderPointProposal as an OPPORTUNITY — it does
 * NOT mutate inventory. The autonomous store's AUTONOMOUS_RESTOCK is the only
 * path that mutates inventory from a forecast, separately authority-gated.
 * UNKNOWN is preserved when the forecast is UNKNOWN (INVARIANT 8/10).
 */
import { describe, expect, it } from "vitest";
import {
  CommerceKernel,
  computeDemandForecast,
  makeId,
  type DemandSignal,
  type ForecastResolution,
} from "../../contract.js";
import { env, mustExecute } from "./support/envelopes.js";

const sku = makeId<"SkuId">("sku-forecast");
const loc = makeId<"LocationId">("loc-warehouse");

function demandSignal(id: string, units: number, method: DemandSignal["method"]): DemandSignal {
  return {
    demandSignalId: makeId<"DemandSignalId">(id),
    skuId: sku,
    locationId: loc,
    periodStart: "2026-10-01T00:00:00Z",
    periodEnd: "2026-10-07T00:00:00Z",
    unitsObserved: units,
    method,
    observedAt: "2026-10-08T00:00:00Z",
    revision: 1,
  };
}

describe("W1-007 scenario 4 — forecasting advisory + UNKNOWN preservation", () => {
  it("records demand signals as journaled observations", async () => {
    const kernel = new CommerceKernel();
    await mustExecute(kernel, env({
      type: "RECORD_DEMAND_SIGNAL",
      signal: demandSignal("ds-1", 70, { kind: "SIMPLE_MOVING_AVERAGE", windowDays: 7 }),
    }));
    const signals = kernel.view().merchantOps().allDemandSignals();
    expect(signals).toHaveLength(1);
    expect(signals[0]!.unitsObserved).toBe(70);
  });

  it("computes OBSERVED forecast via SIMPLE_MOVING_AVERAGE when history is sufficient", () => {
    const forecast = computeDemandForecast([10, 20, 15, 25, 30, 10, 20], { kind: "SIMPLE_MOVING_AVERAGE", windowDays: 7 });
    expect(forecast.kind).toBe("OBSERVED");
    if (forecast.kind === "OBSERVED") expect(forecast.value).toBe(18); // floor(130/7)
  });

  it("preserves UNKNOWN when history is insufficient (never collapses to zero or FAILED)", () => {
    const forecast = computeDemandForecast([10], { kind: "SIMPLE_MOVING_AVERAGE", windowDays: 7 });
    expect(forecast.kind).toBe("UNKNOWN");
    if (forecast.kind === "UNKNOWN") expect(forecast.reason).toBe("INSUFFICIENT_HISTORY");
  });

  it("preserves UNKNOWN when there is no data at all", () => {
    const forecast = computeDemandForecast([], { kind: "SIMPLE_MOVING_AVERAGE", windowDays: 7 });
    expect(forecast.kind).toBe("UNKNOWN");
    if (forecast.kind === "UNKNOWN") expect(forecast.reason).toBe("NO_DATA");
  });

  it("computes OBSERVED forecast via EWMA_FIXED_DECAY", () => {
    const forecast = computeDemandForecast([100, 200, 150, 180, 120], { kind: "EWMA_FIXED_DECAY", decayBps: 3000 });
    expect(forecast.kind).toBe("OBSERVED");
  });

  it("proposes a reorder-point proposal as ADVISORY (never auto-mutates inventory)", async () => {
    const kernel = new CommerceKernel();
    // Seed inventory: 50 units on hand.
    await mustExecute(kernel, env({ type: "RECEIVE_STOCK", skuId: sku, locationId: loc, units: 50, reason: "RECEIVING" }));
    const onHandBefore = kernel.view().level(sku, loc)?.onHand;
    expect(onHandBefore).toBe(50);

    await mustExecute(kernel, env({
      type: "RECORD_DEMAND_SIGNAL",
      signal: demandSignal("ds-reorder", 70, { kind: "SIMPLE_MOVING_AVERAGE", windowDays: 7 }),
    }));
    await mustExecute(kernel, env({
      type: "PROPOSE_REORDER",
      sourceDemandSignalId: makeId<"DemandSignalId">("ds-reorder"),
      skuId: sku,
      locationId: loc,
      forecast: { kind: "OBSERVED", value: 10 } as ForecastResolution,
      currentOnHand: 50,
      leadTimeDays: 3,
      safetyStockUnits: 20,
    }));

    // The proposal is journaled as ADVISORY — inventory is NOT mutated.
    const onHandAfter = kernel.view().level(sku, loc)?.onHand;
    expect(onHandAfter).toBe(50); // unchanged — advisory never mutates truth

    const proposals = kernel.view().merchantOps().allReorderProposals();
    expect(proposals).toHaveLength(1);
    expect(proposals[0]!.status).toBe("PROPOSED");
    expect(proposals[0]!.suggestedReorderPoint).toBe(50); // 10 × 3 + 20
    expect(proposals[0]!.suggestedOrderQuantity).toBe(0); // max(0, 50 − 50)
    expect(proposals[0]!.forecast.kind).toBe("OBSERVED");
  });

  it("proposes a conservative reorder when forecast is UNKNOWN (preserves tri-state)", async () => {
    const kernel = new CommerceKernel();
    await mustExecute(kernel, env({ type: "RECEIVE_STOCK", skuId: sku, locationId: loc, units: 30, reason: "RECEIVING" }));
    await mustExecute(kernel, env({
      type: "RECORD_DEMAND_SIGNAL",
      signal: demandSignal("ds-unknown", 0, { kind: "SIMPLE_MOVING_AVERAGE", windowDays: 7 }),
    }));
    await mustExecute(kernel, env({
      type: "PROPOSE_REORDER",
      sourceDemandSignalId: makeId<"DemandSignalId">("ds-unknown"),
      skuId: sku,
      locationId: loc,
      forecast: { kind: "UNKNOWN", reason: "INSUFFICIENT_HISTORY" } as ForecastResolution,
      currentOnHand: 30,
      leadTimeDays: 5,
      safetyStockUnits: 15,
    }));
    const proposals = kernel.view().merchantOps().allReorderProposals();
    expect(proposals[0]!.forecast.kind).toBe("UNKNOWN");
    expect(proposals[0]!.suggestedReorderPoint).toBe(15); // safety stock only
    expect(proposals[0]!.suggestedOrderQuantity).toBe(0); // max(0, 15 − 30)
  });

  it("advances reorder proposals through ACCEPTED/REJECTED/SUPERSEDED", async () => {
    const kernel = new CommerceKernel();
    await mustExecute(kernel, env({
      type: "RECORD_DEMAND_SIGNAL",
      signal: demandSignal("ds-adv", 100, { kind: "SIMPLE_MOVING_AVERAGE", windowDays: 7 }),
    }));
    await mustExecute(kernel, env({
      type: "PROPOSE_REORDER",
      sourceDemandSignalId: makeId<"DemandSignalId">("ds-adv"),
      skuId: sku,
      locationId: loc,
      forecast: { kind: "OBSERVED", value: 15 } as ForecastResolution,
      currentOnHand: 10,
      leadTimeDays: 2,
      safetyStockUnits: 5,
    }));
    const proposalId = kernel.view().merchantOps().allReorderProposals()[0]!.reorderProposalId;

    await mustExecute(kernel, env({ type: "ADVANCE_REORDER_PROPOSAL", reorderProposalId: proposalId, trigger: "ACCEPT" }));
    expect(kernel.view().merchantOps().reorderProposal(proposalId)?.status).toBe("ACCEPTED");

    await mustExecute(kernel, env({ type: "ADVANCE_REORDER_PROPOSAL", reorderProposalId: proposalId, trigger: "SUPERSEDE" }));
    expect(kernel.view().merchantOps().reorderProposal(proposalId)?.status).toBe("SUPERSEDED");
  });
});
