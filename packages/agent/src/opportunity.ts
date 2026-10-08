/**
 * Opportunity Engine contracts (FROZEN-ARCHITECTURE §3.F, §8; invariant 30).
 *
 * An Opportunity always declares its epistemic kind — factual observation,
 * inference, prediction or recommendation — and the four are never
 * collapsed. Resale and rental opportunities are first-class shapes.
 */

import type { Money, PrincipalRef } from "./common.js";

/** The four epistemic kinds — always distinct, never collapsed (invariant 30). */
export type OpportunityEpistemicKind = "OBSERVATION" | "INFERENCE" | "PREDICTION" | "RECOMMENDATION";

export type OpportunityKind =
  | "RESALE"
  | "RENTAL"
  | "TRADE"
  | "CONSIGNMENT"
  | "WARRANTY_RECOVERY"
  | "SUBSCRIPTION_OPTIMIZATION"
  | "GROUP_PURCHASE"
  | "PRICE_DROP_TIMING"
  | "LOYALTY_REWARDS"
  | "LOCAL_PICKUP_ARBITRAGE"
  | "SHARED_LOGISTICS"
  | "FUTURE_DEMAND_SELLING";

/** Epistemic status declaration with lineage. */
export interface OpportunityEpistemics {
  readonly kind: OpportunityEpistemicKind;
  /** OBSERVATION: references to the factual observations backing it. */
  readonly observedFactRefs?: readonly string[];
  /** INFERENCE: auditable basis. */
  readonly inferenceBasis?: string;
  /** PREDICTION: confidence in [0,1]. Meaningless on facts. */
  readonly predictionConfidence?: number;
  /** PREDICTION/RECOMMENDATION: lineage to prior opportunity records. */
  readonly basedOnOpportunityIds?: readonly string[];
}

export interface ResaleTerms {
  readonly askingPrice: Money;
  readonly condition: "NEW" | "LIKE_NEW" | "GOOD";
}

export interface RentalTerms {
  readonly ratePerPeriod: Money;
  readonly period: "HOUR" | "DAY" | "WEEK" | "MONTH";
  readonly depositRequired?: Money;
}

// --- W2-007 (additive): typed terms for the audit-verified incomplete
// opportunity rows — warranty/recovery, unused-subscription, local-pickup
// and shared-logistics. Each is a typed shape carried by an Opportunity of
// the matching kind; the engine surfaces opportunities of these kinds
// through the EXISTING discovery + proposal/authorization paths (rule 12:
// opportunities are proposals awaiting explicit authorization). ---

/**
 * Warranty/recovery terms: the claim window + recourse path surfaced as an
 * opportunity. The buyer owns an item still under warranty (or with a
 * recovery path — refund/repair/replace) and the engine surfaces a
 * proposal to exercise that path. Authorization is explicit (rule 12).
 */
export interface WarrantyRecoveryTerms {
  /** The opaque warranty/claim reference. */
  readonly warrantyRef: string;
  /** The recourse path proposed: refund, repair, replace, or extended-claim. */
  readonly recoursePath: "REFUND" | "REPAIR" | "REPLACE" | "EXTENDED_CLAIM";
  /** The window during which the claim is exercisable. */
  readonly claimWindow: { readonly opensAt: string; readonly closesAt: string };
  /** The estimated recovery value (refund amount / replacement value). */
  readonly estimatedRecoveryValue?: Money;
}

/**
 * Unused-subscription terms: a subscription the buyer pays for but does not
 * use. The engine surfaces a proposal to liquidate (transfer to another
 * buyer) or reallocate (downgrade / pause / cancel). Authorization is
 * explicit; the proposal never directly mutates the subscription truth.
 */
export interface UnusedSubscriptionTerms {
  /** The opaque subscription reference. */
  readonly subscriptionRef: string;
  /** The proposed action: liquidate (transfer), reallocate (downgrade/pause), or cancel. */
  readonly proposedAction: "LIQUIDATE" | "REALLOCATE" | "CANCEL";
  /** The estimated recovery value (transfer price / saved periods). */
  readonly estimatedRecoveryValue?: Money;
  /** The remaining period count on the subscription. */
  readonly remainingPeriods?: number;
}

/**
 * Local-pickup / shared-logistics terms. Two complementary shapes:
 * - LOCAL_PICKUP: the buyer can pick up locally, avoiding shipping cost/time.
 * - SHARED_LOGISTICS: multiple buyers coordinate a shared shipment (proximity
 *   batching) to reduce per-buyer shipping cost. The coordination is a
 *   proposal awaiting explicit participant authorization (rule 12).
 */
export interface LocalPickupTerms {
  /** The opaque pickup location reference. */
  readonly pickupLocationRef: string;
  /** The estimated pickup window. */
  readonly pickupWindow: { readonly notBefore: string; readonly notAfter: string };
  /** The estimated savings vs shipped delivery. */
  readonly estimatedSavings?: Money;
}

export interface SharedLogisticsTerms {
  /** The opaque shared-shipment coordination reference. */
  readonly sharedShipmentRef: string;
  /** The number of buyers coordinated in the shared shipment. */
  readonly participantCount: number;
  /** The estimated per-buyer shipping cost after sharing. */
  readonly estimatedPerBuyerCost?: Money;
  /** The proximity window during which the shared shipment is feasible. */
  readonly proximityWindow: { readonly notBefore: string; readonly notAfter: string };
}

// --- W2-008 (additive): typed terms for the new opportunity rows —
// swaps, group-purchase, price-drop timing, discounts, other-proactive. ---
import type { SwapTerms, GroupPurchaseTerms, PriceDropTimingTerms, DiscountTerms, OtherProactiveTerms } from "./opportunity-w2-008.js";
export type { SwapTerms, GroupPurchaseTerms, PriceDropTimingTerms, DiscountTerms, OtherProactiveTerms } from "./opportunity-w2-008.js";

export interface Opportunity {
  readonly opportunityId: string;
  readonly forRef: PrincipalRef;
  readonly kind: OpportunityKind;
  readonly epistemics: OpportunityEpistemics;
  /** Opaque owned-item/subscription/intent reference the opportunity is about. */
  readonly subjectRef?: string;
  readonly estimatedValue?: Money;
  readonly resaleTerms?: ResaleTerms;
  readonly rentalTerms?: RentalTerms;
  // --- W2-007 (additive): typed terms for the new opportunity rows. ---
  readonly warrantyRecoveryTerms?: WarrantyRecoveryTerms;
  readonly unusedSubscriptionTerms?: UnusedSubscriptionTerms;
  readonly localPickupTerms?: LocalPickupTerms;
  readonly sharedLogisticsTerms?: SharedLogisticsTerms;
  // --- W2-008 (additive): typed terms for the residue opportunity rows. ---
  readonly swapTerms?: SwapTerms;
  readonly groupPurchaseTerms?: GroupPurchaseTerms;
  readonly priceDropTimingTerms?: PriceDropTimingTerms;
  readonly discountTerms?: DiscountTerms;
  readonly otherProactiveTerms?: OtherProactiveTerms;
  readonly proposedStrategyId?: string;
  readonly detectedAt: string;
}

export type ResaleOpportunity = Opportunity & { readonly kind: "RESALE" };
export type RentalOpportunity = Opportunity & { readonly kind: "RENTAL" };

export type OpportunityChainViolation =
  | "OBSERVATION_CARRIES_PREDICTIVE_FIELDS"
  | "INFERENCE_MISSING_BASIS"
  | "PREDICTION_MISSING_CONFIDENCE"
  | "RECOMMENDATION_WITHOUT_BASIS"
  | "RECOMMENDATION_BASIS_NOT_FOUND";

/**
 * Deterministic epistemic-chain validation: observations carry no predictive
 * fields; inferences state a basis; predictions state a confidence;
 * recommendations cite existing lineage.
 */
export function validateOpportunityChain(opportunities: readonly Opportunity[]): readonly OpportunityChainViolation[] {
  const violations: OpportunityChainViolation[] = [];
  const knownIds = new Set(opportunities.map((opportunity) => opportunity.opportunityId));

  for (const opportunity of opportunities) {
    const epistemics = opportunity.epistemics;
    if (epistemics.kind === "OBSERVATION" && epistemics.predictionConfidence !== undefined) {
      violations.push("OBSERVATION_CARRIES_PREDICTIVE_FIELDS");
    }
    if (epistemics.kind === "INFERENCE" && (epistemics.inferenceBasis === undefined || epistemics.inferenceBasis.length === 0)) {
      violations.push("INFERENCE_MISSING_BASIS");
    }
    if (epistemics.kind === "PREDICTION" && epistemics.predictionConfidence === undefined) {
      violations.push("PREDICTION_MISSING_CONFIDENCE");
    }
    if (epistemics.kind === "RECOMMENDATION") {
      if (epistemics.basedOnOpportunityIds === undefined || epistemics.basedOnOpportunityIds.length === 0) {
        violations.push("RECOMMENDATION_WITHOUT_BASIS");
      } else if (epistemics.basedOnOpportunityIds.some((id) => !knownIds.has(id))) {
        violations.push("RECOMMENDATION_BASIS_NOT_FOUND");
      }
    }
  }
  return [...new Set(violations)];
}
