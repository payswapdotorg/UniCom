/**
 * Strategy contracts (FROZEN-ARCHITECTURE §3.F; invariant 31).
 *
 * A Strategy is WHAT should happen: an auditable approach composed of
 * opaque commerce command intents. A Strategy NEVER says who executes it —
 * that is the Organization's concern (organization.ts). The two types are
 * deliberately disjoint.
 */

import type { CommerceCommandIntent } from "./commerce-seam.js";
import type {
  FinancingConstraint,
  NegotiationBounds,
  PriceTimingConstraint,
} from "./intent.js";

/** Planning approaches available to buyer/merchant goals (§5). */
export type StrategyApproach =
  | "BUY_NOW"
  | "WAIT_FOR_PRICE"
  | "WAIT_FOR_INVENTORY"
  | "JOIN_EXISTING_GROUP_BUY"
  | "PROPOSE_NEW_GROUP_BUY"
  | "NEGOTIATE"
  | "SUBSTITUTE"
  | "BUY_LOCAL"
  | "BUY_FROM_MULTIPLE_MERCHANTS"
  | "BORROW_OR_RENT"
  | "RESELL_OR_REROUTE"
  | "EXECUTE_TRADE_CYCLE"
  // --- W2-007 (additive): the audit-verified incomplete buyer-agent rows
  // become first-class strategy approaches. Each feeds the existing
  // strategy/organization search as a constraints/objective only — bounded,
  // privacy-aware, no new matching semantics (architecture frozen). ---
  | "FINANCING_INSTALLMENT"
  | "BUY_NOW_VS_WAIT"
  | "PRICE_TIMING_WATCH"
  | "WARRANTY_RECOVERY_CLAIM"
  | "SUBSCRIPTION_LIQUIDATE"
  | "SUBSCRIPTION_REALLOCATE"
  | "LOCAL_PICKUP"
  | "SHARED_LOGISTICS_JOIN";

/**
 * W2-007: the constraints-only context a Strategy may carry. The new
 * buyer-agent intent dimensions feed the strategy search as constraints/
 * objectives ONLY — they bound which candidates the search considers, they
 * do NOT introduce new matching semantics (architecture frozen; rule 5:
 * Strategy ≠ Organization; rule 12: authorization explicit).
 *
 * Every field here is a CONSTRAINT or an OBJECTIVE the strategy must
 * respect — it never directly mutates commerce truth (rule 1). The strategy
 * search consumes these as inputs to candidate filtering and scoring, not
 * as commands to the commerce plane.
 */
export interface StrategyConstraints {
  /** Financing parameters the strategy must respect (constraint). */
  readonly financing?: FinancingConstraint;
  /** Buy-now-vs-wait decision input (objective). */
  readonly buyNowVsWait?: "BUY_NOW_REQUIRED" | "WAIT_PREFERRED" | "EITHER";
  /** Price-timing window the strategy must respect (constraint). */
  readonly priceTiming?: PriceTimingConstraint;
  /** Negotiation bounds the strategy must respect (constraint). */
  readonly negotiation?: NegotiationBounds;
  /**
   * Optional privacy-aware objective flags. The strategy search uses these
   * to filter candidates by privacy guarantee — no new matching semantics,
   * only constraint enforcement on the existing search.
   */
  readonly privacyObjective?: "MINIMIZE_DATA_COLLECTION" | "ANONYMIZED_COORDINATION";
}

/** One proposed step: an opaque commerce command intent plus ordering. */
export interface StrategyStep {
  readonly stepId: string;
  readonly commandIntent: CommerceCommandIntent;
  readonly dependsOnSteps?: readonly string[];
}

/**
 * WHAT should happen. Carries no executor, no assignment, no main agent —
 * it is pure proposal and rationale (auditable summary, never hidden
 * chain-of-thought; FROZEN-ARCHITECTURE §14).
 */
export interface Strategy {
  readonly strategyId: string;
  readonly goalRef?: string;
  readonly intentRef?: string;
  readonly approach: StrategyApproach;
  readonly rationale: string;
  readonly steps: readonly StrategyStep[];
  /**
   * W2-007 (additive): the constraints/objectives the strategy respects.
   * The strategy search consumes these as inputs to candidate filtering —
   * they do NOT introduce new matching semantics (architecture frozen).
   */
  readonly constraints?: StrategyConstraints;
}
