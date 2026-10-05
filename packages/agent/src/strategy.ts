/**
 * Strategy contracts (FROZEN-ARCHITECTURE §3.F; invariant 31).
 *
 * A Strategy is WHAT should happen: an auditable approach composed of
 * opaque commerce command intents. A Strategy NEVER says who executes it —
 * that is the Organization's concern (organization.ts). The two types are
 * deliberately disjoint.
 */

import type { CommerceCommandIntent } from "./commerce-seam.js";

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
  | "EXECUTE_TRADE_CYCLE";

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
}
