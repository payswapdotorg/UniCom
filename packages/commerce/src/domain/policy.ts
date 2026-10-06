/**
 * AutonomousStorePolicy: deterministic policy limits (FROZEN-ARCHITECTURE §10).
 *
 * The runtime that observes→plans→executes under this policy is W1-005;
 * THIS contract freezes the limits and the deterministic evaluation of
 * proposals against them. Decisions are hard, coded, total:
 *   DENY (deterministic hard limit) / REQUIRE_APPROVAL (human gate) / ALLOW.
 * No model preference can override a DENY (INVARIANT 24 analog for commerce:
 * policy limits are hard constraints on autonomous action).
 */
import type { AutonomousStoreId, AutonomousStorePolicyId, LocationId, SkuId, SupplierId } from "./ids.js";
import { nextRevision } from "./events.js";
import type { PrincipalRef } from "./principals.js";
import { money, type Money } from "./money.js";
import { roundRationalToBigInt } from "./decimal.js";

export type PolicyPeriod = "DAILY" | "WEEKLY" | "MONTHLY";

export type StopConditionKind =
  | "NEGATIVE_MARGIN_OBSERVED"
  | "RECONCILIATION_DISCREPANCY_RATE"
  | "FRAUD_SIGNAL_RATE"
  | "TECHNICAL_FAILURE_RATE"
  | "CASHFLOW_BREACH";

/** Deterministic halt trigger: when the rate/level crosses the threshold,
 *  autonomous actions stop pending human intervention. */
export interface StopCondition {
  readonly kind: StopConditionKind;
  /** Rate thresholds in basis points (e.g. 500 = 5%); levels in minor units. */
  readonly threshold: number;
  readonly currentlyObserved: number;
}

export interface AutonomousStorePrincipal {
  readonly autonomousStoreId: AutonomousStoreId;
  readonly ownerRef: PrincipalRef;
  readonly displayName: string;
  /** Revision of the policy currently in force (immutable history). */
  readonly activePolicyRevision: number;
}

/**
 * The policy: an immutable, revisioned fact. All money limits share one
 * currency (policyCurrency) — cross-currency proposals are denied outright.
 */
export interface AutonomousStorePolicy {
  readonly policyId: AutonomousStorePolicyId;
  readonly autonomousStoreId: AutonomousStoreId;
  readonly revision: number;
  readonly policyCurrency: Money["currency"];
  /** Minimum margin over cost, in bps of cost (1000 = 10% over cost). */
  readonly marginFloorBps?: number;
  /** Maximum single discount, in bps of the discounted line. */
  readonly maxDiscountBps?: number;
  readonly promotionBudget: { readonly limitPerPeriod: Money; readonly period: PolicyPeriod };
  readonly spendLimit: { readonly limitPerPeriod: Money; readonly period: PolicyPeriod };
  /** Refunds at/above this amount REQUIRE_APPROVAL (never silent auto-refund). */
  readonly refundApprovalThreshold: Money;
  /** Price changes with absolute delta at/above this amount REQUIRE_APPROVAL. */
  readonly priceChangeApprovalThreshold: Money;
  readonly stopConditions: readonly StopCondition[];
  /** W1-005 (additive, optional): store-operating rules (float bounds, escalation bands). */
  readonly storeOperations?: StoreOperatingRules;
  /** W1-005 (additive, optional): restock trigger rules per (sku, location). */
  readonly restockRules?: readonly RestockRule[];
}

/** W1-005 store-operating bands: till float bounds + variance escalation thresholds. */
export interface StoreOperatingRules {
  /** Allowed opening-count band for an autonomous till session. */
  readonly tillFloatMin: Money;
  readonly tillFloatMax: Money;
  /** Cash-variance magnitude at/above which close/handover escalates (journaled). */
  readonly cashVarianceEscalationThreshold: Money;
  /** Count variance beyond this tolerance holds + escalates (also the reconcile tolerance). */
  readonly countMismatchEscalationUnits: number;
}

/** W1-005 restock trigger rule bound to one (sku, location) inventory level. */
export interface RestockRule {
  readonly skuId: SkuId;
  readonly locationId: LocationId;
  readonly supplierId: SupplierId;
  /** On-hand at/below this threshold triggers an autonomous restock. */
  readonly thresholdUnits: number;
  /** Deterministic reorder quantity per trigger. */
  readonly reorderUnits: number;
  /** Planned unit cost (the purchase-order value basis). */
  readonly unitCost: Money;
}

export type PolicyProposal =
  | {
      readonly kind: "PRICE_CHANGE";
      readonly skuId: SkuId;
      readonly currentPrice: Money;
      readonly newPrice: Money;
      readonly costBasis: Money;
    }
  | {
      readonly kind: "DISCOUNT_GRANT";
      readonly discountAmount: Money;
      readonly discountBps: number;
      readonly promotionBudgetSpentInPeriod: Money;
    }
  | {
      readonly kind: "REFUND";
      readonly amount: Money;
    }
  | {
      readonly kind: "SPEND";
      readonly purpose: string;
      readonly amount: Money;
      readonly spendSpentInPeriod: Money;
    };

export type PolicyDenialReason =
  | "STOP_CONDITION_TRIGGERED"
  | "BELOW_MARGIN_FLOOR"
  | "EXCEEDS_MAX_DISCOUNT"
  | "EXCEEDS_PROMOTION_BUDGET"
  | "EXCEEDS_SPEND_LIMIT"
  | "CURRENCY_MISMATCH"
  | "APPROVAL_THRESHOLD"
  | "NEGATIVE_PRICE"
  // --- W1-005 (additive): store-authority denial reasons (override gate) ---
  | "NOT_AUTHORIZED"
  | "NO_REGISTERED_AUTHORITY";

export interface PolicyDecision {
  readonly decision: "ALLOW" | "REQUIRE_APPROVAL" | "DENY";
  readonly reasons: readonly PolicyDenialReason[];
}

const ALLOW: PolicyDecision = { decision: "ALLOW", reasons: [] };

/** Required minimum price for the margin floor (exact; requirement rounded HALF_UP). */
function marginFloorPrice(cost: Money, marginFloorBps: number): Money {
  // required >= cost * (1 + bps/10000), rounded to minor units.
  const numerator = BigInt(cost.amountMinor) * (10_000n + BigInt(marginFloorBps));
  return money(roundRationalToBigInt(numerator, 10_000n, "HALF_UP").toString(), cost.currency);
}

/**
 * Deterministic policy evaluation. Check order is FIXED (documented contract):
 * 1. stop conditions    → DENY (autonomy halted)
 * 2. currency mismatch  → DENY
 * 3. hard limits        → DENY
 * 4. approval thresholds → REQUIRE_APPROVAL
 * 5. otherwise          → ALLOW
 */
export function evaluateAutonomousPolicy(
  proposal: PolicyProposal,
  policy: AutonomousStorePolicy,
): PolicyDecision {
  for (const condition of policy.stopConditions) {
    if (condition.currentlyObserved >= condition.threshold) {
      return { decision: "DENY", reasons: ["STOP_CONDITION_TRIGGERED"] };
    }
  }
  if (proposal.kind === "PRICE_CHANGE") {
    return evaluatePriceChange(proposal, policy);
  }
  if (proposal.kind === "DISCOUNT_GRANT") {
    return evaluateDiscount(proposal, policy);
  }
  if (proposal.kind === "REFUND") {
    return evaluateRefund(proposal, policy);
  }
  return evaluateSpend(proposal, policy);
}

function evaluatePriceChange(
  proposal: Extract<PolicyProposal, { kind: "PRICE_CHANGE" }>,
  policy: AutonomousStorePolicy,
): PolicyDecision {
  if (
    proposal.newPrice.currency !== policy.policyCurrency ||
    proposal.currentPrice.currency !== policy.policyCurrency ||
    proposal.costBasis.currency !== policy.policyCurrency
  ) {
    return { decision: "DENY", reasons: ["CURRENCY_MISMATCH"] };
  }
  if (BigInt(proposal.newPrice.amountMinor) < 0n) {
    return { decision: "DENY", reasons: ["NEGATIVE_PRICE"] };
  }
  if (policy.marginFloorBps !== undefined) {
    const floor = marginFloorPrice(proposal.costBasis, policy.marginFloorBps);
    if (BigInt(proposal.newPrice.amountMinor) < BigInt(floor.amountMinor)) {
      return { decision: "DENY", reasons: ["BELOW_MARGIN_FLOOR"] };
    }
  }
  const deltaMinor =
    BigInt(proposal.newPrice.amountMinor) - BigInt(proposal.currentPrice.amountMinor);
  const magnitude = deltaMinor < 0n ? -deltaMinor : deltaMinor;
  if (magnitude >= BigInt(policy.priceChangeApprovalThreshold.amountMinor)) {
    return { decision: "REQUIRE_APPROVAL", reasons: ["APPROVAL_THRESHOLD"] };
  }
  return ALLOW;
}

function evaluateDiscount(
  proposal: Extract<PolicyProposal, { kind: "DISCOUNT_GRANT" }>,
  policy: AutonomousStorePolicy,
): PolicyDecision {
  if (proposal.discountAmount.currency !== policy.policyCurrency) {
    return { decision: "DENY", reasons: ["CURRENCY_MISMATCH"] };
  }
  if (policy.maxDiscountBps !== undefined && proposal.discountBps > policy.maxDiscountBps) {
    return { decision: "DENY", reasons: ["EXCEEDS_MAX_DISCOUNT"] };
  }
  const spent = proposal.promotionBudgetSpentInPeriod;
  const limit = policy.promotionBudget.limitPerPeriod;
  if (spent.currency !== limit.currency || proposal.discountAmount.currency !== limit.currency) {
    return { decision: "DENY", reasons: ["CURRENCY_MISMATCH"] };
  }
  const projected = BigInt(spent.amountMinor) + BigInt(proposal.discountAmount.amountMinor);
  if (projected > BigInt(limit.amountMinor)) {
    return { decision: "DENY", reasons: ["EXCEEDS_PROMOTION_BUDGET"] };
  }
  return ALLOW;
}

function evaluateRefund(
  proposal: Extract<PolicyProposal, { kind: "REFUND" }>,
  policy: AutonomousStorePolicy,
): PolicyDecision {
  if (proposal.amount.currency !== policy.policyCurrency) {
    return { decision: "DENY", reasons: ["CURRENCY_MISMATCH"] };
  }
  const threshold = policy.refundApprovalThreshold;
  if (BigInt(proposal.amount.amountMinor) >= BigInt(threshold.amountMinor)) {
    return { decision: "REQUIRE_APPROVAL", reasons: ["APPROVAL_THRESHOLD"] };
  }
  return ALLOW;
}

function evaluateSpend(
  proposal: Extract<PolicyProposal, { kind: "SPEND" }>,
  policy: AutonomousStorePolicy,
): PolicyDecision {
  if (proposal.amount.currency !== policy.policyCurrency) {
    return { decision: "DENY", reasons: ["CURRENCY_MISMATCH"] };
  }
  const spent = proposal.spendSpentInPeriod;
  const limit = policy.spendLimit.limitPerPeriod;
  const projected = BigInt(spent.amountMinor) + BigInt(proposal.amount.amountMinor);
  if (projected > BigInt(limit.amountMinor)) {
    return { decision: "DENY", reasons: ["EXCEEDS_SPEND_LIMIT"] };
  }
  return ALLOW;
}

/** Policies are immutable facts — revision bumps create a new fact. */
export function revisePolicy(
  policy: AutonomousStorePolicy,
  changes: Partial<Omit<AutonomousStorePolicy, "policyId" | "revision">>,
): AutonomousStorePolicy {
  return { ...policy, ...changes, revision: nextRevision(policy.revision) };
}
