/**
 * OPAQUE opportunity references.
 *
 * Worker 2 (Agent / Trust / Lab / Security) owns Opportunity, GroupBuy and
 * TradeCycle objects — their terms, participants, commitments and lifecycle.
 * This package references them ONLY by branded id + a minimal link shape.
 * DO NOT model opportunity semantics here; the typed seam is a later stage.
 */
import type { GroupBuyId, OpportunityId, TradeCycleId } from "./ids.js";

export type OpportunityReferenceKind = "OPPORTUNITY" | "GROUP_BUY" | "TRADE_CYCLE";

/**
 * How a commerce record relates to the referenced coordination object.
 * "SOURCE"  — the commerce record originated from the opportunity.
 * "SATISFIES" — the commerce record fulfills it (e.g. an order satisfying a group-buy).
 * "RESULT"  — the commerce record was produced by executing it (e.g. a trade-cycle leg).
 */
export type OpportunityLinkRole = "SOURCE" | "SATISFIES" | "RESULT";

/** Minimal, opaque link from a commerce record to a coordination object. */
export interface OpportunityReference {
  readonly kind: OpportunityReferenceKind;
  readonly ref: OpportunityId | GroupBuyId | TradeCycleId;
  readonly role: OpportunityLinkRole;
}

export function opportunityReferenceKey(reference: OpportunityReference): string {
  const id: string = reference.ref;
  return `${reference.kind}:${id}`;
}

export function opportunityReferenceEquals(a: OpportunityReference, b: OpportunityReference): boolean {
  return a.kind === b.kind && a.role === b.role && opportunityReferenceKey(a) === opportunityReferenceKey(b);
}
