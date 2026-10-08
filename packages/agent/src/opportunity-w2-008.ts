/**
 * W2-008 opportunity vocabulary extensions: typed terms for the
 * user-opportunities residue rows — swaps, group-purchase, price-drop
 * timing, discounts, and other-proactive opportunities.
 *
 * Truth distinctions (work order):
 * - Each term is a typed shape carried by an Opportunity of the matching
 *   kind. The engine surfaces opportunities through the EXISTING discovery
 *   + proposal/authorization paths (rule 12: opportunities are proposals
 *   awaiting explicit authorization).
 * - Swap terms require reciprocity proof — both parties must have declared
 *   trade willingness and sufficient proof level.
 * - Group-purchase terms carry the discount in bps and min-participant
 *   count; the buyer's explicit authorization is required (rule 12).
 * - Price-drop timing terms carry prediction confidence; the engine never
 *   asserts the prediction as fact (invariant 30).
 * - Discount terms require merchant authorization gate (rule 12).
 * - Other-proactive terms (loyalty/future-demand) carry epistemic basis
 *   and never assert commerce truth.
 * - Money is integer minor units (invariant 14 / rule 21).
 */

import type { Money } from "./common.js";
import type { ProofLevel } from "./proof.js";

/**
 * Swap/trade terms: the two items being swapped, their values, and the
 * proof requirements. Both parties must have declared trade willingness
 * (REQUIRED or ACCEPTED); REFUSED blocks the swap (rule 12). The
 * reciprocityProofLevel ensures both sides provide evidence of item
 * ownership and condition at the declared proof level.
 */
export interface SwapTerms {
  /** The item the buyer offers. */
  readonly offeredItemRef: string;
  /** The item the buyer wants. */
  readonly desiredItemRef: string;
  /** The estimated value of the offered item. */
  readonly offeredValue?: Money;
  /** The estimated value of the desired item. */
  readonly desiredValue?: Money;
  /** Required proof level for both parties' item ownership/condition. */
  readonly reciprocityProofLevel?: ProofLevel;
}

/**
 * Group-purchase terms: the group-buy opportunity details. The discount
 * is in basis points; minParticipants is the minimum buyer count for the
 * discount to activate. The buyer's explicit authorization is required
 * (rule 12); merchantSuggested indicates whether the merchant or a buyer
 * initiated the group-buy.
 */
export interface GroupPurchaseTerms {
  /** The group-buy reference. */
  readonly groupBuyRef: string;
  /** Discount in basis points (e.g. 1500 = 15%). */
  readonly discountBps: number;
  /** Minimum participants for the discount to activate. */
  readonly minParticipants: number;
  /** Current participant count. */
  readonly currentParticipants: number;
  /** Whether the merchant suggested this group-buy (requires authorization). */
  readonly merchantSuggested?: boolean;
  /** Required proof level for the merchant. */
  readonly requiredMerchantProofLevel?: ProofLevel;
}

/**
 * Price-drop timing terms: a predicted price drop for the desired item.
 * The prediction carries a confidence in basis points (0..10000) — the
 * engine never asserts the prediction as fact (invariant 30). The
 * targetPrice is the predicted post-drop price.
 */
export interface PriceDropTimingTerms {
  /** The item whose price is predicted to drop. */
  readonly subjectRef: string;
  /** The predicted post-drop price. */
  readonly targetPrice?: Money;
  /** The predicted drop moment (ISO-8601). */
  readonly predictedDropAt?: string;
  /** Prediction confidence in basis points (0..10000). */
  readonly confidenceBps: number;
  /** The basis for the prediction (never asserted as fact). */
  readonly predictionBasis: string;
}

/**
 * Discount terms: a specific discount opportunity (coupon, loyalty
 * redemption, merchant offer). The discount requires merchant
 * authorization — the buyer cannot self-authorize a discount (rule 12).
 */
export interface DiscountTerms {
  /** The discount reference. */
  readonly discountRef: string;
  /** The discount type. */
  readonly kind: "COUPON" | "LOYALTY_REDEMPTION" | "MERCHANT_OFFER" | "VOLUME_DISCOUNT";
  /** The discount amount or rate. */
  readonly discountBps?: number;
  /** Fixed discount amount (alternative to percentage). */
  readonly fixedAmount?: Money;
  /** Whether the merchant has authorized this discount. */
  readonly merchantAuthorized?: boolean;
  /** Required proof level for the discount. */
  readonly requiredProofLevel?: ProofLevel;
}

/**
 * Other-proactive terms: opportunities the engine surfaces proactively
 * based on the buyer's profile and transaction history — loyalty
 * optimization, future-demand selling, and other forward-looking
 * proposals. These are always RECOMMENDATION-epistemic — never asserted
 * commerce truth.
 */
export interface OtherProactiveTerms {
  /** The proactive opportunity reference. */
  readonly opportunityRef: string;
  /** The proactive kind. */
  readonly kind: "LOYALTY_OPTIMIZATION" | "FUTURE_DEMAND_SELLING" | "CROSS_CATEGORY_HINT" | "SPEND_TIMING_HINT";
  /** The epistemic basis — why the engine surfaced this. */
  readonly basis: string;
  /** Estimated value of acting on this opportunity. */
  readonly estimatedValue?: Money;
  /** Required proof level for acting on this opportunity. */
  readonly requiredProofLevel?: ProofLevel;
}
