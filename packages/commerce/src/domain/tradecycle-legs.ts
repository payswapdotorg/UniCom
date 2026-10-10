/**
 * TradeCycle execution legs (W1-012, additive): the per-leg consent/execution
 * vocabulary of the multi-leg trade-cycle aggregate. Vocabulary is aligned
 * with the agent lane's coordination contracts (legIndex, fromRef = the
 * GIVING participant, toRef, offeredItemRef, ATOMIC/STAGED_WITH_RECOURSE,
 * maxHops bounds, proof levels) — but commerce owns the EXECUTION truth and
 * imports nothing from @unicom/agent (this package requires []).
 *
 * Authorization laws (the agent lane's laws, made canonical here):
 * - Every leg is authorized by its GIVING participant only.
 * - An authorization/refusal/withdrawal that cannot be attributed to the
 *   giving participant is AMBIGUOUS: the leg is held UNKNOWN — never silently
 *   passed, never collapsed into a failure (UNKNOWN ≠ FAILED).
 * - Authorization references are required (opaque, per leg).
 */
import type { PrincipalRef } from "./principals.js";
import { principalRefEquals } from "./principals.js";
import { nextRevision } from "./events.js";
import { err, ok, type Result } from "./result.js";

/** Execution mode (agent-lane vocabulary): ATOMIC is all-or-nothing; STAGED_WITH_RECOURSE progresses per leg with recourse. */
export type TradeCycleExecutionMode = "ATOMIC" | "STAGED_WITH_RECOURSE";

/** Search/execution budget reference (agent-lane vocabulary: bounded hops). */
export interface TradeCycleBudget {
  readonly maxHops: number;
  readonly environment: "PRODUCTION" | "LAB";
}

export type TradeCycleValidationError =
  | { readonly code: "NO_LEGS" }
  | { readonly code: "HOP_BOUND_EXCEEDED"; readonly legs: number; readonly maxHops: number }
  | { readonly code: "LEG_INDEX_NOT_CANONICAL"; readonly legIndex: number }
  | { readonly code: "CYCLE_NOT_CLOSED"; readonly legIndex: number }
  | { readonly code: "STAGED_WITHOUT_RECOURSE" }
  | { readonly code: "LEG_NOT_PENDING"; readonly legIndex: number; readonly consentState: TradeCycleLegState }
  | { readonly code: "EMPTY_ITEM_REF"; readonly legIndex: number };

/** Proof levels, aligned with the agent lane's ProofLevel vocabulary. */
export type TradeCycleProofLevel = "P0" | "P1" | "P2" | "P3" | "P4" | "P5";

/** Per-leg consent/execution states. UNKNOWN is a PRESERVED holding state (pending disambiguation), never a failure. */
export type TradeCycleLegState =
  | "PENDING"
  | "CONSENTED"
  | "REFUSED"
  | "WITHDRAWN"
  | "EXPIRED"
  | "UNKNOWN"
  | "COMMITTED"
  | "ROLLED_BACK";

export type TradeCycleLegTrigger =
  | "AUTHORIZE"
  | "REFUSE"
  | "WITHDRAW"
  | "LAPSE"
  | "COMMIT"
  | "ROLLBACK"
  | "MARK_UNKNOWN";

export type TradeCycleLegTransitionError = {
  readonly code: "INVALID_TRADE_CYCLE_LEG_TRANSITION";
  readonly from: TradeCycleLegState;
  readonly trigger: TradeCycleLegTrigger;
};

/** A clear per-leg authorization by the giving participant (reference required). */
export interface TradeCycleLegAuthorization {
  readonly authorizedBy: PrincipalRef;
  /** Opaque per-leg authorization reference (required, never empty). */
  readonly authorizationRef: string;
  readonly recordedAt: string;
}

/** Why an action could not be attributed to the giving participant. */
export type TradeCycleAmbiguityReason = "PARTICIPANT_MISMATCH" | "UNKNOWN_PARTICIPANT";

/** A recorded ambiguity: the leg is held UNKNOWN until disambiguated. */
export interface TradeCycleLegAmbiguity {
  readonly kind: "AMBIGUOUS_AUTHORIZATION" | "AMBIGUOUS_REFUSAL" | "AMBIGUOUS_WITHDRAWAL";
  readonly attemptedBy: PrincipalRef;
  readonly reason: TradeCycleAmbiguityReason;
  readonly authorizationRef?: string;
  readonly recordedAt: string;
}

export interface TradeCycleExecutionLeg {
  readonly legIndex: number;
  /** The GIVING participant — the only principal who may authorize/refuse/withdraw this leg. */
  readonly fromRef: PrincipalRef;
  /** The receiving participant (their stated want is satisfied by the offered item). */
  readonly toRef: PrincipalRef;
  /** Opaque owned-item reference that moves from → to when this leg commits. */
  readonly offeredItemRef: string;
  readonly requiredProofLevel?: TradeCycleProofLevel;
  readonly consentState: TradeCycleLegState;
  /** Present once clearly authorized by the giving participant. */
  readonly authorization?: TradeCycleLegAuthorization;
  /** Present while UNKNOWN (the recorded ambiguity; cleared on disambiguation). */
  readonly ambiguity?: TradeCycleLegAmbiguity;
  readonly revision: number;
}

/** Deterministic per-leg lifecycle. REFUSED/WITHDRAWN/EXPIRED/ROLLED_BACK are terminal. */
export function tradeCycleLegTransition(
  state: TradeCycleLegState,
  trigger: TradeCycleLegTrigger,
): Result<TradeCycleLegState, TradeCycleLegTransitionError> {
  const table: Record<TradeCycleLegState, Partial<Record<TradeCycleLegTrigger, TradeCycleLegState>>> = {
    PENDING: { AUTHORIZE: "CONSENTED", REFUSE: "REFUSED", LAPSE: "EXPIRED", MARK_UNKNOWN: "UNKNOWN" },
    CONSENTED: { REFUSE: "REFUSED", WITHDRAW: "WITHDRAWN", COMMIT: "COMMITTED" },
    UNKNOWN: { AUTHORIZE: "CONSENTED", REFUSE: "REFUSED", LAPSE: "EXPIRED" },
    COMMITTED: { ROLLBACK: "ROLLED_BACK" },
    REFUSED: {},
    WITHDRAWN: {},
    EXPIRED: {},
    ROLLED_BACK: {},
  };
  const next = table[state][trigger];
  if (next === undefined) return err({ code: "INVALID_TRADE_CYCLE_LEG_TRANSITION", from: state, trigger });
  return ok(next);
}

/** Advance one leg by trigger (pure — returns a new leg with the next revision). */
export function advanceTradeCycleLeg(
  leg: TradeCycleExecutionLeg,
  trigger: TradeCycleLegTrigger,
): Result<TradeCycleExecutionLeg, TradeCycleLegTransitionError> {
  const next = tradeCycleLegTransition(leg.consentState, trigger);
  if (!next.ok) return next;
  return ok({ ...leg, consentState: next.value, revision: nextRevision(leg.revision) });
}

/**
 * Deterministic cycle-shape validation (the agent lane's laws, owned here for
 * execution): at least one leg, within the hop bound, canonical 0-based leg
 * indexes, every leg opening PENDING with an item ref, and the legs form a
 * closed cycle (each receiver is the next giver). STAGED_WITH_RECOURSE must
 * declare its recourse plan.
 */
export function validateTradeCycleLegs(
  legs: readonly TradeCycleExecutionLeg[],
  bounds: TradeCycleBudget,
  executionMode: TradeCycleExecutionMode,
  recoursePlanRef?: string,
): Result<true, TradeCycleValidationError> {
  if (legs.length === 0) return err({ code: "NO_LEGS" });
  if (legs.length > bounds.maxHops) return err({ code: "HOP_BOUND_EXCEEDED", legs: legs.length, maxHops: bounds.maxHops });
  for (const leg of legs) {
    if (leg.legIndex < 0 || leg.legIndex >= legs.length) {
      return err({ code: "LEG_INDEX_NOT_CANONICAL", legIndex: leg.legIndex });
    }
    if (leg.consentState !== "PENDING") return err({ code: "LEG_NOT_PENDING", legIndex: leg.legIndex, consentState: leg.consentState });
    if (typeof leg.offeredItemRef !== "string" || leg.offeredItemRef.length === 0) {
      return err({ code: "EMPTY_ITEM_REF", legIndex: leg.legIndex });
    }
  }
  for (let index = 0; index < legs.length; index += 1) {
    const leg = legs[index];
    const next = legs[(index + 1) % legs.length];
    if (!leg || !next || !principalRefEquals(leg.toRef, next.fromRef)) {
      return err({ code: "CYCLE_NOT_CLOSED", legIndex: leg?.legIndex ?? index });
    }
  }
  if (executionMode === "STAGED_WITH_RECOURSE" && (!recoursePlanRef || recoursePlanRef.length === 0)) {
    return err({ code: "STAGED_WITHOUT_RECOURSE" });
  }
  return ok(true);
}
