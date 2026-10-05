/**
 * Subscriptions: recurring commerce with deterministic billing state.
 */
import type { CustomerId, SubscriptionId, SubscriptionPlanId } from "./ids.js";
import { nextRevision } from "./events.js";
import { err, ok, type Result } from "./result.js";
import type { Money } from "./money.js";

export type BillingPeriod = "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";

export interface SubscriptionPlan {
  readonly planId: SubscriptionPlanId;
  readonly recurringPrice: Money;
  readonly period: BillingPeriod;
  /** Trial length in periods (0 = none). */
  readonly trialPeriods?: number;
}

export type SubscriptionState =
  | "PENDING"
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "PAUSED"
  | "CANCELLED"
  | "EXPIRED";

export type SubscriptionTrigger =
  | "START_TRIAL"
  | "ACTIVATE"
  | "PAYMENT_FAILED"
  | "PAYMENT_RECOVERED"
  | "PAUSE"
  | "RESUME"
  | "CANCEL"
  | "EXPIRE";

export type SubscriptionTransitionError = {
  code: "INVALID_SUBSCRIPTION_TRANSITION";
  from: SubscriptionState;
  trigger: SubscriptionTrigger;
};

/**
 * Deterministic subscription lifecycle. PAST_DUE is a preserved
 * customer-action-required state (never collapsed to CANCELLED).
 */
export function subscriptionTransition(
  state: SubscriptionState,
  trigger: SubscriptionTrigger,
): Result<SubscriptionState, SubscriptionTransitionError> {
  const table: Record<SubscriptionState, Partial<Record<SubscriptionTrigger, SubscriptionState>>> = {
    PENDING: { START_TRIAL: "TRIALING", ACTIVATE: "ACTIVE", CANCEL: "CANCELLED" },
    TRIALING: { ACTIVATE: "ACTIVE", CANCEL: "CANCELLED", EXPIRE: "EXPIRED" },
    ACTIVE: { PAYMENT_FAILED: "PAST_DUE", PAUSE: "PAUSED", CANCEL: "CANCELLED", EXPIRE: "EXPIRED" },
    PAST_DUE: { PAYMENT_RECOVERED: "ACTIVE", CANCEL: "CANCELLED", EXPIRE: "EXPIRED" },
    PAUSED: { RESUME: "ACTIVE", CANCEL: "CANCELLED", EXPIRE: "EXPIRED" },
    CANCELLED: {},
    EXPIRED: {},
  };
  const next = table[state][trigger];
  if (next === undefined) return err({ code: "INVALID_SUBSCRIPTION_TRANSITION", from: state, trigger });
  return ok(next);
}

export interface Subscription {
  readonly subscriptionId: SubscriptionId;
  readonly customerId: CustomerId;
  readonly planId: SubscriptionPlanId;
  readonly state: SubscriptionState;
  readonly currentPeriodStart?: string;
  readonly currentPeriodEnd?: string;
  readonly nextBillingAt?: string;
  readonly revision: number;
}

export function advanceSubscription(
  subscription: Subscription,
  trigger: SubscriptionTrigger,
): Result<Subscription, SubscriptionTransitionError> {
  const next = subscriptionTransition(subscription.state, trigger);
  if (!next.ok) return next;
  return ok({ ...subscription, state: next.value, revision: nextRevision(subscription.revision) });
}

/** Deterministic plan-shape validation. */
export function isValidSubscriptionPlan(plan: SubscriptionPlan): boolean {
  return (
    plan.recurringPrice.currency.length === 3 &&
    BigInt(plan.recurringPrice.amountMinor) >= 0n &&
    (plan.trialPeriods ?? 0) >= 0
  );
}
