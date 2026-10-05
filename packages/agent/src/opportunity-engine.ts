/**
 * Opportunity Engine contracts over Buyer CommerceIntent
 * (FROZEN-ARCHITECTURE §3.F, §8; invariant 30; W2-003).
 *
 * Truth distinctions (work order):
 * - Opportunity scores and match candidates are ESTIMATES, never commerce
 *   truth. Formation outcomes become authoritative only after commitment
 *   lands on the commerce plane.
 * - UNKNOWN intent fields stay UNKNOWN: no inference-based promotion to
 *   KNOWN. The engine drops any candidate that would assert known context
 *   for a field that was UNKNOWN in its inputs.
 *
 * Determinism: candidate generation, scoring and lifecycle transitions are
 * pure functions of their inputs — identical inputs produce identical
 * results (replay-stable; scenario 7). No hidden clocks: every "at" is an
 * explicit parameter.
 */

import type { BuyerCommerceIntent } from "./intent.js";
import type { GroupBuyTerms } from "./groupbuy.js";
import type { Money } from "./common.js";
import type { OpportunityKind } from "./opportunity.js";

// ---------------------------------------------------------------------------
// Observed signals the engine matches against intents (opaque subjects)
// ---------------------------------------------------------------------------

export type OpportunityObservationSignal =
  | {
      readonly kind: "OPEN_GROUP_BUY";
      readonly signalId: string;
      readonly subjectRef: string;
      readonly groupBuyId: string;
      readonly terms: GroupBuyTerms;
      readonly observedAt: string;
    }
  | {
      readonly kind: "DEMAND_CLUSTER";
      readonly signalId: string;
      readonly subjectRef: string;
      readonly clusterId: string;
      readonly estimatedParticipants: number;
      readonly observedAt: string;
    }
  | {
      readonly kind: "PRICE_OBSERVATION";
      readonly signalId: string;
      readonly subjectRef: string;
      readonly currentPrice: Money;
      readonly observedAt: string;
    }
  | {
      readonly kind: "RESALE_MARKET";
      readonly signalId: string;
      readonly subjectRef: string;
      readonly estimatedResaleValue: Money;
      readonly observedAt: string;
    };

// ---------------------------------------------------------------------------
// Candidate seeds: ESTIMATE-framed, lineage-bearing
// ---------------------------------------------------------------------------

/** Typed context a seed may carry. Absent fields stay absent — never fabricated. */
export interface OpportunityCandidateContext {
  readonly groupBuyTerms?: GroupBuyTerms;
  readonly estimatedParticipants?: number;
  readonly estimatedValue?: Money;
}

export interface OpportunityCandidateSeed {
  readonly seedId: string;
  readonly intentId: string;
  readonly opportunityKind: OpportunityKind;
  /** Always an estimate-bearing kind — never an asserted fact. */
  readonly epistemics:
    | { readonly kind: "INFERENCE"; readonly basis: string }
    | { readonly kind: "PREDICTION"; readonly basis: string; readonly confidenceBps: number };
  readonly subjectRef?: string;
  readonly matchedSignalIds: readonly string[];
  readonly context?: OpportunityCandidateContext;
}

export interface DroppedPromotion {
  readonly seedId: string;
  /** Intent fields that would have been promoted UNKNOWN → KNOWN. */
  readonly promotedFields: readonly string[];
}

export interface OpportunityCandidateGeneration {
  readonly candidates: readonly OpportunityCandidateSeed[];
  readonly dropped: readonly DroppedPromotion[];
}

// ---------------------------------------------------------------------------
// UNKNOWN preservation (no inference-based promotion to known)
// ---------------------------------------------------------------------------

export type IntentFieldKnowledge = "KNOWN" | "UNKNOWN";

export interface UnknownPreservationCheck {
  readonly preserved: boolean;
  readonly promotedFields: readonly string[];
}

/**
 * Deterministic UNKNOWN-preservation check: a derived record may assert a
 * field as KNOWN only when the source intent field was KNOWN. Fields the
 * derived record leaves absent are always fine (absent ≠ promoted).
 */
export function checkUnknownPreservation(input: {
  readonly source: Readonly<Record<string, IntentFieldKnowledge>>;
  readonly asserted: Readonly<Record<string, IntentFieldKnowledge>>;
}): UnknownPreservationCheck {
  const promotedFields: string[] = [];
  for (const [field, assertedKnowledge] of Object.entries(input.asserted)) {
    if (assertedKnowledge !== "KNOWN") continue;
    const sourceKnowledge = input.source[field];
    if (sourceKnowledge !== "KNOWN") promotedFields.push(field);
  }
  return { preserved: promotedFields.length === 0, promotedFields: [...new Set(promotedFields)].sort() };
}

function intentFieldKnowledge(intent: BuyerCommerceIntent): Readonly<Record<string, IntentFieldKnowledge>> {
  const hard = intent.hardConstraints;
  return {
    deadline: hard.deadline === undefined ? "UNKNOWN" : "KNOWN",
    timeWindow: hard.timeWindow === undefined ? "UNKNOWN" : "KNOWN",
    maxTotalCost: hard.maxTotalCost === undefined ? "UNKNOWN" : "KNOWN",
    minQuality: hard.minQuality === undefined ? "UNKNOWN" : "KNOWN",
    minSellerCredibility: hard.minSellerCredibility === undefined ? "UNKNOWN" : "KNOWN",
    privacyRequirements: hard.privacyRequirements === undefined ? "UNKNOWN" : "KNOWN",
    securityRequirements: hard.securityRequirements === undefined ? "UNKNOWN" : "KNOWN",
    deliveryConstraints: hard.deliveryConstraints === undefined ? "UNKNOWN" : "KNOWN",
    requiredProofLevel: hard.requiredProofLevel === undefined ? "UNKNOWN" : "KNOWN",
    groupBuyWillingness: hard.groupBuyWillingness === undefined ? "UNKNOWN" : "KNOWN",
    tradeWillingness: hard.tradeWillingness === undefined ? "UNKNOWN" : "KNOWN",
  };
}

// ---------------------------------------------------------------------------
// Candidate generation
// ---------------------------------------------------------------------------

/**
 * Generate opportunity candidates for one buyer intent from observed
 * signals. Deterministic: signals are processed in ascending signalId order
 * and output candidates are sorted by seedId. Seeds that would promote an
 * UNKNOWN intent field to KNOWN context are dropped (never fabricated).
 */
export function generateOpportunityCandidates(
  intent: BuyerCommerceIntent,
  signals: readonly OpportunityObservationSignal[],
): OpportunityCandidateGeneration {
  const source = intentFieldKnowledge(intent);
  const candidates: OpportunityCandidateSeed[] = [];
  const dropped: DroppedPromotion[] = [];
  const desiredSet = new Set(intent.desired);

  for (const signal of [...signals].sort((a, b) => (a.signalId < b.signalId ? -1 : a.signalId > b.signalId ? 1 : 0))) {
    const relevant = signal.subjectRef !== undefined && desiredSet.has(signal.subjectRef);
    let seed: OpportunityCandidateSeed | undefined;

    if (signal.kind === "OPEN_GROUP_BUY" && relevant) {
      // UNKNOWN willingness is never promoted to KNOWN: only an explicitly
      // stated REQUIRED/ACCEPTED willingness yields a group-buy candidate.
      if (source.groupBuyWillingness !== "KNOWN" || intent.hardConstraints.groupBuyWillingness === "REFUSED") {
        dropped.push({
          seedId: `seed:${intent.intentId}:${signal.signalId}:GROUP_PURCHASE`,
          promotedFields: ["groupBuyWillingness"],
        });
      } else {
        seed = {
          seedId: `seed:${intent.intentId}:${signal.signalId}:GROUP_PURCHASE`,
          intentId: intent.intentId,
          opportunityKind: "GROUP_PURCHASE",
          epistemics: {
            kind: "INFERENCE",
            basis: "open group-buy signal matched to a stated desired reference and stated willingness",
          },
          subjectRef: signal.subjectRef,
          matchedSignalIds: [signal.signalId],
          context: { groupBuyTerms: signal.terms },
        };
      }
    } else if (signal.kind === "DEMAND_CLUSTER" && relevant) {
      if (source.tradeWillingness !== "KNOWN" || intent.hardConstraints.tradeWillingness === "REFUSED") {
        dropped.push({
          seedId: `seed:${intent.intentId}:${signal.signalId}:TRADE`,
          promotedFields: ["tradeWillingness"],
        });
      } else {
        seed = {
          seedId: `seed:${intent.intentId}:${signal.signalId}:TRADE`,
          intentId: intent.intentId,
          opportunityKind: "TRADE",
          epistemics: {
            kind: "INFERENCE",
            basis: "demand cluster matched to a stated desired reference and stated willingness",
          },
          subjectRef: signal.subjectRef,
          matchedSignalIds: [signal.signalId],
          context: { estimatedParticipants: signal.estimatedParticipants },
        };
      }
    } else if (signal.kind === "PRICE_OBSERVATION" && relevant) {
      const waitTolerance = intent.softPreferences?.buyVsWaitTolerance;
      if (waitTolerance === "PREFER_WAIT" || waitTolerance === "WAIT_ONLY") {
        seed = {
          seedId: `seed:${intent.intentId}:${signal.signalId}:PRICE_DROP_TIMING`,
          intentId: intent.intentId,
          opportunityKind: "PRICE_DROP_TIMING",
          epistemics: {
            kind: "PREDICTION",
            basis: "observed price with buyer wait tolerance",
            confidenceBps: 5_000,
          },
          subjectRef: signal.subjectRef,
          matchedSignalIds: [signal.signalId],
          context: { estimatedValue: signal.currentPrice },
        };
      }
    } else if (signal.kind === "RESALE_MARKET" && relevant) {
      seed = {
        seedId: `seed:${intent.intentId}:${signal.signalId}:RESALE`,
        intentId: intent.intentId,
        opportunityKind: "RESALE",
        epistemics: {
          kind: "INFERENCE",
          basis: "resale market observation matched to a stated reference",
        },
        subjectRef: signal.subjectRef,
        matchedSignalIds: [signal.signalId],
        context: { estimatedValue: signal.estimatedResaleValue },
      };
    }

    if (seed === undefined) continue;
    candidates.push(seed);
  }

  candidates.sort((a, b) => (a.seedId < b.seedId ? -1 : a.seedId > b.seedId ? 1 : 0));
  return { candidates, dropped: dropped.sort((a, b) => (a.seedId < b.seedId ? -1 : 1)) };
}

// ---------------------------------------------------------------------------
// Scoring — integer points, always ESTIMATES
// ---------------------------------------------------------------------------

export interface OpportunityScoreEstimate {
  readonly seedId: string;
  /** Integer estimate points. An ESTIMATE — never commerce truth. */
  readonly estimatePoints: number;
  readonly estimate: true;
  readonly epistemicKind: "INFERENCE" | "PREDICTION";
  /** Confidence in basis points (0..10000). */
  readonly confidenceBps: number;
  readonly basisRefs: readonly string[];
}

function discountBps(terms: GroupBuyTerms | undefined): number {
  if (terms === undefined) return 0;
  return terms.discount.kind === "PERCENTAGE" ? Number(terms.discount.value) : 0;
}

/**
 * Deterministic integer scoring of candidate seeds. Points are estimates for
 * ranking only: they never assert price, availability or any commerce fact.
 */
export function scoreOpportunityCandidates(
  seeds: readonly OpportunityCandidateSeed[],
): readonly OpportunityScoreEstimate[] {
  return [...seeds]
    .sort((a, b) => (a.seedId < b.seedId ? -1 : a.seedId > b.seedId ? 1 : 0))
    .map((seed) => {
      let points = 10;
      if (seed.opportunityKind === "GROUP_PURCHASE") {
        points += 40 + Math.min(Math.floor(discountBps(seed.context?.groupBuyTerms) / 100), 30);
      } else if (seed.opportunityKind === "TRADE") {
        points += 30;
      } else if (seed.opportunityKind === "PRICE_DROP_TIMING") {
        points += 20;
      } else if (seed.opportunityKind === "RESALE") {
        points += 25;
      }
      const confidenceBps = seed.epistemics.kind === "PREDICTION" ? seed.epistemics.confidenceBps : 8_000;
      return {
        seedId: seed.seedId,
        estimatePoints: points + Math.floor(confidenceBps / 1_000),
        estimate: true as const,
        epistemicKind: seed.epistemics.kind,
        confidenceBps,
        basisRefs: seed.matchedSignalIds,
      };
    });
}

// ---------------------------------------------------------------------------
// Lifecycle — deterministic transition table
// ---------------------------------------------------------------------------

export type OpportunityLifecycleState =
  | "CANDIDATE"
  | "SCORED"
  | "PRESENTED"
  | "ACCEPTED"
  | "COMMITTED"
  | "REALIZED"
  | "EXPIRED"
  | "RETIRED";

export type OpportunityLifecycleEvent =
  | { readonly type: "SCORE" }
  | { readonly type: "PRESENT" }
  | { readonly type: "ACCEPT" }
  | { readonly type: "COMMIT" }
  | { readonly type: "REALIZE" }
  | { readonly type: "EXPIRE" }
  | { readonly type: "RETIRE" };

export type OpportunityLifecycleViolation =
  | "INVALID_TRANSITION"
  | "COMMIT_WITHOUT_ACCEPTANCE"
  | "REALIZE_WITHOUT_COMMITMENT";

export type OpportunityLifecycleTransition =
  | { readonly ok: true; readonly next: OpportunityLifecycleState }
  | { readonly ok: false; readonly violation: OpportunityLifecycleViolation };

const LIFECYCLE_TABLE: Readonly<Record<OpportunityLifecycleState, readonly OpportunityLifecycleEvent["type"][]>> = {
  CANDIDATE: ["SCORE", "RETIRE", "EXPIRE"],
  SCORED: ["PRESENT", "RETIRE", "EXPIRE"],
  PRESENTED: ["ACCEPT", "RETIRE", "EXPIRE"],
  ACCEPTED: ["COMMIT", "RETIRE", "EXPIRE"],
  COMMITTED: ["REALIZE", "RETIRE", "EXPIRE"],
  REALIZED: [],
  EXPIRED: [],
  RETIRED: [],
};

/** Deterministic lifecycle transition. Terminal states never leave. */
export function transitionOpportunityLifecycle(
  current: OpportunityLifecycleState,
  event: OpportunityLifecycleEvent,
): OpportunityLifecycleTransition {
  if (!LIFECYCLE_TABLE[current].includes(event.type)) {
    const violation: OpportunityLifecycleViolation =
      event.type === "COMMIT" ? "COMMIT_WITHOUT_ACCEPTANCE"
      : event.type === "REALIZE" ? "REALIZE_WITHOUT_COMMITMENT"
      : "INVALID_TRANSITION";
    return { ok: false, violation };
  }
  const next: OpportunityLifecycleState =
    event.type === "SCORE" ? "SCORED"
    : event.type === "PRESENT" ? "PRESENTED"
    : event.type === "ACCEPT" ? "ACCEPTED"
    : event.type === "COMMIT" ? "COMMITTED"
    : event.type === "REALIZE" ? "REALIZED"
    : event.type === "EXPIRE" ? "EXPIRED"
    : "RETIRED";
  return { ok: true, next };
}
