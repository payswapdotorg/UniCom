/**
 * Circular commerce: resale listings, rental agreements and consignment.
 *
 * These are commerce-truth objects: money-exact, revisioned, with deterministic
 * state machines. The DISCOVERY of resale/rental/consignment opportunities is
 * Worker 2's lane and is referenced only opaquely (opportunity.ts).
 */
import type { ConsignmentId, RentalAgreementId, ResaleListingId, SkuId } from "./ids.js";
import { nextRevision } from "./events.js";
import { money, percentageBpsOfMoney, type Money } from "./money.js";
import type { PrincipalRef } from "./principals.js";
import type { RoundingMode } from "./decimal.js";
import { err, ok, type Result } from "./result.js";

export type ItemCondition = "NEW" | "LIKE_NEW" | "GOOD" | "FAIR" | "POOR";

// --- Resale ---

export type ListingState = "DRAFT" | "ACTIVE" | "RESERVED" | "SOLD" | "ENDED" | "CANCELLED";

export type ListingTrigger =
  | "PUBLISH"
  | "RESERVE"
  | "MARK_SOLD"
  | "END"
  | "CANCEL";

export type ListingTransitionError = {
  code: "INVALID_LISTING_TRANSITION";
  from: ListingState;
  trigger: ListingTrigger;
};

export interface ResaleListing {
  readonly listingId: ResaleListingId;
  readonly sellerRef: PrincipalRef;
  readonly skuRef: SkuId;
  readonly itemCondition: ItemCondition;
  readonly askingPrice: Money;
  readonly state: ListingState;
  readonly revision: number;
}

/** Deterministic resale listing lifecycle. */
export function listingTransition(
  state: ListingState,
  trigger: ListingTrigger,
): Result<ListingState, ListingTransitionError> {
  const table: Record<ListingState, Partial<Record<ListingTrigger, ListingState>>> = {
    DRAFT: { PUBLISH: "ACTIVE", CANCEL: "CANCELLED" },
    ACTIVE: { RESERVE: "RESERVED", MARK_SOLD: "SOLD", END: "ENDED", CANCEL: "CANCELLED" },
    RESERVED: { MARK_SOLD: "SOLD", CANCEL: "CANCELLED" },
    SOLD: {},
    ENDED: {},
    CANCELLED: {},
  };
  const next = table[state][trigger];
  if (next === undefined) return err({ code: "INVALID_LISTING_TRANSITION", from: state, trigger });
  return ok(next);
}

export function advanceListing(
  listing: ResaleListing,
  trigger: ListingTrigger,
): Result<ResaleListing, ListingTransitionError> {
  const next = listingTransition(listing.state, trigger);
  if (!next.ok) return next;
  return ok({ ...listing, state: next.value, revision: nextRevision(listing.revision) });
}

// --- Rental ---

export type RentalState = "REQUESTED" | "ACTIVE" | "OVERDUE" | "RETURNED" | "COMPLETED" | "CANCELLED";

export type RentalTrigger =
  | "START"
  | "MARK_OVERDUE"
  | "RETURN"
  | "COMPLETE"
  | "CANCEL";

export type RentalTransitionError = {
  code: "INVALID_RENTAL_TRANSITION";
  from: RentalState;
  trigger: RentalTrigger;
};

export interface RentalPeriod {
  readonly startsAt: string;
  readonly endsAt: string;
}

export interface RentalAgreement {
  readonly rentalAgreementId: RentalAgreementId;
  readonly itemSkuRef: SkuId;
  readonly renterRef: PrincipalRef;
  readonly period: RentalPeriod;
  readonly ratePerPeriod: Money;
  readonly deposit: Money;
  readonly state: RentalState;
  readonly revision: number;
}

/** Deterministic rental lifecycle (OVERDUE is a preserved state, not a failure). */
export function rentalTransition(
  state: RentalState,
  trigger: RentalTrigger,
): Result<RentalState, RentalTransitionError> {
  const table: Record<RentalState, Partial<Record<RentalTrigger, RentalState>>> = {
    REQUESTED: { START: "ACTIVE", CANCEL: "CANCELLED" },
    ACTIVE: { MARK_OVERDUE: "OVERDUE", RETURN: "RETURNED", CANCEL: "CANCELLED" },
    OVERDUE: { RETURN: "RETURNED" },
    RETURNED: { COMPLETE: "COMPLETED" },
    COMPLETED: {},
    CANCELLED: {},
  };
  const next = table[state][trigger];
  if (next === undefined) return err({ code: "INVALID_RENTAL_TRANSITION", from: state, trigger });
  return ok(next);
}

export function advanceRental(
  agreement: RentalAgreement,
  trigger: RentalTrigger,
): Result<RentalAgreement, RentalTransitionError> {
  const next = rentalTransition(agreement.state, trigger);
  if (!next.ok) return next;
  return ok({ ...agreement, state: next.value, revision: nextRevision(agreement.revision) });
}

/** Deposit refund on timely return: exact, policy-declared wear deduction in bps. */
export function depositReturn(
  agreement: RentalAgreement,
  wearDeductionBps: number,
  mode: RoundingMode,
): Result<{ refunded: Money; withheld: Money }, { code: "INVALID_DEDUCTION_BPS"; bps: number }> {
  if (!Number.isSafeInteger(wearDeductionBps) || wearDeductionBps < 0 || wearDeductionBps > 10_000) {
    return err({ code: "INVALID_DEDUCTION_BPS", bps: wearDeductionBps });
  }
  const withheld = percentageBpsOfMoney(agreement.deposit, wearDeductionBps, mode);
  const refundedMinor = BigInt(agreement.deposit.amountMinor) - BigInt(withheld.amountMinor);
  return ok({
    refunded: money(refundedMinor.toString(), agreement.deposit.currency),
    withheld,
  });
}

// --- Consignment ---

export type ConsignmentState = "PROPOSED" | "ACTIVE" | "SETTLED" | "TERMINATED";

export type ConsignmentTrigger =
  | "ACCEPT"
  | "SETTLE"
  | "TERMINATE";

export type ConsignmentTransitionError = {
  code: "INVALID_CONSIGNMENT_TRANSITION";
  from: ConsignmentState;
  trigger: ConsignmentTrigger;
};

export interface ConsignmentAgreement {
  readonly consignmentId: ConsignmentId;
  /** Consignor principal — opaque from the commerce plane's perspective. */
  readonly consignorRef: PrincipalRef;
  /** Consignor share of sale proceeds, in integer basis points (≤ 10000). */
  readonly consignorShareBps: number;
  readonly state: ConsignmentState;
  readonly revision: number;
}

export function consignmentTransition(
  state: ConsignmentState,
  trigger: ConsignmentTrigger,
): Result<ConsignmentState, ConsignmentTransitionError> {
  const table: Record<ConsignmentState, Partial<Record<ConsignmentTrigger, ConsignmentState>>> = {
    PROPOSED: { ACCEPT: "ACTIVE", TERMINATE: "TERMINATED" },
    ACTIVE: { SETTLE: "SETTLED", TERMINATE: "TERMINATED" },
    SETTLED: {},
    TERMINATED: {},
  };
  const next = table[state][trigger];
  if (next === undefined) return err({ code: "INVALID_CONSIGNMENT_TRANSITION", from: state, trigger });
  return ok(next);
}

export function advanceConsignment(
  agreement: ConsignmentAgreement,
  trigger: ConsignmentTrigger,
): Result<ConsignmentAgreement, ConsignmentTransitionError> {
  const next = consignmentTransition(agreement.state, trigger);
  if (!next.ok) return next;
  return ok({ ...agreement, state: next.value, revision: nextRevision(agreement.revision) });
}

/**
 * Deterministic consignment payout split (consignor share first —
 * the merchant's remainder is whatever is left, exactly).
 */
export function consignmentPayout(
  saleAmount: Money,
  consignorShareBps: number,
  mode: RoundingMode,
): Result<{ consignor: Money; merchant: Money }, { code: "INVALID_SHARE_BPS"; bps: number }> {
  if (!Number.isSafeInteger(consignorShareBps) || consignorShareBps < 0 || consignorShareBps > 10_000) {
    return err({ code: "INVALID_SHARE_BPS", bps: consignorShareBps });
  }
  const consignor = percentageBpsOfMoney(saleAmount, consignorShareBps, mode);
  const merchantMinor = BigInt(saleAmount.amountMinor) - BigInt(consignor.amountMinor);
  return ok({
    consignor,
    merchant: money(merchantMinor.toString(), saleAmount.currency),
  });
}
