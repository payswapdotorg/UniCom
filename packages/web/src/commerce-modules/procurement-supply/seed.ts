/**
 * procurement-supply seed + module-local helpers — split out of
 * component.tsx for the oxlint max-lines gate (pure code motion; the seed
 * body is byte-identical).
 *
 * The seed replays a fixed fixture command script through the REAL
 * deterministic commerce kernel (four purchase orders across every honest
 * lifecycle state); DEMO quote/substitution/evidence fixtures stay in
 * fixtures.ts and never contact a supplier.
 */

import { makeId } from "@unicom/commerce";
import type {
  CommandExecution,
  PrincipalRef,
  RuntimeCommandPayload,
} from "@unicom/commerce";
import {
  DEMO_MERCHANT_ACTOR,
  DEMO_SYSTEM_ACTOR,
  DemoCommerceRuntime,
} from "../merchant-shared/demo-runtime.js";
import { DEMO_SUPPLIERS, SUBSTITUTE_SKU, WAREHOUSE_LOCATION } from "./fixtures.js";

export type KernelRun = (
  actor: PrincipalRef,
  payload: RuntimeCommandPayload,
  opts?: { readonly commandId?: string; readonly idempotencyKey?: string },
) => Promise<CommandExecution>;

export const PO_1 = makeId<"PurchaseOrderId">("po-demo-1");
export const PO_2 = makeId<"PurchaseOrderId">("po-demo-2");
export const PO_3 = makeId<"PurchaseOrderId">("po-demo-3");
export const PO_4 = makeId<"PurchaseOrderId">("po-demo-4");

export async function seedProcurementDemo(): Promise<DemoCommerceRuntime> {
  const runtime = new DemoCommerceRuntime();

  // PO-1 (Riverstone): submitted, supplier-confirmed, PARTIALLY received —
  // the seeded wrong-quantity case (supplier said 20 envelopes, 12 scanned).
  await runtime.run(DEMO_MERCHANT_ACTOR, {
    type: "OPEN_PURCHASE_ORDER",
    purchaseOrder: {
      purchaseOrderId: PO_1,
      supplierId: makeId<"SupplierId">("sup-demo-riverstone"),
      destinationLocationId: WAREHOUSE_LOCATION,
      lines: [
        { skuId: makeId<"SkuId">("sku-proc-a3-paper"), orderedUnits: 40, receivedUnits: 0 },
        { skuId: makeId<"SkuId">("sku-proc-envelopes"), orderedUnits: 20, receivedUnits: 0 },
      ],
      state: "DRAFT",
      revision: 1,
    },
  });
  await runtime.run(DEMO_MERCHANT_ACTOR, { type: "ADVANCE_PURCHASE_ORDER", purchaseOrderId: PO_1, trigger: "SUBMIT" });
  await runtime.run(DEMO_SYSTEM_ACTOR, { type: "ADVANCE_PURCHASE_ORDER", purchaseOrderId: PO_1, trigger: "SUPPLIER_CONFIRM" });
  await runtime.run(DEMO_MERCHANT_ACTOR, {
    type: "RECEIVE_PURCHASE_ORDER",
    purchaseOrderId: PO_1,
    lines: [
      { skuId: makeId<"SkuId">("sku-proc-a3-paper"), units: 40 },
      { skuId: makeId<"SkuId">("sku-proc-envelopes"), units: 12 },
    ],
  });

  // PO-2 (Apex, ink): DRAFT — awaiting the approval boundary below.
  await runtime.run(DEMO_MERCHANT_ACTOR, {
    type: "OPEN_PURCHASE_ORDER",
    purchaseOrder: {
      purchaseOrderId: PO_2,
      supplierId: makeId<"SupplierId">("sup-demo-apex"),
      destinationLocationId: WAREHOUSE_LOCATION,
      lines: [{ skuId: makeId<"SkuId">("sku-proc-ink"), orderedUnits: 15, receivedUnits: 0 }],
      state: "DRAFT",
      revision: 1,
    },
  });

  // PO-3 (BlueMagpie, envelopes): CONFIRMED — ready for the live partial
  // receiving + duplicate-replay demo.
  await runtime.run(DEMO_MERCHANT_ACTOR, {
    type: "OPEN_PURCHASE_ORDER",
    purchaseOrder: {
      purchaseOrderId: PO_3,
      supplierId: makeId<"SupplierId">("sup-demo-bluemagpie"),
      destinationLocationId: WAREHOUSE_LOCATION,
      lines: [{ skuId: makeId<"SkuId">("sku-proc-envelopes"), orderedUnits: 30, receivedUnits: 0 }],
      state: "DRAFT",
      revision: 1,
    },
  });
  await runtime.run(DEMO_MERCHANT_ACTOR, { type: "ADVANCE_PURCHASE_ORDER", purchaseOrderId: PO_3, trigger: "SUBMIT" });
  await runtime.run(DEMO_SYSTEM_ACTOR, { type: "ADVANCE_PURCHASE_ORDER", purchaseOrderId: PO_3, trigger: "SUPPLIER_CONFIRM" });

  // PO-4: the APPROVED substitution's own line — the canonical route for a
  // substitute SKU (DRAFT, awaiting approval; it can never ride PO-1's lines).
  await runtime.run(DEMO_MERCHANT_ACTOR, {
    type: "OPEN_PURCHASE_ORDER",
    purchaseOrder: {
      purchaseOrderId: PO_4,
      supplierId: makeId<"SupplierId">("sup-demo-riverstone"),
      destinationLocationId: WAREHOUSE_LOCATION,
      lines: [{ skuId: makeId<"SkuId">(SUBSTITUTE_SKU), orderedUnits: 10, receivedUnits: 0 }],
      state: "DRAFT",
      revision: 1,
    },
  });

  return runtime;
}

/** Best quote per SKU (exact minor units; deterministic tiebreak on lead time). */
export function bestQuotePerSku() {
  return DEMO_SUPPLIERS[0]!.quotes.map((quote) => {
    const best = DEMO_SUPPLIERS.flatMap((supplier) =>
      supplier.quotes
        .filter((entry) => entry.skuId === quote.skuId)
        .map((entry) => ({ supplier, entry })),
    ).sort(
      (a, b) =>
        Number(BigInt(a.entry.unitPriceMinor) - BigInt(b.entry.unitPriceMinor)) ||
        a.entry.leadTimeDays - b.entry.leadTimeDays,
    )[0]!;
    return { skuId: quote.skuId, skuTitle: quote.skuTitle, best };
  });
}
