/**
 * W2-008 opportunity-engine extensions: the new observation-signal kinds
 * for the user-opportunities residue rows — swap availability, group-buy
 * opening, price-drop prediction, discount availability, and proactive
 * suggestion signals — + the candidate-context fields they populate +
 * the candidate-generation logic that converts each signal into a
 * seed-shape object + the scoring additions for the new opportunity kinds.
 *
 * Truth distinctions (work order):
 * - Each signal is a factual observation (OBSERVATION) the engine matches
 *   against the buyer's declared desired set. The candidate seed it produces
 *   carries ESTIMATE epistemics (INFERENCE or PREDICTION) — never asserted
 *   commerce truth (invariant 30).
 * - Opportunities are proposals awaiting explicit participant/merchant
 *   authorization (rule 12); commitment becomes commerce truth only through
 *   the authorization gate.
 * - UNKNOWN intent fields stay UNKNOWN — no inference-based promotion to
 *   KNOWN (rule 8).
 *
 * This module is dependency-clean: it imports only from opportunity.ts,
 * common.ts, and proof.ts — it NEVER imports from opportunity-engine.ts
 * (which would form a cycle).
 */

import type { Money } from "./common.js";
import type { ProofLevel } from "./proof.js";
import type { OpportunityKind } from "./opportunity.js";

// ---------------------------------------------------------------------------
// W2-008 observation signals
// ---------------------------------------------------------------------------

export type W2_008ObservationSignal =
  | {
      readonly kind: "SWAP_AVAILABILITY";
      readonly signalId: string;
      readonly subjectRef: string;
      readonly offeredItemRef: string;
      readonly desiredItemRef: string;
      readonly offeredValue?: Money;
      readonly desiredValue?: Money;
      readonly reciprocityProofLevel?: ProofLevel;
      readonly observedAt: string;
    }
  | {
      readonly kind: "GROUP_BUY_OPENING";
      readonly signalId: string;
      readonly subjectRef: string;
      readonly groupBuyRef: string;
      readonly discountBps: number;
      readonly minParticipants: number;
      readonly currentParticipants: number;
      readonly merchantSuggested?: boolean;
      readonly observedAt: string;
    }
  | {
      readonly kind: "PRICE_DROP_PREDICTION";
      readonly signalId: string;
      readonly subjectRef: string;
      readonly targetPrice?: Money;
      readonly predictedDropAt?: string;
      readonly confidenceBps: number;
      readonly predictionBasis: string;
      readonly observedAt: string;
    }
  | {
      readonly kind: "DISCOUNT_AVAILABLE";
      readonly signalId: string;
      readonly subjectRef: string;
      readonly discountRef: string;
      readonly discountKind: "COUPON" | "LOYALTY_REDEMPTION" | "MERCHANT_OFFER" | "VOLUME_DISCOUNT";
      readonly discountBps?: number;
      readonly fixedAmount?: Money;
      readonly merchantAuthorized?: boolean;
      readonly observedAt: string;
    }
  | {
      readonly kind: "PROACTIVE_SUGGESTION";
      readonly signalId: string;
      readonly subjectRef: string;
      readonly opportunityRef: string;
      readonly proactiveKind: "LOYALTY_OPTIMIZATION" | "FUTURE_DEMAND_SELLING" | "CROSS_CATEGORY_HINT" | "SPEND_TIMING_HINT";
      readonly basis: string;
      readonly estimatedValue?: Money;
      readonly observedAt: string;
    };

// ---------------------------------------------------------------------------
// Candidate context + seed shape
// ---------------------------------------------------------------------------

/** W2-008 candidate-context fields (additive to OpportunityCandidateContext). */
export interface W2_008CandidateContext {
  readonly offeredItemRef?: string;
  readonly desiredItemRef?: string;
  readonly offeredValue?: Money;
  readonly desiredValue?: Money;
  readonly reciprocityProofLevel?: ProofLevel;
  readonly groupBuyRef?: string;
  readonly discountBps?: number;
  readonly minParticipants?: number;
  readonly currentParticipants?: number;
  readonly merchantSuggested?: boolean;
  readonly targetPrice?: Money;
  readonly predictedDropAt?: string;
  readonly confidenceBps?: number;
  readonly predictionBasis?: string;
  readonly discountRef?: string;
  readonly discountKind?: "COUPON" | "LOYALTY_REDEMPTION" | "MERCHANT_OFFER" | "VOLUME_DISCOUNT";
  readonly fixedAmount?: Money;
  readonly merchantAuthorized?: boolean;
  readonly opportunityRef?: string;
  readonly proactiveKind?: "LOYALTY_OPTIMIZATION" | "FUTURE_DEMAND_SELLING" | "CROSS_CATEGORY_HINT" | "SPEND_TIMING_HINT";
  readonly proactiveBasis?: string;
}

/**
 * The seed-shape a W2-008 signal produces. Defined locally to avoid a
 * circular import (opportunity-engine.ts imports this module).
 */
export interface W2_008SeedShape {
  readonly seedId: string;
  readonly opportunityKind: OpportunityKind;
  readonly epistemics:
    | { readonly kind: "INFERENCE"; readonly basis: string }
    | { readonly kind: "PREDICTION"; readonly basis: string; readonly confidenceBps: number };
  readonly subjectRef?: string;
  readonly matchedSignalIds: readonly string[];
  readonly context?: W2_008CandidateContext & { readonly estimatedValue?: Money };
}

// ---------------------------------------------------------------------------
// Seed-from-signal
// ---------------------------------------------------------------------------

/**
 * Convert one W2-008 observation signal into a seed-shape. Returns undefined
 * when the signal kind is not a W2-008 kind. The seed-shape carries ESTIMATE
 * epistemics — INFERENCE for factual observations matched to the buyer's
 * desired set; PREDICTION for price-drop predictions; the engine never
 * asserts commerce truth.
 */
export function seedFromW2_008Signal(
  signal: W2_008ObservationSignal,
  intentId: string,
): W2_008SeedShape | undefined {
  if (signal.kind === "SWAP_AVAILABILITY") {
    return {
      seedId: `seed:${intentId}:${signal.signalId}:TRADE`,
      opportunityKind: "TRADE",
      epistemics: {
        kind: "INFERENCE",
        basis: "swap availability observation matched to a stated desired reference and trade willingness",
      },
      subjectRef: signal.subjectRef,
      matchedSignalIds: [signal.signalId],
      context: {
        offeredItemRef: signal.offeredItemRef,
        desiredItemRef: signal.desiredItemRef,
        offeredValue: signal.offeredValue,
        desiredValue: signal.desiredValue,
        reciprocityProofLevel: signal.reciprocityProofLevel,
        estimatedValue: signal.desiredValue,
      },
    };
  }
  if (signal.kind === "GROUP_BUY_OPENING") {
    return {
      seedId: `seed:${intentId}:${signal.signalId}:GROUP_PURCHASE`,
      opportunityKind: "GROUP_PURCHASE",
      epistemics: {
        kind: "INFERENCE",
        basis: "group-buy opening observation matched to a stated desired reference and group-buy willingness",
      },
      subjectRef: signal.subjectRef,
      matchedSignalIds: [signal.signalId],
      context: {
        groupBuyRef: signal.groupBuyRef,
        discountBps: signal.discountBps,
        minParticipants: signal.minParticipants,
        currentParticipants: signal.currentParticipants,
        merchantSuggested: signal.merchantSuggested,
        estimatedValue: undefined,
      },
    };
  }
  if (signal.kind === "PRICE_DROP_PREDICTION") {
    return {
      seedId: `seed:${intentId}:${signal.signalId}:PRICE_DROP_TIMING`,
      opportunityKind: "PRICE_DROP_TIMING",
      epistemics: {
        kind: "PREDICTION",
        basis: signal.predictionBasis,
        confidenceBps: signal.confidenceBps,
      },
      subjectRef: signal.subjectRef,
      matchedSignalIds: [signal.signalId],
      context: {
        targetPrice: signal.targetPrice,
        predictedDropAt: signal.predictedDropAt,
        confidenceBps: signal.confidenceBps,
        predictionBasis: signal.predictionBasis,
        estimatedValue: signal.targetPrice,
      },
    };
  }
  if (signal.kind === "DISCOUNT_AVAILABLE") {
    return {
      seedId: `seed:${intentId}:${signal.signalId}:LOYALTY_REWARDS`,
      opportunityKind: "LOYALTY_REWARDS",
      epistemics: {
        kind: "INFERENCE",
        basis: "discount availability observation matched to a stated desired reference",
      },
      subjectRef: signal.subjectRef,
      matchedSignalIds: [signal.signalId],
      context: {
        discountRef: signal.discountRef,
        discountKind: signal.discountKind,
        discountBps: signal.discountBps,
        fixedAmount: signal.fixedAmount,
        merchantAuthorized: signal.merchantAuthorized,
        estimatedValue: signal.fixedAmount,
      },
    };
  }
  if (signal.kind === "PROACTIVE_SUGGESTION") {
    return {
      seedId: `seed:${intentId}:${signal.signalId}:FUTURE_DEMAND_SELLING`,
      opportunityKind: "FUTURE_DEMAND_SELLING",
      epistemics: {
        kind: "PREDICTION",
        basis: signal.basis,
        confidenceBps: 4_000,
      },
      subjectRef: signal.subjectRef,
      matchedSignalIds: [signal.signalId],
      context: {
        opportunityRef: signal.opportunityRef,
        proactiveKind: signal.proactiveKind,
        proactiveBasis: signal.basis,
        estimatedValue: signal.estimatedValue,
      },
    };
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * W2-008 scoring additions: estimate points for the new opportunity kinds.
 * Returns 0 when the kind is not a W2-008 kind (the caller adds the
 * Stage-0 base points).
 */
export function w2_008EstimatePoints(kind: OpportunityKind, context: {
  readonly discountBps?: number;
  readonly currentParticipants?: number;
  readonly confidenceBps?: number;
}): number {
  if (kind === "TRADE") return 30;
  if (kind === "GROUP_PURCHASE") return 40 + Math.min(Math.floor((context.discountBps ?? 0) / 100), 30);
  if (kind === "PRICE_DROP_TIMING") return 20 + Math.floor((context.confidenceBps ?? 0) / 2_000);
  if (kind === "LOYALTY_REWARDS") return 15 + Math.min(Math.floor((context.discountBps ?? 0) / 200), 15);
  if (kind === "FUTURE_DEMAND_SELLING") return 12;
  return 0;
}

/** Type guard: true when the kind is a W2-008 opportunity kind. */
export function isW2_008OpportunityKind(kind: OpportunityKind): boolean {
  return (
    kind === "TRADE" ||
    kind === "GROUP_PURCHASE" ||
    kind === "PRICE_DROP_TIMING" ||
    kind === "LOYALTY_REWARDS" ||
    kind === "FUTURE_DEMAND_SELLING"
  );
}
