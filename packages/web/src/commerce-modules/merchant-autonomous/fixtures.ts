/**
 * merchant-autonomous deterministic DEMO fixtures (J13).
 *
 * Committed, synthetic, single-currency (USD). The policy below is a real
 * AutonomousStorePolicy object: the seed registers it on the commerce kernel
 * (a POLICY_REVISED journal fact), and every autonomous action the surface
 * offers is judged by that policy through the kernel's own gate. The
 * "halted" revision demonstrates a stop condition crossing its threshold —
 * revision 2 is journaled the same way, never a silent mutation.
 */

import { makeId, revisePolicy } from "@unicom/commerce";
import type {
  AutonomousStorePolicy,
  PolicyProposal,
  AutonomousStorePolicyId,
} from "@unicom/commerce";
import { DEMO_CURRENCY, demoMoney } from "../merchant-shared/demo-runtime.js";

/** Fixture identity (shown on the surface; bumps when fixtures change). */
export const AUTONOMOUS_FIXTURES_ID = "w3-015-autonomous-fixtures@1";

/** The demo autonomous kiosk. */
export const DEMO_STORE_ID = "store-demo-harbor-24";
export const DEMO_STORE_NAME = "Harbor 24 autonomous kiosk";
export const AUTONOMOUS_STORE_ID = makeId<"AutonomousStoreId">(DEMO_STORE_ID);
export const AUTONOMOUS_LOCATION = makeId<"LocationId">("loc-demo-harbor24");
export const DEMO_TILL_ID = makeId<"TillId">("till-demo-harbor24-1");
export const DEMO_SUPPLIER_ID = makeId<"SupplierId">("sup-demo-northwind");

/** The demo kiosk SKU (price book + restock rule target). */
export const AUTONOMOUS_SKU = {
  skuId: makeId<"SkuId">("sku-auto-kettle"),
  title: "Gooseneck kettle",
  openingUnits: 5,
  listPriceMinor: "4200",
  costBasisMinor: "3000",
} as const;

/**
 * Policy revision 1 — the healthy bounds the seed starts from.
 * Numbers chosen so every branch of the deterministic evaluator is shown:
 * margin floor 15% over a USD 30.00 cost basis ⇒ floor price USD 34.50;
 * price-change approval threshold USD 5.00; daily spend limit USD 200.00
 * with a 4-unit restock rule (4 × USD 30.00 = USD 120.00 per trigger).
 */
export const HEALTHY_POLICY: AutonomousStorePolicy = {
  policyId: makeId<AutonomousStorePolicyId>("pol-demo-harbor24"),
  autonomousStoreId: AUTONOMOUS_STORE_ID,
  revision: 1,
  policyCurrency: DEMO_CURRENCY,
  marginFloorBps: 1500,
  maxDiscountBps: 1500,
  promotionBudget: { limitPerPeriod: demoMoney("8000"), period: "DAILY" },
  spendLimit: { limitPerPeriod: demoMoney("20000"), period: "DAILY" },
  refundApprovalThreshold: demoMoney("5000"),
  priceChangeApprovalThreshold: demoMoney("500"),
  stopConditions: [
    { kind: "RECONCILIATION_DISCREPANCY_RATE", threshold: 5000, currentlyObserved: 1200 },
    { kind: "NEGATIVE_MARGIN_OBSERVED", threshold: 10000, currentlyObserved: 0 },
  ],
  storeOperations: {
    tillFloatMin: demoMoney("1000"),
    tillFloatMax: demoMoney("6000"),
    cashVarianceEscalationThreshold: demoMoney("1500"),
    countMismatchEscalationUnits: 2,
  },
  restockRules: [
    {
      skuId: AUTONOMOUS_SKU.skuId,
      locationId: AUTONOMOUS_LOCATION,
      supplierId: DEMO_SUPPLIER_ID,
      thresholdUnits: 6,
      reorderUnits: 4,
      unitCost: demoMoney(AUTONOMOUS_SKU.costBasisMinor),
    },
  ],
};

/**
 * Policy revision 2 — the HALT: the observed reconciliation-discrepancy rate
 * (6200 bps ≈ 62% of counts discrepant) crossed the 5000 bps stop threshold.
 * Built with the public `revisePolicy` (immutable revisioned fact); the seed
 * registers it on the kernel, so every autonomous-store action afterwards is
 * DENIED at the kernel boundary with STOP_CONDITION_TRIGGERED.
 */
export const HALTED_POLICY: AutonomousStorePolicy = revisePolicy(HEALTHY_POLICY, {
  stopConditions: [
    { kind: "RECONCILIATION_DISCREPANCY_RATE", threshold: 5000, currentlyObserved: 6200 },
    { kind: "NEGATIVE_MARGIN_OBSERVED", threshold: 10000, currentlyObserved: 0 },
  ],
});

/** One preview row: a proposal evaluated against a policy BEFORE acting. */
export interface PolicyPreviewRow {
  readonly id: string;
  readonly label: string;
  readonly statement: string;
  readonly proposal: PolicyProposal;
  readonly against: "healthy" | "halted";
}

/**
 * Preview proposals (pure `evaluateAutonomousPolicy`, public entrypoint —
 * nothing commits). Together they show every decision class:
 * DENY (margin floor), REQUIRE_APPROVAL (refund threshold), DENY (spend
 * limit), DENY (stop condition — under the halted revision).
 */
export const POLICY_PREVIEWS: readonly PolicyPreviewRow[] = [
  {
    id: "preview-margin-floor",
    label: "Price change below the margin floor",
    statement:
      "Set the kettle to USD 33.00 while cost basis is USD 30.00 and the margin floor is 15% over cost (floor price USD 34.50) — below the floor, the policy can never allow it.",
    proposal: {
      kind: "PRICE_CHANGE",
      skuId: AUTONOMOUS_SKU.skuId,
      currentPrice: demoMoney("4400"),
      newPrice: demoMoney("3300"),
      costBasis: demoMoney(AUTONOMOUS_SKU.costBasisMinor),
    },
    against: "healthy",
  },
  {
    id: "preview-refund-approval",
    label: "Refund at the approval threshold",
    statement:
      "A USD 50.00 refund at the refund-approval threshold (USD 50.00): the policy does not deny it — a human must approve it first. Auto-refund never happens silently.",
    proposal: { kind: "REFUND", amount: demoMoney("5000") },
    against: "healthy",
  },
  {
    id: "preview-spend-limit",
    label: "Restock spend beyond the daily limit",
    statement:
      "A USD 90.00 restock on top of USD 120.00 already spent today against the USD 200.00 daily spend limit — over the limit, denied outright.",
    proposal: {
      kind: "SPEND",
      purpose: "AUTONOMOUS_RESTOCK",
      amount: demoMoney("9000"),
      spendSpentInPeriod: demoMoney("12000"),
    },
    against: "healthy",
  },
  {
    id: "preview-stop-condition",
    label: "Any action while the stop condition holds",
    statement:
      "A routine USD 10.00 order under the HALTED policy revision: with the discrepancy rate over the stop threshold, autonomy halts EVERY action — even one that would otherwise be allowed.",
    proposal: {
      kind: "SPEND",
      purpose: "ROUTINE_ORDER",
      amount: demoMoney("1000"),
      spendSpentInPeriod: demoMoney("0"),
    },
    against: "halted",
  },
];
