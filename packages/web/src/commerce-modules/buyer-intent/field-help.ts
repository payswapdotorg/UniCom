/**
 * buyer-intent plain-language field help (W1-026 first-journey upgrade).
 *
 * The frozen typed catalog (INTENT_CONSTRAINT_FIELDS in @unicom/experience)
 * stays the source of truth for ids, labels, input kinds and choices. This
 * map adds the missing plain-language layer so a first-time buyer understands
 * what each facet DOES before typing — required by the W1-026 work order §2
 * (deadline, total-cost limit, quality, trust/privacy, delivery/pickup and
 * acceptable substitutes made understandable; every facet stays optional).
 *
 * Presentation-only: no contract change, no new vocabulary, no runtime edge.
 */
import type { IntentConstraintFieldId } from "@unicom/experience";

/** One-line plain-language explanation rendered under each constraint input. */
export const FIELD_HELP: Readonly<Record<IntentConstraintFieldId, string>> = {
  deadline:
    "The last date this still works for you. Every plan is checked against it before anything else — a cheap offer that arrives late is not a win.",
  "time-window":
    "When it may arrive or happen (weekday evenings, before the 15th…). Sellers and plans work around the window you give.",
  "max-total-cost":
    "The all-in ceiling: price + delivery + fees together. A plan above your ceiling never reaches you as an option.",
  "min-quality":
    "The floor you can accept: any, solid or premium. Anything below your floor is filtered out before you see it.",
  "seller-credibility-threshold":
    "How much you need to trust the seller: any, verified, or top-rated. Verified sellers carry checked identity and history.",
  "privacy-requirements":
    "What sellers may do with your data (e.g. no data resale, no third-party sharing). Your term travels with the intent.",
  "security-requirements":
    "Protection you require in transit and at hand-off (e.g. proof of delivery, signature).",
  "delivery-pickup-constraints":
    "How it must reach you: delivered, pickup, or either. Plans with timing you cannot accept are filtered out.",
  location:
    "Where you are or where it must go — used for local pickup, nearby stock and delivery zones.",
  condition:
    "The state of the item you accept: new, like-new, or used-ok. Widening this can widen your options.",
  "acceptable-substitutes":
    "What you would happily take instead (similar models, other brands, a different finish). Substitutes widen your options — you decide what counts as instead.",
  "buy-vs-wait-tolerance":
    "Whether waiting for a likely lower price is acceptable for you. Guidance about waiting is predictive — never a promise.",
  "financing-preference":
    "Whether paying over time (installments) is acceptable, and any terms you need.",
  "proof-requirements":
    "The evidence you want for what happened: none, a receipt, or stronger proof (signed/carried receipts).",
  "recourse-requirements":
    "Your protection if something goes wrong: none, refundable, or insured. Stronger recourse can rule some cheap offers out.",
  "group-buy-willingness":
    "Whether teaming up with other buyers for a group discount is acceptable. Interest is never a commitment — you confirm before anything binds.",
  "trade-swap-willingness":
    "Whether trading something you own counts as a path. Every leg needs your explicit consent; nothing is committed silently.",
};

/** The six facets the W1-026 work order names as the buyer essentials. */
export const ESSENTIAL_FIELD_IDS: readonly IntentConstraintFieldId[] = [
  "deadline",
  "max-total-cost",
  "min-quality",
  "seller-credibility-threshold",
  "privacy-requirements",
  "delivery-pickup-constraints",
  "acceptable-substitutes",
];
