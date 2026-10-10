/**
 * TradeCycle execution aggregate (W1-012, additive): the multi-leg trade
 * execution truth the agent lane's discovery describes but the kernel did not
 * own. Discovery/proposals remain the agent lane's (unchanged); candidates
 * arrive here as command payloads with opaque item refs, and THIS aggregate is
 * the execution authority.
 *
 * Execution laws (work order W1-012, aligned with the agent lane):
 * - Each leg advances pending → CONSENTED/REFUSED by its GIVING participant
 *   only, with a per-leg authorization reference.
 * - ATOMIC mode: any leg refusal stops the cycle with NO leg committed; all
 *   legs consented → COMMITTED (all-or-nothing).
 * - STAGED_WITH_RECOURSE mode: per-leg progression; a stop with committed legs
 *   opens RECOURSE, and recourse rolls committed legs back (ROLLED_BACK is a
 *   preserved terminal state, never a failure).
 * - UNKNOWN-participant / ambiguous-authorization outcomes stay UNKNOWN —
 *   never silently passed, never collapsed into failures (UNKNOWN ≠ FAILED).
 */
import type { TradeCycleId } from "./ids.js";
import { nextRevision } from "./events.js";
import type { PrincipalRef } from "./principals.js";
import { principalRefEquals } from "./principals.js";
import { err, ok, type Result } from "./result.js";
import type {
  TradeCycleBudget,
  TradeCycleExecutionLeg,
  TradeCycleExecutionMode,
  TradeCycleLegAmbiguity,
  TradeCycleLegAuthorization,
  TradeCycleLegState,
  TradeCycleLegTransitionError,
} from "./tradecycle-legs.js";
import { advanceTradeCycleLeg, tradeCycleLegTransition } from "./tradecycle-legs.js";

export { advanceTradeCycleLeg, tradeCycleLegTransition, validateTradeCycleLegs } from "./tradecycle-legs.js";
export type {
  TradeCycleProofLevel,
  TradeCycleLegState,
  TradeCycleLegTrigger,
  TradeCycleLegTransitionError,
  TradeCycleLegAuthorization,
  TradeCycleLegAmbiguity,
  TradeCycleAmbiguityReason,
  TradeCycleExecutionLeg,
  TradeCycleExecutionMode,
  TradeCycleBudget,
  TradeCycleValidationError,
} from "./tradecycle-legs.js";

export type TradeCycleExecutionState =
  | "OPEN"
  | "ALL_LEGS_AUTHORIZED"
  | "COMMITTED"
  | "STOPPED_REFUSAL"
  | "STOPPED_WITHDRAWAL"
  | "STOPPED_EXPIRY"
  | "RECOURSE_OPEN"
  | "ROLLED_BACK";

export type TradeCycleCycleTrigger =
  | "COMMIT_ALL"
  | "STOP_REFUSAL"
  | "STOP_WITHDRAWAL"
  | "STOP_EXPIRY"
  | "OPEN_RECOURSE"
  | "COMPLETE_ROLLBACK";

export type TradeCycleTransitionError = {
  readonly code: "INVALID_TRADE_CYCLE_TRANSITION";
  readonly from: TradeCycleExecutionState;
  readonly trigger: TradeCycleCycleTrigger;
};

export interface TradeCycleExecution {
  readonly tradeCycleId: TradeCycleId;
  /** The principal that carried the candidate into execution; the only executor of the cycle. */
  readonly initiatingRef: PrincipalRef;
  readonly legs: readonly TradeCycleExecutionLeg[];
  readonly executionMode: TradeCycleExecutionMode;
  readonly bounds: TradeCycleBudget;
  /** Required when executionMode is STAGED_WITH_RECOURSE. */
  readonly recoursePlanRef?: string;
  readonly state: TradeCycleExecutionState;
  readonly revision: number;
}

/** Deterministic cycle lifecycle. Every STOPPED state plus COMMITTED and ROLLED_BACK are terminal; RECOURSE_OPEN only completes by rollback. */
export function tradeCycleTransition(
  state: TradeCycleExecutionState,
  trigger: TradeCycleCycleTrigger,
): Result<TradeCycleExecutionState, TradeCycleTransitionError> {
  const table: Record<TradeCycleExecutionState, Partial<Record<TradeCycleCycleTrigger, TradeCycleExecutionState>>> = {
    OPEN: {
      COMMIT_ALL: "COMMITTED",
      STOP_REFUSAL: "STOPPED_REFUSAL",
      STOP_WITHDRAWAL: "STOPPED_WITHDRAWAL",
      STOP_EXPIRY: "STOPPED_EXPIRY",
      OPEN_RECOURSE: "RECOURSE_OPEN",
    },
    ALL_LEGS_AUTHORIZED: {
      COMMIT_ALL: "COMMITTED",
      STOP_REFUSAL: "STOPPED_REFUSAL",
      STOP_WITHDRAWAL: "STOPPED_WITHDRAWAL",
      STOP_EXPIRY: "STOPPED_EXPIRY",
      OPEN_RECOURSE: "RECOURSE_OPEN",
    },
    RECOURSE_OPEN: { COMPLETE_ROLLBACK: "ROLLED_BACK" },
    COMMITTED: {},
    STOPPED_REFUSAL: {},
    STOPPED_WITHDRAWAL: {},
    STOPPED_EXPIRY: {},
    ROLLED_BACK: {},
  };
  const next = table[state][trigger];
  if (next === undefined) return err({ code: "INVALID_TRADE_CYCLE_TRANSITION", from: state, trigger });
  return ok(next);
}

export type TradeCycleExecutionError =
  | TradeCycleLegTransitionError
  | TradeCycleTransitionError
  | { readonly code: "CYCLE_TERMINAL"; readonly state: TradeCycleExecutionState }
  | { readonly code: "LEG_NOT_FOUND"; readonly legIndex: number }
  | { readonly code: "LEG_ALREADY_CONSENTED"; readonly legIndex: number }
  | { readonly code: "LEG_NOT_CONSENTED"; readonly legIndex: number; readonly consentState: TradeCycleLegState }
  | { readonly code: "LEG_NOT_COMMITTED"; readonly legIndex: number; readonly consentState: TradeCycleLegState }
  | { readonly code: "NOT_ALL_LEGS_AUTHORIZED" }
  | { readonly code: "MODE_MISMATCH"; readonly expected: TradeCycleExecutionMode; readonly actual: TradeCycleExecutionMode }
  | { readonly code: "INVALID_AUTHORIZATION_REF"; readonly legIndex: number }
  | { readonly code: "AMBIGUOUS_ACTION_ON_CONSENTED_LEG"; readonly legIndex: number }
  | { readonly code: "NOT_IN_RECOURSE"; readonly state: TradeCycleExecutionState };

function legOf(cycle: TradeCycleExecution, legIndex: number): Result<TradeCycleExecutionLeg, TradeCycleExecutionError> {
  const leg = cycle.legs.find((candidate) => candidate.legIndex === legIndex);
  if (!leg) return err({ code: "LEG_NOT_FOUND", legIndex });
  return ok(leg);
}

function withLeg(
  cycle: TradeCycleExecution,
  legIndex: number,
  leg: TradeCycleExecutionLeg,
  state: TradeCycleExecutionState,
): TradeCycleExecution {
  return {
    ...cycle,
    legs: cycle.legs.map((candidate) => (candidate.legIndex === legIndex ? leg : candidate)),
    state,
    revision: nextRevision(cycle.revision),
  };
}

/** Every leg carries its giver's standing authorization (CONSENTED, or already COMMITTED in staged progression). */
export function allLegsAuthorized(cycle: TradeCycleExecution): boolean {
  return cycle.legs.every((leg) => leg.consentState === "CONSENTED" || leg.consentState === "COMMITTED");
}

function committedLegCount(cycle: TradeCycleExecution): number {
  return cycle.legs.filter((leg) => leg.consentState === "COMMITTED").length;
}

function principalIsCycleParticipant(cycle: TradeCycleExecution, ref: PrincipalRef): boolean {
  return cycle.legs.some((leg) => principalRefEquals(leg.fromRef, ref) || principalRefEquals(leg.toRef, ref));
}

/** One consent/refusal/withdrawal action against a leg, attributed to a principal. */
export type TradeCycleLegAction =
  | { readonly kind: "AUTHORIZE"; readonly actor: PrincipalRef; readonly authorizationRef: string; readonly recordedAt: string }
  | { readonly kind: "REFUSE"; readonly actor: PrincipalRef; readonly recordedAt: string }
  | { readonly kind: "WITHDRAW"; readonly actor: PrincipalRef; readonly recordedAt: string };

/**
 * Apply one leg-level consent action. Attribution is decided FIRST:
 * - action by the GIVING participant → the leg's clear transition
 *   (AUTHORIZE → CONSENTED with the authorization reference; REFUSE → REFUSED;
 *   WITHDRAW → WITHDRAWN by a consented giver);
 * - action by anyone else (unknown participant, or a different participant of
 *   the cycle) → the leg is held UNKNOWN with the ambiguity recorded —
 *   never passed, never failed. An ambiguous action against a leg that is
 *   already CONSENTED is rejected: the standing consent is never destroyed.
 */
export function applyTradeCycleLegAction(
  cycle: TradeCycleExecution,
  legIndex: number,
  action: TradeCycleLegAction,
): Result<TradeCycleExecution, TradeCycleExecutionError> {
  if (cycle.state !== "OPEN" && cycle.state !== "ALL_LEGS_AUTHORIZED") {
    return err({ code: "CYCLE_TERMINAL", state: cycle.state });
  }
  const legResult = legOf(cycle, legIndex);
  if (!legResult.ok) return legResult;
  const leg = legResult.value;
  const clear = principalRefEquals(action.actor, leg.fromRef);
  if (action.kind === "AUTHORIZE" && (typeof action.authorizationRef !== "string" || action.authorizationRef.length === 0)) {
    return err({ code: "INVALID_AUTHORIZATION_REF", legIndex });
  }
  if (!clear) {
    if (leg.consentState === "CONSENTED" || leg.consentState === "COMMITTED") {
      return err({ code: "AMBIGUOUS_ACTION_ON_CONSENTED_LEG", legIndex });
    }
    const marked = tradeCycleLegTransition(leg.consentState, "MARK_UNKNOWN");
    if (!marked.ok) return marked;
    const ambiguity: TradeCycleLegAmbiguity = {
      kind:
        action.kind === "AUTHORIZE" ? "AMBIGUOUS_AUTHORIZATION" : action.kind === "REFUSE" ? "AMBIGUOUS_REFUSAL" : "AMBIGUOUS_WITHDRAWAL",
      attemptedBy: action.actor,
      reason: principalIsCycleParticipant(cycle, action.actor) ? "PARTICIPANT_MISMATCH" : "UNKNOWN_PARTICIPANT",
      authorizationRef: action.kind === "AUTHORIZE" ? action.authorizationRef : undefined,
      recordedAt: action.recordedAt,
    };
    const nextLeg: TradeCycleExecutionLeg = { ...leg, consentState: "UNKNOWN", ambiguity, revision: nextRevision(leg.revision) };
    return ok(withLeg(cycle, legIndex, nextLeg, cycle.state));
  }
  if (action.kind === "AUTHORIZE") {
    if (leg.consentState === "CONSENTED") return err({ code: "LEG_ALREADY_CONSENTED", legIndex });
    const advanced = advanceTradeCycleLeg(leg, "AUTHORIZE");
    if (!advanced.ok) return advanced;
    const authorization: TradeCycleLegAuthorization = {
      authorizedBy: action.actor,
      authorizationRef: action.authorizationRef,
      recordedAt: action.recordedAt,
    };
    const nextLeg: TradeCycleExecutionLeg = { ...advanced.value, authorization, ambiguity: undefined };
    return ok(reconcileAfterClearConsent(withLeg(cycle, legIndex, nextLeg, cycle.state)));
  }
  if (action.kind === "WITHDRAW") {
    if (leg.consentState !== "CONSENTED") {
      return err({ code: "LEG_NOT_CONSENTED", legIndex, consentState: leg.consentState });
    }
    const advanced = advanceTradeCycleLeg(leg, "WITHDRAW");
    if (!advanced.ok) return advanced;
    return ok(stopCycle(withLeg(cycle, legIndex, { ...advanced.value, authorization: undefined }, cycle.state), "STOP_WITHDRAWAL"));
  }
  if (leg.consentState === "CONSENTED" || leg.consentState === "PENDING" || leg.consentState === "UNKNOWN") {
    const advanced = advanceTradeCycleLeg(leg, "REFUSE");
    if (!advanced.ok) return advanced;
    return ok(stopCycle(withLeg(cycle, legIndex, { ...advanced.value, authorization: undefined, ambiguity: undefined }, cycle.state), "STOP_REFUSAL"));
  }
  return err({ code: "INVALID_TRADE_CYCLE_LEG_TRANSITION", from: leg.consentState, trigger: "REFUSE" });
}

/** The consent window lapses on an unanswered leg (PENDING or still-UNKNOWN): the cycle stops; nothing commits. */
export function lapseTradeCycleLeg(
  cycle: TradeCycleExecution,
  legIndex: number,
): Result<TradeCycleExecution, TradeCycleExecutionError> {
  if (cycle.state !== "OPEN" && cycle.state !== "ALL_LEGS_AUTHORIZED") {
    return err({ code: "CYCLE_TERMINAL", state: cycle.state });
  }
  const legResult = legOf(cycle, legIndex);
  if (!legResult.ok) return legResult;
  const leg = legResult.value;
  if (leg.consentState !== "PENDING" && leg.consentState !== "UNKNOWN") {
    return err({ code: "INVALID_TRADE_CYCLE_LEG_TRANSITION", from: leg.consentState, trigger: "LAPSE" });
  }
  const advanced = advanceTradeCycleLeg(leg, "LAPSE");
  if (!advanced.ok) return advanced;
  return ok(stopCycle(withLeg(cycle, legIndex, advanced.value, cycle.state), "STOP_EXPIRY"));
}

/**
 * ATOMIC execution: requires EVERY leg CONSENTED (cycle ALL_LEGS_AUTHORIZED);
 * commits all legs together. No partial commitment is representable.
 */
export function executeTradeCycle(cycle: TradeCycleExecution): Result<TradeCycleExecution, TradeCycleExecutionError> {
  if (cycle.executionMode !== "ATOMIC") {
    return err({ code: "MODE_MISMATCH", expected: "ATOMIC", actual: cycle.executionMode });
  }
  if (cycle.state !== "ALL_LEGS_AUTHORIZED") return err({ code: "NOT_ALL_LEGS_AUTHORIZED" });
  const advanced = tradeCycleTransition(cycle.state, "COMMIT_ALL");
  if (!advanced.ok) return advanced;
  const legs = cycle.legs.map((leg) => ({ ...leg, consentState: "COMMITTED" as const, revision: nextRevision(leg.revision) }));
  return ok({ ...cycle, legs, state: advanced.value, revision: nextRevision(cycle.revision) });
}

/**
 * STAGED_WITH_RECOURSE per-leg progression: one CONSENTED leg commits. When
 * that was the last leg, the cycle is COMMITTED.
 */
export function executeTradeCycleLeg(
  cycle: TradeCycleExecution,
  legIndex: number,
): Result<TradeCycleExecution, TradeCycleExecutionError> {
  if (cycle.executionMode !== "STAGED_WITH_RECOURSE") {
    return err({ code: "MODE_MISMATCH", expected: "STAGED_WITH_RECOURSE", actual: cycle.executionMode });
  }
  if (cycle.state !== "OPEN" && cycle.state !== "ALL_LEGS_AUTHORIZED") {
    return err({ code: "CYCLE_TERMINAL", state: cycle.state });
  }
  const legResult = legOf(cycle, legIndex);
  if (!legResult.ok) return legResult;
  const leg = legResult.value;
  if (leg.consentState !== "CONSENTED") {
    return err({ code: "LEG_NOT_CONSENTED", legIndex, consentState: leg.consentState });
  }
  const advanced = advanceTradeCycleLeg(leg, "COMMIT");
  if (!advanced.ok) return advanced;
  const next = withLeg(cycle, legIndex, advanced.value, cycle.state);
  if (next.legs.every((candidate) => candidate.consentState === "COMMITTED")) {
    const committed = tradeCycleTransition(next.state, "COMMIT_ALL");
    if (!committed.ok) return committed;
    return ok({ ...next, state: committed.value, revision: nextRevision(next.revision) });
  }
  return ok(next);
}

/**
 * STAGED_WITH_RECOURSE recourse: roll one COMMITTED leg back. When the last
 * committed leg is rolled back the cycle completes its rollback (terminal
 * ROLLED_BACK — a preserved recourse outcome, never a failure).
 */
export function rollbackTradeCycleLeg(
  cycle: TradeCycleExecution,
  legIndex: number,
): Result<TradeCycleExecution, TradeCycleExecutionError> {
  if (cycle.executionMode !== "STAGED_WITH_RECOURSE") {
    return err({ code: "MODE_MISMATCH", expected: "STAGED_WITH_RECOURSE", actual: cycle.executionMode });
  }
  if (cycle.state !== "RECOURSE_OPEN") return err({ code: "NOT_IN_RECOURSE", state: cycle.state });
  const legResult = legOf(cycle, legIndex);
  if (!legResult.ok) return legResult;
  const leg = legResult.value;
  if (leg.consentState !== "COMMITTED") {
    return err({ code: "LEG_NOT_COMMITTED", legIndex, consentState: leg.consentState });
  }
  const advanced = advanceTradeCycleLeg(leg, "ROLLBACK");
  if (!advanced.ok) return advanced;
  const next = withLeg(cycle, legIndex, advanced.value, cycle.state);
  if (committedLegCount(next) === 0) {
    const completed = tradeCycleTransition(next.state, "COMPLETE_ROLLBACK");
    if (!completed.ok) return completed;
    return ok({ ...next, state: completed.value, revision: nextRevision(next.revision) });
  }
  return ok(next);
}

function reconcileAfterClearConsent(cycle: TradeCycleExecution): TradeCycleExecution {
  if (cycle.state === "OPEN" && allLegsAuthorized(cycle)) {
    return { ...cycle, state: "ALL_LEGS_AUTHORIZED", revision: nextRevision(cycle.revision) };
  }
  return cycle;
}

/** A stop by a giver: staged cycles with committed legs open RECOURSE instead of a bare stop. */
function stopCycle(
  cycle: TradeCycleExecution,
  trigger: "STOP_REFUSAL" | "STOP_WITHDRAWAL" | "STOP_EXPIRY",
): TradeCycleExecution {
  const effectiveTrigger = cycle.executionMode === "STAGED_WITH_RECOURSE" && committedLegCount(cycle) > 0 ? "OPEN_RECOURSE" : trigger;
  const next = tradeCycleTransition(cycle.state, effectiveTrigger);
  if (!next.ok) return cycle;
  return { ...cycle, state: next.value, revision: nextRevision(cycle.revision) };
}

/**
 * Typed command payloads (the only mutation path). Handlers additionally
 * enforce actor identity: OPEN/EXECUTE/EXECUTE_LEG/ROLLBACK by the initiating
 * principal; AUTHORIZE/REFUSE/WITHDRAW by the payload principal (the kernel
 * then decides clear vs ambiguous attribution against the leg's giver); LAPSE
 * is a window observation any principal may record.
 */
export type TradeCycleCommandPayload =
  | { readonly type: "OPEN_TRADE_CYCLE"; readonly cycle: TradeCycleExecution }
  | {
      readonly type: "AUTHORIZE_TRADE_CYCLE_LEG";
      readonly cycleId: TradeCycleId;
      readonly legIndex: number;
      readonly authorizingRef: PrincipalRef;
      readonly authorizationRef: string;
    }
  | {
      readonly type: "REFUSE_TRADE_CYCLE_LEG";
      readonly cycleId: TradeCycleId;
      readonly legIndex: number;
      readonly refusingRef: PrincipalRef;
      readonly reason?: string;
    }
  | { readonly type: "WITHDRAW_TRADE_CYCLE_LEG"; readonly cycleId: TradeCycleId; readonly legIndex: number; readonly withdrawingRef: PrincipalRef }
  | { readonly type: "LAPSE_TRADE_CYCLE_LEG"; readonly cycleId: TradeCycleId; readonly legIndex: number }
  | { readonly type: "EXECUTE_TRADE_CYCLE"; readonly cycleId: TradeCycleId }
  | { readonly type: "EXECUTE_TRADE_CYCLE_LEG"; readonly cycleId: TradeCycleId; readonly legIndex: number }
  | { readonly type: "ROLLBACK_TRADE_CYCLE_LEG"; readonly cycleId: TradeCycleId; readonly legIndex: number; readonly reason: string };
