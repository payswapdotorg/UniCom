/**
 * W1-007 marketing campaigns: lifecycle contracts beyond the existing
 * pricing/promotions core (domain/pricing.ts).
 *
 * A Campaign is a journaled lifecycle object that WRAPS a PromotionRule (from
 * the certified pricing path) as its economic effect. The campaign carries
 * state (draft → scheduled → active → paused → completed/retired); the rule
 * carries the deterministic discount math. Stacking/exclusivity is an explicit
 * policy contract — never a silent accumulation.
 *
 * Laws (W1-007 §truth distinctions):
 * - Campaigns are deterministic kernel state + journaled evidence — agents may
 *   PROPOSE (via the existing opportunity/command paths), never mutate truth.
 * - Eligibility + application are deterministic (same inputs → same outcome);
 * - No floating-point money, no hidden ledgers (INVARIANT 14, 21);
 * - Stacking/exclusivity is an explicit policy (reject cases are first-class).
 */
import type {
  CampaignEffectId,
  CampaignId,
  MerchantId,
  SkuId,
} from "./ids.js";
import type { Money } from "./money.js";
import { currency, money } from "./money.js";
import type { PromotionRule } from "./pricing.js";
import { applyPromotionRule } from "./pricing.js";
import type { RoundingMode } from "./decimal.js";
import { nextRevision } from "./events.js";
import { err, ok, type Result } from "./result.js";

/** Campaign lifecycle states (W1-007 §scope 1). */
export type CampaignState =
  | "DRAFT"
  | "SCHEDULED"
  | "ACTIVE"
  | "PAUSED"
  | "COMPLETED"
  | "RETIRED";

/** Deterministic lifecycle triggers. */
export type CampaignTrigger =
  | "SCHEDULE"
  | "ACTIVATE"
  | "PAUSE"
  | "RESUME"
  | "COMPLETE"
  | "RETIRE";

export type CampaignTransitionError = {
  readonly code: "INVALID_CAMPAIGN_TRANSITION";
  readonly from: CampaignState;
  readonly trigger: CampaignTrigger;
};

/**
 * Deterministic campaign lifecycle.
 * DRAFT → SCHEDULED → ACTIVE ↔ PAUSED → COMPLETED → RETIRED.
 * RETIRED is reachable from any non-terminal state (kill switch).
 */
export function campaignTransition(
  state: CampaignState,
  trigger: CampaignTrigger,
): Result<CampaignState, CampaignTransitionError> {
  const table: Record<CampaignState, Partial<Record<CampaignTrigger, CampaignState>>> = {
    DRAFT: { SCHEDULE: "SCHEDULED", ACTIVATE: "ACTIVE", RETIRE: "RETIRED" },
    SCHEDULED: { ACTIVATE: "ACTIVE", RETIRE: "RETIRED" },
    ACTIVE: { PAUSE: "PAUSED", COMPLETE: "COMPLETED", RETIRE: "RETIRED" },
    PAUSED: { RESUME: "ACTIVE", COMPLETE: "COMPLETED", RETIRE: "RETIRED" },
    COMPLETED: { RETIRE: "RETIRED" },
    RETIRED: {},
  };
  const next = table[state][trigger];
  if (next === undefined) return err({ code: "INVALID_CAMPAIGN_TRANSITION", from: state, trigger });
  return ok(next);
}

/** How multiple campaigns combine on the same line/cart. */
export type CampaignStackingMode =
  | "STACKABLE"
  | "EXCLUSIVE";

/** Explicit stacking policy — never a silent accumulation. */
export interface CampaignStackingPolicy {
  readonly mode: CampaignStackingMode;
  /** When EXCLUSIVE, the highest-priority applicable campaign wins. */
  readonly priorityOrder?: readonly CampaignId[];
}

export type CampaignEligibilityError =
  | { code: "CAMPAIGN_NOT_ACTIVE"; state: CampaignState }
  | { code: "SKU_NOT_IN_SCOPE"; skuId: SkuId }
  | { code: "WINDOW_NOT_OPEN"; scheduledStart?: string; scheduledEnd?: string; now: string };

/** A campaign wraps a certified PromotionRule with lifecycle + scope. */
export interface Campaign {
  readonly campaignId: CampaignId;
  readonly merchantId: MerchantId;
  readonly title: string;
  readonly rule: PromotionRule;
  readonly state: CampaignState;
  /** Restriction to SKUs; empty/undefined = catalog-wide. */
  readonly appliesToSkuIds?: readonly SkuId[];
  readonly stackable: boolean;
  readonly scheduledStart?: string;
  readonly scheduledEnd?: string;
  readonly revision: number;
}

export function advanceCampaign(
  campaign: Campaign,
  trigger: CampaignTrigger,
): Result<Campaign, CampaignTransitionError> {
  const next = campaignTransition(campaign.state, trigger);
  if (!next.ok) return next;
  return ok({ ...campaign, state: next.value, revision: nextRevision(campaign.revision) });
}

/** Deterministic eligibility check — same inputs always produce the same verdict. */
export function isCampaignEligible(
  campaign: Campaign,
  skuId: SkuId,
  now: string,
): Result<true, CampaignEligibilityError> {
  if (campaign.state !== "ACTIVE") return err({ code: "CAMPAIGN_NOT_ACTIVE", state: campaign.state });
  if (campaign.appliesToSkuIds && campaign.appliesToSkuIds.length > 0) {
    if (!campaign.appliesToSkuIds.includes(skuId)) return err({ code: "SKU_NOT_IN_SCOPE", skuId });
  }
  if (campaign.scheduledStart && now < campaign.scheduledStart) {
    return err({ code: "WINDOW_NOT_OPEN", scheduledStart: campaign.scheduledStart, scheduledEnd: campaign.scheduledEnd, now });
  }
  if (campaign.scheduledEnd && now > campaign.scheduledEnd) {
    return err({ code: "WINDOW_NOT_OPEN", scheduledStart: campaign.scheduledStart, scheduledEnd: campaign.scheduledEnd, now });
  }
  return ok(true);
}

/** A journaled campaign-effect record (evidence for every application). */
export interface CampaignEffect {
  readonly effectId: CampaignEffectId;
  readonly campaignId: CampaignId;
  readonly skuId: SkuId;
  readonly gross: Money;
  readonly discount: Money;
  readonly net: Money;
  readonly appliedAt: string;
  readonly revision: number;
}

export type CampaignApplicationError =
  | { code: "CAMPAIGN_NOT_ELIGIBLE"; detail: CampaignEligibilityError }
  | { code: "PROMOTION_RULE_ERROR"; detail: string };

/**
 * Deterministic campaign-effect application — wraps the certified
 * applyPromotionRule with lifecycle/scope checks. The effect is RETURNED (not
 * applied in-place); the kernel journals it as an immutable evidence fact.
 */
export function applyCampaignEffect(
  campaign: Campaign,
  skuId: SkuId,
  lineAmount: Money,
  now: string,
  rounding: RoundingMode,
): Result<CampaignEffect, CampaignApplicationError> {
  const eligibility = isCampaignEligible(campaign, skuId, now);
  if (!eligibility.ok) return err({ code: "CAMPAIGN_NOT_ELIGIBLE", detail: eligibility.error });
  const application = applyPromotionRule(lineAmount, campaign.rule, rounding);
  if (!application.ok) return err({ code: "PROMOTION_RULE_ERROR", detail: application.error.code });
  const result = application.value;
  return ok({
    effectId: "" as CampaignEffectId, // kernel mints the real id at journal time
    campaignId: campaign.campaignId,
    skuId,
    gross: result.gross,
    discount: result.discount,
    net: result.net,
    appliedAt: now,
    revision: 1,
  });
}

/**
 * Deterministic stacking resolution — applies the policy to a set of candidate
 * effects on the same line. STACKABLE: all effects accumulate (discounts sum,
 * net floor at zero). EXCLUSIVE: only the highest-priority (or first) effect
 * survives; the rest are rejected (first-class rejection evidence).
 */
export type StackingResolution = {
  readonly accepted: readonly CampaignEffect[];
  readonly rejected: readonly { effect: CampaignEffect; reason: "EXCLUSIVE_POLICY" }[];
  readonly totalDiscount: Money;
};

export function resolveStacking(
  effects: readonly CampaignEffect[],
  policy: CampaignStackingPolicy,
): StackingResolution {
  if (effects.length === 0) {
    return { accepted: [], rejected: [], totalDiscount: money("0", currency("USD")) };
  }
  const code = effects[0]!.discount.currency;
  if (policy.mode === "STACKABLE") {
    let totalMinor = 0n;
    for (const effect of effects) totalMinor += BigInt(effect.discount.amountMinor);
    const grossMinor = BigInt(effects[0]!.gross.amountMinor);
    if (totalMinor > grossMinor) totalMinor = grossMinor;
    return {
      accepted: effects,
      rejected: [],
      totalDiscount: money(totalMinor.toString(), code),
    };
  }
  // EXCLUSIVE: pick by priority order, else first applicable.
  let winner: CampaignEffect | undefined;
  if (policy.priorityOrder) {
    for (const cid of policy.priorityOrder) {
      winner = effects.find((e) => e.campaignId === cid);
      if (winner) break;
    }
  }
  if (!winner) winner = effects[0];
  const accepted = winner ? [winner] : [];
  const rejected = effects.filter((e) => e !== winner).map((effect) => ({ effect, reason: "EXCLUSIVE_POLICY" as const }));
  return {
    accepted,
    rejected,
    totalDiscount: winner ? winner.discount : money("0", code),
  };
}
