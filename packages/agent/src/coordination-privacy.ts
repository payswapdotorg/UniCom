/**
 * Privacy-aware coordination contracts (FROZEN-ARCHITECTURE §7, §22.2;
 * invariant 48; W2-003 scenario 4).
 *
 * Minimum-necessary disclosure at every coordination step: a recipient's
 * view is built by copying ONLY the fields the disclosure policy allows for
 * that recipient kind — anything else is a typed violation. Cross-principal
 * inference resistance is auditable: `adversarialReconstruction` models an
 * observer holding every disclosed view and reports which raw buyer-intent
 * facts are attributable beyond the contract's explicit disclosures
 * (identity material, unique-value bindings, combination attacks).
 */

import type { BuyerCommerceIntent } from "./intent.js";

// ---------------------------------------------------------------------------
// Leaf walking (deterministic, path-addressed)
// ---------------------------------------------------------------------------

export interface LeafEntry {
  readonly path: string;
  readonly value: string | number | boolean;
}

/** Collect scalar leaves with JSON-path-style addresses. Deterministic order. */
export function collectLeaves(value: unknown, basePath = "$"): readonly LeafEntry[] {
  if (value === null || value === undefined) return [];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return [{ path: basePath, value }];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => collectLeaves(entry, `${basePath}[${index}]`));
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .flatMap(([key, child]) => collectLeaves(child, `${basePath}.${key}`));
  }
  return [];
}

// ---------------------------------------------------------------------------
// Raw buyer-intent inventory (what an adversary wants to reconstruct)
// ---------------------------------------------------------------------------

export interface RawIntentField {
  readonly intentId: string;
  readonly fieldPath: string;
  readonly value: string;
}

/**
 * Every raw scalar field of a set of buyer intents: identity, desired
 * references and every hard-constraint leaf. These are the facts an
 * adversarial observer must NOT be able to attribute beyond contract.
 */
export function rawIntentFieldInventory(intents: readonly BuyerCommerceIntent[]): readonly RawIntentField[] {
  const inventory: RawIntentField[] = [];
  for (const intent of intents) {
    const push = (fieldPath: string, value: string) => inventory.push({ intentId: intent.intentId, fieldPath, value });
    push("intentId", intent.intentId);
    push("buyerRef.principalId", intent.buyerRef.principalId);
    for (const desired of intent.desired) push("desired", desired);
    const hard = intent.hardConstraints;
    if (hard.deadline !== undefined) push("hardConstraints.deadline", hard.deadline);
    if (hard.timeWindow !== undefined) {
      push("hardConstraints.timeWindow.notBefore", hard.timeWindow.notBefore);
      push("hardConstraints.timeWindow.notAfter", hard.timeWindow.notAfter);
    }
    if (hard.maxTotalCost !== undefined) {
      push("hardConstraints.maxTotalCost.currency", hard.maxTotalCost.currency);
      push("hardConstraints.maxTotalCost.minorUnits", hard.maxTotalCost.minorUnits);
    }
    if (hard.minQuality !== undefined) {
      if (hard.minQuality.minAverageRating !== undefined) {
        push("hardConstraints.minQuality.minAverageRating", String(hard.minQuality.minAverageRating));
      }
      if (hard.minQuality.minReviewCount !== undefined) {
        push("hardConstraints.minQuality.minReviewCount", String(hard.minQuality.minReviewCount));
      }
      if (hard.minQuality.minCondition !== undefined) push("hardConstraints.minQuality.minCondition", hard.minQuality.minCondition);
    }
    for (const requirement of hard.privacyRequirements ?? []) push("hardConstraints.privacyRequirements", requirement);
    for (const requirement of hard.securityRequirements ?? []) push("hardConstraints.securityRequirements", requirement);
    for (const constraint of hard.deliveryConstraints ?? []) push("hardConstraints.deliveryConstraints.value", constraint.value);
    if (hard.requiredProofLevel !== undefined) push("hardConstraints.requiredProofLevel", hard.requiredProofLevel);
    if (hard.groupBuyWillingness !== undefined) push("hardConstraints.groupBuyWillingness", hard.groupBuyWillingness);
    if (hard.tradeWillingness !== undefined) push("hardConstraints.tradeWillingness", hard.tradeWillingness);
  }
  return inventory;
}

// ---------------------------------------------------------------------------
// Disclosure policy + views (minimum necessary at every step)
// ---------------------------------------------------------------------------

export type CoordinationDisclosureField =
  | "COORDINATION_ID"
  | "COORDINATION_KIND"
  | "PARTICIPANT_COUNT"
  | "MERCHANT_REF"
  | "GROUP_BUY_TERMS"
  | "OPAQUE_ITEM_REFS"
  | "AGGREGATE_DEMAND"
  | "INTEREST_WINDOW";

export type CoordinationRecipientKind = "BUYER_PARTICIPANT" | "MERCHANT" | "OTHER_PARTICIPANT" | "PLATFORM";

export interface CoordinationDisclosurePolicy {
  readonly policyId: string;
  readonly allowedByRecipient: Readonly<Record<CoordinationRecipientKind, readonly CoordinationDisclosureField[]>>;
}

/** Minimum-necessary baseline: each recipient kind sees only what it needs. */
export const MINIMUM_NECESSARY_DISCLOSURE_POLICY: CoordinationDisclosurePolicy = {
  policyId: "coordination-minimum-necessary-v1",
  allowedByRecipient: {
    BUYER_PARTICIPANT: ["COORDINATION_ID", "COORDINATION_KIND", "GROUP_BUY_TERMS", "PARTICIPANT_COUNT", "OPAQUE_ITEM_REFS"],
    MERCHANT: ["COORDINATION_ID", "COORDINATION_KIND", "AGGREGATE_DEMAND", "OPAQUE_ITEM_REFS", "INTEREST_WINDOW", "MERCHANT_REF"],
    OTHER_PARTICIPANT: ["COORDINATION_ID", "COORDINATION_KIND", "GROUP_BUY_TERMS"],
    PLATFORM: [
      "COORDINATION_ID",
      "COORDINATION_KIND",
      "PARTICIPANT_COUNT",
      "MERCHANT_REF",
      "GROUP_BUY_TERMS",
      "OPAQUE_ITEM_REFS",
      "AGGREGATE_DEMAND",
      "INTEREST_WINDOW",
    ],
  },
};

export interface CoordinationDisclosureView {
  readonly coordinationId: string;
  readonly recipientKind: CoordinationRecipientKind;
  /** Only whitelisted keys are ever present in a well-formed view. */
  readonly disclosed: Readonly<Partial<Record<CoordinationDisclosureField, unknown>>>;
}

/**
 * Build a recipient view by copying ONLY the fields the policy allows for
 * the recipient kind — minimum necessary disclosure at every step.
 */
export function discloseCoordination(input: {
  readonly coordinationId: string;
  readonly recipientKind: CoordinationRecipientKind;
  readonly policy: CoordinationDisclosurePolicy;
  readonly material: Readonly<Partial<Record<CoordinationDisclosureField, unknown>>>;
}): CoordinationDisclosureView {
  const allowed = new Set(input.policy.allowedByRecipient[input.recipientKind]);
  const disclosed: Partial<Record<CoordinationDisclosureField, unknown>> = {};
  for (const [field, value] of Object.entries(input.material) as readonly [CoordinationDisclosureField, unknown][]) {
    if (value === undefined) continue;
    if (allowed.has(field)) disclosed[field] = value;
  }
  return { coordinationId: input.coordinationId, recipientKind: input.recipientKind, disclosed };
}

export type DisclosureViolation = { readonly field: string; readonly reason: "UNDISCLOSED_FIELD" };

/** Validate a view against the policy: extra fields are typed violations. */
export function enforceMinimumNecessary(
  view: CoordinationDisclosureView,
  policy: CoordinationDisclosurePolicy,
): { readonly ok: true } | { readonly ok: false; readonly violations: readonly DisclosureViolation[] } {
  const allowed = new Set(policy.allowedByRecipient[view.recipientKind]);
  const violations: DisclosureViolation[] = [];
  for (const field of Object.keys(view.disclosed) as CoordinationDisclosureField[]) {
    if (view.disclosed[field] !== undefined && !allowed.has(field)) {
      violations.push({ field, reason: "UNDISCLOSED_FIELD" });
    }
  }
  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}

// ---------------------------------------------------------------------------
// Adversarial observer (scenario 4)
// ---------------------------------------------------------------------------

export type ObserverAttributionHow = "IDENTITY_MATERIAL_PRESENT" | "UNIQUE_VALUE_BOUND" | "COMBINATION_BOUND";

export interface ObserverAttribution {
  readonly intentId: string;
  readonly fieldPath: string;
  readonly value: string;
  readonly how: ObserverAttributionHow;
}

export interface ObserverReconstruction {
  /** Raw-intent facts attributable BEYOND the explicit disclosure contract. */
  readonly attributions: readonly ObserverAttribution[];
  /** Unique-value observations that fall INSIDE explicitly disclosed fields. */
  readonly permittedObservations: readonly ObserverAttribution[];
}

/**
 * Adversarial observer model: given every disclosed view, which raw
 * buyer-intent facts become attributable?
 * - IDENTITY_MATERIAL_PRESENT: any view leaf equals an intentId/principalId —
 *   every raw fact of that intent is then attributable.
 * - UNIQUE_VALUE_BOUND: a leaf on a NON-permitted path equals a raw value
 *   unique to one intent.
 * - COMBINATION_BOUND: a pair of leaves on NON-permitted paths matches a
 *   value pair unique to one intent.
 * Values on explicitly permitted paths are reported as permitted
 * observations — the contract discloses them by declaration.
 */
export function adversarialReconstruction(input: {
  readonly views: readonly CoordinationDisclosureView[];
  readonly sourceIntents: readonly BuyerCommerceIntent[];
  /** Field paths the contract explicitly discloses (e.g. "desired" item refs). */
  readonly permittedRawFieldPaths: readonly string[];
}): ObserverReconstruction {
  const inventory = rawIntentFieldInventory(input.sourceIntents);
  const leaves = input.views.flatMap((view) => collectLeaves(view.disclosed, `view:${view.coordinationId}`));
  const leafValues = new Set(leaves.map((leaf) => String(leaf.value)));

  const identityValues = new Map<string, string>();
  for (const fact of inventory) {
    if (fact.fieldPath === "intentId" || fact.fieldPath === "buyerRef.principalId") {
      identityValues.set(fact.value, fact.intentId);
    }
  }
  const permittedPaths = new Set(input.permittedRawFieldPaths);
  const valueCounts = new Map<string, number>();
  for (const fact of inventory) valueCounts.set(fact.value, (valueCounts.get(fact.value) ?? 0) + 1);

  const attributions: ObserverAttribution[] = [];
  const permittedObservations: ObserverAttribution[] = [];

  for (const leaf of leaves) {
    const identity = identityValues.get(String(leaf.value));
    if (identity !== undefined) {
      for (const fact of inventory.filter((entry) => entry.intentId === identity)) {
        attributions.push({ intentId: identity, fieldPath: fact.fieldPath, value: fact.value, how: "IDENTITY_MATERIAL_PRESENT" });
      }
      continue;
    }
    if ((valueCounts.get(String(leaf.value)) ?? 0) !== 1) continue;
    const matching = inventory.filter((fact) => fact.value === String(leaf.value));
    for (const fact of matching) {
      if (permittedPaths.has(fact.fieldPath)) {
        permittedObservations.push({ intentId: fact.intentId, fieldPath: fact.fieldPath, value: fact.value, how: "UNIQUE_VALUE_BOUND" });
      } else {
        attributions.push({ intentId: fact.intentId, fieldPath: fact.fieldPath, value: fact.value, how: "UNIQUE_VALUE_BOUND" });
      }
    }
  }

  // Combination attack over non-permitted leaf values (pairs).
  const nonPermittedLeaves = leaves.filter((leaf) => {
    const matching = inventory.filter((fact) => fact.value === String(leaf.value));
    return matching.length > 0 && matching.every((fact) => !permittedPaths.has(fact.fieldPath));
  });
  const intentsById = new Map(input.sourceIntents.map((intent) => [intent.intentId, intent]));
  for (const intent of input.sourceIntents) {
    const facts = inventory.filter((fact) => fact.intentId === intent.intentId && !permittedPaths.has(fact.fieldPath));
    const pairs: [RawIntentField, RawIntentField][] = [];
    for (let i = 0; i < facts.length; i += 1) {
      for (let j = i + 1; j < facts.length; j += 1) pairs.push([facts[i] as RawIntentField, facts[j] as RawIntentField]);
    }
    for (const [left, right] of pairs) {
      if (!leafValues.has(left.value) || !leafValues.has(right.value)) continue;
      const otherIntents = [...intentsById.values()].filter(
        (other) => other.intentId !== intent.intentId && hasPair(inventory, other.intentId, left.value, right.value),
      );
      if (otherIntents.length === 0) {
        for (const fact of [left, right]) {
          if (!nonPermittedLeaves.some((leaf) => String(leaf.value) === fact.value)) continue;
          attributions.push({ intentId: intent.intentId, fieldPath: fact.fieldPath, value: fact.value, how: "COMBINATION_BOUND" });
        }
      }
    }
  }

  return { attributions, permittedObservations };
}

function hasPair(inventory: readonly RawIntentField[], intentId: string, left: string, right: string): boolean {
  const values = new Set(inventory.filter((fact) => fact.intentId === intentId).map((fact) => fact.value));
  return values.has(left) && values.has(right);
}
