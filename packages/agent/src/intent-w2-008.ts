/**
 * W2-008 buyer-intent vocabulary extensions: residue closure constraints for
 * the buyer-agent, user-opportunities, and trust-and-security planes.
 *
 * Five commerce-plane constraint types:
 *   RentalConstraint, ResaleConstraint, MultiHopTradeConstraint,
 *   MerchantSuggestedGroupBuyConstraint, LocalCommerceConstraint
 *
 * Six security-plane constraint types:
 *   AccountCompromiseConstraint, AgentCompromiseConstraint,
 *   ConnectorCompromiseConstraint, CollusionConstraint,
 *   SybilConstraint, AnomalousAgentConstraint
 *
 * Truth distinctions (work order):
 * - These are buyer-declared hard constraints — they gate BEFORE soft
 *   optimization (rule 1; FROZEN-ARCHITECTURE §5). They never directly
 *   mutate commerce truth (FROZEN-ARCHITECTURE §12).
 * - UNKNOWN (absent constraint) is preserved — never coerced to FAILED
 *   (rule 8). Out-of-bound attempts are rejected deterministically.
 * - Group-buy/trade-cycle require explicit authorization (rule 12).
 * - Multi-hop trade has bounded hop count (rule 13).
 * - Security BLOCK is a deterministic hard constraint (rule 15).
 * - Four trust kinds are distinct: UserTrust / AgentTrust /
 *   CapabilityTrust / TransactionProof (rule 14).
 * - Proof level is selected BEFORE consequential execution (rule 23).
 * - Money is integer minor units — never floating point (rule 21 / invariant 14).
 *
 * The check function is a pure (constraints, candidate) → violations
 * projection. It is re-exported through intent.ts so consumers see one
 * contract surface. checkHardConstraints dispatches to this after
 * v1 + W2-007 checks.
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
// ---------------------------------------------------------------------------

export interface W2_008ConstraintShape {
  readonly rental?: RentalConstraint;
  readonly resale?: ResaleConstraint;
  readonly multiHopTrade?: MultiHopTradeConstraint;
  readonly merchantSuggestedGroupBuy?: MerchantSuggestedGroupBuyConstraint;
  readonly localCommerce?: LocalCommerceConstraint;
  readonly accountCompromise?: AccountCompromiseConstraint;
  readonly agentCompromise?: AgentCompromiseConstraint;
  readonly connectorCompromise?: ConnectorCompromiseConstraint;
  readonly collusion?: CollusionConstraint;
  readonly sybil?: SybilConstraint;
  readonly anomalousAgent?: AnomalousAgentConstraint;
}

export interface W2_008CandidateShape {
  readonly rental?: W2_008RentalCandidate;
  readonly resale?: W2_008ResaleCandidate;
  readonly multiHop?: W2_008MultiHopCandidate;
  readonly groupBuy?: W2_008GroupBuyCandidate;
  readonly localCommerce?: W2_008LocalCommerceCandidate;
  readonly security?: W2_008SecurityCandidate;
}

// ---------------------------------------------------------------------------
// Deterministic check function
// ---------------------------------------------------------------------------

const PROOF_RANK: Readonly<Record<ProofLevel, number>> = {
  P0: 0, P1: 1, P2: 2, P3: 3, P4: 4, P5: 5,
};

/**
 * Deterministic check of the W2-008 hard constraints. Returns the typed
 * violations (empty when no W2-008 constraint is declared, or when the
 * candidate satisfies every declared W2-008 constraint). Every check fails
 * closed (MISSING_REQUIRED_DATA) when the candidate lacks the data a
 * declared hard constraint requires. UNKNOWN (absent constraint) never
 * reaches these branches (rule 8).
 */
export function checkW2_008Constraints(
  constraints: W2_008ConstraintShape,
  candidate: W2_008CandidateShape,
): readonly W2_008ConstraintViolation[] {
  const violations: W2_008ConstraintViolation[] = [];

  // --- Rental ---
  if (constraints.rental !== undefined) {
    const rc = constraints.rental;
    const cc = candidate.rental;
    if (cc === undefined) {
      violations.push("MISSING_REQUIRED_DATA");
    } else {
      if (rc.maxPeriods !== undefined) {
        if (cc.periods === undefined) violations.push("MISSING_REQUIRED_DATA");
        else if (cc.periods > rc.maxPeriods) violations.push("RENTAL_PERIOD_EXCEEDS_MAX");
      }
      if (rc.maxDeposit !== undefined) {
        if (cc.deposit === undefined) violations.push("MISSING_REQUIRED_DATA");
        else if (cc.deposit.currency !== rc.maxDeposit.currency || BigInt(cc.deposit.minorUnits) > BigInt(rc.maxDeposit.minorUnits)) {
          violations.push("RENTAL_DEPOSIT_EXCEEDS_MAX");
        }
      }
      if (rc.requiredRentalProofLevel !== undefined) {
        if (cc.proofLevel === undefined) violations.push("MISSING_REQUIRED_DATA");
        else if (PROOF_RANK[cc.proofLevel] < PROOF_RANK[rc.requiredRentalProofLevel]) {
          violations.push("RENTAL_PROOF_BELOW_REQUIRED");
        }
      }
    }
  }

  // --- Resale ---
  if (constraints.resale !== undefined) {
    const rc = constraints.resale;
    const cc = candidate.resale;
    if (cc === undefined) {
      violations.push("MISSING_REQUIRED_DATA");
    } else {
      if (rc.minResaleValue !== undefined) {
        if (cc.appraisedValue === undefined) violations.push("MISSING_REQUIRED_DATA");
        else if (cc.appraisedValue.currency !== rc.minResaleValue.currency || BigInt(cc.appraisedValue.minorUnits) < BigInt(rc.minResaleValue.minorUnits)) {
          violations.push("RESALE_VALUE_BELOW_MIN");
        }
      }
      if (rc.maxDepreciationBps !== undefined) {
        if (cc.depreciationBps === undefined) violations.push("MISSING_REQUIRED_DATA");
        else if (cc.depreciationBps > rc.maxDepreciationBps) violations.push("RESALE_DEPRECIATION_EXCEEDS_MAX");
      }
      if (rc.requiredResaleProofLevel !== undefined) {
        if (cc.proofLevel === undefined) violations.push("MISSING_REQUIRED_DATA");
        else if (PROOF_RANK[cc.proofLevel] < PROOF_RANK[rc.requiredResaleProofLevel]) {
          violations.push("RESALE_PROOF_BELOW_REQUIRED");
        }
      }
    }
  }

  // --- Multi-hop trade ---
  if (constraints.multiHopTrade !== undefined) {
    const rc = constraints.multiHopTrade;
    const cc = candidate.multiHop;
    if (cc === undefined) {
      violations.push("MISSING_REQUIRED_DATA");
    } else {
      if (rc.maxHopCount !== undefined) {
        if (cc.hopCount === undefined) violations.push("MISSING_REQUIRED_DATA");
        else if (cc.hopCount > rc.maxHopCount) violations.push("TRADE_HOP_COUNT_EXCEEDS_MAX");
      }
      if (rc.minParticipants !== undefined) {
        if (cc.participantCount === undefined) violations.push("MISSING_REQUIRED_DATA");
        else if (cc.participantCount < rc.minParticipants) violations.push("TRADE_PARTICIPANTS_BELOW_MIN");
      }
      if (rc.requiredParticipantProofLevel !== undefined) {
        if (cc.participantProofLevel === undefined) violations.push("MISSING_REQUIRED_DATA");
        else if (PROOF_RANK[cc.participantProofLevel] < PROOF_RANK[rc.requiredParticipantProofLevel]) {
          violations.push("TRADE_PARTICIPANT_PROOF_BELOW_REQUIRED");
        }
      }
    }
  }

  // --- Merchant-suggested group-buy ---
  if (constraints.merchantSuggestedGroupBuy !== undefined) {
    const rc = constraints.merchantSuggestedGroupBuy;
    const cc = candidate.groupBuy;
    if (cc === undefined) {
      violations.push("MISSING_REQUIRED_DATA");
    } else {
      if (rc.willingness === "REFUSED" || !cc.merchantAuthorized) {
        violations.push("MERCHANT_SUGGESTED_GROUP_BUY_AUTHORIZATION_MISSING");
      }
      if (rc.minDiscountBps !== undefined) {
        if (cc.discountBps === undefined) violations.push("MISSING_REQUIRED_DATA");
        else if (cc.discountBps < rc.minDiscountBps) violations.push("GROUP_BUY_DISCOUNT_BELOW_MIN");
      }
      if (rc.requiredMerchantProofLevel !== undefined) {
        if (cc.merchantProofLevel === undefined) violations.push("MISSING_REQUIRED_DATA");
        else if (PROOF_RANK[cc.merchantProofLevel] < PROOF_RANK[rc.requiredMerchantProofLevel]) {
          violations.push("GROUP_BUY_MERCHANT_PROOF_BELOW_REQUIRED");
        }
      }
    }
  }

  // --- Local commerce ---
  if (constraints.localCommerce !== undefined) {
    const rc = constraints.localCommerce;
    const cc = candidate.localCommerce;
    if (cc === undefined) {
      violations.push("MISSING_REQUIRED_DATA");
    } else {
      if (rc.maxDistanceKm !== undefined) {
        if (cc.distanceKm === undefined) violations.push("MISSING_REQUIRED_DATA");
        else if (cc.distanceKm > rc.maxDistanceKm) violations.push("LOCAL_COMMERCE_DISTANCE_EXCEEDS_MAX");
      }
      if (rc.localPickupRequired === true && cc.localPickupAvailable !== true) {
        violations.push("LOCAL_PICKUP_NOT_AVAILABLE");
      }
    }
  }

  // --- Account compromise ---
  if (constraints.accountCompromise !== undefined) {
    const rc = constraints.accountCompromise;
    const cc = candidate.security;
    if (cc === undefined) {
      violations.push("MISSING_REQUIRED_DATA");
    } else {
      if (rc.maxAnomalousLoginRate !== undefined) {
        if (cc.anomalousLoginRate === undefined) violations.push("MISSING_REQUIRED_DATA");
        else if (cc.anomalousLoginRate > rc.maxAnomalousLoginRate) violations.push("ACCOUNT_ANOMALOUS_LOGIN_RATE_EXCEEDS_MAX");
      }
      if (rc.requiredAttestationProofLevel !== undefined) {
        if (cc.attestationProofLevel === undefined) violations.push("MISSING_REQUIRED_DATA");
        else if (PROOF_RANK[cc.attestationProofLevel] < PROOF_RANK[rc.requiredAttestationProofLevel]) {
          violations.push("ACCOUNT_ATTESTATION_PROOF_BELOW_REQUIRED");
        }
      }
    }
  }

  // --- Agent compromise ---
  if (constraints.agentCompromise !== undefined) {
    const rc = constraints.agentCompromise;
    const cc = candidate.security;
    if (cc === undefined) {
      violations.push("MISSING_REQUIRED_DATA");
    } else {
      if (rc.maxBehavioralDeviationBps !== undefined) {
        if (cc.behavioralDeviationBps === undefined) violations.push("MISSING_REQUIRED_DATA");
        else if (cc.behavioralDeviationBps > rc.maxBehavioralDeviationBps) violations.push("AGENT_BEHAVIORAL_DEVIATION_EXCEEDS_MAX");
      }
      if (rc.requiredAgentProofLevel !== undefined) {
        if (cc.agentProofLevel === undefined) violations.push("MISSING_REQUIRED_DATA");
        else if (PROOF_RANK[cc.agentProofLevel] < PROOF_RANK[rc.requiredAgentProofLevel]) {
          violations.push("AGENT_PROOF_BELOW_REQUIRED");
        }
      }
    }
  }

  // --- Connector compromise ---
  if (constraints.connectorCompromise !== undefined) {
    const rc = constraints.connectorCompromise;
    const cc = candidate.security;
    if (cc === undefined) {
      violations.push("MISSING_REQUIRED_DATA");
    } else {
      if (rc.minAttestationFreshnessSeconds !== undefined) {
        if (cc.attestationFreshnessSeconds === undefined) violations.push("MISSING_REQUIRED_DATA");
        else if (cc.attestationFreshnessSeconds < rc.minAttestationFreshnessSeconds) violations.push("CONNECTOR_ATTESTATION_STALE");
      }
      if (rc.requiredConnectorProofLevel !== undefined) {
        if (cc.attestationProofLevel === undefined) violations.push("MISSING_REQUIRED_DATA");
        else if (PROOF_RANK[cc.attestationProofLevel] < PROOF_RANK[rc.requiredConnectorProofLevel]) {
          violations.push("CONNECTOR_PROOF_BELOW_REQUIRED");
        }
      }
    }
  }

  // --- Collusion ---
  if (constraints.collusion !== undefined) {
    const rc = constraints.collusion;
    const cc = candidate.security;
    if (cc === undefined) {
      violations.push("MISSING_REQUIRED_DATA");
    } else {
      if (rc.minIndependentSellers !== undefined) {
        if (cc.independentSellerCount === undefined) violations.push("MISSING_REQUIRED_DATA");
        else if (cc.independentSellerCount < rc.minIndependentSellers) violations.push("COLLUSION_INDEPENDENT_SELLERS_BELOW_MIN");
      }
    }
  }

  // --- Sybil ---
  if (constraints.sybil !== undefined) {
    const rc = constraints.sybil;
    const cc = candidate.security;
    if (cc === undefined) {
      violations.push("MISSING_REQUIRED_DATA");
    } else {
      if (rc.minUniqueIdentities !== undefined) {
        if (cc.uniqueIdentityCount === undefined) violations.push("MISSING_REQUIRED_DATA");
        else if (cc.uniqueIdentityCount < rc.minUniqueIdentities) violations.push("SYBIL_UNIQUE_IDENTITIES_BELOW_MIN");
      }
    }
  }

  // --- Anomalous agent ---
  if (constraints.anomalousAgent !== undefined) {
    const rc = constraints.anomalousAgent;
    const cc = candidate.security;
    if (cc === undefined) {
      violations.push("MISSING_REQUIRED_DATA");
    } else {
      if (rc.maxActionRatePerMinute !== undefined) {
        if (cc.actionRatePerMinute === undefined) violations.push("MISSING_REQUIRED_DATA");
        else if (cc.actionRatePerMinute > rc.maxActionRatePerMinute) violations.push("ANOMALOUS_AGENT_ACTION_RATE_EXCEEDS_MAX");
      }
      if (rc.maxCapabilityDeviationBps !== undefined) {
        if (cc.capabilityDeviationBps === undefined) violations.push("MISSING_REQUIRED_DATA");
        else if (cc.capabilityDeviationBps > rc.maxCapabilityDeviationBps) violations.push("ANOMALOUS_AGENT_CAPABILITY_DEVIATION_EXCEEDS_MAX");
      }
    }
  }

  return [...new Set(violations)];
}
