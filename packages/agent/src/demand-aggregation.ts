/**
 * Merchant demand-generated GroupBuy (FROZEN-ARCHITECTURE §6, §22.1;
 * invariant 43; W2-003 scenario 2).
 *
 * Buyer intents are aggregated into a merchant-visible opportunity with ZERO
 * raw buyer-intent fields crossing the boundary:
 * - no buyer principal ids, no intent ids, no per-buyer constraints ever
 *   appear in the merchant view (asserted by `findRawIntentLeaks`, not by
 *   convention);
 * - the projection exists only above a minimum anonymity count k;
 * - the price band is an order-statistic aggregate whose endpoints are each
 *   supported by at least k stated budgets (or suppressed);
 * - the interest window is date-coarsened, never a raw intent timestamp.
 *
 * The merchant-visible view is an INFERENCE about aggregate demand — never
 * an asserted commerce fact.
 */

import type { BuyerCommerceIntent } from "./intent.js";
import type { PrincipalRef } from "./common.js";
import { type GroupBuyProposal, type GroupBuyTerms } from "./groupbuy.js";
import { collectLeaves, rawIntentFieldInventory } from "./coordination-privacy.js";

export const DEFAULT_MINIMUM_ANONYMITY_COUNT = 3;

export interface DemandAggregationOptions {
  readonly minimumAnonymityCount: number;
  readonly demandId?: string;
}

export type MerchantDemandPriceBand =
  | {
      readonly currency: string;
      /** k-th smallest stated budget — at least k budgets at or below. */
      readonly floorMinorUnits: string;
      /** k-th largest stated budget — at least k budgets at or above. */
      readonly ceilingMinorUnits: string;
    }
  | { readonly suppressed: "INSUFFICIENT_SUPPORT" };

export interface MerchantDemandView {
  readonly aggregateParticipantCount: number;
  /** Union of opaque desired references — the demand SUBJECT, deduped + sorted. */
  readonly opaqueItemRefs: readonly string[];
  readonly priceBand: MerchantDemandPriceBand;
  /** Date-coarsened interest window (UTC dates, never raw timestamps). */
  readonly interestWindow: { readonly opensOn: string; readonly closesOn: string };
  readonly epistemics: { readonly kind: "INFERENCE"; readonly basis: string };
}

/** The explicit disclosure contract for the merchant boundary. */
export interface MerchantDemandDisclosure {
  readonly disclosedPaths: readonly string[];
  readonly suppressedPaths: readonly string[];
  readonly anonymityCount: number;
  readonly sourceIntentCount: number;
}

export interface MerchantDemandOpportunity {
  readonly demandId: string;
  readonly merchantVisible: MerchantDemandView;
  readonly disclosure: MerchantDemandDisclosure;
}

export type DemandAggregationOutcome =
  | { readonly status: "AGGREGATED"; readonly opportunity: MerchantDemandOpportunity }
  | { readonly status: "SUPPRESSED"; readonly reason: "INSUFFICIENT_ANONYMITY"; readonly sourceIntentCount: number };

const DECLARED_DISCLOSED_PATHS: readonly string[] = [
  "merchantVisible.aggregateParticipantCount",
  "merchantVisible.opaqueItemRefs",
  "merchantVisible.priceBand",
  "merchantVisible.interestWindow",
  "merchantVisible.epistemics",
];

function utcDate(timestamp: string): string {
  return timestamp.slice(0, 10);
}

/**
 * Aggregate buyer intents into a merchant-visible demand opportunity.
 * Deterministic: identical intents + options produce identical output.
 * Below k intents the whole projection is SUPPRESSED — nothing crosses.
 */
export function aggregateMerchantDemand(
  intents: readonly BuyerCommerceIntent[],
  options: DemandAggregationOptions,
): DemandAggregationOutcome {
  const k = Math.max(1, Math.floor(options.minimumAnonymityCount));
  const n = intents.length;
  if (n < k) {
    return { status: "SUPPRESSED", reason: "INSUFFICIENT_ANONYMITY", sourceIntentCount: n };
  }

  const itemRefs = [...new Set(intents.flatMap((intent) => intent.desired))].sort();
  const statedAt = intents.map((intent) => intent.statedAt).sort();
  const interestWindow = {
    opensOn: utcDate(statedAt[0] ?? ""),
    closesOn: utcDate(statedAt[statedAt.length - 1] ?? ""),
  };

  // Price band: order statistics over the largest same-currency budget group.
  const byCurrency = new Map<string, string[]>();
  for (const intent of intents) {
    const budget = intent.hardConstraints.maxTotalCost;
    if (budget === undefined) continue;
    const bucket = byCurrency.get(budget.currency) ?? [];
    bucket.push(budget.minorUnits);
    byCurrency.set(budget.currency, bucket);
  }
  let dominantCurrency: string | undefined;
  let dominantBudgets: string[] = [];
  for (const [currency, budgets] of [...byCurrency.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (budgets.length > dominantBudgets.length) {
      dominantCurrency = currency;
      dominantBudgets = budgets;
    }
  }
  const numeric = dominantBudgets.map((units) => BigInt(units)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const priceBand: MerchantDemandPriceBand =
    dominantCurrency !== undefined && numeric.length >= 2 * k - 1 && numeric[0] !== undefined && numeric[numeric.length - 1] !== undefined
      ? {
          currency: dominantCurrency,
          floorMinorUnits: numeric[k - 1]?.toString() ?? "0",
          ceilingMinorUnits: numeric[numeric.length - k]?.toString() ?? "0",
        }
      : { suppressed: "INSUFFICIENT_SUPPORT" };

  const suppressedPaths = "suppressed" in priceBand ? ["merchantVisible.priceBand"] : [];

  return {
    status: "AGGREGATED",
    opportunity: {
      demandId: options.demandId ?? `demand:cluster:${stableDemandKey(intents)}`,
      merchantVisible: {
        aggregateParticipantCount: n,
        opaqueItemRefs: itemRefs,
        priceBand,
        interestWindow,
        epistemics: {
          kind: "INFERENCE",
          basis: `aggregate demand inferred from ${n} buyer intents at anonymity count >= ${k}`,
        },
      },
      disclosure: {
        disclosedPaths: DECLARED_DISCLOSED_PATHS,
        suppressedPaths,
        anonymityCount: k,
        sourceIntentCount: n,
      },
    },
  };
}

function stableDemandKey(intents: readonly BuyerCommerceIntent[]): string {
  const ids = intents.map((intent) => intent.intentId).sort();
  let hash = 0x811c9dc5;
  for (const id of ids) {
    for (let index = 0; index < id.length; index += 1) {
      hash ^= id.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    hash ^= 0x2f;
  }
  return hash.toString(16).padStart(8, "0");
}

// ---------------------------------------------------------------------------
// Privacy boundary assertion (scenario 2 — asserted by test, not convention)
// ---------------------------------------------------------------------------

export type DemandLeakHow =
  | "IDENTITY_MATERIAL"
  | "UNDISCLOSED_PATH"
  | "UNIQUE_RAW_VALUE"
  | "AGGREGATE_SUPPORT_BELOW_ANONYMITY_COUNT";

export interface DemandLeakFinding {
  readonly path: string;
  readonly value: string;
  readonly how: DemandLeakHow;
}

const AGGREGATE_PATH_PATTERN =
  /^(merchantVisible\.(aggregateParticipantCount|opaqueItemRefs(\[\d+\])?|priceBand\.suppressed|interestWindow\.(opensOn|closesOn)|epistemics\.(kind|basis)))$/;

/**
 * Structural verification that ZERO raw buyer-intent fields cross the
 * merchant boundary. Checks, over every leaf of the merchant-visible view:
 * 1. IDENTITY_MATERIAL — no intentId or buyer principalId appears anywhere;
 * 2. UNDISCLOSED_PATH — every leaf path is one of the declared fields;
 * 3. UNIQUE_RAW_VALUE — a leaf value that is unique to ONE source intent on
 *    a path that is not the declared subject/aggregate disclosure (item
 *    refs, counts, band endpoints with k-support, dates, epistemics);
 * 4. AGGREGATE_SUPPORT_BELOW_ANONYMITY_COUNT — a band endpoint supported by
 *    fewer than k stated budgets.
 */
export function findRawIntentLeaks(
  view: MerchantDemandView,
  sourceIntents: readonly BuyerCommerceIntent[],
  options: { readonly minimumAnonymityCount: number },
): readonly DemandLeakFinding[] {
  const findings: DemandLeakFinding[] = [];
  const k = Math.max(1, Math.floor(options.minimumAnonymityCount));
  const inventory = rawIntentFieldInventory(sourceIntents);
  const identityValues = new Set(
    inventory
      .filter((fact) => fact.fieldPath === "intentId" || fact.fieldPath === "buyerRef.principalId")
      .map((fact) => fact.value),
  );
  const valueCounts = new Map<string, number>();
  for (const fact of inventory) valueCounts.set(fact.value, (valueCounts.get(fact.value) ?? 0) + 1);

  for (const leaf of collectLeaves({ merchantVisible: view }, "$")) {
    const value = String(leaf.value);
    if (identityValues.has(value)) {
      findings.push({ path: leaf.path, value, how: "IDENTITY_MATERIAL" });
      continue;
    }
    if (!AGGREGATE_PATH_PATTERN.test(leaf.path)) {
      findings.push({ path: leaf.path, value, how: "UNDISCLOSED_PATH" });
      continue;
    }
    // Declared subject disclosure: opaque item refs may cross by contract.
    if (leaf.path.startsWith("merchantVisible.opaqueItemRefs")) continue;
    // Structural aggregates with whole-population support: the participant
    // count (support = n) and the date-coarsened interest window.
    if (leaf.path === "merchantVisible.aggregateParticipantCount") continue;
    if (leaf.path.startsWith("merchantVisible.interestWindow")) continue;
    // Band endpoints: verify k-support from the source intents themselves.
    if (leaf.path === "merchantVisible.priceBand.floorMinorUnits" || leaf.path === "merchantVisible.priceBand.ceilingMinorUnits") {
      const support = countBudgetSupport(sourceIntents, value, leaf.path.endsWith("floorMinorUnits"));
      if (support < k) findings.push({ path: leaf.path, value, how: "AGGREGATE_SUPPORT_BELOW_ANONYMITY_COUNT" });
      continue;
    }
    // Any other unique-to-one-intent raw value on a declared path is a leak.
    if ((valueCounts.get(value) ?? 0) === 1 && inventory.some((fact) => fact.value === value)) {
      findings.push({ path: leaf.path, value, how: "UNIQUE_RAW_VALUE" });
    }
  }
  return findings;
}

/** Number of stated budgets at or beyond a band endpoint. */
function countBudgetSupport(intents: readonly BuyerCommerceIntent[], endpoint: string, isFloor: boolean): number {
  let support = 0;
  for (const intent of intents) {
    const budget = intent.hardConstraints.maxTotalCost;
    if (budget === undefined) continue;
    const units = BigInt(budget.minorUnits);
    const bound = BigInt(endpoint);
    if (isFloor ? units <= bound : units >= bound) support += 1;
  }
  return support;
}

// ---------------------------------------------------------------------------
// Demand-generated group-buy proposal (merchant side sees only the aggregate)
// ---------------------------------------------------------------------------

/**
 * Propose a NEW group-buy to a merchant agent from an aggregated demand
 * opportunity. The proposal references the demand cluster id — the merchant
 * sees the aggregate only, never raw intent.
 */
export function proposeDemandGeneratedGroupBuy(input: {
  readonly demand: MerchantDemandOpportunity;
  readonly fromRef: PrincipalRef;
  readonly merchantRef: PrincipalRef;
  readonly proposedTerms: GroupBuyTerms;
  readonly at: string;
}): GroupBuyProposal {
  return {
    proposalId: `proposal:demand:${input.demand.demandId}:${stableDemandKeyTerm(input.proposedTerms)}`,
    fromRef: input.fromRef,
    merchantRef: input.merchantRef,
    demandClusterId: input.demand.demandId,
    proposedTerms: input.proposedTerms,
    proposedAt: input.at,
  };
}

function stableDemandKeyTerm(terms: GroupBuyTerms): string {
  const key = `${terms.minimumParticipants}:${terms.windowOpensAt}:${terms.windowClosesAt}:${terms.discount.kind}:${terms.discount.value}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
