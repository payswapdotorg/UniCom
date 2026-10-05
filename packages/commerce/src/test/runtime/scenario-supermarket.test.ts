/**
 * W1-002 runtime scenario 6 (twin of W1-001 scenario 6): the no-RFID
 * supermarket inventory flow on the real kernel, per
 * docs/SUPERMARKET-WITHOUT-RFID.md — imported opening stock, POS sync
 * (receipt-backed delta), barcode/mobile counts (absolute observation),
 * deterministic reconciliation, weighted sale, shrinkage hold, UNKNOWN
 * scan preservation. Hardware-independent: barcode + POS + scale only.
 */
import { describe, expect, it } from "vitest";
import {
  CommerceKernel,
  countQuantity,
  currency,
  makeId,
  measuredQuantity,
  money,
  reconstructKernel,
  unitOfMeasure,
  type CountReconciliationPolicy,
  type InventoryCountObservation,
} from "../../contract.js";
import { env, mustExecute } from "./support/envelopes.js";

const usd = currency("USD");
const milk = makeId<"SkuId">("sku-milk-1l");
const bananas = makeId<"SkuId">("sku-bananas");
const loc = makeId<"LocationId">("loc-market-1");
const policy: CountReconciliationPolicy = { toleranceUnits: 2, promoteWithinTolerance: true };

function countObs(skuId: typeof milk, observedCount: number, kind: InventoryCountObservation["kind"], observationId: string): InventoryCountObservation {
  return {
    observationId: makeId<"ObservationId">(observationId),
    kind,
    skuId,
    locationId: loc,
    observedAt: "2026-10-05T12:00:00Z",
    source: { sourceType: "SCANNER", sourceRef: "phone-01" },
    resolution: { resolved: "OBSERVED", value: observedCount },
  };
}

function posSync(skuId: typeof milk, unitsSold: number, observationId: string) {
  return {
    observationId: makeId<"ObservationId">(observationId),
    kind: "POS_SYNC" as const,
    skuId,
    locationId: loc,
    observedAt: "2026-10-05T12:00:00Z",
    source: { sourceType: "POS" as const, sourceRef: "pos-01" },
    resolution: { resolved: "OBSERVED" as const, value: { unitsSold } },
  };
}

describe("runtime scenario 6 — no-RFID supermarket day (real kernel)", () => {
  it("walks a full supermarket day: import → POS sales → barcode counts → shrinkage hold", async () => {
    const kernel = new CommerceKernel();

    // Morning: opening stock imported from a CSV export (deterministic receiving).
    await mustExecute(kernel, env({ type: "RECEIVE_STOCK", skuId: milk, locationId: loc, units: 40, reason: "RECEIVING" }));
    await mustExecute(kernel, env({ type: "RECEIVE_STOCK", skuId: bananas, locationId: loc, units: 30, reason: "RECEIVING" }));

    // POS reports 7 milk sold (receipt-backed delta: authoritative fact).
    await mustExecute(kernel, env({ type: "RECONCILE_POS_SYNC", observation: posSync(milk, 7, "obs-pos-milk-1") }));
    expect(kernel.view().level(milk, loc)?.onHand).toBe(33);

    // A weighted banana sale at the till: 0.542 kg × $2.49/kg → $1.35 exact.
    await mustExecute(kernel, env({
      type: "ADD_CART_LINE",
      cartId: makeId<"CartId">("cart-till-1"),
      skuId: bananas,
      quantity: measuredQuantity("0.542", unitOfMeasure("KG")),
      unitPrice: money("249", usd),
    }));
    await mustExecute(kernel, env({ type: "PLACE_ORDER", cartId: makeId<"CartId">("cart-till-1"), merchantId: makeId<"MerchantId">("merchant-market") }));
    const orderId = kernel.view().allOrders()[0]?.orderId as string;
    expect(kernel.view().order(orderId)?.totals.grandTotal).toMatchObject({ amountMinor: "135" });
    // Bananas stock counts whole units; the sale reports 1 unit via POS.
    await mustExecute(kernel, env({ type: "RECONCILE_POS_SYNC", observation: posSync(bananas, 1, "obs-pos-ban-1") }));
    expect(kernel.view().level(bananas, loc)?.onHand).toBe(29);

    // Mid-day barcode count on milk: 32 observed vs 33 expected (within tolerance).
    await mustExecute(kernel, env({
      type: "RECONCILE_COUNT_OBSERVATION",
      observation: countObs(milk, 32, "BARCODE_COUNT", "obs-bar-milk-1"),
      policy,
    }));
    expect(kernel.view().level(milk, loc)).toMatchObject({ onHand: 32, revision: 3 });

    // Evening cycle count observes 22 vs 32 expected — shrinkage beyond tolerance: HOLD.
    await mustExecute(kernel, env({
      type: "RECONCILE_COUNT_OBSERVATION",
      observation: countObs(milk, 22, "CYCLE_COUNT", "obs-cycle-milk-1"),
      policy,
    }));
    expect(kernel.view().level(milk, loc)?.onHand).toBe(32);
    expect(kernel.view().allReconciliationRecords().find((candidate) => candidate.observationId === "obs-cycle-milk-1")).toMatchObject({ disposition: "DISCREPANCY_HOLD", varianceUnits: -10 });

    // A partial mobile scan resolves to UNKNOWN — never promoted, never failed.
    const ambiguous: InventoryCountObservation = {
      ...countObs(bananas, 25, "BARCODE_COUNT", "obs-unknown-ban-1"),
      resolution: { resolved: "UNKNOWN", reason: "PARTIAL_DATA", providerNativeStatus: "SCAN_INTERRUPTED" },
    };
    await mustExecute(kernel, env({ type: "RECONCILE_COUNT_OBSERVATION", observation: ambiguous, policy }));
    expect(kernel.view().level(bananas, loc)?.onHand).toBe(29);
    expect(kernel.view().allReconciliationRecords().find((candidate) => candidate.observationId === "obs-unknown-ban-1")?.disposition).toBe("NOT_PROMOTED_UNKNOWN");

    expect(kernel.journalIsValid()).toBe(true);

    // The whole day replays deterministically into identical authoritative state.
    const replayed = reconstructKernel(kernel.persistentState());
    expect(replayed.snapshot()).toEqual(kernel.snapshot());
  });

  it("reconstructed supermarket state matches the domain reference projections", async () => {
    const kernel = new CommerceKernel();
    await mustExecute(kernel, env({ type: "RECEIVE_STOCK", skuId: milk, locationId: loc, units: 40, reason: "RECEIVING" }));
    await mustExecute(kernel, env({ type: "RECONCILE_POS_SYNC", observation: posSync(milk, 7, "obs-pos-milk-2") }));
    await mustExecute(kernel, env({
      type: "RECONCILE_COUNT_OBSERVATION",
      observation: countObs(milk, 32, "BARCODE_COUNT", "obs-bar-milk-2"),
      policy,
    }));
    const { inventoryProjection, inventoryKey } = await import("../../contract.js");
    const folded = kernel.events().reduce((state, event) => inventoryProjection.apply(state, event), inventoryProjection.initialState());
    expect(folded.levels.get(inventoryKey(milk, loc))).toEqual(kernel.view().level(milk, loc));
    void countQuantity;
  });
});
