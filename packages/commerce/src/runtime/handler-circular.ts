/**
 * Circular commerce handlers: subscriptions, resale listings, rental
 * agreements and consignment agreements on the kernel.
 *
 * Each aggregate opens in its initial state (validated) and advances through
 * the frozen deterministic state machines; every step is an idempotent
 * command that appends an immutable fact. PAST_DUE / OVERDUE are preserved
 * customer-action states, never collapsed into failures.
 */
import { advanceSubscription } from "../domain/subscriptions.js";
import { advanceListing } from "../domain/circular.js";
import { advanceRental } from "../domain/circular.js";
import { advanceConsignment } from "../domain/circular.js";
import {
  accept,
  rejectInvalidCommand,
  rejectInvalidState,
  type RuntimeCommandHandler,
} from "./handler.js";
import { consignmentSubject, listingSubject, rentalSubject, subscriptionSubject } from "./subjects.js";

export const handleOpenSubscription: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "OPEN_SUBSCRIPTION") return rejectInvalidCommand("not OPEN_SUBSCRIPTION");
  const subscription = payload.subscription;
  if (subscription.state !== "PENDING") return rejectInvalidCommand("subscription must open in PENDING state");
  if (subscription.revision !== 1) return rejectInvalidCommand("subscription must open at revision 1");
  if (ctx.state.subscription(subscription.subscriptionId)) {
    return rejectInvalidState(`subscription ${subscription.subscriptionId} already exists`);
  }
  ctx.emit({
    subject: subscriptionSubject(subscription.subscriptionId),
    kind: "SUBSCRIPTION_OPENED",
    payload: { kind: "SUBSCRIPTION_OPENED", subscription },
  });
  return accept();
};

export const handleAdvanceSubscription: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "ADVANCE_SUBSCRIPTION") return rejectInvalidCommand("not ADVANCE_SUBSCRIPTION");
  const subscription = ctx.state.subscription(payload.subscriptionId);
  if (!subscription) return rejectInvalidState(`subscription ${payload.subscriptionId} not found`);
  const next = advanceSubscription(subscription, payload.trigger);
  if (!next.ok) {
    return rejectInvalidState(
      `subscription ${payload.subscriptionId}: ${next.error.code} from ${next.error.from} on ${next.error.trigger}`,
    );
  }
  ctx.emit({
    subject: subscriptionSubject(payload.subscriptionId),
    kind: "SUBSCRIPTION_STATE_CHANGED",
    payload: { kind: "SUBSCRIPTION_STATE_CHANGED", subscription: next.value },
  });
  return accept();
};

export const handleOpenListing: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "OPEN_LISTING") return rejectInvalidCommand("not OPEN_LISTING");
  const listing = payload.listing;
  if (listing.state !== "DRAFT") return rejectInvalidCommand("listing must open in DRAFT state");
  if (listing.revision !== 1) return rejectInvalidCommand("listing must open at revision 1");
  if (ctx.state.listing(listing.listingId)) return rejectInvalidState(`listing ${listing.listingId} already exists`);
  ctx.emit({
    subject: listingSubject(listing.listingId),
    kind: "LISTING_OPENED",
    payload: { kind: "LISTING_OPENED", listing },
  });
  return accept();
};

export const handleAdvanceListing: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "ADVANCE_LISTING") return rejectInvalidCommand("not ADVANCE_LISTING");
  const listing = ctx.state.listing(payload.listingId);
  if (!listing) return rejectInvalidState(`listing ${payload.listingId} not found`);
  const next = advanceListing(listing, payload.trigger);
  if (!next.ok) {
    return rejectInvalidState(`listing ${payload.listingId}: ${next.error.code} from ${next.error.from} on ${next.error.trigger}`);
  }
  ctx.emit({
    subject: listingSubject(payload.listingId),
    kind: "LISTING_STATE_CHANGED",
    payload: { kind: "LISTING_STATE_CHANGED", listing: next.value },
  });
  return accept();
};

export const handleOpenRental: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "OPEN_RENTAL") return rejectInvalidCommand("not OPEN_RENTAL");
  const rental = payload.rental;
  if (rental.state !== "REQUESTED") return rejectInvalidCommand("rental must open in REQUESTED state");
  if (rental.revision !== 1) return rejectInvalidCommand("rental must open at revision 1");
  if (ctx.state.rental(rental.rentalAgreementId)) {
    return rejectInvalidState(`rental ${rental.rentalAgreementId} already exists`);
  }
  ctx.emit({
    subject: rentalSubject(rental.rentalAgreementId),
    kind: "RENTAL_OPENED",
    payload: { kind: "RENTAL_OPENED", rental },
  });
  return accept();
};

export const handleAdvanceRental: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "ADVANCE_RENTAL") return rejectInvalidCommand("not ADVANCE_RENTAL");
  const rental = ctx.state.rental(payload.rentalAgreementId);
  if (!rental) return rejectInvalidState(`rental ${payload.rentalAgreementId} not found`);
  const next = advanceRental(rental, payload.trigger);
  if (!next.ok) {
    return rejectInvalidState(
      `rental ${payload.rentalAgreementId}: ${next.error.code} from ${next.error.from} on ${next.error.trigger}`,
    );
  }
  ctx.emit({
    subject: rentalSubject(payload.rentalAgreementId),
    kind: "RENTAL_STATE_CHANGED",
    payload: { kind: "RENTAL_STATE_CHANGED", rental: next.value },
  });
  return accept();
};

export const handleOpenConsignment: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "OPEN_CONSIGNMENT") return rejectInvalidCommand("not OPEN_CONSIGNMENT");
  const consignment = payload.consignment;
  if (consignment.state !== "PROPOSED") return rejectInvalidCommand("consignment must open in PROPOSED state");
  if (consignment.revision !== 1) return rejectInvalidCommand("consignment must open at revision 1");
  if (!Number.isSafeInteger(consignment.consignorShareBps) || consignment.consignorShareBps < 0 || consignment.consignorShareBps > 10_000) {
    return rejectInvalidCommand("consignor share bps must be within [0, 10000]");
  }
  if (ctx.state.consignment(consignment.consignmentId)) {
    return rejectInvalidState(`consignment ${consignment.consignmentId} already exists`);
  }
  ctx.emit({
    subject: consignmentSubject(consignment.consignmentId),
    kind: "CONSIGNMENT_OPENED",
    payload: { kind: "CONSIGNMENT_OPENED", consignment },
  });
  return accept();
};

export const handleAdvanceConsignment: RuntimeCommandHandler = async (envelope, ctx) => {
  const payload = envelope.payload;
  if (payload.type !== "ADVANCE_CONSIGNMENT") return rejectInvalidCommand("not ADVANCE_CONSIGNMENT");
  const consignment = ctx.state.consignment(payload.consignmentId);
  if (!consignment) return rejectInvalidState(`consignment ${payload.consignmentId} not found`);
  const next = advanceConsignment(consignment, payload.trigger);
  if (!next.ok) {
    return rejectInvalidState(
      `consignment ${payload.consignmentId}: ${next.error.code} from ${next.error.from} on ${next.error.trigger}`,
    );
  }
  ctx.emit({
    subject: consignmentSubject(payload.consignmentId),
    kind: "CONSIGNMENT_STATE_CHANGED",
    payload: { kind: "CONSIGNMENT_STATE_CHANGED", consignment: next.value },
  });
  return accept();
};
