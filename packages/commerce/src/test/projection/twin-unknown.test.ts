/**
 * W1-003 acceptance scenario 6 — UNKNOWN observations survive projection.
 *
 * An UNKNOWN inventory count observation projects to UNKNOWN in the inventory
 * projection AND in the Commerce Twin — never promoted to OBSERVED, never
 * dropped, never collapsed into FAILED (INVARIANT 10: UNKNOWN ≠ FAILED).
 * FAILED observation attempts remain a DISTINCT third state. The preserved
 * tri-state is asserted at four layers: the reconciliation record (journal
 * fact), the inventory read model, the twin's facts query, and the twin's
 * canonical snapshot (which must still equal the kernel's exactly).
 */
import { describe, expect, it } from "vitest";
import {
  assertTwinMatchesAuthoritative,
  CommerceKernel,
  CommerceTwin,
  currency,
  makeId,
  money,
  type InventoryCountObservation,
  type PosSyncObservation,
} from "../../contract.js";
import { env, mustExecute } from "../runtime/support/envelopes.js";
import { ScriptedPaymentDouble } from "../runtime/support/payment-double.js";

const sku = makeId<"SkuId">("sku-unknown");
const loc = makeId<"LocationId">("loc-unknown");

function countObservation(observationId: string, resolution: InventoryCountObservation["resolution"]): InventoryCountObservation {
  return {
    observationId: makeId<"ObservationId">(observationId),
    kind: "CYCLE_COUNT",
    skuId: sku,
    locationId: loc,
    observedAt: "2026-10-05T00:00:00Z",
    source: { sourceType: "SCANNER", sourceRef: "scanner-1" },
    resolution,
  };
}

describe("W1-003 acceptance scenario 6 — UNKNOWN survives projection end-to-end", () => {
  it("an UNKNOWN inventory count projects to UNKNOWN in the inventory projection AND the twin", async () => {
    const kernel = new CommerceKernel();
    await mustExecute(kernel, env({ type: "RECEIVE_STOCK", skuId: sku, locationId: loc, units: 12, reason: "RECEIVING" }));
    const unknown: InventoryCountObservation["resolution"] = { resolved: "UNKNOWN", reason: "AMBIGUOUS", providerNativeStatus: "COUNT_UNCLEAR" };
    await mustExecute(kernel, env({
      type: "RECONCILE_COUNT_OBSERVATION",
      observation: countObservation("obs-unknown-1", unknown),
      policy: { toleranceUnits: 0, promoteWithinTolerance: true },
    }));
    const twin = CommerceTwin.fromEvents(kernel.events());

    // Layer 1 — the journal fact: NOT_PROMOTED_UNKNOWN recorded (no promotion event).
    const records = twin.reconciliation.records;
    expect(records).toHaveLength(1);
    expect(records[0]?.disposition).toBe("NOT_PROMOTED_UNKNOWN");
    expect(kernel.events().some((event) => event.kind === "INVENTORY_RECONCILED")).toBe(false);

    // Layer 2 — the inventory read model: tri-state fact is UNKNOWN.
    expect(twin.inventory.countObservations.get(`${sku}|${loc}`)).toEqual({ resolved: "UNKNOWN" });

    // Layer 3 — the twin's facts query: UNKNOWN, not OBSERVED, not FAILED.
    expect(twin.facts().inventory.countObservation(sku, loc)).toEqual({ resolved: "UNKNOWN" });

    // Layer 4 — the twin snapshot still equals the kernel snapshot exactly
    // (the UNKNOWN record is part of authoritative state, preserved verbatim).
    assertTwinMatchesAuthoritative(twin.snapshot(), kernel.snapshot());
    expect(twin.snapshot().reconciliationRecords[0]?.disposition).toBe("NOT_PROMOTED_UNKNOWN");

    // Canonical state was NOT touched by the UNKNOWN observation.
    expect(twin.facts().inventory.level(sku, loc)?.onHand).toBe(12);
  });

  it("UNKNOWN never silently becomes FAILED (and FAILED stays distinct)", async () => {
    const kernel = new CommerceKernel();
    await mustExecute(kernel, env({ type: "RECEIVE_STOCK", skuId: sku, locationId: loc, units: 20, reason: "RECEIVING" }));
    const unknown: InventoryCountObservation["resolution"] = { resolved: "UNKNOWN", reason: "TIMEOUT" };
    const failed: InventoryCountObservation["resolution"] = { resolved: "FAILED", error: "scanner hardware fault" };
    await mustExecute(kernel, env({
      type: "RECONCILE_COUNT_OBSERVATION",
      observation: countObservation("obs-unknown-2", unknown),
      policy: { toleranceUnits: 0, promoteWithinTolerance: true },
    }));
    await mustExecute(kernel, env({
      type: "RECONCILE_COUNT_OBSERVATION",
      observation: countObservation("obs-failed-1", failed),
      policy: { toleranceUnits: 0, promoteWithinTolerance: true },
    }));
    const twin = CommerceTwin.fromEvents(kernel.events());
    expect(twin.reconciliation.counters.get(`${sku}|${loc}`)).toEqual({
      promoted: 0,
      confirmed: 0,
      discrepancyHolds: 0,
      notPromotedUnknown: 1,
      notPromotedFailed: 1,
      notPromotedKind: 0,
    });
    // FAILED is the LATEST observation now — distinct from UNKNOWN, never conflated.
    expect(twin.facts().inventory.countObservation(sku, loc)).toEqual({ resolved: "FAILED" });
    // An OBSERVED count afterwards flips the latest-state to OBSERVED only via
    // a real reconciliation fact (deterministic promotion path).
    await mustExecute(kernel, env({
      type: "RECONCILE_COUNT_OBSERVATION",
      observation: countObservation("obs-observed-1", { resolved: "OBSERVED", value: 20 }),
      policy: { toleranceUnits: 0, promoteWithinTolerance: true },
    }));
    const twinAfter = CommerceTwin.fromEvents(kernel.events());
    expect(twinAfter.facts().inventory.countObservation(sku, loc)).toEqual({ resolved: "OBSERVED" });
    expect(twinAfter.facts().inventory.level(sku, loc)?.onHand).toBe(20); // CONFIRMED (variance 0)
    assertTwinMatchesAuthoritative(twinAfter.snapshot(), kernel.snapshot());
  });

  it("UNKNOWN POS-sync observations never decrement canonical stock", async () => {
    const kernel = new CommerceKernel();
    await mustExecute(kernel, env({ type: "RECEIVE_STOCK", skuId: sku, locationId: loc, units: 15, reason: "RECEIVING" }));
    const unknownPos: PosSyncObservation = {
      observationId: makeId<"ObservationId">("obs-pos-unknown"),
      kind: "POS_SYNC",
      skuId: sku,
      locationId: loc,
      observedAt: "2026-10-05T00:00:00Z",
      source: { sourceType: "POS", sourceRef: "pos-1" },
      resolution: { resolved: "UNKNOWN", reason: "PROVIDER_UNAVAILABLE", providerNativeStatus: "POS_SYNC_PENDING" },
    };
    await mustExecute(kernel, env({ type: "RECONCILE_POS_SYNC", observation: unknownPos }));
    const twin = CommerceTwin.fromEvents(kernel.events());
    expect(twin.facts().inventory.level(sku, loc)?.onHand).toBe(15);
    expect(twin.facts().inventory.countObservation(sku, loc)).toEqual({ resolved: "UNKNOWN" });
    expect(twin.reconciliation.records[0]?.disposition).toBe("NOT_PROMOTED_UNKNOWN");
    assertTwinMatchesAuthoritative(twin.snapshot(), kernel.snapshot());
  });

  it("UNKNOWN survives full rebuild, resume and the facts query identically", async () => {
    const kernel = new CommerceKernel();
    await mustExecute(kernel, env({ type: "RECEIVE_STOCK", skuId: sku, locationId: loc, units: 9, reason: "RECEIVING" }));
    await mustExecute(kernel, env({
      type: "RECONCILE_COUNT_OBSERVATION",
      observation: countObservation("obs-unknown-3", { resolved: "UNKNOWN", reason: "CONFLICTING_OBSERVATIONS" }),
      policy: { toleranceUnits: 0, promoteWithinTolerance: true },
    }));
    const events = kernel.events();
    const rebuilt = CommerceTwin.fromEvents(events);
    const prefixTwin = CommerceTwin.fromEvents(events.slice(0, 1));
    const resumed = CommerceTwin.resume(prefixTwin.checkpoint(), events.slice(1));
    for (const twin of [rebuilt, resumed]) {
      expect(twin.facts().inventory.countObservation(sku, loc)).toEqual({ resolved: "UNKNOWN" });
      expect(twin.snapshot().reconciliationRecords).toHaveLength(1);
      expect(twin.snapshot().reconciliationRecords[0]?.disposition).toBe("NOT_PROMOTED_UNKNOWN");
      expect(twin.facts().inventory.level(sku, loc)?.onHand).toBe(9);
    }
  });

  it("payment UNKNOWN intents and UNKNOWN refunds project as UNKNOWN in the twin", async () => {
    // Uses the scripted payment double's AMBIGUOUS mode on capture (UNKNOWN
    // with native status preserved) — the twin must mirror the kernel exactly,
    // UNKNOWN payment status included.
    const usd = currency("USD");
    const double = new ScriptedPaymentDouble();
    const kernel = new CommerceKernel({ paymentBoundary: double });
    await mustExecute(kernel, env({
      type: "CREATE_PAYMENT_INTENT",
      request: {
        amount: money("2500", usd),
        reference: { kind: "ORDER", orderId: makeId<"OrderId">("order-unknown-pay") },
        method: { methodKind: "CARD", tokenRef: "tok-unknown" },
      },
    }));
    const paymentId = kernel.view().allPaymentIntents()[0]?.paymentId as string;
    double.makeNextOutcomeAmbiguous("PROCESSING_STATE_UNCLEAR");
    await mustExecute(kernel, env({ type: "CAPTURE_PAYMENT", paymentId: makeId<"PaymentId">(paymentId) }));
    const twin = CommerceTwin.fromEvents(kernel.events());
    expect(twin.facts().payments.intents()).toHaveLength(1);
    expect(twin.facts().payments.intents()[0]?.status).toBe("UNKNOWN");
    expect(twin.facts().payments.intents()[0]?.providerNativeStatus).toBe("PROCESSING_STATE_UNCLEAR");
    expect(twin.facts().payments.unknownIntents()).toHaveLength(1);
    assertTwinMatchesAuthoritative(twin.snapshot(), kernel.snapshot());
  });
});
