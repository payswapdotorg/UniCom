/**
 * Opportunity Inbox (docs/UX-DEPLOYMENT.md §4, FROZEN-ARCHITECTURE §8).
 *
 * Users see opportunities unrelated to their current task: resale, rental,
 * trade, group-buy, price timing, discounts, loyalty, unused inventory or
 * subscriptions, local opportunities. Every item MUST distinguish factual
 * observation, inference, prediction and recommendation (INVARIANT 30).
 * The canonical `Opportunity` object is owned by `@unicom/agent` (W2);
 * `category` below is a presentation label, not a second model.
 */

import type { OpportunityRef, PrincipalRef } from "../common/opaque-refs";
import type { EvidenceReference } from "../common/evidence";
import type { UtcIso8601String } from "../common/values";

/** Presentation categories for inbox items (canonical semantics are W2's). */
export type OpportunityCategoryLabel =
  | "resale"
  | "rental"
  | "swap"
  | "group-deal"
  | "discount"
  | "price-timing"
  | "unused-subscription"
  | "warranty-recovery"
  | "local-logistics"
  | "loyalty"
  | "other";

/**
 * Disclosure: separates observation (fact), inference, prediction and
 * recommendation. `observation` is required so users always see the factual
 * basis; the rest are optional and explicitly labeled.
 */
export interface OpportunityDisclosure {
  readonly observation: string;
  readonly inference?: string;
  readonly prediction?: {
    readonly summary: string;
    readonly truthClass: "predictive";
    readonly confidenceNote: string;
  };
  readonly recommendation?: string;
}

/** User-facing lifecycle of an inbox item. */
export type OpportunityItemStatus =
  | "new"
  | "seen"
  | "interested"
  | "dismissed"
  | "acted-on"
  | "expired"
  | "unknown";

/** One inbox item. */
export interface OpportunityInboxItem {
  readonly itemId: string;
  readonly opportunityRef: OpportunityRef;
  readonly category: OpportunityCategoryLabel;
  readonly title: string;
  readonly summary: string;
  readonly disclosure: OpportunityDisclosure;
  readonly status: OpportunityItemStatus;
  readonly estimatedValueNote?: string;
  readonly requiresAuthorization: boolean;
  readonly evidence: readonly EvidenceReference[];
  readonly surfacedAt: UtcIso8601String;
}

/** The Opportunity Inbox view contract. */
export interface OpportunityInboxView {
  readonly items: readonly OpportunityInboxItem[];
  readonly viewer: PrincipalRef;
  readonly categoryFilters: readonly OpportunityCategoryLabel[];
  readonly contextualHints: readonly {
    readonly hintId: string;
    readonly message: string;
    readonly relatedItemIds: readonly string[];
  }[];
}
