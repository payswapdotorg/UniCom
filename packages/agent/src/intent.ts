/**
 * Buyer commerce intent contracts (FROZEN-ARCHITECTURE §5).
 *
 * Hard constraints (deadline, max cost, quality, credibility, privacy,
 * security, delivery/speed, proof, recourse) are checked BEFORE soft
 * optimization. Desired goods/services are opaque references — commerce
 * entities are Worker 1's truth.
 */

import type { Money, PrincipalRef } from "./common.js";
import type { ProofLevel } from "./proof.js";

export type PrivacyRequirement =
  | "NO_THIRD_PARTY_SHARING"
  | "MINIMIZE_DATA_COLLECTION"
  | "NO_PROFILE_RETENTION"
  | "ANONYMIZED_COORDINATION";

export type SecurityRequirement =
  | "PROOF_OF_DELIVERY"
  | "VERIFIED_MERCHANT"
  | "SECURE_PAYMENT_RAIL"
  | "RECEIPT_REQUIRED";

/** Delivery/speed constraints. DEADLINE/window live on the intent itself. */
export interface DeliveryConstraint {
  readonly kind: "MAX_LATENCY_HOURS" | "PICKUP_GEOGRAPHY";
  readonly value: string;
}

export interface QualityFloor {
  readonly minAverageRating?: number;
  readonly minReviewCount?: number;
  readonly minCondition?: "NEW" | "LIKE_NEW" | "GOOD";
}

export interface SellerCredibilityFloor {
  readonly minVerifiedTransactions?: number;
  /** Maximum tolerated dispute rate, in basis points. */
  readonly minDisputeRateCeilingBps?: number;
}

/** Typed hard constraints — checked before any soft optimization. */
export interface BuyerHardConstraints {
  readonly deadline?: string;
  readonly timeWindow?: { readonly notBefore: string; readonly notAfter: string };
  readonly maxTotalCost?: Money;
  readonly minQuality?: QualityFloor;
  readonly minSellerCredibility?: SellerCredibilityFloor;
  readonly privacyRequirements?: readonly PrivacyRequirement[];
  readonly securityRequirements?: readonly SecurityRequirement[];
  readonly deliveryConstraints?: readonly DeliveryConstraint[];
  readonly requiredProofLevel?: ProofLevel;
  readonly recourseRequired?: boolean;
  readonly groupBuyWillingness?: "REQUIRED" | "ACCEPTED" | "REFUSED";
  readonly tradeWillingness?: "REQUIRED" | "ACCEPTED" | "REFUSED";
}

/** Typed soft preferences — optimization hints, never gates. */
export interface BuyerSoftPreferences {
  readonly speedPreference?: "FASTEST" | "BALANCED" | "CHEAPEST";
  readonly acceptableSubstitutes?: readonly string[];
  readonly buyVsWaitTolerance?: "BUY_NOW" | "PREFER_WAIT" | "WAIT_ONLY";
  readonly financingPreference?: "PREPAY" | "FINANCE" | "PAY_ON_DELIVERY";
  readonly preferredMerchants?: readonly string[];
}

export interface BuyerCommerceIntent {
  readonly intentId: string;
  readonly buyerRef: PrincipalRef;
  /** Opaque desired goods/services references. */
  readonly desired: readonly string[];
  readonly hardConstraints: BuyerHardConstraints;
  readonly softPreferences?: BuyerSoftPreferences;
  readonly statedAt: string;
}

/** An opaque candidate evaluated against an intent. */
export interface IntentCandidate {
  readonly candidateRef: string;
  readonly sellerRef?: string;
  readonly totalCost?: Money;
  readonly estimatedDeliveryAt?: string;
  readonly averageRating?: number;
  readonly reviewCount?: number;
  readonly condition?: "NEW" | "LIKE_NEW" | "GOOD";
  readonly sellerVerifiedTransactions?: number;
  readonly sellerDisputeRateBps?: number;
  readonly privacyGuarantees?: readonly PrivacyRequirement[];
  readonly securityGuarantees?: readonly SecurityRequirement[];
  readonly financingAvailable?: readonly ("PREPAY" | "FINANCE" | "PAY_ON_DELIVERY")[];
  readonly proofLevel?: ProofLevel;
  readonly recourseAvailable?: boolean;
}

export type HardConstraintViolation =
  | "DEADLINE_EXCEEDED"
  | "WINDOW_VIOLATION"
  | "COST_EXCEEDED"
  | "QUALITY_BELOW_FLOOR"
  | "CREDIBILITY_BELOW_FLOOR"
  | "PRIVACY_UNSATISFIED"
  | "SECURITY_UNSATISFIED"
  | "PROOF_LEVEL_BELOW_REQUIRED"
  | "RECOURSE_UNAVAILABLE"
  | "DELIVERY_LATENCY_EXCEEDED"
  | "MISSING_REQUIRED_DATA";

export type HardConstraintCheck =
  | { readonly satisfied: true }
  | { readonly satisfied: false; readonly violations: readonly HardConstraintViolation[] };

const HOUR_MS = 3_600_000;

function parseTime(value: string): number {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw new Error(`invalid timestamp: ${value}`);
  return parsed;
}

const CONDITION_RANK: Readonly<Record<"NEW" | "LIKE_NEW" | "GOOD", number>> = { NEW: 2, LIKE_NEW: 1, GOOD: 0 };

/** Deterministic hard-constraint check. Missing candidate data for a declared
 * hard constraint fails closed (MISSING_REQUIRED_DATA). */
export function checkHardConstraints(intent: BuyerCommerceIntent, candidate: IntentCandidate): HardConstraintCheck {
  const hard = intent.hardConstraints;
  const violations: HardConstraintViolation[] = [];

  if (hard.deadline !== undefined) {
    if (candidate.estimatedDeliveryAt === undefined) violations.push("MISSING_REQUIRED_DATA");
    else if (parseTime(candidate.estimatedDeliveryAt) > parseTime(hard.deadline)) violations.push("DEADLINE_EXCEEDED");
  }
  if (hard.timeWindow !== undefined) {
    if (candidate.estimatedDeliveryAt === undefined) violations.push("MISSING_REQUIRED_DATA");
    else {
      const delivery = parseTime(candidate.estimatedDeliveryAt);
      if (delivery < parseTime(hard.timeWindow.notBefore) || delivery > parseTime(hard.timeWindow.notAfter)) {
        violations.push("WINDOW_VIOLATION");
      }
    }
  }
  if (hard.maxTotalCost !== undefined) {
    if (candidate.totalCost === undefined) violations.push("MISSING_REQUIRED_DATA");
    else if (candidate.totalCost.currency !== hard.maxTotalCost.currency || BigInt(candidate.totalCost.minorUnits) > BigInt(hard.maxTotalCost.minorUnits)) {
      violations.push("COST_EXCEEDED");
    }
  }
  if (hard.minQuality !== undefined) {
    const floor = hard.minQuality;
    if (floor.minAverageRating !== undefined) {
      if (candidate.averageRating === undefined) violations.push("MISSING_REQUIRED_DATA");
      else if (candidate.averageRating < floor.minAverageRating) violations.push("QUALITY_BELOW_FLOOR");
    }
    if (floor.minReviewCount !== undefined) {
      if (candidate.reviewCount === undefined) violations.push("MISSING_REQUIRED_DATA");
      else if (candidate.reviewCount < floor.minReviewCount) violations.push("QUALITY_BELOW_FLOOR");
    }
    if (floor.minCondition !== undefined) {
      if (candidate.condition === undefined) violations.push("MISSING_REQUIRED_DATA");
      else if (CONDITION_RANK[candidate.condition] < CONDITION_RANK[floor.minCondition]) {
        violations.push("QUALITY_BELOW_FLOOR");
      }
    }
  }
  if (hard.minSellerCredibility !== undefined) {
    const floor = hard.minSellerCredibility;
    if (floor.minVerifiedTransactions !== undefined) {
      if (candidate.sellerVerifiedTransactions === undefined) violations.push("MISSING_REQUIRED_DATA");
      else if (candidate.sellerVerifiedTransactions < floor.minVerifiedTransactions) violations.push("CREDIBILITY_BELOW_FLOOR");
    }
    if (floor.minDisputeRateCeilingBps !== undefined) {
      if (candidate.sellerDisputeRateBps === undefined) violations.push("MISSING_REQUIRED_DATA");
      else if (candidate.sellerDisputeRateBps > floor.minDisputeRateCeilingBps) violations.push("CREDIBILITY_BELOW_FLOOR");
    }
  }
  if (hard.privacyRequirements !== undefined) {
    const guarantees = new Set(candidate.privacyGuarantees ?? []);
    if (hard.privacyRequirements.some((requirement) => !guarantees.has(requirement))) {
      violations.push("PRIVACY_UNSATISFIED");
    }
  }
  if (hard.securityRequirements !== undefined) {
    const guarantees = new Set(candidate.securityGuarantees ?? []);
    if (hard.securityRequirements.some((requirement) => !guarantees.has(requirement))) {
      violations.push("SECURITY_UNSATISFIED");
    }
  }
  for (const constraint of hard.deliveryConstraints ?? []) {
    if (constraint.kind !== "MAX_LATENCY_HOURS") continue;
    if (candidate.estimatedDeliveryAt === undefined) {
      violations.push("MISSING_REQUIRED_DATA");
      continue;
    }
    const latencyHours = (parseTime(candidate.estimatedDeliveryAt) - parseTime(intent.statedAt)) / HOUR_MS;
    if (latencyHours > Number(constraint.value)) violations.push("DELIVERY_LATENCY_EXCEEDED");
  }
  if (hard.requiredProofLevel !== undefined) {
    if (candidate.proofLevel === undefined) violations.push("MISSING_REQUIRED_DATA");
    else if (PROOF_RANK[candidate.proofLevel] < PROOF_RANK[hard.requiredProofLevel]) {
      violations.push("PROOF_LEVEL_BELOW_REQUIRED");
    }
  }
  if (hard.recourseRequired === true && candidate.recourseAvailable !== true) {
    violations.push("RECOURSE_UNAVAILABLE");
  }

  return violations.length === 0 ? { satisfied: true } : { satisfied: false, violations: [...new Set(violations)] };
}

const PROOF_RANK: Readonly<Record<ProofLevel, number>> = { P0: 0, P1: 1, P2: 2, P3: 3, P4: 4, P5: 5 };

/** Candidate evaluation: hard-constrained first, then soft-scored. */
export interface ScoredCandidate {
  readonly candidateRef: string;
  readonly hardCheck: HardConstraintCheck;
  /** Present only for candidates that satisfied every hard constraint. */
  readonly softScore?: number;
}

/**
 * Evaluate candidates: hard constraints first — a hard-violating candidate
 * is excluded from soft optimization regardless of how well it scores.
 */
export function evaluateIntentCandidates(
  intent: BuyerCommerceIntent,
  candidates: readonly IntentCandidate[],
): readonly ScoredCandidate[] {
  const checked = candidates.map((candidate) => ({
    candidate,
    hardCheck: checkHardConstraints(intent, candidate),
  }));
  const survivors = checked.filter((entry) => entry.hardCheck.satisfied);

  const earliest = minBy(survivors, (entry) =>
    entry.candidate.estimatedDeliveryAt === undefined ? Number.POSITIVE_INFINITY : parseTime(entry.candidate.estimatedDeliveryAt),
  );
  const cheapest = minBy(survivors, (entry) =>
    entry.candidate.totalCost === undefined ? Number.POSITIVE_INFINITY : Number(entry.candidate.totalCost.minorUnits),
  );

  return checked.map((entry) => {
    if (!entry.hardCheck.satisfied) return { candidateRef: entry.candidate.candidateRef, hardCheck: entry.hardCheck };
    const preferences = intent.softPreferences;
    let score = 0;
    if (preferences?.speedPreference === "FASTEST" && earliest?.candidate.candidateRef === entry.candidate.candidateRef) score += 2;
    if (preferences?.speedPreference === "CHEAPEST" && cheapest?.candidate.candidateRef === entry.candidate.candidateRef) score += 2;
    if (
      preferences?.financingPreference !== undefined &&
      entry.candidate.financingAvailable?.includes(preferences.financingPreference) === true
    ) {
      score += 1;
    }
    if (preferences?.preferredMerchants?.includes(entry.candidate.sellerRef ?? "") === true) score += 1;
    return { candidateRef: entry.candidate.candidateRef, hardCheck: entry.hardCheck, softScore: score };
  });
}

function minBy<T>(entries: readonly T[], score: (entry: T) => number): T | undefined {
  let best: T | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const entry of entries) {
    const value = score(entry);
    if (value < bestScore) {
      best = entry;
      bestScore = value;
    }
  }
  return best;
}
