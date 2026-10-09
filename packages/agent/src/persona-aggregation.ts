/**
 * W2-009 — Adoption aggregation (by industry / firm-size / role).
 *
 * Split out of persona-scoring.ts for the architecture file-line budget.
 * Internal to the @unicom/agent module — the public re-export goes through
 * contract.w2-009.ts.
 *
 * Law: every aggregate carries the denominator. Failed/blocked/UNKNOWN
 * personas remain in the denominator (W2-009 acceptance #6). Percentages
 * are rounded to one decimal place.
 */

import type {
  AdoptionAggregate,
  AdoptionDecision,
  AdoptionGrouping,
  ReasonCode,
} from "./persona-types.js";
import { REASON_CODES } from "./persona-types.js";

/**
 * Aggregate adoption decisions by the chosen grouping. Returns one
 * AdoptionAggregate per group key, with counts AND percentages and the
 * denominator.
 */
export function aggregateAdoption(
  decisions: ReadonlyArray<AdoptionDecision>,
  grouping: AdoptionGrouping,
): ReadonlyArray<AdoptionAggregate> {
  const groups = new Map<string, AdoptionDecision[]>();
  for (const decision of decisions) {
    const key = groupKeyFor(decision, grouping);
    const bucket = groups.get(key) ?? [];
    bucket.push(decision);
    groups.set(key, bucket);
  }
  return Array.from(groups.entries())
    .map(([key, bucket]) => aggregateOneGroup(key, bucket))
    .sort((a, b) => a.groupKey.localeCompare(b.groupKey));
}

function groupKeyFor(decision: AdoptionDecision, grouping: AdoptionGrouping): string {
  switch (grouping) {
    case "global":
      return "global";
    case "industry":
      return decision.industry;
    case "firm-size":
      return decision.firmSize;
    case "industry-size":
      return `${decision.industry}:${decision.firmSize}`;
    case "role":
      return decision.roleFamily;
    case "industry-size-role":
      return `${decision.industry}:${decision.firmSize}:${decision.roleFamily}`;
  }
}

function aggregateOneGroup(
  groupKey: string,
  bucket: ReadonlyArray<AdoptionDecision>,
): AdoptionAggregate {
  const denominator = bucket.length;
  if (denominator === 0) {
    return zeroAggregate(groupKey);
  }
  const technicalFullSwitchEligibleCount = bucket.filter((d) => d.technicalFullSwitchEligible).length;
  const simulatedWillingToSwitchCompletelyCount = bucket.filter(
    (d) => d.simulatedWillingToSwitchCompletely,
  ).length;
  const mainInterfaceEligibleCount = bucket.filter((d) => d.mainInterfaceEligible).length;
  const simulatedWillingToUseAsMainInterfaceCount = bucket.filter(
    (d) => d.simulatedWillingToUseAsMainInterface,
  ).length;
  const vetoedCount = bucket.filter((d) => d.vetoedByCriticalFailure).length;
  const reasonCodeCounts = emptyReasonCodeCounts();
  for (const decision of bucket) {
    for (const code of decision.reasonCodes) {
      reasonCodeCounts[code] += 1;
    }
  }
  return {
    groupKey,
    denominator,
    technicalFullSwitchEligibleCount,
    technicalFullSwitchEligiblePct: pct(technicalFullSwitchEligibleCount, denominator),
    simulatedWillingToSwitchCompletelyCount,
    simulatedWillingToSwitchCompletelyPct: pct(
      simulatedWillingToSwitchCompletelyCount,
      denominator,
    ),
    mainInterfaceEligibleCount,
    mainInterfaceEligiblePct: pct(mainInterfaceEligibleCount, denominator),
    simulatedWillingToUseAsMainInterfaceCount,
    simulatedWillingToUseAsMainInterfacePct: pct(
      simulatedWillingToUseAsMainInterfaceCount,
      denominator,
    ),
    vetoedCount,
    vetoedPct: pct(vetoedCount, denominator),
    reasonCodeCounts,
  };
}

function emptyReasonCodeCounts(): Record<ReasonCode, number> {
  const result = {} as Record<ReasonCode, number>;
  for (const code of REASON_CODES) result[code] = 0;
  return result;
}

function zeroAggregate(groupKey: string): AdoptionAggregate {
  return {
    groupKey,
    denominator: 0,
    technicalFullSwitchEligibleCount: 0,
    technicalFullSwitchEligiblePct: 0,
    simulatedWillingToSwitchCompletelyCount: 0,
    simulatedWillingToSwitchCompletelyPct: 0,
    mainInterfaceEligibleCount: 0,
    mainInterfaceEligiblePct: 0,
    simulatedWillingToUseAsMainInterfaceCount: 0,
    simulatedWillingToUseAsMainInterfacePct: 0,
    vetoedCount: 0,
    vetoedPct: 0,
    reasonCodeCounts: emptyReasonCodeCounts(),
  };
}

function pct(count: number, denom: number): number {
  if (denom === 0) return 0;
  return Math.round((count / denom) * 1000) / 10;
}
