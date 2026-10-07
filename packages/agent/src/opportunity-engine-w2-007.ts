/**
 * W2-007 opportunity-engine extensions: the new observation-signal kinds
 * (warranty claim window, unused subscription, local pickup, shared
 * logistics batch) + the candidate-context fields they populate + the
 * candidate-generation logic that converts each signal into a seed-shape
 * object + the scoring additions for the new opportunity kinds.
 *
 * Truth distinctions (work order):
 * - Each signal is a factual observation (OBSERVATION) the engine matches
 *   against the buyer's declared desired set. The candidate seed it produces
 *   carries ESTIMATE epistemics (INFERENCE or PREDICTION) — never asserted
 *   commerce truth (invariant 30: opportunity recommendations distinguish
 *   observation, inference, prediction and recommendation).
 * - Opportunities are proposals awaiting explicit participant/merchant
 *   authorization (rule 12); commitment becomes commerce truth only through
 *   the authorization gate.
 * - UNKNOWN intent fields stay UNKNOWN — no inference-based promotion to
 *   KNOWN (rule 8).
 *
 * This module is dependency-clean: it imports only from opportunity.ts
 * (OpportunityKind) and common.ts (Money) — it NEVER imports from
 * opportunity-engine.ts (which would form a cycle, since opportunity-engine.ts
 * imports this module). The returned W2_007SeedShape is wrapped by
 * opportunity-engine.ts into an OpportunityCandidateSeed.
 */

import type { Money } from "./common.js";
import type { OpportunityKind } from "./opportunity.js";

// ---------------------------------------------------------------------------
// W2-007 observation signals
// ---------------------------------------------------------------------------

export type W2_007ObservationSignal =
  | {
      readonly kind: "WARRANTY_CLAIM_WINDOW";
      readonly signalId: string;
      readonly subjectRef: string;
      readonly warrantyRef: string;
      readonly recoursePath: "REFUND" | "REPAIR" | "REPLACE" | "EXTENDED_CLAIM";
      readonly claimWindow: { readonly opensAt: string; readonly closesAt: string };
      readonly estimatedRecoveryValue?: Money;
      readonly observedAt: string;
    }
  | {
      readonly kind: "UNUSED_SUBSCRIPTION";
      readonly signalId: string;
      readonly subjectRef: string;
      readonly subscriptionRef: string;
      readonly remainingPeriods: number;
      readonly estimatedRecoveryValue?: Money;
      readonly observedAt: string;
    }
  | {
      readonly kind: "LOCAL_PICKUP_AVAILABILITY";
      readonly signalId: string;
      readonly subjectRef: string;
      readonly pickupLocationRef: string;
      readonly pickupWindow: { readonly notBefore: string; readonly notAfter: string };
      readonly estimatedSavings?: Money;
      readonly observedAt: string;
    }
  | {
      readonly kind: "SHARED_LOGISTICS_BATCH";
      readonly signalId: string;
      readonly subjectRef: string;
      readonly sharedShipmentRef: string;
      readonly participantCount: number;
      readonly estimatedPerBuyerCost?: Money;
      readonly proximityWindow: { readonly notBefore: string; readonly notAfter: string };
      readonly observedAt: string;
    };

/** W2-007 candidate-context fields (additive to OpportunityCandidateContext). */
export interface W2_007CandidateContext {
  readonly warrantyRef?: string;
  readonly recoursePath?: "REFUND" | "REPAIR" | "REPLACE" | "EXTENDED_CLAIM";
  readonly claimWindow?: { readonly opensAt: string; readonly closesAt: string };
  readonly subscriptionRef?: string;
  readonly remainingPeriods?: number;
  readonly proposedAction?: "LIQUIDATE" | "REALLOCATE" | "CANCEL";
  readonly pickupLocationRef?: string;
  readonly pickupWindow?: { readonly notBefore: string; readonly notAfter: string };
  readonly sharedShipmentRef?: string;
  readonly participantCount?: number;
  readonly estimatedPerBuyerCost?: Money;
  readonly proximityWindow?: { readonly notBefore: string; readonly notAfter: string };
}

/**
 * The seed-shape a W2-007 signal produces. This is the SHAPE of an
 * OpportunityCandidateSeed (opportunity-engine.ts wraps it into the typed
 * seed). Defined locally to avoid a circular import: opportunity-engine.ts
 * imports this module, so this module cannot import OpportunityCandidateSeed
 * back.
 */
export interface W2_007SeedShape {
  readonly seedId: string;
  readonly opportunityKind: OpportunityKind;
  readonly epistemics:
    | { readonly kind: "INFERENCE"; readonly basis: string }
    | { readonly kind: "PREDICTION"; readonly basis: string; readonly confidenceBps: number };
  readonly subjectRef?: string;
  readonly matchedSignalIds: readonly string[];
  readonly context?: W2_007CandidateContext & { readonly estimatedValue?: Money };
}

/**
 * Convert one W2-007 observation signal into a seed-shape. Returns undefined
 * when the signal kind is not a W2-007 kind. The seed-shape carries ESTIMATE
 * epistemics — INFERENCE for factual observations matched to the buyer's
 * desired set; the engine never asserts commerce truth.
 */
export function seedFromW2_007Signal(
  signal: W2_007ObservationSignal,
  intentId: string,
): W2_007SeedShape | undefined {
  if (signal.kind === "WARRANTY_CLAIM_WINDOW") {
    return {
      seedId: `seed:${intentId}:${signal.signalId}:WARRANTY_RECOVERY`,
      opportunityKind: "WARRANTY_RECOVERY",
      epistemics: {
        kind: "INFERENCE",
        basis: "warranty claim-window observation matched to a stated desired reference",
      },
      subjectRef: signal.subjectRef,
      matchedSignalIds: [signal.signalId],
      context: {
        warrantyRef: signal.warrantyRef,
        recoursePath: signal.recoursePath,
        claimWindow: signal.claimWindow,
        estimatedValue: signal.estimatedRecoveryValue,
      },
    };
  }
  if (signal.kind === "UNUSED_SUBSCRIPTION") {
    // The proposed action defaults to LIQUIDATE if the buyer has not
    // declared a preference; the buyer's explicit authorization is
    // required at presentation (rule 12) before any action is taken.
    return {
      seedId: `seed:${intentId}:${signal.signalId}:SUBSCRIPTION_OPTIMIZATION`,
      opportunityKind: "SUBSCRIPTION_OPTIMIZATION",
      epistemics: {
        kind: "INFERENCE",
        basis: "unused-subscription observation matched to a stated desired reference",
      },
      subjectRef: signal.subjectRef,
      matchedSignalIds: [signal.signalId],
      context: {
        subscriptionRef: signal.subscriptionRef,
        remainingPeriods: signal.remainingPeriods,
        estimatedValue: signal.estimatedRecoveryValue,
        proposedAction: "LIQUIDATE",
      },
    };
  }
  if (signal.kind === "LOCAL_PICKUP_AVAILABILITY") {
    return {
      seedId: `seed:${intentId}:${signal.signalId}:LOCAL_PICKUP_ARBITRAGE`,
      opportunityKind: "LOCAL_PICKUP_ARBITRAGE",
      epistemics: {
        kind: "INFERENCE",
        basis: "local-pickup availability observation matched to a stated desired reference",
      },
      subjectRef: signal.subjectRef,
      matchedSignalIds: [signal.signalId],
      context: {
        pickupLocationRef: signal.pickupLocationRef,
        pickupWindow: signal.pickupWindow,
        estimatedValue: signal.estimatedSavings,
      },
    };
  }
  if (signal.kind === "SHARED_LOGISTICS_BATCH") {
    // Shared logistics is a coordination opportunity — like group-buy, it
    // requires explicit participant authorization (rule 12). The seed is
    // an INFERENCE; commitment becomes commerce truth only through the
    // authorization gate.
    return {
      seedId: `seed:${intentId}:${signal.signalId}:SHARED_LOGISTICS`,
      opportunityKind: "SHARED_LOGISTICS",
      epistemics: {
        kind: "INFERENCE",
        basis: "shared-logistics batch observation matched to a stated desired reference",
      },
      subjectRef: signal.subjectRef,
      matchedSignalIds: [signal.signalId],
      context: {
        sharedShipmentRef: signal.sharedShipmentRef,
        participantCount: signal.participantCount,
        estimatedPerBuyerCost: signal.estimatedPerBuyerCost,
        proximityWindow: signal.proximityWindow,
        estimatedValue: signal.estimatedPerBuyerCost,
      },
    };
  }
  return undefined;
}

/**
 * W2-007 scoring additions: estimate points for the new opportunity kinds.
 * Returns 0 when the kind is not a W2-007 kind (the caller adds the
 * Stage-0 base points). Estimate points are integer ranks for ordering only
 * — never an assertion of value (invariant 30: opportunity recommendations
 * distinguish observation, inference, prediction and recommendation).
 */
export function w2_007EstimatePoints(kind: OpportunityKind, context: {
  readonly participantCount?: number;
}): number {
  if (kind === "WARRANTY_RECOVERY") return 35;
  if (kind === "SUBSCRIPTION_OPTIMIZATION") return 28;
  if (kind === "LOCAL_PICKUP_ARBITRAGE") return 18;
  if (kind === "SHARED_LOGISTICS") return 22 + Math.min(context.participantCount ?? 0, 5);
  return 0;
}

/** Type guard: true when the kind is a W2-007 opportunity kind. */
export function isW2_007OpportunityKind(kind: OpportunityKind): boolean {
  return (
    kind === "WARRANTY_RECOVERY" ||
    kind === "SUBSCRIPTION_OPTIMIZATION" ||
    kind === "LOCAL_PICKUP_ARBITRAGE" ||
    kind === "SHARED_LOGISTICS"
  );
}
