/**
 * Contract tests — scenario 7: autonomous-store policy limits.
 *
 * The policy is deterministic and total: hard limits DENY, approval
 * thresholds REQUIRE_APPROVAL (a human gate — not a silent auto-action),
 * everything else ALLOWS. Evaluation order is fixed and documented.
 */
import { describe, expect, it } from "vitest";
import {
  currency,
  evaluateAutonomousPolicy,
  makeId,
  money,
  revisePolicy,
  type AutonomousStorePolicy,
  type PolicyProposal,
} from "../contract.js";

const usd = currency("USD");

const policy: AutonomousStorePolicy = {
  policyId: makeId<"AutonomousStorePolicyId">("policy-1"),
  autonomousStoreId: makeId<"AutonomousStoreId">("store-1"),
  revision: 1,
  policyCurrency: usd,
  marginFloorBps: 1_000, // 10% over cost
  maxDiscountBps: 2_000, // 20%
  promotionBudget: { limitPerPeriod: money("5000", usd), period: "MONTHLY" },
  spendLimit: { limitPerPeriod: money("100000", usd), period: "MONTHLY" },
  refundApprovalThreshold: money("10000", usd), // refunds ≥ $100 need approval
  priceChangeApprovalThreshold: money("2000", usd), // |Δ| ≥ $20 needs approval
  stopConditions: [
    { kind: "RECONCILIATION_DISCREPANCY_RATE", threshold: 2500, currentlyObserved: 0 },
  ],
};

describe("scenario 7 — deterministic policy limits", () => {
  it("DENIES a price below the margin floor (hard limit)", () => {
    const proposal: PolicyProposal = {
      kind: "PRICE_CHANGE",
      skuId: makeId<"SkuId">("sku-olive-oil"),
      currentPrice: money("1999", usd),
      newPrice: money("1000", usd),
      costBasis: money("950", usd),
    };
    // Floor for cost 950 at 10% = round(950 × 1.1) = 1045 — 1000 is below.
    const decision = evaluateAutonomousPolicy(proposal, policy);
    expect(decision).toEqual({ decision: "DENY", reasons: ["BELOW_MARGIN_FLOOR"] });
  });

  it("ALLOWS an in-margin, small-delta price change", () => {
    const proposal: PolicyProposal = {
      kind: "PRICE_CHANGE",
      skuId: makeId<"SkuId">("sku-olive-oil"),
      currentPrice: money("1999", usd),
      newPrice: money("1899", usd),
      costBasis: money("950", usd),
    };
    expect(evaluateAutonomousPolicy(proposal, policy)).toEqual({ decision: "ALLOW", reasons: [] });
  });

  it("REQUIREs APPROVAL for a large-delta price change (human gate)", () => {
    const proposal: PolicyProposal = {
      kind: "PRICE_CHANGE",
      skuId: makeId<"SkuId">("sku-tv-55"),
      currentPrice: money("59900", usd),
      newPrice: money("39900", usd),
      costBasis: money("30000", usd),
    };
    expect(evaluateAutonomousPolicy(proposal, policy)).toEqual({
      decision: "REQUIRE_APPROVAL",
      reasons: ["APPROVAL_THRESHOLD"],
    });
  });

  it("DENIES a discount that exceeds the promotion budget", () => {
    const proposal: PolicyProposal = {
      kind: "DISCOUNT_GRANT",
      discountAmount: money("600", usd),
      discountBps: 500,
      promotionBudgetSpentInPeriod: money("4900", usd),
    };
    // 4900 + 600 = 5500 > 5000 limit.
    expect(evaluateAutonomousPolicy(proposal, policy)).toEqual({
      decision: "DENY",
      reasons: ["EXCEEDS_PROMOTION_BUDGET"],
    });
  });

  it("DENIES a discount above the max discount rate", () => {
    const proposal: PolicyProposal = {
      kind: "DISCOUNT_GRANT",
      discountAmount: money("100", usd),
      discountBps: 2_500,
      promotionBudgetSpentInPeriod: money("0", usd),
    };
    expect(evaluateAutonomousPolicy(proposal, policy)).toEqual({
      decision: "DENY",
      reasons: ["EXCEEDS_MAX_DISCOUNT"],
    });
  });

  it("DENIES spend beyond the period limit and allows within it", () => {
    const over: PolicyProposal = {
      kind: "SPEND",
      purpose: "ad-campaign",
      amount: money("40000", usd),
      spendSpentInPeriod: money("70000", usd),
    };
    expect(evaluateAutonomousPolicy(over, policy)).toEqual({ decision: "DENY", reasons: ["EXCEEDS_SPEND_LIMIT"] });
    const within: PolicyProposal = {
      kind: "SPEND",
      purpose: "ad-campaign",
      amount: money("20000", usd),
      spendSpentInPeriod: money("70000", usd),
    };
    expect(evaluateAutonomousPolicy(within, policy)).toEqual({ decision: "ALLOW", reasons: [] });
  });

  it("stop conditions halt autonomy regardless of proposal merit", () => {
    const halted: AutonomousStorePolicy = {
      ...policy,
      stopConditions: [
        { kind: "FRAUD_SIGNAL_RATE", threshold: 1000, currentlyObserved: 1500 },
      ],
    };
    const proposal: PolicyProposal = {
      kind: "SPEND",
      purpose: "anything",
      amount: money("1", usd),
      spendSpentInPeriod: money("0", usd),
    };
    expect(evaluateAutonomousPolicy(proposal, halted)).toEqual({
      decision: "DENY",
      reasons: ["STOP_CONDITION_TRIGGERED"],
    });
  });

  it("cross-currency proposals are denied outright", () => {
    const proposal: PolicyProposal = {
      kind: "REFUND",
      amount: money("500", currency("EUR")),
    };
    expect(evaluateAutonomousPolicy(proposal, policy)).toEqual({ decision: "DENY", reasons: ["CURRENCY_MISMATCH"] });
  });

  it("margin floor math is exact (HALF_UP on the requirement)", () => {
    // cost 999 at 10% → floor = round(1098.9) = 1099; 1099 passes, 1098 denies.
    const at: PolicyProposal = {
      kind: "PRICE_CHANGE",
      skuId: makeId<"SkuId">("sku-x"),
      currentPrice: money("1200", usd),
      newPrice: money("1099", usd),
      costBasis: money("999", usd),
    };
    expect(evaluateAutonomousPolicy(at, policy)).toEqual({ decision: "ALLOW", reasons: [] });
    const below: PolicyProposal = { ...at, newPrice: money("1098", usd) };
    expect(evaluateAutonomousPolicy(below, policy)).toEqual({ decision: "DENY", reasons: ["BELOW_MARGIN_FLOOR"] });
  });

  it("policy revisions are immutable facts (new revision, same id)", () => {
    const revised = revisePolicy(policy, { refundApprovalThreshold: money("5000", usd) });
    expect(revised.revision).toBe(2);
    expect(policy.revision).toBe(1);
    expect(revised.refundApprovalThreshold.amountMinor).toBe("5000");
    const proposal: PolicyProposal = { kind: "REFUND", amount: money("7500", usd) };
    // Original threshold $100: a $75 refund auto-allows.
    expect(evaluateAutonomousPolicy(proposal, policy)).toEqual({ decision: "ALLOW", reasons: [] });
    // Revised threshold $50: the same $75 refund now requires approval.
    expect(evaluateAutonomousPolicy(proposal, revised)).toEqual({
      decision: "REQUIRE_APPROVAL",
      reasons: ["APPROVAL_THRESHOLD"],
    });
  });
});
