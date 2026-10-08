/**
 * W1-007 inventory forecasting: deterministic demand-signal projection + advisory
 * reorder-point proposals.
 *
 * Forecasting output is TYPED ADVISORY STATE — opportunity proposals, never
 * automatic inventory mutation (W1-007 §scope 4, Advisory law). The canonical
 * inventory truth lives in the inventory domain; forecasts are a separate,
 * clearly-typed projection. UNKNOWN is preserved when history is insufficient
 * (INVARIANT 8/10: UNKNOWN ≠ FAILED — insufficient data is UNKNOWN, not an error).
 *
 * Laws:
 * - Demand signals are journaled OBSERVATIONS derived from order history;
 * - Reorder proposals are journaled ADVISORY facts (opportunities) — never auto-mutation;
 * - The autonomous store's AUTONOMOUS_RESTOCK is the ONLY path that mutates
 *   inventory from a forecast, and it is separately authority-gated (W1-005);
 * - Deterministic methods only (no randomness, no clock — pure functions of
 *   the journal).
 */
import type {
  DemandSignalId,
  LocationId,
  ReorderProposalId,
  SkuId,
} from "./ids.js";
import { nextRevision } from "./events.js";
import { err, ok, type Result } from "./result.js";

/**
 * Tri-state forecast resolution (mirrors the observation tri-state law).
 * UNKNOWN is preserved when demand history is insufficient — never collapsed
 * to FAILED or to a zero forecast.
 */
export type ForecastResolution =
  | { readonly kind: "OBSERVED"; readonly value: number }
  | { readonly kind: "UNKNOWN"; readonly reason: "INSUFFICIENT_HISTORY" | "NO_DATA" | "STALE_DATA" };

/** Forecast horizon in days. */
export type ForecastHorizon = number;

/** The deterministic forecast methods (no randomness, no ML — pure journal folds). */
export type ForecastMethod =
  | { readonly kind: "SIMPLE_MOVING_AVERAGE"; readonly windowDays: number }
  | { readonly kind: "EWMA_FIXED_DECAY"; readonly decayBps: number };

/** A journaled demand-signal observation (derived from order history). */
export interface DemandSignal {
  readonly demandSignalId: DemandSignalId;
  readonly skuId: SkuId;
  readonly locationId: LocationId;
  /** Period this signal covers (start/end ISO instants). */
  readonly periodStart: string;
  readonly periodEnd: string;
  /** Observed units sold in the period (integer). */
  readonly unitsObserved: number;
  readonly method: ForecastMethod;
  readonly observedAt: string;
  readonly revision: number;
}

/** Advisory reorder-point proposal — an OPPORTUNITY, never an auto-mutation. */
export type ReorderProposalStatus = "PROPOSED" | "ACCEPTED" | "REJECTED" | "SUPERSEDED";

export interface ReorderPointProposal {
  readonly reorderProposalId: ReorderProposalId;
  readonly skuId: SkuId;
  readonly locationId: LocationId;
  /** The demand signal this proposal was derived from (provenance). */
  readonly sourceDemandSignalId: DemandSignalId;
  /** Forecasted daily demand (OBSERVED) or UNKNOWN. */
  readonly forecast: ForecastResolution;
  /** Current on-hand at proposal time (snapshot for audit). */
  readonly currentOnHand: number;
  /** Suggested reorder point (units). */
  readonly suggestedReorderPoint: number;
  /** Suggested reorder quantity (units). */
  readonly suggestedOrderQuantity: number;
  readonly status: ReorderProposalStatus;
  readonly proposedAt: string;
  readonly revision: number;
}

export type ReorderProposalTransitionError = {
  readonly code: "INVALID_REORDER_PROPOSAL_TRANSITION";
  readonly from: ReorderProposalStatus;
  readonly trigger: "ACCEPT" | "REJECT" | "SUPERSEDE";
};

export function reorderProposalTransition(
  state: ReorderProposalStatus,
  trigger: "ACCEPT" | "REJECT" | "SUPERSEDE",
): Result<ReorderProposalStatus, ReorderProposalTransitionError> {
  const table: Partial<Record<ReorderProposalStatus, Partial<Record<string, ReorderProposalStatus>>>> = {
    PROPOSED: { ACCEPT: "ACCEPTED", REJECT: "REJECTED", SUPERSEDE: "SUPERSEDED" },
    ACCEPTED: { SUPERSEDE: "SUPERSEDED" },
    REJECTED: { SUPERSEDE: "SUPERSEDED" },
    SUPERSEDED: {},
  };
  const next = table[state]?.[trigger];
  if (next === undefined) return err({ code: "INVALID_REORDER_PROPOSAL_TRANSITION", from: state, trigger });
  return ok(next);
}

export function advanceReorderProposal(
  proposal: ReorderPointProposal,
  trigger: "ACCEPT" | "REJECT" | "SUPERSEDE",
): Result<ReorderPointProposal, ReorderProposalTransitionError> {
  const next = reorderProposalTransition(proposal.status, trigger);
  if (!next.ok) return next;
  return ok({ ...proposal, status: next.value, revision: nextRevision(proposal.revision) });
}

/**
 * Deterministic demand computation from a series of per-period unit counts.
 * Returns OBSERVED when sufficient history exists, UNKNOWN otherwise.
 *
 * - SIMPLE_MOVING_AVERAGE: average over the last `windowDays` periods;
 * - EWMA_FIXED_DECAY: exponentially weighted, decay = decayBps / 10000.
 *
 * INSUFFICIENT_HISTORY (fewer than `windowDays` / 2 periods, or no data at all)
 * resolves to UNKNOWN — never to zero, never to FAILED.
 */
export function computeDemandForecast(
  periodicUnits: readonly number[],
  method: ForecastMethod,
): ForecastResolution {
  if (periodicUnits.length === 0) return { kind: "UNKNOWN", reason: "NO_DATA" };
  if (method.kind === "SIMPLE_MOVING_AVERAGE") {
    const window = method.windowDays;
    if (periodicUnits.length < Math.max(1, Math.floor(window / 2))) {
      return { kind: "UNKNOWN", reason: "INSUFFICIENT_HISTORY" };
    }
    const slice = periodicUnits.slice(-window);
    const sum = slice.reduce((acc, n) => acc + n, 0);
    return { kind: "OBSERVED", value: Math.floor(sum / slice.length) };
  }
  // EWMA_FIXED_DECAY
  const decay = method.decayBps / 10_000;
  if (decay <= 0 || decay >= 1) return { kind: "UNKNOWN", reason: "INSUFFICIENT_HISTORY" };
  if (periodicUnits.length < 2) return { kind: "UNKNOWN", reason: "INSUFFICIENT_HISTORY" };
  let ewma = periodicUnits[0]!;
  for (const observation of periodicUnits.slice(1)) {
    ewma = decay * observation + (1 - decay) * ewma;
  }
  return { kind: "OBSERVED", value: Math.floor(ewma) };
}

/**
 * Deterministic reorder-point proposal computation — pure function from
 * demand forecast + policy → typed advisory proposal. NEVER mutates inventory.
 *
 * - If forecast is UNKNOWN, the proposal carries UNKNOWN (preserved tri-state);
 * - suggestedReorderPoint = forecast.dailyDemand × leadTimeDays + safetyStockUnits;
 * - suggestedOrderQuantity = max(0, reorderPoint − currentOnHand);
 * - All integer arithmetic (no floating-point in the proposal values).
 */
export function computeReorderProposal(input: {
  readonly skuId: SkuId;
  readonly locationId: LocationId;
  readonly sourceDemandSignalId: DemandSignalId;
  readonly forecast: ForecastResolution;
  readonly currentOnHand: number;
  readonly leadTimeDays: number;
  readonly safetyStockUnits: number;
  readonly now: string;
}): ReorderPointProposal {
  let suggestedReorderPoint: number;
  let suggestedOrderQuantity: number;
  if (input.forecast.kind === "OBSERVED") {
    const dailyDemand = input.forecast.value;
    suggestedReorderPoint = Math.max(0, dailyDemand * input.leadTimeDays + input.safetyStockUnits);
    suggestedOrderQuantity = Math.max(0, suggestedReorderPoint - input.currentOnHand);
  } else {
    // UNKNOWN forecast: propose a conservative reorder at safety stock only.
    suggestedReorderPoint = input.safetyStockUnits;
    suggestedOrderQuantity = Math.max(0, input.safetyStockUnits - input.currentOnHand);
  }
  return {
    reorderProposalId: "" as ReorderProposalId, // kernel mints the real id
    skuId: input.skuId,
    locationId: input.locationId,
    sourceDemandSignalId: input.sourceDemandSignalId,
    forecast: input.forecast,
    currentOnHand: input.currentOnHand,
    suggestedReorderPoint,
    suggestedOrderQuantity,
    status: "PROPOSED",
    proposedAt: input.now,
    revision: 1,
  };
}
