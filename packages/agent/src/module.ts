/**
 * Architecture module manifest for @unicom/agent.
 *
 * Lane: Worker 2 — Agent / Trust / Lab / Security (W2-001, Stage 0).
 * Stage-0 law: pairwise-disjoint lanes; this module has no cross-module
 * dependencies. The capability vocabulary defined here is the CANONICAL one
 * that Worker 3 (experience/connectors) consumes — no duplicate vocabulary
 * may be introduced anywhere else in the repository.
 */
export const moduleName = "agent";

export const requires: [] = [];
