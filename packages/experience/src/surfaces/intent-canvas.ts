/**
 * Buyer Intent Canvas (docs/UX-DEPLOYMENT.md §2, FROZEN-ARCHITECTURE §5).
 *
 * The buyer starts with intent, not a product category. The canvas contract
 * covers the CONSTRAINT EDITOR surface and the hand-off of the draft intent.
 * The canonical `BuyerCommerceIntent` object is owned by `@unicom/agent`
 * (W2-001): this surface describes editable facets and hands off an opaque
 * reference — it never re-defines intent semantics structurally.
 */

import type { BuyerCommerceIntentRef, StrategyRef } from "../common/opaque-refs";
import type { EvidenceReference } from "../common/evidence";
import type { UtcIso8601String } from "../common/values";

/** Editable intent constraint facets (UI mirror of @unicom/agent facets). */
export type IntentConstraintFieldId =
  | "deadline"
  | "time-window"
  | "max-total-cost"
  | "min-quality"
  | "seller-credibility-threshold"
  | "privacy-requirements"
  | "security-requirements"
  | "delivery-pickup-constraints"
  | "location"
  | "condition"
  | "acceptable-substitutes"
  | "buy-vs-wait-tolerance"
  | "financing-preference"
  | "proof-requirements"
  | "recourse-requirements"
  | "group-buy-willingness"
  | "trade-swap-willingness";

/** Input widget used to edit a constraint facet. */
export type IntentConstraintInputKind =
  | "text"
  | "number"
  | "date"
  | "range"
  | "choice"
  | "toggle"
  | "location";

/** Descriptor of one editable constraint field on the canvas. */
export interface IntentConstraintFieldDescriptor {
  readonly fieldId: IntentConstraintFieldId;
  readonly userLabel: string;
  readonly inputKind: IntentConstraintInputKind;
  readonly placeholderExample: string;
  readonly choices?: readonly string[];
}

/** The full constraint editor catalog (17 facets, FROZEN §5). */
export const INTENT_CONSTRAINT_FIELDS: readonly IntentConstraintFieldDescriptor[] = [
  { fieldId: "deadline", userLabel: "Needed by", inputKind: "date", placeholderExample: "by next Monday" },
  { fieldId: "time-window", userLabel: "Time window", inputKind: "text", placeholderExample: "weekday evenings" },
  { fieldId: "max-total-cost", userLabel: "Total budget", inputKind: "text", placeholderExample: "at most $1,500 all-in" },
  { fieldId: "min-quality", userLabel: "Quality", inputKind: "choice", placeholderExample: "reliable, well-reviewed", choices: ["any", "solid", "premium"] },
  { fieldId: "seller-credibility-threshold", userLabel: "Seller trust", inputKind: "choice", placeholderExample: "established sellers", choices: ["any", "verified", "top-rated"] },
  { fieldId: "privacy-requirements", userLabel: "Privacy", inputKind: "text", placeholderExample: "no data resale" },
  { fieldId: "security-requirements", userLabel: "Security", inputKind: "text", placeholderExample: "proof of delivery" },
  { fieldId: "delivery-pickup-constraints", userLabel: "Delivery or pickup", inputKind: "choice", placeholderExample: "delivered", choices: ["delivery", "pickup", "either"] },
  { fieldId: "location", userLabel: "Location", inputKind: "location", placeholderExample: "near me" },
  { fieldId: "condition", userLabel: "Condition", inputKind: "choice", placeholderExample: "new", choices: ["new", "like-new", "used-ok"] },
  { fieldId: "acceptable-substitutes", userLabel: "Alternatives", inputKind: "text", placeholderExample: "similar models fine" },
  { fieldId: "buy-vs-wait-tolerance", userLabel: "Buy or wait", inputKind: "toggle", placeholderExample: "wait if a drop is likely" },
  { fieldId: "financing-preference", userLabel: "Payment plan", inputKind: "toggle", placeholderExample: "installments okay" },
  { fieldId: "proof-requirements", userLabel: "Proof needed", inputKind: "choice", placeholderExample: "receipt", choices: ["none", "receipt", "stronger"] },
  { fieldId: "recourse-requirements", userLabel: "Protection needed", inputKind: "choice", placeholderExample: "refundable", choices: ["none", "refundable", "insured"] },
  { fieldId: "group-buy-willingness", userLabel: "Group deal", inputKind: "toggle", placeholderExample: "team up with others" },
  { fieldId: "trade-swap-willingness", userLabel: "Swap", inputKind: "toggle", placeholderExample: "trade what I own" },
];

/** Draft intent awaiting parsing into the canonical intent (Worker 2). */
export interface IntentDraftSubmission {
  readonly draftId: string;
  readonly rawIntent: string;
  readonly constraintHints: readonly IntentConstraintFieldId[];
  readonly submittedAt: UtcIso8601String;
  /** Hand-off to the canonical BuyerCommerceIntent once parsed (W2 lane). */
  readonly parsedIntentRef?: BuyerCommerceIntentRef;
}

/** Buy-now vs wait guidance rendered on the canvas (predictive truth). */
export interface WaitOrBuyGuidance {
  readonly truthClass: "predictive";
  readonly recommendation: "buy-now" | "wait" | "no-clear-answer";
  readonly reasoningSummary: string;
  readonly expectedSavingNote?: string;
  readonly deadlineRiskNote?: string;
  readonly evidence: readonly EvidenceReference[];
}

/** Plan option card presented on the canvas. */
export interface IntentPlanOption {
  readonly optionId: string;
  readonly userLabel: string;
  readonly summary: string;
  readonly kind:
    | "buy-now"
    | "wait-for-price"
    | "wait-for-inventory"
    | "group-with-others"
    | "propose-group-deal"
    | "negotiate"
    | "substitute"
    | "buy-locally"
    | "rent-or-borrow"
    | "resell-existing"
    | "multi-person-swap";
  readonly strategyRef: StrategyRef;
  readonly predictedOutcome: WaitOrBuyGuidance;
}

/** The Intent Canvas view contract. */
export interface IntentCanvasView {
  readonly draft: IntentDraftSubmission;
  readonly constraintFields: readonly IntentConstraintFieldDescriptor[];
  readonly planOptions: readonly IntentPlanOption[];
  readonly waitOrBuy: WaitOrBuyGuidance;
}
