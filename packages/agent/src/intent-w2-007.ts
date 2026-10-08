/**
 * W2-007 buyer-intent vocabulary extensions: typed capability contracts for
 * the audit-verified incomplete buyer-agent rows — financing, buy-now-vs-wait,
 * price timing, negotiation.
 *
 * Truth distinctions (work order):
 * - Buyer intents are agent-plane parameters — they never directly mutate
 *   commerce truth (rule 1; FROZEN-ARCHITECTURE §12).
 * - UNKNOWN (absent constraint) is preserved — never coerced to FAILED
 *   (rule 8). Out-of-bound attempts are rejected deterministically before
 *   they reach commerce truth.
 * - Negotiation + financing journeys produce TransactionProof at the right
 *   P-levels (rule 14; rule 23).
 *
 * These types are re-exported through `intent.ts` so existing consumers see
 * a single contract surface. The check logic is invoked by `checkHardConstraints`
 * via `checkW2_007Constraints` — a pure function over (intent, candidate)
 * that returns the W2-007-specific violations (empty when no W2-007
 * constraint is declared).
 */

import type { Money } from "./common.js";
import type { ProofLevel } from "./proof.js";

/**
 * W2-007: financing as a buyer-declared hard constraint. The recurring
 * installment the buyer can sustain AND the financing modes acceptable.
 * Out-of-bound candidates (installment above ceiling, or a mode not
 * declared) are rejected by checkHardConstraints — the constraint is a
 * deterministic gate, never a soft preference (rule 1; FROZEN-ARCHITECTURE
 * §5: hard constraints are checked before soft optimization).
 */
export interface FinancingConstraint {
  /** Maximum recurring installment the buyer can sustain, per period. */
  readonly maxInstallmentPerPeriod?: Money;
  readonly installmentPeriod?: "WEEK" | "MONTH";
  /** Maximum number of periods the buyer will commit to. */
  readonly maxPeriods?: number;
  /**
   * Modes the buyer will ACCEPT. The candidate's offered financing mode
   * must intersect this set; otherwise the candidate is rejected with
   * FINANCING_MODE_NOT_ACCEPTED. Empty/undefined → UNKNOWN.
   */
  readonly acceptedModes?: readonly FinancingMode[];
  /** Minimum proof level required for the financing instrument. */
  readonly requiredFinancingProofLevel?: ProofLevel;
}

export type FinancingMode = "INSTALLMENT" | "BNPL" | "STORE_CREDIT" | "DEFERRED_PAYMENT";

/**
 * W2-007: explicit price-timing window. The buyer declares the target price
 * (the price at which they will buy) and the deadline by which that target
 * must be achievable. Candidates priced above the target are NOT rejected
 * — they are presented to the buyer with the timing trade-off explicit;
 * the buyer then chooses buy-now-vs-wait with full predicted-vs-actual
 * evidence (W2-005 Lab law). A candidate priced AT or BELOW target by
 * the deadline satisfies the constraint.
 */
export interface PriceTimingConstraint {
  /** The price at which the buyer commits to buy. */
  readonly targetPrice?: Money;
  /** The latest moment the target must be achievable. */
  readonly targetDeadline?: string;
  /**
   * Optional floor — if a candidate's price drops below this, the buyer
   * commits immediately (no further waiting). The buyer declares the
   * walk-away-from-waiting threshold.
   */
  readonly buyNowFloor?: Money;
}

/**
 * W2-007: negotiation bounds as buyer-declared hard constraints. The buyer
 * declares the bounds within which they will negotiate. Out-of-bounds
 * offers trigger deterministic walk-away (rule 15: deterministic BLOCK
 * where the policy says BLOCK). The protocol is bounded by max rounds —
 * a bad-faith adversary who tries to extend negotiation past max rounds
 * is detected and blocked (immune-system adversary, adversarial-cases-buyer.ts).
 */
export interface NegotiationBounds {
  /** The best (lowest) price the buyer hopes to achieve. */
  readonly bestCasePrice: Money;
  /** The worst (highest) price the buyer will accept. */
  readonly walkAwayPrice: Money;
  /** Maximum number of offer/counter-offer rounds before walk-away. */
  readonly maxRounds: number;
  /**
   * Required proof level for the negotiated outcome — the negotiation
   * produces a TransactionProof at this level once agreement is reached
   * (rule 14: Trust ≠ Proof; rule 23: proof level selected before
   * consequential execution).
   */
  readonly requiredProofLevel?: ProofLevel;
}

/**
 * W2-007: the financing offer a candidate carries. When the buyer has
 * declared a FinancingConstraint, the candidate's offer is checked against
 * the buyer's ceiling + accepted modes. A candidate whose offer exceeds
 * the buyer's installment ceiling, or whose mode is not in the buyer's
 * accepted set, is rejected with FINANCING_OUT_OF_BOUND.
 */
export interface CandidateFinancingOffer {
  readonly mode: FinancingMode;
  readonly installmentPerPeriod: Money;
  readonly period: "WEEK" | "MONTH";
  readonly periods: number;
  /** Proof level of the financing instrument (e.g. P2 for provider-signed). */
  readonly proofLevel?: ProofLevel;
}

/** W2-007 hard-constraint violations (additive — see intent.ts HardConstraintViolation). */
export type W2_007ConstraintViolation =
  | "FINANCING_OUT_OF_BOUND"
  | "FINANCING_MODE_NOT_ACCEPTED"
  | "FINANCING_PROOF_BELOW_REQUIRED"
  | "BUY_NOW_REQUIRED_VIOLATED"
  | "WAIT_REQUIRED_VIOLATED"
  | "TARGET_DEADLINE_MISSED"
  | "NEGOTIATION_OUT_OF_BOUND"
  | "NEGOTIATION_ROUNDS_EXHAUSTED"
  | "NEGOTIATION_PROOF_BELOW_REQUIRED"
  | "MISSING_REQUIRED_DATA";

/**
 * The W2-007 constraint-shape the engine checks against. This is a typed
 * projection of BuyerHardConstraints (the W2-007 fields only) — kept here
 * so the check function lives next to the types it enforces.
 */
export interface W2_007ConstraintShape {
  readonly financing?: FinancingConstraint;
  readonly buyNowVsWait?: "BUY_NOW_REQUIRED" | "WAIT_PREFERRED" | "EITHER";
  readonly priceTiming?: PriceTimingConstraint;
  readonly negotiation?: NegotiationBounds;
}

/**
 * The W2-007 candidate-shape the engine checks against. This is a typed
 * projection of IntentCandidate (the W2-007 fields only).
 */
export interface W2_007CandidateShape {
  readonly financingOffer?: CandidateFinancingOffer;
  readonly meetsTargetPrice?: boolean;
  readonly withinTargetDeadline?: boolean;
  readonly negotiationOpeningOffer?: Money;
  readonly negotiationRoundsElapsed?: number;
  readonly proofLevel?: ProofLevel;
  readonly estimatedDeliveryAt?: string;
  readonly recourseAvailable?: boolean;
}

const PROOF_RANK_W2_007: Readonly<Record<ProofLevel, number>> = {
  P0: 0, P1: 1, P2: 2, P3: 3, P4: 4, P5: 5,
};

/**
 * Deterministic check of the W2-007 hard constraints. Returns the typed
 * violations (empty when no W2-007 constraint is declared, or when the
 * candidate satisfies every declared W2-007 constraint). Every check fails
 * closed (MISSING_REQUIRED_DATA) when the candidate lacks the data a
 * declared hard constraint requires. UNKNOWN (absent constraint) never
 * reaches these branches — the engine never asserts a target the buyer
 * did not declare (rule 8).
 */
export function checkW2_007Constraints(
  constraints: W2_007ConstraintShape,
  candidate: W2_007CandidateShape,
): readonly W2_007ConstraintViolation[] {
  const violations: W2_007ConstraintViolation[] = [];

  if (constraints.financing !== undefined) {
    const fin = constraints.financing;
    const offer = candidate.financingOffer;
    if (offer === undefined) {
      violations.push("MISSING_REQUIRED_DATA");
    } else {
      if (
        fin.maxInstallmentPerPeriod !== undefined &&
        offer.installmentPerPeriod.currency !== fin.maxInstallmentPerPeriod.currency
      ) {
        violations.push("FINANCING_OUT_OF_BOUND");
      } else if (
        fin.maxInstallmentPerPeriod !== undefined &&
        BigInt(offer.installmentPerPeriod.minorUnits) > BigInt(fin.maxInstallmentPerPeriod.minorUnits)
      ) {
        violations.push("FINANCING_OUT_OF_BOUND");
      }
      if (fin.maxPeriods !== undefined && offer.periods > fin.maxPeriods) {
        violations.push("FINANCING_OUT_OF_BOUND");
      }
      if (
        fin.acceptedModes !== undefined &&
        fin.acceptedModes.length > 0 &&
        !fin.acceptedModes.includes(offer.mode)
      ) {
        violations.push("FINANCING_MODE_NOT_ACCEPTED");
      }
      if (
        fin.requiredFinancingProofLevel !== undefined &&
        offer.proofLevel !== undefined &&
        PROOF_RANK_W2_007[offer.proofLevel] < PROOF_RANK_W2_007[fin.requiredFinancingProofLevel]
      ) {
        violations.push("FINANCING_PROOF_BELOW_REQUIRED");
      } else if (
        fin.requiredFinancingProofLevel !== undefined &&
        offer.proofLevel === undefined
      ) {
        violations.push("MISSING_REQUIRED_DATA");
      }
    }
  }

  if (constraints.buyNowVsWait !== undefined) {
    if (constraints.buyNowVsWait === "BUY_NOW_REQUIRED") {
      if (candidate.estimatedDeliveryAt === undefined) {
        violations.push("BUY_NOW_REQUIRED_VIOLATED");
      }
      if (candidate.withinTargetDeadline === false) {
        violations.push("BUY_NOW_REQUIRED_VIOLATED");
      }
    } else if (constraints.buyNowVsWait === "WAIT_PREFERRED") {
      if (
        candidate.meetsTargetPrice === true &&
        candidate.withinTargetDeadline === true &&
        candidate.financingOffer === undefined &&
        candidate.recourseAvailable !== true
      ) {
        violations.push("WAIT_REQUIRED_VIOLATED");
      }
    }
  }

  if (constraints.priceTiming !== undefined) {
    const timing = constraints.priceTiming;
    if (timing.targetDeadline !== undefined) {
      if (candidate.withinTargetDeadline === false) {
        violations.push("TARGET_DEADLINE_MISSED");
      } else if (candidate.withinTargetDeadline === undefined && candidate.estimatedDeliveryAt === undefined) {
        violations.push("MISSING_REQUIRED_DATA");
      }
    }
  }

  if (constraints.negotiation !== undefined) {
    const neg = constraints.negotiation;
    const opening = candidate.negotiationOpeningOffer;
    const rounds = candidate.negotiationRoundsElapsed ?? 0;
    if (rounds > neg.maxRounds) {
      violations.push("NEGOTIATION_ROUNDS_EXHAUSTED");
    }
    if (opening !== undefined) {
      if (opening.currency !== neg.walkAwayPrice.currency) {
        violations.push("NEGOTIATION_OUT_OF_BOUND");
      } else if (BigInt(opening.minorUnits) > BigInt(neg.walkAwayPrice.minorUnits)) {
        violations.push("NEGOTIATION_OUT_OF_BOUND");
      }
    }
    if (
      neg.requiredProofLevel !== undefined &&
      candidate.proofLevel !== undefined &&
      PROOF_RANK_W2_007[candidate.proofLevel] < PROOF_RANK_W2_007[neg.requiredProofLevel]
    ) {
      violations.push("NEGOTIATION_PROOF_BELOW_REQUIRED");
    }
  }

  return [...new Set(violations)];
}
