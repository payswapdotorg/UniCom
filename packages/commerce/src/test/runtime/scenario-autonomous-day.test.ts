/**
 * W1-005 acceptance scenario 1 — the full autonomous store day.
 *
 * open → operate (till ops, a card sale, an in-policy price adjustment,
 * restock triggers + receiving, count reconcile) → close → reconcile, all
 * through the autonomous runtime with a deterministic stepping clock. The
 * whole day folds deterministically; a replay of the journal (full
 * persistent state AND the events alone) reconstructs the identical terminal
 * state; the twin equals the kernel at every step.
 */
import { describe, expect, it } from "vitest";
import {
  CommerceKernel,
  CommerceTwin,
  assertCanonicalEquivalence,
  assertTwinMatchesAuthoritative,
  countQuantity,
  makeId,
  money,
  reconstructAuthoritativeState,
  reconstructKernel,
} from "../../contract.js";
import { ScriptedPaymentDouble } from "./support/payment-double.js";
import { env, mustExecute } from "./support/envelopes.js";
import { steppingTimeSource } from "./support/clock.js";
import { autonomousPolicy, bootstrapAutonomousStore, storeActorOf, storeIdOf, usd } from "./support/autonomous-store.js";

const store = "store-downtown";
const storeActor = storeActorOf(store);
const skuTote = makeId<"SkuId">("sku-tote");
const locStore = makeId<"LocationId">("loc-store");
const card = { methodKind: "CARD" as const, tokenRef: "tok-day-1" };

async function rejected(kernel: CommerceKernel, payload: Parameters<typeof env>[0], actor = storeActor): Promise<{ code: string; detail: string }> {
  const outcome = await kernel.execute(env(payload, actor));
  expect(outcome.status).toBe("REJECTED");
  return outcome.status === "REJECTED" ? outcome.reason : { code: "?", detail: "?" };
}

function newKernel() {
  return new CommerceKernel({ paymentBoundary: new ScriptedPaymentDouble(), timeSource: steppingTimeSource() });
}

function twinOf(kernel: CommerceKernel) {
  const twin = CommerceTwin.fromEvents(kernel.events());
  assertTwinMatchesAuthoritative(twin.snapshot(), kernel.snapshot());
  assertCanonicalEquivalence(twin.snapshot(), kernel.snapshot());
  return twin;
}

describe("W1-005 acceptance scenario 1 — full autonomous store day (open → operate → close → reconcile)", () => {
  it("walks the whole day deterministically: cycles, tills, sales, prices, restock, reconcile + exact summary", async () => {
    const kernel = newKernel();
    await bootstrapAutonomousStore(kernel, store, autonomousPolicy(store, 1));

    // OPEN: the store begins its operating day (day key from the deterministic clock).
    await mustExecute(kernel, env({ type: "BEGIN_STORE_CYCLE", autonomousStoreId: storeIdOf(store) }, storeActor));
    let cycle = kernel.view().autonomousOps().allCycles()[0]!;
    expect(cycle.state).toBe("OPEN");
    expect(cycle.dayKey).toBe("2026-01-05");
    await mustExecute(kernel, env({ type: "ADVANCE_STORE_CYCLE", cycleId: cycle.cycleId, trigger: "OPERATE" }, storeActor));
    cycle = kernel.view().autonomousOps().cycle(cycle.cycleId)!;
    expect(cycle.state).toBe("OPERATING");
    // A second cycle for the same day is a deterministic rejection.
    await rejected(kernel, { type: "BEGIN_STORE_CYCLE", autonomousStoreId: storeIdOf(store) });

    // OPERATE — till: autonomous open with an in-band float ($100.00).
    await mustExecute(kernel, env({
      type: "AUTONOMOUS_OPEN_TILL",
      autonomousStoreId: storeIdOf(store),
      tillId: makeId<"TillId">("till-front"),
      openingCount: money("10000", usd),
    }, storeActor));
    const session = kernel.view().allStoreSessions().find((item) => item.autonomousStoreId === store) ?? kernel.view().allStoreSessions()[0]!;
    expect(session.state).toBe("OPEN");
    expect(session.staffRef).toEqual(storeActor);
    expect(session.openingCount.amountMinor).toBe("10000");

    // Cash sale tender (+$35.50) and a safe drop (−$20.00).
    await mustExecute(kernel, env({ type: "RECORD_TILL_OPERATION", sessionId: session.sessionId, operation: { kind: "TENDER_SALE", amount: money("3550", usd) } }, storeActor));
    await mustExecute(kernel, env({ type: "RECORD_TILL_OPERATION", sessionId: session.sessionId, operation: { kind: "CASH_OUT", amount: money("2000", usd), note: "safe drop" } }, storeActor));
    expect(kernel.view().storeSession(session.sessionId)!.expectedCash.amountMinor).toBe("11550");

    // Card sale through the checkout flow (composition with W1-004).
    await mustExecute(kernel, env({ type: "ADD_CART_LINE", cartId: makeId<"CartId">("cart-day"), skuId: skuTote, quantity: countQuantity(2), unitPrice: money("1899", usd) }));
    await mustExecute(kernel, env({ type: "OPEN_CHECKOUT", cartId: makeId<"CartId">("cart-day") }));
    const checkout = kernel.view().allCheckoutSessions()[0]!;
    await mustExecute(kernel, env({ type: "COMPLETE_CHECKOUT", checkoutSessionId: checkout.checkoutSessionId, merchantId: makeId<"MerchantId">("merchant-autoshop"), method: card }));
    const order = kernel.view().allOrders()[0]!;
    expect(order.paymentStatus).toBe("AUTHORIZED");
    expect(order.totals.grandTotal.amountMinor).toBe("3798");

    // In-policy price adjustment: $19.99 → $18.99 (delta $1.00 < $5.00, floor $11.00).
    await mustExecute(kernel, env({
      type: "ADJUST_SKU_PRICE",
      autonomousStoreId: storeIdOf(store),
      skuId: skuTote,
      newPrice: money("1899", usd),
      reason: "competitor match",
    }, storeActor));
    const price = kernel.view().autonomousOps().priceRecord(store, skuTote)!;
    expect(price.unitPrice.amountMinor).toBe("1899");
    expect(price.revision).toBe(2);
    const adjustment = kernel.view().autonomousOps().allPriceAdjustments()[0]!;
    expect(adjustment.applied).toBe(true);
    expect(adjustment.before.amountMinor).toBe("1999");
    expect(adjustment.after.amountMinor).toBe("1899");

    // Inventory: receive 10, sell 6 → on-hand 4 (≤ threshold 5) → restock triggers.
    await mustExecute(kernel, env({ type: "RECEIVE_STOCK", skuId: skuTote, locationId: locStore, units: 10, reason: "RECEIVING" }));
    await mustExecute(kernel, env({ type: "ADJUST_INVENTORY", skuId: skuTote, locationId: locStore, deltaUnits: -6, reason: "MANUAL" }));
    expect(kernel.view().level(skuTote, locStore)!.onHand).toBe(4);
    await mustExecute(kernel, env({ type: "AUTONOMOUS_RESTOCK", autonomousStoreId: storeIdOf(store), skuId: skuTote, locationId: locStore }, storeActor));
    const restock = kernel.view().autonomousOps().allRestockOrders()[0]!;
    expect(restock.units).toBe(20);
    expect(restock.plannedValue.amountMinor).toBe("4000");
    expect(restock.basis).toBe("POLICY");
    const po = kernel.view().purchaseOrder(restock.purchaseOrderId!)!;
    expect(po.state).toBe("SUBMITTED");
    expect(po.lines[0]!.orderedUnits).toBe(20);
    // A duplicate trigger while the PO is open is a JOURNALED violation (not silent).
    const before = kernel.events().length;
    await mustExecute(kernel, env({ type: "AUTONOMOUS_RESTOCK", autonomousStoreId: storeIdOf(store), skuId: skuTote, locationId: locStore }, storeActor));
    expect(kernel.events().length).toBe(before + 2); // policy application + escalation
    expect(kernel.view().autonomousOps().allRestockOrders()).toHaveLength(1);

    // The shipment arrives: receive the restock PO → on-hand 24.
    await mustExecute(kernel, env({ type: "ADVANCE_PURCHASE_ORDER", purchaseOrderId: po.purchaseOrderId, trigger: "SUPPLIER_CONFIRM" }));
    await mustExecute(kernel, env({ type: "RECEIVE_PURCHASE_ORDER", purchaseOrderId: po.purchaseOrderId, lines: [{ skuId: skuTote, units: 20 }] }));
    expect(kernel.view().level(skuTote, locStore)!.onHand).toBe(24);

    // Autonomous count reconcile within tolerance (observed 21, |−3| ≤ 3) → promoted.
    await mustExecute(kernel, env({
      type: "AUTONOMOUS_RECONCILE_COUNT",
      autonomousStoreId: storeIdOf(store),
      observation: {
        observationId: makeId<"ObservationId">("obs-day-1"),
        kind: "CYCLE_COUNT",
        skuId: skuTote,
        locationId: locStore,
        observedAt: "2026-01-05T12:00:00Z",
        source: { sourceType: "SCANNER", sourceRef: "scanner-front" },
        resolution: { resolved: "OBSERVED", value: 21 },
      },
    }, storeActor));
    expect(kernel.view().level(skuTote, locStore)!.onHand).toBe(21);
    expect(kernel.view().allReconciliationRecords()).toHaveLength(1);

    // CLOSE: till close counts $108.50 vs expected $115.50 → SHORT $7.00 ≥ $5.00 → escalation.
    await mustExecute(kernel, env({
      type: "AUTONOMOUS_CLOSE_TILL",
      autonomousStoreId: storeIdOf(store),
      sessionId: session.sessionId,
      closingCount: money("10850", usd),
    }, storeActor));
    expect(kernel.view().storeSession(session.sessionId)!.state).toBe("CLOSED");
    const variance = kernel.view().allCashVariances()[0]!;
    expect(variance.kind).toBe("SHORT");
    expect(variance.varianceAmount.amountMinor).toBe("700");
    const escalations = kernel.view().autonomousOps().allEscalations();
    expect(escalations).toHaveLength(2); // restock duplicate + cash variance
    expect(escalations[1]!.kind).toBe("CASH_VARIANCE");
    // Cycle close requires every till closed — now it holds.
    await mustExecute(kernel, env({ type: "ADVANCE_STORE_CYCLE", cycleId: cycle.cycleId, trigger: "CLOSE" }, storeActor));
    expect(kernel.view().autonomousOps().cycle(cycle.cycleId)!.state).toBe("CLOSED");

    // RECONCILE: the deterministic day summary, folded from journaled facts.
    await mustExecute(kernel, env({ type: "ADVANCE_STORE_CYCLE", cycleId: cycle.cycleId, trigger: "RECONCILE" }, storeActor));
    const reconciled = kernel.view().autonomousOps().cycle(cycle.cycleId)!;
    expect(reconciled.state).toBe("RECONCILED");
    expect(reconciled.summary).toEqual({
      closedSessions: 1,
      cashVarianceCount: 1,
      netCashVariance: money("-700", usd),
      escalationCount: 2,
      restockOrderCount: 1,
      restockSpend: money("4000", usd),
    });
    // Every autonomous action journaled its policy application.
    const applications = kernel.view().autonomousOps().allPolicyApplications();
    expect(applications.filter((item) => item.decision === "ALLOW")).toHaveLength(9);
    expect(applications.filter((item) => item.decision === "DENY")).toHaveLength(1);

    // Twin ≡ kernel, journal law, replay determinism (both replay paths).
    const twin = twinOf(kernel);
    expect(kernel.journalIsValid()).toBe(true);
    expect(twin.facts().autonomousStore.cyclesForStore(store)).toHaveLength(1);
    expect(twin.facts().autonomousStore.policyApplications().length).toBe(10);
    expect(reconstructKernel(kernel.persistentState()).snapshot()).toEqual(kernel.snapshot());
    expect(reconstructAuthoritativeState(kernel.events()).snapshot()).toEqual(kernel.snapshot());
  });

  it("cycle sequencing guards: cannot close with an open till, cannot skip states, wrong-store actor rejected", async () => {
    const kernel = newKernel();
    await bootstrapAutonomousStore(kernel, store, autonomousPolicy(store, 1));
    await mustExecute(kernel, env({ type: "BEGIN_STORE_CYCLE", autonomousStoreId: storeIdOf(store) }, storeActor));
    const cycle = kernel.view().autonomousOps().allCycles()[0]!;
    // RECONCILE from OPEN is an invalid transition.
    await rejected(kernel, { type: "ADVANCE_STORE_CYCLE", cycleId: cycle.cycleId, trigger: "RECONCILE" });
    await mustExecute(kernel, env({ type: "ADVANCE_STORE_CYCLE", cycleId: cycle.cycleId, trigger: "OPERATE" }, storeActor));
    // An open till blocks the close.
    await mustExecute(kernel, env({
      type: "AUTONOMOUS_OPEN_TILL",
      autonomousStoreId: storeIdOf(store),
      tillId: makeId<"TillId">("till-guard"),
      openingCount: money("5000", usd),
    }, storeActor));
    const closeBlocked = await rejected(kernel, { type: "ADVANCE_STORE_CYCLE", cycleId: cycle.cycleId, trigger: "CLOSE" });
    expect(closeBlocked.detail).toContain("still OPEN");
    // A different store principal cannot advance this store's cycle.
    await rejected(kernel, { type: "ADVANCE_STORE_CYCLE", cycleId: cycle.cycleId, trigger: "CLOSE" }, storeActorOf("store-other"));
    // Close the till, then the cycle closes and reconciles cleanly.
    const session = kernel.view().allStoreSessions().find((item) => item.autonomousStoreId === store)!;
    await mustExecute(kernel, env({ type: "AUTONOMOUS_CLOSE_TILL", autonomousStoreId: storeIdOf(store), sessionId: session.sessionId, closingCount: money("5000", usd) }, storeActor));
    await mustExecute(kernel, env({ type: "ADVANCE_STORE_CYCLE", cycleId: cycle.cycleId, trigger: "CLOSE" }, storeActor));
    await mustExecute(kernel, env({ type: "ADVANCE_STORE_CYCLE", cycleId: cycle.cycleId, trigger: "RECONCILE" }, storeActor));
    const reconciled = kernel.view().autonomousOps().cycle(cycle.cycleId)!;
    expect(reconciled.summary!.closedSessions).toBe(1);
    expect(reconciled.summary!.escalationCount).toBe(0);
    twinOf(kernel);
  });
});
