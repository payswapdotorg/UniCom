/**
 * Coordination contracts: CoordinationRequest and bounded TradeCycle
 * (FROZEN-ARCHITECTURE §7, §22.2; invariants 19/20/44/48).
 *
 * Every trade-cycle participant independently authorizes its own leg;
 * production search is bounded in hop count; cycles are atomic or staged
 * with explicit recourse; privacy is minimized and correlation happens only
 * under a declared policy.
 */

import type { PrincipalRef } from "./common.js";
import type { AuthorizationDecision } from "./commerce-seam.js";
import type { ProofLevel } from "./proof.js";

/** Privacy policy for multi-party coordination (invariant 48). */
export interface CoordinationPrivacyPolicy {
  readonly informationSharing: "MINIMUM_NECESSARY";
  /** Declared authority under which cross-principal correlation is permitted. */
  readonly correlationAuthorityRef?: string;
}

export type CoordinationKind = "GROUP_BUY" | "TRADE_CYCLE" | "SHARED_LOGISTICS" | "MULTI_MERCHANT_PURCHASE";

/** Request to coordinate across principals. */
export interface CoordinationRequest {
  readonly requestId: string;
  readonly initiatingRef: PrincipalRef;
  readonly kind: CoordinationKind;
  readonly participantRefs: readonly PrincipalRef[];
  readonly privacyPolicy: CoordinationPrivacyPolicy;
  readonly expiresAt: string;
}

/** One leg of a trade cycle: this participant gives, that participant receives. */
export interface TradeCycleLeg {
  readonly legIndex: number;
  readonly fromRef: PrincipalRef;
  readonly toRef: PrincipalRef;
  /** Opaque owned-item reference. */
  readonly offeredItemRef: string;
  /** Authorized by fromRef — each participant authorizes its OWN leg. */
  readonly authorization?: AuthorizationDecision;
  /** Proof-carrying cycle: every leg pins its proof requirement. */
  readonly requiredProofLevel?: ProofLevel;
}

export type TradeCycleExecutionMode = "ATOMIC" | "STAGED_WITH_RECOURSE";

/** Production search is bounded in hop count (invariant 19). */
export interface TradeCycleSearchBounds {
  readonly maxHops: number;
  readonly environment: "PRODUCTION" | "LAB";
}

export interface TradeCycle {
  readonly tradeCycleId: string;
  readonly legs: readonly TradeCycleLeg[];
  readonly executionMode: TradeCycleExecutionMode;
  readonly bounds: TradeCycleSearchBounds;
  /** Required when executionMode is STAGED_WITH_RECOURSE. */
  readonly recoursePlanRef?: string;
}

export type TradeCycleViolation =
  | "HOP_BOUND_EXCEEDED"
  | "LEG_UNAUTHORIZED"
  | "LEG_AUTHORIZATION_MISMATCH"
  | "CYCLE_NOT_CLOSED"
  | "STAGED_WITHOUT_RECOURSE"
  | "MISSING_PROOF_REQUIREMENT";

export type TradeCycleValidation =
  | { readonly valid: true }
  | { readonly valid: false; readonly violations: readonly TradeCycleViolation[] };

/**
 * Deterministic trade-cycle validation:
 * - hop count within bounds;
 * - every leg independently authorized by its own giving participant;
 * - the legs form a closed cycle;
 * - staged execution declares an explicit recourse plan;
 * - every leg pins a proof requirement.
 */
export function validateTradeCycle(cycle: TradeCycle): TradeCycleValidation {
  const violations: TradeCycleViolation[] = [];
  const { legs, bounds, executionMode } = cycle;

  if (legs.length > bounds.maxHops) violations.push("HOP_BOUND_EXCEEDED");

  if (legs.length === 0) {
    violations.push("CYCLE_NOT_CLOSED", "LEG_UNAUTHORIZED", "MISSING_PROOF_REQUIREMENT");
    return { valid: false, violations };
  }

  for (const leg of legs) {
    if (leg.authorization === undefined || leg.authorization.decision !== "AUTHORIZED") {
      violations.push("LEG_UNAUTHORIZED");
    } else if (leg.authorization.decidedBy.principalId !== leg.fromRef.principalId) {
      violations.push("LEG_AUTHORIZATION_MISMATCH");
    }
    if (leg.requiredProofLevel === undefined) violations.push("MISSING_PROOF_REQUIREMENT");
  }

  for (let index = 0; index < legs.length; index += 1) {
    const leg = legs[index] as TradeCycleLeg;
    const next = legs[(index + 1) % legs.length] as TradeCycleLeg;
    if (leg.toRef.principalId !== next.fromRef.principalId) violations.push("CYCLE_NOT_CLOSED");
  }

  if (executionMode === "STAGED_WITH_RECOURSE" && (cycle.recoursePlanRef === undefined || cycle.recoursePlanRef.length === 0)) {
    violations.push("STAGED_WITHOUT_RECOURSE");
  }

  return violations.length === 0 ? { valid: true } : { valid: false, violations: [...new Set(violations)] };
}
