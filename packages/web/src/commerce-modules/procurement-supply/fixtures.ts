/**
 * procurement-supply deterministic DEMO fixtures (J11).
 *
 * Committed, synthetic, single-currency (USD). Quote, substitution and
 * document-evidence data are DEMO fixtures (the deterministic kernel has no
 * supplier-quote or substitution aggregate — that is shown honestly on the
 * surface, never simulated as live). The purchase orders, receiving,
 * over-receipt refusals, reconciliation dispositions and stock levels the
 * surface renders are REAL kernel state driven by the seed script through
 * typed commands.
 */

import { makeId } from "@unicom/commerce";
import type { CountReconciliationPolicy } from "@unicom/commerce";
import { demoMoney } from "../merchant-shared/demo-runtime.js";

/** Fixture identity (shown on the surface; bumps when fixtures change). */
export const PROCUREMENT_FIXTURES_ID = "w3-015-procurement-fixtures@1";

/** The demo goods-in warehouse (receiving destination). */
export const WAREHOUSE_LOCATION = makeId<"LocationId">("loc-demo-warehouse");

/** Deterministic timestamp stamped on demo quote requests (fixture data). */
export const QUOTE_REQUESTED_AT = "2026-10-05T09:10:00Z";

/** One supplier quote line (committed fixture data — never a live quote). */
export interface DemoQuote {
  readonly skuId: string;
  readonly skuTitle: string;
  readonly unitPriceMinor: string;
  readonly leadTimeDays: number;
}

/** One synthetic supplier with its committed quote sheet. */
export interface DemoSupplier {
  readonly supplierId: string;
  readonly name: string;
  readonly country: string;
  readonly terms: string;
  readonly quotes: readonly DemoQuote[];
}

/** The three demo suppliers of Harbor Lane Print Studio (synthetic). */
export const DEMO_SUPPLIERS: readonly DemoSupplier[] = [
  {
    supplierId: "sup-demo-riverstone",
    name: "Riverstone Paper Co.",
    country: "DE",
    terms: "NET_30",
    quotes: [
      { skuId: "sku-proc-a3-paper", skuTitle: "A3 uncoated paper (160gsm, ream of 250)", unitPriceMinor: "620", leadTimeDays: 3 },
      { skuId: "sku-proc-envelopes", skuTitle: "C6 kraft envelopes (box of 250)", unitPriceMinor: "1450", leadTimeDays: 5 },
      { skuId: "sku-proc-ink", skuTitle: "Pigment ink, cyan (250ml)", unitPriceMinor: "1890", leadTimeDays: 7 },
    ],
  },
  {
    supplierId: "sup-demo-apex",
    name: "Apex Office Supply",
    country: "NL",
    terms: "NET_15",
    quotes: [
      { skuId: "sku-proc-a3-paper", skuTitle: "A3 uncoated paper (160gsm, ream of 250)", unitPriceMinor: "655", leadTimeDays: 2 },
      { skuId: "sku-proc-envelopes", skuTitle: "C6 kraft envelopes (box of 250)", unitPriceMinor: "1390", leadTimeDays: 4 },
      { skuId: "sku-proc-ink", skuTitle: "Pigment ink, cyan (250ml)", unitPriceMinor: "2050", leadTimeDays: 9 },
    ],
  },
  {
    supplierId: "sup-demo-bluemagpie",
    name: "BlueMagpie Wholesale",
    country: "PL",
    terms: "PREPAID",
    quotes: [
      { skuId: "sku-proc-a3-paper", skuTitle: "A3 uncoated paper (160gsm, ream of 250)", unitPriceMinor: "610", leadTimeDays: 6 },
      { skuId: "sku-proc-envelopes", skuTitle: "C6 kraft envelopes (box of 250)", unitPriceMinor: "1520", leadTimeDays: 6 },
      { skuId: "sku-proc-ink", skuTitle: "Pigment ink, cyan (250ml)", unitPriceMinor: "1990", leadTimeDays: 4 },
    ],
  },
];

/** The substitute SKU of substitution SUB-1 (its own PO line — po-demo-4). */
export const SUBSTITUTE_SKU = "sku-proc-a3-heavy";
export const SUBSTITUTE_SKU_TITLE = "A3 heavyweight paper (240gsm, ream of 250)";

/** Substitution records — DEMO state with full provenance (no kernel aggregate). */
export interface DemoSubstitution {
  readonly substitutionId: string;
  readonly purchaseOrderId: string;
  readonly originalSkuId: string;
  readonly substituteSkuId: string;
  readonly substituteTitle: string;
  readonly units: number;
  readonly reason: string;
  readonly requestedBy: string;
  readonly decidedBy: string;
  readonly state: "APPROVED" | "PENDING";
  readonly followUpPurchaseOrderId: string;
}

export const DEMO_SUBSTITUTIONS: readonly DemoSubstitution[] = [
  {
    substitutionId: "sub-demo-1",
    purchaseOrderId: "po-demo-1",
    originalSkuId: "sku-proc-a3-paper",
    substituteSkuId: SUBSTITUTE_SKU,
    substituteTitle: SUBSTITUTE_SKU_TITLE,
    units: 10,
    reason: "supplier out of stock on 160gsm for part of the line",
    requestedBy: "Riverstone Paper Co. (demo supplier)",
    decidedBy: "approver (demo, Harbor Lane)",
    state: "APPROVED",
    followUpPurchaseOrderId: "po-demo-4",
  },
  {
    substitutionId: "sub-demo-2",
    purchaseOrderId: "po-demo-3",
    originalSkuId: "sku-proc-ink",
    substituteSkuId: "sku-proc-ink-2l",
    substituteTitle: "Pigment ink, cyan (2-litre)",
    units: 8,
    reason: "2-litre bottles cheaper per ml; needs approval (volume commitment)",
    requestedBy: "BlueMagpie Wholesale (demo supplier)",
    decidedBy: "—",
    state: "PENDING",
    followUpPurchaseOrderId: "(not opened yet — needs an approver)",
  },
];

/** Document evidence cards — DEMO attachments (the journal is the real evidence). */
export interface DemoEvidence {
  readonly evidenceId: string;
  readonly kind: "INVOICE" | "PACKING_SLIP" | "RECEIPT_NOTE";
  readonly reference: string;
  readonly purchaseOrderId: string;
  readonly amountMinor: string;
  readonly status: "PAID" | "PENDING" | "ATTACHED";
}

export const DEMO_EVIDENCE: readonly DemoEvidence[] = [
  { evidenceId: "ev-demo-1", kind: "INVOICE", reference: "INV-2026-1188", purchaseOrderId: "po-demo-1", amountMinor: "30400", status: "PAID" },
  { evidenceId: "ev-demo-2", kind: "PACKING_SLIP", reference: "PS-7741", purchaseOrderId: "po-demo-1", amountMinor: "0", status: "ATTACHED" },
  { evidenceId: "ev-demo-3", kind: "INVOICE", reference: "INV-2026-1201", purchaseOrderId: "po-demo-3", amountMinor: "41700", status: "PENDING" },
];

/** Supplier-reported quantities (the supplier-receipt column of the four truths). */
export const DEMO_SUPPLIER_REPORTED: readonly {
  readonly purchaseOrderId: string;
  readonly skuId: string;
  readonly units: number;
}[] = [
  { purchaseOrderId: "po-demo-1", skuId: "sku-proc-a3-paper", units: 40 },
  { purchaseOrderId: "po-demo-1", skuId: "sku-proc-envelopes", units: 20 },
  { purchaseOrderId: "po-demo-3", skuId: "sku-proc-envelopes", units: 0 },
];

/**
 * The demo count-reconciliation policy: barcode counts within ±2 units
 * promote; supplier reports are observations and never promote.
 */
export const DEMO_COUNT_POLICY: CountReconciliationPolicy = {
  toleranceUnits: 2,
  promoteWithinTolerance: true,
};

/** Invoice amount helper (fixtures store exact minor units). */
export function evidenceAmount(amountMinor: string) {
  return demoMoney(amountMinor);
}
