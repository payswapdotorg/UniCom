/**
 * GroupBuy formation aggregate (W1-012, additive): the canonical kernel truth
 * for latent-demand group-buy proposals and their formation into deals.
 * Before this file the rendered UIs kept formation outcomes in local demo
 * state (no group-buy kernel aggregate existed).
 *
 * Kernel laws enforced here:
 * - INTEREST IS NEVER COMMITMENT: a recorded interest is a share with consent
 *   terms only. A commitment could exist solely on the commerce planes after
 *   the SECOND confirmation — formation with final terms — and this aggregate
 *   never creates one.
 * - Withdrawal is permitted any time before the second confirmation (i.e.
 *   while the pool is PENDING / MONITORING / HELD — never after FORMED).
 * - Threshold-met pools are HELD awaiting the organizer's EXPLICIT formation
 *   step; formation never happens automatically, and a HELD pool that falls
 *   back below the threshold honestly returns to MONITORING.
 * - FORMED freezes the final terms (exact group price + exact pool value) and
 *   the roster of CONSENTING-ONLY participants (live, non-withdrawn interest).
 * - Exact money only (Money, integer minor units); quantities via the exact
 *   CountQuantity vocabulary; deterministic Result-returning transitions;
 *   interest is recorded per participant, each with their own consent terms.
 */
import type { GroupBuyId, SkuId } from "./ids.js";
import { nextRevision } from "./events.js";
import { multiplyMoneyByInteger, type Money } from "./money.js";
import type { CountQuantity } from "./quantity.js";
import type { PrincipalRef } from "./principals.js";
import { principalRefEquals } from "./principals.js";
import { err, ok, type Result } from "./result.js";

/** Aggregate lifecycle. PENDING/COUNTERED/REJECTED/EXPIRED are proposal states; MONITORING/HELD/FORMED/CLOSED are pool states (ACCEPT moves the proposal into threshold MONITORING). */
export type GroupBuyFormationState =
  | "PENDING"
  | "COUNTERED"
  | "REJECTED"
  | "EXPIRED"
  | "MONITORING"
  | "HELD"
  | "FORMED"
  | "CLOSED";

/** Deterministic lifecycle triggers. THRESHOLD_MET/THRESHOLD_LOST are derived from the live interest pool, never dispatched directly. */
export type GroupBuyTrigger =
  | "ACCEPT"
  | "ACCEPT_COUNTER"
  | "COUNTER"
  | "REJECT"
  | "THRESHOLD_MET"
  | "THRESHOLD_LOST"
  | "FORM"
  | "EXPIRE"
  | "CLOSE";

export type GroupBuyTransitionError = {
  readonly code: "INVALID_GROUP_BUY_TRANSITION";
  readonly from: GroupBuyFormationState;
  readonly trigger: GroupBuyTrigger;
};

/** Pool thresholds: BOTH the participant count and the unit count must be met. */
export interface GroupBuyThreshold {
  /** Minimum distinct consenting participants (studios). */
  readonly minimumParticipants: number;
  /** Minimum total consenting units (e.g. boxes). */
  readonly minimumUnits: number;
}

/** The proposed terms a latent-demand pool carries onto the organizer's desk. */
export interface GroupBuyProposalTerms {
  readonly skuRef: SkuId;
  /** Proposed per-unit group price (exact). */
  readonly proposedUnitPrice: Money;
  /** List per-unit price for comparison (exact, same currency). */
  readonly listUnitPrice: Money;
  readonly threshold: GroupBuyThreshold;
  /** Pool window close (e.g. the Oct 20 18:00 close); expiry is honest at/after it. */
  readonly windowClosesAt: string;
  readonly eligibilityNote?: string;
}

/** A deterministic counter option the organizer may send instead of accept/reject. */
export interface GroupBuyCounterTerms {
  readonly unitPrice: Money;
  readonly minimumUnits: number;
  readonly note?: string;
}

/** Frozen final terms of a formed group buy (the second confirmation). */
export interface GroupBuyFormationTerms {
  /** Final per-unit group price (exact). */
  readonly groupPrice: Money;
  /** groupPrice × total consenting units — exact, computed at formation. */
  readonly poolValue: Money;
  readonly formedAt: string;
}

/** One consenting participant's frozen share in a formed group buy. */
export interface GroupBuyParticipantShare {
  readonly participantRef: PrincipalRef;
  readonly quantity: CountQuantity;
}

/**
 * Per-participant interest. INTEREST IS NEVER COMMITMENT: `consentTerms` is
 * the text the participant agreed to when expressing interest — it records
 * what a future commitment WOULD mean, never that one exists.
 */
export interface GroupBuyInterestRecord {
  readonly groupBuyId: GroupBuyId;
  readonly participantRef: PrincipalRef;
  readonly quantity: CountQuantity;
  readonly consentTerms: string;
  readonly state: "EXPRESSED" | "WITHDRAWN";
  readonly recordedAt: string;
  readonly revision: number;
}

export interface GroupBuyAggregate {
  readonly groupBuyId: GroupBuyId;
  /** The principal that opened the proposal (buyer side). */
  readonly initiatorRef: PrincipalRef;
  /** The organizer (merchant) whose desk the proposal lands on; formation authority. */
  readonly organizerRef: PrincipalRef;
  readonly terms: GroupBuyProposalTerms;
  readonly state: GroupBuyFormationState;
  readonly openedAt: string;
  /** Present while COUNTERED (and after ACCEPT_COUNTER — the accepted counter is the evidence). */
  readonly counterTerms?: GroupBuyCounterTerms;
  readonly rejectionReason?: string;
  /** Present once FORMED: final terms + consenting-only participant roster. */
  readonly formation?: GroupBuyFormationTerms;
  readonly participants: readonly GroupBuyParticipantShare[];
  readonly revision: number;
}

/** Deterministic lifecycle table. REJECTED/EXPIRED/CLOSED are terminal. */
export function groupBuyTransition(
  state: GroupBuyFormationState,
  trigger: GroupBuyTrigger,
): Result<GroupBuyFormationState, GroupBuyTransitionError> {
  const table: Record<GroupBuyFormationState, Partial<Record<GroupBuyTrigger, GroupBuyFormationState>>> = {
    PENDING: { ACCEPT: "MONITORING", COUNTER: "COUNTERED", REJECT: "REJECTED", EXPIRE: "EXPIRED" },
    COUNTERED: { ACCEPT_COUNTER: "MONITORING", REJECT: "REJECTED", EXPIRE: "EXPIRED" },
    MONITORING: { THRESHOLD_MET: "HELD", EXPIRE: "EXPIRED", CLOSE: "CLOSED" },
    HELD: { THRESHOLD_LOST: "MONITORING", FORM: "FORMED", EXPIRE: "EXPIRED", CLOSE: "CLOSED" },
    FORMED: { CLOSE: "CLOSED" },
    REJECTED: {},
    EXPIRED: {},
    CLOSED: {},
  };
  const next = table[state][trigger];
  if (next === undefined) return err({ code: "INVALID_GROUP_BUY_TRANSITION", from: state, trigger });
  return ok(next);
}

/** Live (non-withdrawn) interest records of one pool. */
export function liveGroupBuyInterests(
  interests: readonly GroupBuyInterestRecord[],
): readonly GroupBuyInterestRecord[] {
  return interests.filter((interest) => interest.state === "EXPRESSED");
}

/** Total live consenting units (exact integer sum). */
export function poolUnitsOf(interests: readonly GroupBuyInterestRecord[]): number {
  return liveGroupBuyInterests(interests).reduce((total, interest) => total + interest.quantity.units, 0);
}

/** Distinct live consenting participants. */
export function poolParticipantCountOf(interests: readonly GroupBuyInterestRecord[]): number {
  return liveGroupBuyInterests(interests).length;
}

/** BOTH thresholds met (participants and units). */
export function groupBuyThresholdMet(
  threshold: GroupBuyThreshold,
  interests: readonly GroupBuyInterestRecord[],
): boolean {
  return poolParticipantCountOf(interests) >= threshold.minimumParticipants && poolUnitsOf(interests) >= threshold.minimumUnits;
}

/** Exact pool value of the live consenting interests at `groupPrice` (integer multiply). */
export function groupBuyPoolValue(groupPrice: Money, interests: readonly GroupBuyInterestRecord[]): Money {
  return multiplyMoneyByInteger(groupPrice, poolUnitsOf(interests));
}

export type GroupBuyInterestError =
  | { readonly code: "GROUP_BUY_NOT_OPEN_FOR_INTEREST"; readonly state: GroupBuyFormationState }
  | { readonly code: "INTEREST_ALREADY_EXPRESSED"; readonly participantRef: PrincipalRef }
  | { readonly code: "NO_LIVE_INTEREST"; readonly participantRef: PrincipalRef }
  | { readonly code: "INVALID_INTEREST_UNITS"; readonly units: number }
  | { readonly code: "INVALID_CONSENT_TERMS" };

/**
 * Record (or re-express after withdrawal) one participant's interest, then
 * reconcile the derived threshold states: MONITORING→HELD when the pool now
 * meets BOTH thresholds. Interest is never commitment — this only ever grows
 * the interested list.
 */
export function recordGroupBuyInterest(
  groupBuy: GroupBuyAggregate,
  interests: readonly GroupBuyInterestRecord[],
  interest: {
    readonly participantRef: PrincipalRef;
    readonly quantity: CountQuantity;
    readonly consentTerms: string;
    readonly recordedAt: string;
  },
): Result<{ readonly groupBuy: GroupBuyAggregate; readonly interest: GroupBuyInterestRecord }, GroupBuyInterestError> {
  if (groupBuy.state !== "PENDING" && groupBuy.state !== "MONITORING" && groupBuy.state !== "HELD") {
    return err({ code: "GROUP_BUY_NOT_OPEN_FOR_INTEREST", state: groupBuy.state });
  }
  if (interest.quantity.units <= 0) return err({ code: "INVALID_INTEREST_UNITS", units: interest.quantity.units });
  if (typeof interest.consentTerms !== "string" || interest.consentTerms.trim().length === 0) {
    return err({ code: "INVALID_CONSENT_TERMS" });
  }
  const existing = interests.find(
    (record) => record.groupBuyId === groupBuy.groupBuyId && principalRefEquals(record.participantRef, interest.participantRef),
  );
  if (existing && existing.state === "EXPRESSED") {
    return err({ code: "INTEREST_ALREADY_EXPRESSED", participantRef: interest.participantRef });
  }
  const recorded: GroupBuyInterestRecord = {
    groupBuyId: groupBuy.groupBuyId,
    participantRef: interest.participantRef,
    quantity: interest.quantity,
    consentTerms: interest.consentTerms,
    state: "EXPRESSED",
    recordedAt: interest.recordedAt,
    revision: existing ? nextRevision(existing.revision) : 1,
  };
  const nextInterests = existing
    ? interests.map((record) => (record === existing ? recorded : record))
    : [...interests, recorded];
  let next: GroupBuyAggregate = { ...groupBuy, revision: nextRevision(groupBuy.revision) };
  if (groupBuy.state === "MONITORING" && groupBuyThresholdMet(groupBuy.terms.threshold, nextInterests)) {
    const promoted = groupBuyTransition(groupBuy.state, "THRESHOLD_MET");
    if (promoted.ok) next = { ...next, state: promoted.value };
  }
  return ok({ groupBuy: next, interest: recorded });
}

/**
 * Withdraw one participant's interest — permitted any time before the second
 * confirmation (formation). A HELD pool that honestly falls back below the
 * threshold returns to MONITORING (HELD never overstates the pool).
 */
export function withdrawGroupBuyInterest(
  groupBuy: GroupBuyAggregate,
  interests: readonly GroupBuyInterestRecord[],
  participantRef: PrincipalRef,
  withdrawnAt: string,
): Result<{ readonly groupBuy: GroupBuyAggregate; readonly interest: GroupBuyInterestRecord }, GroupBuyInterestError> {
  if (groupBuy.state !== "PENDING" && groupBuy.state !== "MONITORING" && groupBuy.state !== "HELD") {
    return err({ code: "GROUP_BUY_NOT_OPEN_FOR_INTEREST", state: groupBuy.state });
  }
  const existing = interests.find(
    (record) => record.groupBuyId === groupBuy.groupBuyId && principalRefEquals(record.participantRef, participantRef),
  );
  if (!existing || existing.state !== "EXPRESSED") {
    return err({ code: "NO_LIVE_INTEREST", participantRef });
  }
  const withdrawn: GroupBuyInterestRecord = { ...existing, state: "WITHDRAWN", recordedAt: withdrawnAt, revision: nextRevision(existing.revision) };
  const nextInterests = interests.map((record) => (record === existing ? withdrawn : record));
  let next: GroupBuyAggregate = { ...groupBuy, revision: nextRevision(groupBuy.revision) };
  if (groupBuy.state === "HELD" && !groupBuyThresholdMet(groupBuy.terms.threshold, nextInterests)) {
    const demoted = groupBuyTransition(groupBuy.state, "THRESHOLD_LOST");
    if (demoted.ok) next = { ...next, state: demoted.value };
  }
  return ok({ groupBuy: next, interest: withdrawn });
}

export type GroupBuyDecisionError =
  | GroupBuyTransitionError
  | { readonly code: "COUNTER_TERMS_REQUIRED" }
  | { readonly code: "REJECTION_REASON_REQUIRED" }
  | { readonly code: "COUNTER_TERMS_NOT_ALLOWED"; readonly trigger: GroupBuyProposalDecision }
  | { readonly code: "CURRENCY_MISMATCH"; readonly left: string; readonly right: string };

/** The merchant decisions a proposal admits (the review-desk actions). */
export type GroupBuyProposalDecision = "ACCEPT" | "ACCEPT_COUNTER" | "COUNTER" | "REJECT";

/**
 * The organizer's proposal decision. ACCEPT moves the proposal into threshold
 * MONITORING; COUNTER/REJECT record their evidence (terms / reason); the
 * initiator may ACCEPT_COUNTER a counter (the counter terms stay on record).
 */
export function decideGroupBuyProposal(
  groupBuy: GroupBuyAggregate,
  trigger: GroupBuyProposalDecision,
  evidence?: { readonly counterTerms?: GroupBuyCounterTerms; readonly rejectionReason?: string },
): Result<GroupBuyAggregate, GroupBuyDecisionError> {
  const next = groupBuyTransition(groupBuy.state, trigger);
  if (!next.ok) return next;
  if (trigger === "COUNTER") {
    if (!evidence?.counterTerms) return err({ code: "COUNTER_TERMS_REQUIRED" });
    if (evidence.counterTerms.unitPrice.currency !== groupBuy.terms.proposedUnitPrice.currency) {
      return err({ code: "CURRENCY_MISMATCH", left: evidence.counterTerms.unitPrice.currency, right: groupBuy.terms.proposedUnitPrice.currency });
    }
  } else if (trigger === "ACCEPT_COUNTER") {
    // The initiator accepts the counter ON RECORD — the recorded terms are the
    // evidence; replacement terms are never smuggled in through acceptance.
    if (!groupBuy.counterTerms) return err({ code: "COUNTER_TERMS_REQUIRED" });
    if (evidence?.counterTerms) return err({ code: "COUNTER_TERMS_NOT_ALLOWED", trigger });
  } else if (evidence?.counterTerms) {
    return err({ code: "COUNTER_TERMS_NOT_ALLOWED", trigger });
  }
  if (trigger === "REJECT" && (!evidence?.rejectionReason || evidence.rejectionReason.trim().length === 0)) {
    return err({ code: "REJECTION_REASON_REQUIRED" });
  }
  return ok({
    ...groupBuy,
    state: next.value,
    counterTerms: evidence?.counterTerms ?? groupBuy.counterTerms,
    rejectionReason: trigger === "REJECT" ? evidence?.rejectionReason : groupBuy.rejectionReason,
    revision: nextRevision(groupBuy.revision),
  });
}

export type GroupBuyFormationError =
  | GroupBuyTransitionError
  | { readonly code: "NOT_HELD"; readonly state: GroupBuyFormationState }
  | { readonly code: "POOL_BELOW_THRESHOLD"; readonly participants: number; readonly units: number }
  | { readonly code: "CURRENCY_MISMATCH"; readonly left: string; readonly right: string };

/**
 * The organizer's EXPLICIT formation step (the second confirmation): only
 * from HELD (threshold met), with final terms. Freezes the exact group price,
 * the exact pool value and the roster of CONSENTING-ONLY participants. No
 * commitment is created — commitments live on the commerce planes.
 */
export function formGroupBuy(
  groupBuy: GroupBuyAggregate,
  interests: readonly GroupBuyInterestRecord[],
  groupPrice: Money,
  formedAt: string,
): Result<GroupBuyAggregate, GroupBuyFormationError> {
  if (groupBuy.state !== "HELD") return err({ code: "NOT_HELD", state: groupBuy.state });
  if (!groupBuyThresholdMet(groupBuy.terms.threshold, interests)) {
    return err({ code: "POOL_BELOW_THRESHOLD", participants: poolParticipantCountOf(interests), units: poolUnitsOf(interests) });
  }
  if (groupPrice.currency !== groupBuy.terms.proposedUnitPrice.currency) {
    return err({ code: "CURRENCY_MISMATCH", left: groupPrice.currency, right: groupBuy.terms.proposedUnitPrice.currency });
  }
  const next = groupBuyTransition(groupBuy.state, "FORM");
  if (!next.ok) return next;
  const live = liveGroupBuyInterests(interests);
  return ok({
    ...groupBuy,
    state: next.value,
    formation: { groupPrice, poolValue: groupBuyPoolValue(groupPrice, interests), formedAt },
    participants: live.map((interest) => ({ participantRef: interest.participantRef, quantity: interest.quantity })),
    revision: nextRevision(groupBuy.revision),
  });
}

/** EXPIRE (window closed) / CLOSE (organizer close) — preserved paths. */
export function closeOrExpireGroupBuy(
  groupBuy: GroupBuyAggregate,
  trigger: "EXPIRE" | "CLOSE",
): Result<GroupBuyAggregate, GroupBuyTransitionError> {
  const next = groupBuyTransition(groupBuy.state, trigger);
  if (!next.ok) return next;
  return ok({ ...groupBuy, state: next.value, revision: nextRevision(groupBuy.revision) });
}

/**
 * Typed command payloads (the only mutation path). Handlers additionally
 * enforce actor identity: OPEN/ACCEPT_COUNTER by the initiator, interest by
 * the participant themself, decisions/formation/close by the organizer,
 * expiry by the organizer or SYSTEM.
 */
export type GroupBuyCommandPayload =
  | { readonly type: "OPEN_GROUP_BUY_PROPOSAL"; readonly groupBuy: GroupBuyAggregate }
  | {
      readonly type: "RECORD_GROUP_BUY_INTEREST";
      readonly groupBuyId: GroupBuyId;
      readonly participantRef: PrincipalRef;
      readonly quantity: CountQuantity;
      readonly consentTerms: string;
    }
  | { readonly type: "WITHDRAW_GROUP_BUY_INTEREST"; readonly groupBuyId: GroupBuyId; readonly participantRef: PrincipalRef }
  | {
      readonly type: "DECIDE_GROUP_BUY_PROPOSAL";
      readonly groupBuyId: GroupBuyId;
      readonly trigger: GroupBuyProposalDecision;
      readonly counterTerms?: GroupBuyCounterTerms;
      readonly rejectionReason?: string;
    }
  | { readonly type: "FORM_GROUP_BUY"; readonly groupBuyId: GroupBuyId; readonly groupPrice: Money }
  | { readonly type: "CLOSE_GROUP_BUY"; readonly groupBuyId: GroupBuyId; readonly reason?: string }
  | { readonly type: "EXPIRE_GROUP_BUY"; readonly groupBuyId: GroupBuyId };
