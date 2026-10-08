/**
 * Opportunity lifecycle transition table (W2-003). Extracted from
 * opportunity-engine.ts to respect the per-file line budget.
 *
 * Deterministic transition table — terminal states (REALIZED/EXPIRED/
 * RETIRED) never leave. The transition function is pure: identical inputs
 * produce identical outputs.
 */

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
