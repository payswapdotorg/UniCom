/**
 * ██████████████████████████████████████████████████████████████████████
 * █ TEST-ONLY AUTONOMOUS-STORE FIXTURES — NEVER PRODUCTION CODE.      █
 * █ No production-reachable path may import this file.                █
 * ██████████████████████████████████████████████████████████████████████
 *
 * Deterministic store + policy bootstrap for the W1-005 scenario tests:
 * one registered autonomous store (owner merchant), one revisioned policy
 * with operating rules + restock rules, and the journaled price book.
 */
import {
  CommerceKernel,
  currency,
  makeId,
  money,
  type AutonomousStorePolicy,
  type PrincipalRef,
} from "../../../contract.js";
import { env, mustExecute } from "./envelopes.js";

export const usd = currency("USD");

export const ownerRef: PrincipalRef = { kind: "MERCHANT", merchantId: makeId<"MerchantId">("merchant-autoshop") };
export const otherMerchant: PrincipalRef = { kind: "MERCHANT", merchantId: makeId<"MerchantId">("merchant-bystander") };
export const supervisor: PrincipalRef = { kind: "CUSTOMER", customerId: makeId<"CustomerId">("customer-supervisor") };

export function storeIdOf(text: string) {
  return makeId<"AutonomousStoreId">(text);
}

export function storeActorOf(text: string): PrincipalRef {
  return { kind: "AUTONOMOUS_STORE", autonomousStoreId: storeIdOf(text) };
}

export interface PolicyOverrides {
  readonly spendLimitMinor?: string;
  readonly marginFloorBps?: number;
  readonly priceChangeApprovalThresholdMinor?: string;
  readonly varianceThresholdMinor?: string;
  readonly countMismatchUnits?: number;
  readonly restockThreshold?: number;
  readonly restockUnits?: number;
  readonly restockUnitCostMinor?: string;
}

/** A well-formed revisioned policy with W1-005 store-operating rules. */
export function autonomousPolicy(storeId: string, revision: number, overrides: PolicyOverrides = {}): AutonomousStorePolicy {
  return {
    policyId: makeId<"AutonomousStorePolicyId">(`policy-${storeId}-${revision}`),
    autonomousStoreId: storeIdOf(storeId),
    revision,
    policyCurrency: usd,
    marginFloorBps: overrides.marginFloorBps ?? 1_000,
    priceChangeApprovalThreshold: money(overrides.priceChangeApprovalThresholdMinor ?? "500", usd),
    promotionBudget: { limitPerPeriod: money("10000", usd), period: "DAILY" },
    spendLimit: { limitPerPeriod: money(overrides.spendLimitMinor ?? "10000", usd), period: "DAILY" },
    refundApprovalThreshold: money("5000", usd),
    stopConditions: [],
    storeOperations: {
      tillFloatMin: money("1000", usd),
      tillFloatMax: money("20000", usd),
      cashVarianceEscalationThreshold: money(overrides.varianceThresholdMinor ?? "500", usd),
      countMismatchEscalationUnits: overrides.countMismatchUnits ?? 3,
    },
    restockRules: [
      {
        skuId: makeId<"SkuId">("sku-tote"),
        locationId: makeId<"LocationId">("loc-store"),
        supplierId: makeId<"SupplierId">("sup-north"),
        thresholdUnits: overrides.restockThreshold ?? 5,
        reorderUnits: overrides.restockUnits ?? 20,
        unitCost: money(overrides.restockUnitCostMinor ?? "200", usd),
      },
    ],
  };
}

/** Register the store (owner bootstrap) + the policy + one price record. */
export async function bootstrapAutonomousStore(
  kernel: CommerceKernel,
  storeId: string,
  policy: AutonomousStorePolicy,
  options: { readonly withPriceRecord?: boolean } = {},
): Promise<void> {
  await mustExecute(kernel, env({
    type: "REGISTER_AUTONOMOUS_STORE",
    autonomousStoreId: storeIdOf(storeId),
    ownerRef,
    displayName: `Autonomous ${storeId}`,
  }, ownerRef));
  kernel.registerAutonomousPolicy(policy);
  if (options.withPriceRecord !== false) {
    await mustExecute(kernel, env({
      type: "SET_SKU_PRICE",
      autonomousStoreId: storeIdOf(storeId),
      skuId: makeId<"SkuId">("sku-tote"),
      unitPrice: money("1999", usd),
      costBasis: money("1000", usd),
    }, ownerRef));
  }
}
