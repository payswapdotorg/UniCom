/**
 * W1-002 runtime scenario 2 (twin of W1-001 scenario 2): multi-location
 * stock transfer on the real kernel — deterministic, symmetrical inventory
 * effects with in-transit invisibility.
 */
import { describe, expect, it } from "vitest";
import { CommerceKernel, makeId, type StockTransfer } from "../../contract.js";
import { env, mustExecute } from "./support/envelopes.js";

const sku = makeId<"SkuId">("sku-flour-10kg");
const locA = makeId<"LocationId">("loc-warehouse-a");
const locB = makeId<"LocationId">("loc-store-b");

function transfer(transferId: string, units: number, from = locA, to = locB): StockTransfer {
  return {
    transferId: makeId<"TransferId">(transferId),
    fromLocationId: from,
    toLocationId: to,
    lines: [{ skuId: sku, units }],
    state: "REQUESTED",
    revision: 1,
  };
}

describe("runtime scenario 2 — multi-location transfer (real kernel)", () => {
  it("dispatch decrements source; receipt increments destination; in-transit is invisible", async () => {
    const kernel = new CommerceKernel();
    await mustExecute(kernel, env({ type: "RECEIVE_STOCK", skuId: sku, locationId: locA, units: 10, reason: "RECEIVING" }));
    await mustExecute(kernel, env({ type: "OPEN_TRANSFER", transfer: transfer("tr-1", 6) }));

    const dispatched = await mustExecute(kernel, env({ type: "ADVANCE_TRANSFER", transferId: makeId<"TransferId">("tr-1"), trigger: "DISPATCH" }));
    expect(dispatched.receipt?.subjectRefs).toContain("STOCK_TRANSFER:tr-1");
    expect(kernel.view().transfer("tr-1")).toMatchObject({ state: "DISPATCHED", revision: 2 });
    expect(kernel.view().level(sku, locA)).toMatchObject({ onHand: 4, reserved: 0 });
    // In-transit stock is NOT silently available at the destination.
    expect(kernel.view().level(sku, locB)).toBeUndefined();

    await mustExecute(kernel, env({ type: "ADVANCE_TRANSFER", transferId: makeId<"TransferId">("tr-1"), trigger: "CONFIRM_RECEIPT" }));
    expect(kernel.view().transfer("tr-1")).toMatchObject({ state: "RECEIVED", revision: 3 });
    expect(kernel.view().level(sku, locA)).toMatchObject({ onHand: 4 });
    expect(kernel.view().level(sku, locB)).toMatchObject({ onHand: 6, reserved: 0, revision: 1 });
    expect(kernel.journalIsValid()).toBe(true);
  });

  it("multi-line transfers apply atomically — a failing line leaves zero effects", async () => {
    const kernel = new CommerceKernel();
    await mustExecute(kernel, env({ type: "RECEIVE_STOCK", skuId: sku, locationId: locA, units: 5, reason: "RECEIVING" }));
    const multi: StockTransfer = {
      transferId: makeId<"TransferId">("tr-2"),
      fromLocationId: locA,
      toLocationId: locB,
      lines: [
        { skuId: sku, units: 3 },
        { skuId: makeId<"SkuId">("sku-sugar-1kg"), units: 4 },
      ],
      state: "REQUESTED",
      revision: 1,
    };
    await mustExecute(kernel, env({ type: "OPEN_TRANSFER", transfer: multi }));
    const journalBefore = kernel.events().length;
    // sugar has no stock at the source: the whole dispatch is rejected.
    const outcome = await kernel.execute(env({ type: "ADVANCE_TRANSFER", transferId: makeId<"TransferId">("tr-2"), trigger: "DISPATCH" }));
    expect(outcome.status).toBe("REJECTED");
    if (outcome.status === "REJECTED") expect(outcome.reason.code).toBe("INSUFFICIENT_INVENTORY");
    expect(kernel.events().length).toBe(journalBefore);
    expect(kernel.view().transfer("tr-2")?.state).toBe("REQUESTED");
    expect(kernel.view().level(sku, locA)).toMatchObject({ onHand: 5 });
  });

  it("cancel in transit returns units to the source deterministically", async () => {
    const kernel = new CommerceKernel();
    await mustExecute(kernel, env({ type: "RECEIVE_STOCK", skuId: sku, locationId: locA, units: 8, reason: "RECEIVING" }));
    await mustExecute(kernel, env({ type: "OPEN_TRANSFER", transfer: transfer("tr-3", 5) }));
    await mustExecute(kernel, env({ type: "ADVANCE_TRANSFER", transferId: makeId<"TransferId">("tr-3"), trigger: "DISPATCH" }));
    expect(kernel.view().level(sku, locA)).toMatchObject({ onHand: 3 });
    await mustExecute(kernel, env({ type: "ADVANCE_TRANSFER", transferId: makeId<"TransferId">("tr-3"), trigger: "CANCEL_IN_TRANSIT" }));
    expect(kernel.view().transfer("tr-3")).toMatchObject({ state: "CANCELLED" });
    expect(kernel.view().level(sku, locA)).toMatchObject({ onHand: 8 });
    expect(kernel.view().level(sku, locB)).toBeUndefined();
  });

  it("impossible transitions and degenerate transfers are coded rejections", async () => {
    const kernel = new CommerceKernel();
    const samePlace = { ...transfer("tr-4", 6), toLocationId: locA };
    const degenerate = await kernel.execute(env({ type: "OPEN_TRANSFER", transfer: samePlace }));
    expect(degenerate.status).toBe("REJECTED");
    await mustExecute(kernel, env({ type: "OPEN_TRANSFER", transfer: transfer("tr-5", 6) }));
    const premature = await kernel.execute(env({ type: "ADVANCE_TRANSFER", transferId: makeId<"TransferId">("tr-5"), trigger: "CONFIRM_RECEIPT" }));
    expect(premature.status).toBe("REJECTED");
    if (premature.status === "REJECTED") expect(premature.reason.code).toBe("INVALID_STATE");
    const unknown = await kernel.execute(env({ type: "ADVANCE_TRANSFER", transferId: makeId<"TransferId">("tr-ghost"), trigger: "DISPATCH" }));
    expect(unknown.status).toBe("REJECTED");
  });
});
