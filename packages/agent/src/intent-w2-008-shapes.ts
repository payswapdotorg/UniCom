/**
 * W2-008 constraint and candidate SHAPE types — split from
 * intent-w2-008.ts by the TL battery (the combined file broke the
 * architecture max-file-lines limit at 524 lines). The deterministic
 * check function stays in intent-w2-008.ts; consumers import from there.
 */

import type { Money } from "./common.js";
import type { ProofLevel } from "./proof.js";

// ---------------------------------------------------------------------------
// Commerce-plane constraint types
// ---------------------------------------------------------------------------

/**
 * Rental/borrow hard constraint. The buyer declares the rental ceiling:
 * max periods, acceptable period unit, max deposit, and the proof level
 * required for the rental agreement. A candidate exceeding the period
 * ceiling, or lacking the required proof level, is rejected
 * deterministically (rule 15).
 */
export interface RentalConstraint {
  readonly maxPeriods?: number;
  readonly period: "HOUR" | "DAY" | "WEEK" | "MONTH";
  readonly maxDeposit?: Money;
  readonly requiredRentalProofLevel?: ProofLevel;
}

/**
 * Resale hard constraint. The buyer declares the minimum acceptable resale
 * value (or max depreciation in bps), and the proof level required for
 * the resale appraisal. A candidate appraised below the floor is rejected.
 */
export interface ResaleConstraint {
  readonly minResaleValue?: Money;
  readonly maxDepreciationBps?: number;
  readonly requiredResaleProofLevel?: ProofLevel;
}

/**
 * Multi-hop trade constraint. The buyer bounds the trade-cycle hop count
 * (rule 13: trade-cycle search is bounded; AGENTS.md rule 13). A
 * candidate exceeding the hop ceiling is rejected. minParticipants and
 * proof level enforce that every participant in the cycle has been
 * verified at the declared proof level.
 */
export interface MultiHopTradeConstraint {
  readonly maxHopCount?: number;
  readonly minParticipants?: number;
  readonly requiredParticipantProofLevel?: ProofLevel;
}

/**
 * Merchant-suggested group-buy constraint. Rule 12 requires explicit
 * authorization: REQUIRED = buyer initiated, ACCEPTED = buyer accepts
 * merchant suggestion, REFUSED = buyer declines. A merchant-suggested
 * group-buy without REQUIRED or ACCEPTED authorization is rejected with
 * MERCHANT_SUGGESTED_GROUP_BUY_AUTHORIZATION_MISSING.
 */
export interface MerchantSuggestedGroupBuyConstraint {
  readonly willingness: "REQUIRED" | "ACCEPTED" | "REFUSED";
  readonly minDiscountBps?: number;
  readonly requiredMerchantProofLevel?: ProofLevel;
}

/**
 * Local-commerce constraint. The buyer declares a max distance for
 * local-pickup and whether local pickup is required. A candidate beyond
 * the distance ceiling is rejected.
 */
export interface LocalCommerceConstraint {
  readonly maxDistanceKm?: number;
  readonly localPickupRequired?: boolean;
}

// ---------------------------------------------------------------------------
// Security-plane constraint types
// ---------------------------------------------------------------------------

/**
 * Account compromise constraint. The buyer declares the maximum anomalous
 * login rate (per hour) they will tolerate before the account is
 * considered compromised. The proof level for attestation verification
 * is also declared.
 */
export interface AccountCompromiseConstraint {
  readonly maxAnomalousLoginRate?: number;
  readonly requiredAttestationProofLevel?: ProofLevel;
}

/**
 * Agent compromise constraint. The buyer declares the maximum behavioral
 * deviation rate (bps) they will tolerate before the agent is considered
 * compromised. This detects agents acting outside their declared
 * capability bounds.
 */
export interface AgentCompromiseConstraint {
  readonly maxBehavioralDeviationBps?: number;
  readonly requiredAgentProofLevel?: ProofLevel;
}

/**
 * Connector compromise constraint. The buyer declares the minimum
 * attestation freshness (in seconds) and proof level for connector
 * attestation verification. A connector with stale or insufficient
 * attestation is rejected.
 */
export interface ConnectorCompromiseConstraint {
  readonly minAttestationFreshnessSeconds?: number;
  readonly requiredConnectorProofLevel?: ProofLevel;
}

/**
 * Collusion constraint. The buyer declares the minimum number of
 * independent sellers required for a marketplace to be considered
 * non-collusive. A marketplace with fewer independent sellers than the
 * floor is flagged for potential collusion.
 */
export interface CollusionConstraint {
  readonly minIndependentSellers?: number;
  readonly requiredCollusionProofLevel?: ProofLevel;
}

/**
 * Sybil constraint. The buyer declares the minimum number of unique
 * identity proofs required for a participant set to be considered
 * non-Sybil. A set with fewer unique identities than the floor is
 * flagged.
 */
export interface SybilConstraint {
  readonly minUniqueIdentities?: number;
  readonly requiredIdentityProofLevel?: ProofLevel;
}

/**
 * Anomalous agent constraint. The buyer declares behavioral bounds:
 * max action rate (actions per minute) and max deviation from declared
 * capability profile (in bps). An agent exceeding these bounds is
 * flagged as anomalous.
 */
export interface AnomalousAgentConstraint {
  readonly maxActionRatePerMinute?: number;
  readonly maxCapabilityDeviationBps?: number;
  readonly requiredAnomalyProofLevel?: ProofLevel;
}

// ---------------------------------------------------------------------------
// Candidate shapes (what the candidate carries for W2-008 checks)
// ---------------------------------------------------------------------------

export interface W2_008RentalCandidate {
  readonly periods?: number;
  readonly deposit?: Money;
  readonly proofLevel?: ProofLevel;
}

export interface W2_008ResaleCandidate {
  readonly appraisedValue?: Money;
  readonly depreciationBps?: number;
  readonly proofLevel?: ProofLevel;
}

export interface W2_008MultiHopCandidate {
  readonly hopCount?: number;
  readonly participantCount?: number;
  readonly participantProofLevel?: ProofLevel;
}

export interface W2_008GroupBuyCandidate {
  readonly merchantAuthorized?: boolean;
  readonly discountBps?: number;
  readonly merchantProofLevel?: ProofLevel;
}

export interface W2_008LocalCommerceCandidate {
  readonly distanceKm?: number;
  readonly localPickupAvailable?: boolean;
}

export interface W2_008SecurityCandidate {
  readonly anomalousLoginRate?: number;
  readonly attestationProofLevel?: ProofLevel;
  readonly attestationFreshnessSeconds?: number;
  readonly behavioralDeviationBps?: number;
  readonly agentProofLevel?: ProofLevel;
  readonly independentSellerCount?: number;
  readonly uniqueIdentityCount?: number;
  readonly actionRatePerMinute?: number;
  readonly capabilityDeviationBps?: number;
}

// ---------------------------------------------------------------------------
// Violation types
// ---------------------------------------------------------------------------

export type W2_008ConstraintViolation =
  // Commerce-plane violations
  | "RENTAL_PERIOD_EXCEEDS_MAX"
  | "RENTAL_DEPOSIT_EXCEEDS_MAX"
  | "RENTAL_PROOF_BELOW_REQUIRED"
  | "RESALE_VALUE_BELOW_MIN"
  | "RESALE_DEPRECIATION_EXCEEDS_MAX"
  | "RESALE_PROOF_BELOW_REQUIRED"
  | "TRADE_HOP_COUNT_EXCEEDS_MAX"
  | "TRADE_PARTICIPANTS_BELOW_MIN"
  | "TRADE_PARTICIPANT_PROOF_BELOW_REQUIRED"
  | "MERCHANT_SUGGESTED_GROUP_BUY_AUTHORIZATION_MISSING"
  | "GROUP_BUY_DISCOUNT_BELOW_MIN"
  | "GROUP_BUY_MERCHANT_PROOF_BELOW_REQUIRED"
  | "LOCAL_COMMERCE_DISTANCE_EXCEEDS_MAX"
  | "LOCAL_PICKUP_NOT_AVAILABLE"
  // Security-plane violations
  | "ACCOUNT_ANOMALOUS_LOGIN_RATE_EXCEEDS_MAX"
  | "ACCOUNT_ATTESTATION_PROOF_BELOW_REQUIRED"
  | "AGENT_BEHAVIORAL_DEVIATION_EXCEEDS_MAX"
  | "AGENT_PROOF_BELOW_REQUIRED"
  | "CONNECTOR_ATTESTATION_STALE"
  | "CONNECTOR_PROOF_BELOW_REQUIRED"
  | "COLLUSION_INDEPENDENT_SELLERS_BELOW_MIN"
  | "SYBIL_UNIQUE_IDENTITIES_BELOW_MIN"
  | "ANOMALOUS_AGENT_ACTION_RATE_EXCEEDS_MAX"
  | "ANOMALOUS_AGENT_CAPABILITY_DEVIATION_EXCEEDS_MAX"
  | "MISSING_REQUIRED_DATA";

// ---------------------------------------------------------------------------
// Constraint + candidate aggregate shapes
