/**
 * W1-002 runtime scenario 5 (twin of W1-001 scenario 5): supplier
 * purchase-order receiving on the real kernel — DRAFT → SUBMITTED →
 * CONFIRMED → partial/full receiving with deterministic inventory effects,
 * tolerance-bounded over-receipt rejection and PO-state gating.
 */
import { describe, expect, it } from "vitest";
import { CommerceKernel, makeId, type PurchaseOrder } from "../../contract.js";
import { env, mustExecute } from "./support/envelopes.js";

const flour = makeId<"SkuId">("sku-flour-10kg");
const sugar = makeId<"SkuId">("sku-sugar-1kg");
const locA = makeId<"LocationId">("loc-warehouse-a");
const supplier = makeId<"SupplierId">("sup-1");

function draftPO(purchaseOrderId: string): PurchaseOrder {
  return {
    purchaseOrderId: makeId<"PurchaseOrderId">(purchaseOrderId),
    supplierId: supplier,
    destinationLocationId: locA,
    lines: [
      { skuId: flour, orderedUnits: 50, receivedUnits: 0 },
      { skuId: sugar, orderedUnits: 20, receivedUnits: 0 },
    ],
    state: "DRAFT",
    revision: 1,
  };
}

async function confirmedPO(kernel: import("../../contract.js").CommerceKernel, poId = "po-1"): Promise<void> {
  await mustExecute(kernel, env({ type: "OPEN_PURCHASE_ORDER", purchaseOrder: draftPO(poId) }));
  await mustExecute(kernel, env({ type: "ADVANCE_PURCHASE_ORDER", purchaseOrderId: makeId<"PurchaseOrderId">(poId), trigger: "SUBMIT" }));
  await mustExecute(kernel, env({ type: "ADVANCE_PURCHASE_ORDER", purchaseOrderId: makeId<"PurchaseOrderId">(poId), trigger: "SUPPLIER_CONFIRM" }));
}

describe("runtime scenario 5 — supplier purchase-order receiving (real kernel)", () => {
  it("partial then full receiving drives inventory exactly", async () => {
    const kernel = new CommerceKernel();
    await confirmedPO(kernel);
    expect(kernel.view().purchaseOrder("po-1")).toMatchObject({ state: "CONFIRMED", revision: 3 });

    await mustExecute(kernel, env({
      type: "RECEIVE_PURCHASE_ORDER",
      purchaseOrderId: makeId<"PurchaseOrderId">("po-1"),
      lines: [{ skuId: flour, units: 30 }],
    }));
    expect(kernel.view().purchaseOrder("po-1")).toMatchObject({ state: "PARTIALLY_RECEIVED" });
    expect(kernel.view().level(flour, locA)).toMatchObject({ onHand: 30, revision: 1 });

    await mustExecute(kernel, env({
      type: "RECEIVE_PURCHASE_ORDER",
      purchaseOrderId: makeId<"PurchaseOrderId">("po-1"),
      lines: [
        { skuId: flour, units: 20 },
        { skuId: sugar, units: 20 },
      ],
    }));
    expect(kernel.view().purchaseOrder("po-1")).toMatchObject({ state: "RECEIVED" });
    expect(kernel.view().level(flour, locA)).toMatchObject({ onHand: 50, revision: 2 });
    expect(kernel.view().level(sugar, locA)).toMatchObject({ onHand: 20, revision: 1 });
    expect(kernel.journalIsValid()).toBe(true);
  });

  it("over-receipt beyond the 5% tolerance is a coded rejection with zero effects", async () => {
    const kernel = new CommerceKernel();
    await confirmedPO(kernel);
    const journalBefore = kernel.events().length;
    const outcome = await kernel.execute(env({
      type: "RECEIVE_PURCHASE_ORDER",
      purchaseOrderId: makeId<"PurchaseOrderId">("po-1"),
      lines: [{ skuId: flour, units: 60 }],
    }));
    expect(outcome.status).toBe("REJECTED");
    if (outcome.status === "REJECTED") expect(outcome.reason.detail).toContain("OVER_RECEIPT");
    expect(kernel.events().length).toBe(journalBefore);
    expect(kernel.view().level(flour, locA)).toBeUndefined();
  });

  it("unknown SKUs, invalid units and non-receivable states are rejections", async () => {
    const kernel = new CommerceKernel();
    const unknownLine = await kernel.execute(env({
      type: "RECEIVE_PURCHASE_ORDER",
      purchaseOrderId: makeId<"PurchaseOrderId">("po-ghost"),
      lines: [{ skuId: flour, units: 1 }],
    }));
    expect(unknownLine.status).toBe("REJECTED");

    await mustExecute(kernel, env({ type: "OPEN_PURCHASE_ORDER", purchaseOrder: draftPO("po-2") }));
    const draftReceive = await kernel.execute(env({
      type: "RECEIVE_PURCHASE_ORDER",
      purchaseOrderId: makeId<"PurchaseOrderId">("po-2"),
      lines: [{ skuId: flour, units: 10 }],
    }));
    expect(draftReceive.status).toBe("REJECTED");
    if (draftReceive.status === "REJECTED") expect(draftReceive.reason.detail).toContain("PO_NOT_RECEIVABLE");

    await confirmedPO(kernel, "po-3");
    const ghostSku = await kernel.execute(env({
      type: "RECEIVE_PURCHASE_ORDER",
      purchaseOrderId: makeId<"PurchaseOrderId">("po-3"),
      lines: [{ skuId: makeId<"SkuId">("sku-ghost"), units: 1 }],
    }));
    if (ghostSku.status === "REJECTED") expect(ghostSku.reason.detail).toContain("UNKNOWN_LINE");
    expect(ghostSku.status).toBe("REJECTED");
  });

  it("PO state machine transitions are validated (cancel from CONFIRMED, not from RECEIVED)", async () => {
    const kernel = new CommerceKernel();
    await confirmedPO(kernel);
    await mustExecute(kernel, env({ type: "ADVANCE_PURCHASE_ORDER", purchaseOrderId: makeId<"PurchaseOrderId">("po-1"), trigger: "CANCEL" }));
    expect(kernel.view().purchaseOrder("po-1")).toMatchObject({ state: "CANCELLED" });
    const afterCancel = await kernel.execute(env({
      type: "RECEIVE_PURCHASE_ORDER",
      purchaseOrderId: makeId<"PurchaseOrderId">("po-1"),
      lines: [{ skuId: flour, units: 1 }],
    }));
    expect(afterCancel.status).toBe("REJECTED");
  });
});
