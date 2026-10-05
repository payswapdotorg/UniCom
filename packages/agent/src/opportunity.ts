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
