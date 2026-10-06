/**
 * W1-005 acceptance scenario 2 — autonomous restock triggers.
 *
 * Inventory at/below the policy threshold → autonomous restock order +
 * purchase-order initiation within policy bounds (spend limit). Out-of-band
 * triggers (above threshold, no rule, duplicate pending order, spend breach)
 * are JOURNALED policy violations + explicit escalation states — never
 * silent drops. A human override may force a restock beyond the bands
 * (authority-backed, journaled).
 */
import { describe, expect, it } from "vitest";
import {
  CommerceKernel,
  CommerceTwin,
  assertCanonicalEquivalence,
  assertTwinMatchesAuthoritative,
  makeId,

} from "../../contract.js";
import { env, mustExecute } from "./support/envelopes.js";
import { autonomousPolicy, bootstrapAutonomousStore, ownerRef, storeActorOf, storeIdOf } from "./support/autonomous-store.js";

const store = "store-restock";
const storeActor = storeActorOf(store);
const skuTote = makeId<"SkuId">("sku-tote");
const skuMystery = makeId<"SkuId">("sku-unmanaged");
const locStore = makeId<"LocationId">("loc-store");

function newKernel(spendLimitMinor = "6000") {
  return { kernel: new CommerceKernel(), spendLimitMinor };
}

function twinOf(kernel: CommerceKernel) {
  const twin = CommerceTwin.fromEvents(kernel.events());
  assertTwinMatchesAuthoritative(twin.snapshot(), kernel.snapshot());
  assertCanonicalEquivalence(twin.snapshot(), kernel.snapshot());
  return twin;
}

describe("W1-005 acceptance scenario 2 — autonomous restock (threshold → order + PO within bounds; out-of-band journaled)", () => {
  it("above threshold → journaled violation (no silent drop, no PO); at threshold → order + PO initiation in bounds", async () => {
    const { kernel } = newKernel();
    await bootstrapAutonomousStore(kernel, store, autonomousPolicy(store, 1), { withPriceRecord: false });
    await mustExecute(kernel, env({ type: "RECEIVE_STOCK", skuId: skuTote, locationId: locStore, units: 10, reason: "RECEIVING" }));

    // Out-of-band trigger: stock 10 > threshold 5 → JOURNALED policy violation.
    await mustExecute(kernel, env({ type: "AUTONOMOUS_RESTOCK", autonomousStoreId: storeIdOf(store), skuId: skuTote, locationId: locStore }, storeActor));
    let applications = kernel.view().autonomousOps().allPolicyApplications();
    expect(applications).toHaveLength(1);
    expect(applications[0]!.actionKind).toBe("RESTOCK");
    expect(applications[0]!.decision).toBe("DENY");
    expect(applications[0]!.reasons).toEqual(["RESTOCK_OUT_OF_BAND"]);
    let escalations = kernel.view().autonomousOps().allEscalations();
    expect(escalations).toHaveLength(1);
    expect(escalations[0]!.kind).toBe("POLICY_VIOLATION");
    expect(kernel.view().allPurchaseOrders()).toHaveLength(0);
    expect(kernel.view().autonomousOps().allRestockOrders()).toHaveLength(0);

    // Unmanaged SKU (no rule) → journaled violation with NO_RESTOCK_RULE.
    await mustExecute(kernel, env({ type: "AUTONOMOUS_RESTOCK", autonomousStoreId: storeIdOf(store), skuId: skuMystery, locationId: locStore }, storeActor));
    applications = kernel.view().autonomousOps().allPolicyApplications();
    expect(applications[1]!.reasons).toEqual(["NO_RESTOCK_RULE"]);
    expect(kernel.view().allPurchaseOrders()).toHaveLength(0);

    // Sell down to the threshold (5) → in-band trigger.
    await mustExecute(kernel, env({ type: "ADJUST_INVENTORY", skuId: skuTote, locationId: locStore, deltaUnits: -5, reason: "MANUAL" }));
    await mustExecute(kernel, env({ type: "AUTONOMOUS_RESTOCK", autonomousStoreId: storeIdOf(store), skuId: skuTote, locationId: locStore }, storeActor));
    const restock = kernel.view().autonomousOps().allRestockOrders()[0]!;
    expect(restock.units).toBe(20);
    expect(restock.plannedValue.amountMinor).toBe("4000");
    expect(restock.basis).toBe("POLICY");
    const po = kernel.view().purchaseOrder(restock.purchaseOrderId!)!;
    expect(po.state).toBe("SUBMITTED");
    expect(po.supplierId).toBe(makeId<"SupplierId">("sup-north"));
    expect(po.destinationLocationId).toBe(locStore);
    const allowed = kernel.view().autonomousOps().allPolicyApplications()[2]!;
    expect(allowed.decision).toBe("ALLOW");
    expect(allowed.effectRef).toBe(`RESTOCK_ORDER:${restock.restockId}`);

    // Duplicate trigger while the PO is open → RESTOCK_ALREADY_PENDING violation.
    await mustExecute(kernel, env({ type: "AUTONOMOUS_RESTOCK", autonomousStoreId: storeIdOf(store), skuId: skuTote, locationId: locStore }, storeActor));
    expect(kernel.view().autonomousOps().allPolicyApplications()[3]!.reasons).toEqual(["RESTOCK_ALREADY_PENDING"]);
    expect(kernel.view().autonomousOps().allRestockOrders()).toHaveLength(1);

    // Twin folds the restock + PO; nothing swallowed.
    const twin = twinOf(kernel);
    expect(twin.facts().autonomousStore.restockOrdersForStore(store)).toHaveLength(1);
    expect(twin.facts().supply.purchaseOrders()).toHaveLength(1);
    expect(twin.facts().autonomousStore.escalations()).toHaveLength(3);
    expect(kernel.journalIsValid()).toBe(true);
  });

  it("spend limit bounds the PO value: a second in-band trigger over the limit is a journaled EXCEEDS_SPEND_LIMIT violation", async () => {
    const { kernel } = newKernel("6000");
    await bootstrapAutonomousStore(kernel, store, autonomousPolicy(store, 1, { spendLimitMinor: "6000" }), { withPriceRecord: false });
    await mustExecute(kernel, env({ type: "RECEIVE_STOCK", skuId: skuTote, locationId: locStore, units: 5, reason: "RECEIVING" }));
    // First order: $40.00 of $60.00 daily spend — in bounds.
    await mustExecute(kernel, env({ type: "AUTONOMOUS_RESTOCK", autonomousStoreId: storeIdOf(store), skuId: skuTote, locationId: locStore }, storeActor));
    expect(kernel.view().autonomousOps().allRestockOrders()).toHaveLength(1);
    // Receive the first PO so the pending guard no longer blocks.
    const first = kernel.view().autonomousOps().allRestockOrders()[0]!;
    const po = kernel.view().purchaseOrder(first.purchaseOrderId!)!;
    await mustExecute(kernel, env({ type: "ADVANCE_PURCHASE_ORDER", purchaseOrderId: po.purchaseOrderId, trigger: "SUPPLIER_CONFIRM" }));
    await mustExecute(kernel, env({ type: "RECEIVE_PURCHASE_ORDER", purchaseOrderId: po.purchaseOrderId, lines: [{ skuId: skuTote, units: 20 }] }));
    // Stock is now 25; sell back down to 5 → trigger again.
    await mustExecute(kernel, env({ type: "ADJUST_INVENTORY", skuId: skuTote, locationId: locStore, deltaUnits: -20, reason: "MANUAL" }));
    await mustExecute(kernel, env({ type: "AUTONOMOUS_RESTOCK", autonomousStoreId: storeIdOf(store), skuId: skuTote, locationId: locStore }, storeActor));
    // $40.00 (first, still committed — received) + $40.00 > $60.00 → DENY.
    const denial = kernel.view().autonomousOps().allPolicyApplications().at(-1)!;
    expect(denial.decision).toBe("DENY");
    expect(denial.reasons).toEqual(["EXCEEDS_SPEND_LIMIT"]);
    expect(kernel.view().autonomousOps().allRestockOrders()).toHaveLength(1);
    expect(kernel.view().autonomousOps().allEscalations().at(-1)!.kind).toBe("POLICY_VIOLATION");
    twinOf(kernel);
  });

  it("a human override forces an out-of-band restock beyond the spend limit (authority-backed, journaled, PO initiated)", async () => {
    const { kernel } = newKernel("1000");
    await bootstrapAutonomousStore(kernel, store, autonomousPolicy(store, 1, { spendLimitMinor: "1000" }), { withPriceRecord: false });
    await mustExecute(kernel, env({ type: "RECEIVE_STOCK", skuId: skuTote, locationId: locStore, units: 50, reason: "RECEIVING" }));
    // Above threshold, and the $40.00 order would exceed the $10.00 limit —
    // both bands are bypassed by the owner's override.
    await mustExecute(kernel, env({
      type: "RECORD_HUMAN_OVERRIDE",
      autonomousStoreId: storeIdOf(store),
      action: { kind: "RESTOCK", skuId: skuTote, locationId: locStore, units: 12, reason: "weekend rush forecast" },
      justification: "weather event expected",
    }, ownerRef));
    const override = kernel.view().autonomousOps().allOverrides()[0]!;
    expect(override.exercisedBy).toEqual(ownerRef);
    expect(override.onBehalfOf).toEqual(storeActor);
    expect(override.action).toEqual({ kind: "RESTOCK", skuId: skuTote, locationId: locStore, units: 12, reason: "weekend rush forecast" });
    const restock = kernel.view().autonomousOps().allRestockOrders()[0]!;
    expect(restock.basis).toBe("HUMAN_OVERRIDE");
    expect(restock.units).toBe(12);
    expect(restock.plannedValue.amountMinor).toBe("2400");
    expect(kernel.view().purchaseOrder(restock.purchaseOrderId!)!.state).toBe("SUBMITTED");
    const application = kernel.view().autonomousOps().allPolicyApplications()[0]!;
    expect(application.decision).toBe("OVERRIDE");
    expect(application.overrideRef).toBe(override.overrideId);
    // Overrides with no restock rule or bad units are deterministic refusals (zero events).
    const before = kernel.events().length;
    const badUnits = await kernel.execute(env({
      type: "RECORD_HUMAN_OVERRIDE",
      autonomousStoreId: storeIdOf(store),
      action: { kind: "RESTOCK", skuId: skuMystery, locationId: locStore, units: 5, reason: "x" },
      justification: "no rule",
    }, ownerRef));
    expect(badUnits.status).toBe("REJECTED");
    expect(kernel.events().length).toBe(before);
    twinOf(kernel);
  });
});
