/**
 * merchant-groupbuy-review kernel space (J5 merchant side, W3-016).
 *
 * The w3gr- scenario space as REAL kernel truth: every pool below is built
 * through the W1-012 GroupBuy formation machine (`@unicom/commerce` public
 * entrypoint) — interests are recorded per consenting participant (each with
 * their own consent terms), merchant decisions run through
 * `decideGroupBuyProposal`, threshold promotion/demotion is the machine's own
 * derived THRESHOLD_MET / THRESHOLD_LOST, formation runs through
 * `formGroupBuy` (final terms + consenting-only roster frozen), and expiry
 * runs through `closeOrExpireGroupBuy`. Nothing on this desk fabricates
 * lifecycle state: a seed step that the machine refuses throws loudly (a
 * seed script defect), it is never papered over.
 *
 * Lifecycle coverage of the seeded space (8 proposals): PENDING review
 * (below threshold + at threshold), COUNTERED, REJECTED with reason,
 * EXPIRED, MONITORING (accepted, still below threshold), HELD (threshold
 * met, awaiting the organizer's explicit formation) and FORMED with final
 * terms and a consenting-only roster (its history includes a withdrawal
 * before formation → honest THRESHOLD_LOST demotion → HELD again). CLOSED
 * is a kernel transition that this demo space does not seed (noted in the
 * lane manifest).
 */

import {
  closeOrExpireGroupBuy,
  countQuantity,
  decideGroupBuyProposal,
  formGroupBuy,
  makeId,
  principalRefEquals,
  recordGroupBuyInterest,
  withdrawGroupBuyInterest,
} from "@unicom/commerce";
import type {
  GroupBuyAggregate,
  GroupBuyFormationState,
  GroupBuyInterestRecord,
  GroupBuyProposalDecision,
  GroupBuyCounterTerms,
  Result,
} from "@unicom/commerce";
import { DEMO_MERCHANT_ACTOR, demoMoney } from "../merchant-shared/demo-runtime.js";
import { REJECT_REASONS } from "./fixtures.js";

/** One seeded pool: the kernel aggregate + its per-participant interests. */
export interface SeededPool {
  readonly aggregate: GroupBuyAggregate;
  readonly interests: readonly GroupBuyInterestRecord[];
}

/** A participant studio reference (opaque customer principal of the demo space). */
function studioRef(studioId: string): { kind: "CUSTOMER"; customerId: ReturnType<typeof makeId<"CustomerId">> } {
  return { kind: "CUSTOMER", customerId: makeId<"CustomerId">(studioId) };
}

/** The consent terms a studio's recorded interest carries (interest ≠ commitment). */
function consentTermsOf(units: number): string {
  return `Explicitly agreed (demo fixture) to appear in this pool with a ${units}-box share — interest is not commitment.`;
}

/** Initial aggregate exactly as the buyer side's OPEN would create it. */
function openPool(input: {
  readonly groupBuyId: string;
  readonly initiatorId: string;
  readonly skuRef: string;
  readonly proposedMinor: string;
  readonly listMinor: string;
  readonly minimumParticipants: number;
  readonly minimumUnits: number;
  readonly windowClosesAt: string;
  readonly openedAt: string;
}): GroupBuyAggregate {
  return {
    groupBuyId: makeId<"GroupBuyId">(input.groupBuyId),
    initiatorRef: studioRef(input.initiatorId),
    organizerRef: DEMO_MERCHANT_ACTOR,
    terms: {
      skuRef: makeId<"SkuId">(input.skuRef),
      proposedUnitPrice: demoMoney(input.proposedMinor),
      listUnitPrice: demoMoney(input.listMinor),
      threshold: {
        minimumParticipants: input.minimumParticipants,
        minimumUnits: input.minimumUnits,
      },
      windowClosesAt: input.windowClosesAt,
    },
    state: "PENDING",
    openedAt: input.openedAt,
    participants: [],
    revision: 1,
  };
}

/** One pool under construction (frozen into a SeededPool at the end). */
interface PoolBuilder {
  aggregate: GroupBuyAggregate;
  interests: GroupBuyInterestRecord[];
}

/** Unwrap a seed-step Result — a refused seed step is a defect, never silent. */
function unwrapSeed<T, E>(step: string, result: Result<T, E>): T {
  if (!result.ok) {
    throw new Error(`groupbuy-review seed defect at ${step}: ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

/** Record one consenting studio's interest through the kernel machine. */
function recordInterest(pool: PoolBuilder, studioId: string, units: number, at: string): void {
  const outcome = recordGroupBuyInterest(pool.aggregate, pool.interests, {
    participantRef: studioRef(studioId),
    quantity: countQuantity(units),
    consentTerms: consentTermsOf(units),
    recordedAt: at,
  });
  const { groupBuy, interest } = unwrapSeed(`record-interest ${pool.aggregate.groupBuyId}/${studioId}`, outcome);
  pool.aggregate = groupBuy;
  const existing = pool.interests.findIndex((record) => principalRefEquals(record.participantRef, interest.participantRef));
  if (existing >= 0) pool.interests[existing] = interest;
  else pool.interests.push(interest);
}

/** Withdraw one studio's interest through the kernel machine (pre-formation only). */
function withdrawInterest(pool: PoolBuilder, studioId: string, at: string): void {
  const outcome = withdrawGroupBuyInterest(pool.aggregate, pool.interests, studioRef(studioId), at);
  const { groupBuy, interest } = unwrapSeed(`withdraw-interest ${pool.aggregate.groupBuyId}/${studioId}`, outcome);
  pool.aggregate = groupBuy;
  const existing = pool.interests.findIndex((record) => principalRefEquals(record.participantRef, interest.participantRef));
  if (existing >= 0) pool.interests[existing] = interest;
  else pool.interests.push(interest);
}

/** The organizer's proposal decision, through the kernel machine. */
function decide(pool: PoolBuilder, trigger: GroupBuyProposalDecision, evidence?: { readonly counterTerms?: GroupBuyCounterTerms; readonly rejectionReason?: string }): void {
  pool.aggregate = unwrapSeed(
    `decide ${pool.aggregate.groupBuyId}/${trigger}`,
    decideGroupBuyProposal(pool.aggregate, trigger, evidence),
  );
}

/** The organizer's explicit formation with final terms, through the kernel machine. */
function form(pool: PoolBuilder, groupPriceMinor: string, at: string): void {
  pool.aggregate = unwrapSeed(
    `form ${pool.aggregate.groupBuyId}`,
    formGroupBuy(pool.aggregate, pool.interests, demoMoney(groupPriceMinor), at),
  );
}

/** EXPIRE (window closed) through the kernel machine. */
function expire(pool: PoolBuilder): void {
  pool.aggregate = unwrapSeed(
    `expire ${pool.aggregate.groupBuyId}`,
    closeOrExpireGroupBuy(pool.aggregate, "EXPIRE"),
  );
}

/**
 * Seed the whole desk deterministically. Every mutation runs through the
 * formation machine; the buyer-side events of the history (interests,
 * withdrawal, the accepted counter) are fixture script steps, DEMO-labelled
 * on the surface — the desk itself never simulates a buyer.
 */
export function seedGroupBuyReview(): readonly SeededPool[] {
  // prop-1 — PENDING, below threshold; mirrors the w2ld- buyer fixture space.
  const p1: PoolBuilder = {
    aggregate: openPool({
      groupBuyId: "w3gr-prop-1",
      initiatorId: "w3gr-studio-ferry-road",
      skuRef: "sku-demo-cards",
      proposedMinor: "1080",
      listMinor: "1200",
      minimumParticipants: 4,
      minimumUnits: 40,
      windowClosesAt: "2026-10-20T18:00:00Z",
      openedAt: "2026-10-10T08:20:00Z",
    }),
    interests: [],
  };
  recordInterest(p1, "w3gr-studio-ferry-road", 16, "2026-10-10T08:25:00Z");
  recordInterest(p1, "w3gr-studio-two-harbors", 12, "2026-10-10T09:10:00Z");
  recordInterest(p1, "w3gr-studio-quayside", 8, "2026-10-10T11:45:00Z");

  // prop-2 — PENDING, threshold already met (5 studios / 48 boxes vs 4/40).
  const p2: PoolBuilder = {
    aggregate: openPool({
      groupBuyId: "w3gr-prop-2",
      initiatorId: "w3gr-studio-beacon-hill",
      skuRef: "sku-demo-poster",
      proposedMinor: "2950",
      listMinor: "3400",
      minimumParticipants: 4,
      minimumUnits: 40,
      windowClosesAt: "2026-10-22T17:00:00Z",
      openedAt: "2026-10-11T10:05:00Z",
    }),
    interests: [],
  };
  recordInterest(p2, "w3gr-studio-beacon-hill", 12, "2026-10-11T10:30:00Z");
  recordInterest(p2, "w3gr-studio-old-mill", 10, "2026-10-11T11:15:00Z");
  recordInterest(p2, "w3gr-studio-juniper", 10, "2026-10-11T12:40:00Z");
  recordInterest(p2, "w3gr-studio-copperline", 9, "2026-10-11T14:05:00Z");
  recordInterest(p2, "w3gr-studio-saltmarsh", 7, "2026-10-11T15:20:00Z");

  // prop-3 — COUNTERED: counter sent Oct 9, awaiting the buyer's response.
  const p3: PoolBuilder = {
    aggregate: openPool({
      groupBuyId: "w3gr-prop-3",
      initiatorId: "w3gr-studio-ridgeline",
      skuRef: "sku-demo-a3print",
      proposedMinor: "1550",
      listMinor: "1850",
      minimumParticipants: 3,
      minimumUnits: 30,
      windowClosesAt: "2026-10-18T18:00:00Z",
      openedAt: "2026-10-08T09:40:00Z",
    }),
    interests: [],
  };
  recordInterest(p3, "w3gr-studio-ridgeline", 12, "2026-10-08T10:05:00Z");
  recordInterest(p3, "w3gr-studio-alder-ash", 10, "2026-10-08T11:30:00Z");
  recordInterest(p3, "w3gr-studio-lantern-row", 8, "2026-10-08T13:15:00Z");
  decide(p3, "COUNTER", {
    counterTerms: {
      unitPrice: demoMoney("1690"),
      minimumUnits: 24,
      note: "Counter sent Oct 9: USD 16.90 per print at a 24-print minimum, delivered.",
    },
  });

  // prop-4 — EXPIRED: window closed Oct 11 before any decision was recorded.
  const p4: PoolBuilder = {
    aggregate: openPool({
      groupBuyId: "w3gr-prop-4",
      initiatorId: "w3gr-studio-riverside",
      skuRef: "sku-demo-cards",
      proposedMinor: "1060",
      listMinor: "1200",
      minimumParticipants: 3,
      minimumUnits: 24,
      windowClosesAt: "2026-10-11T18:00:00Z",
      openedAt: "2026-10-05T11:15:00Z",
    }),
    interests: [],
  };
  recordInterest(p4, "w3gr-studio-riverside", 12, "2026-10-05T11:40:00Z");
  recordInterest(p4, "w3gr-studio-foxglove", 8, "2026-10-05T13:20:00Z");
  expire(p4);

  // prop-5 — REJECTED with a recorded reason (threshold had been met).
  const p5: PoolBuilder = {
    aggregate: openPool({
      groupBuyId: "w3gr-prop-5",
      initiatorId: "w3gr-studio-granite-yard",
      skuRef: "sku-demo-poster",
      proposedMinor: "2600",
      listMinor: "3400",
      minimumParticipants: 4,
      minimumUnits: 40,
      windowClosesAt: "2026-10-25T17:00:00Z",
      openedAt: "2026-10-06T13:50:00Z",
    }),
    interests: [],
  };
  recordInterest(p5, "w3gr-studio-granite-yard", 14, "2026-10-06T14:10:00Z");
  recordInterest(p5, "w3gr-studio-willowbrook", 12, "2026-10-06T15:00:00Z");
  recordInterest(p5, "w3gr-studio-tidewater", 10, "2026-10-06T16:25:00Z");
  recordInterest(p5, "w3gr-studio-cedar-coast", 8, "2026-10-06T17:05:00Z");
  decide(p5, "REJECT", { rejectionReason: REJECT_REASONS[2] });

  // prop-6 — ACCEPTED → kernel MONITORING, still below threshold (5/50).
  const p6: PoolBuilder = {
    aggregate: openPool({
      groupBuyId: "w3gr-prop-6",
      initiatorId: "w3gr-studio-fog-harbor",
      skuRef: "sku-demo-a3print",
      proposedMinor: "1650",
      listMinor: "1850",
      minimumParticipants: 5,
      minimumUnits: 50,
      windowClosesAt: "2026-10-24T18:00:00Z",
      openedAt: "2026-10-07T10:25:00Z",
    }),
    interests: [],
  };
  recordInterest(p6, "w3gr-studio-fog-harbor", 12, "2026-10-07T11:00:00Z");
  recordInterest(p6, "w3gr-studio-marigold", 11, "2026-10-07T12:30:00Z");
  decide(p6, "ACCEPT");
  recordInterest(p6, "w3gr-studio-ironworks", 10, "2026-10-09T10:20:00Z");

  // prop-7 — ACCEPTED → MONITORING → buyer-side interests cross the
  // threshold → the machine's derived THRESHOLD_MET → HELD, awaiting the
  // organizer's explicit formation (never automatic).
  const p7: PoolBuilder = {
    aggregate: openPool({
      groupBuyId: "w3gr-prop-7",
      initiatorId: "w3gr-studio-beacon-hill",
      skuRef: "sku-demo-a3print",
      proposedMinor: "1650",
      listMinor: "1850",
      minimumParticipants: 4,
      minimumUnits: 40,
      windowClosesAt: "2026-10-24T18:00:00Z",
      openedAt: "2026-10-08T08:15:00Z",
    }),
    interests: [],
  };
  recordInterest(p7, "w3gr-studio-beacon-hill", 12, "2026-10-08T09:00:00Z");
  recordInterest(p7, "w3gr-studio-old-mill", 10, "2026-10-08T10:30:00Z");
  decide(p7, "ACCEPT");
  recordInterest(p7, "w3gr-studio-juniper", 10, "2026-10-09T11:05:00Z");
  recordInterest(p7, "w3gr-studio-copperline", 9, "2026-10-10T09:40:00Z");

  // prop-8 — FORMED with final terms and a consenting-only roster; the
  // history includes a withdrawal before formation (THRESHOLD_LOST demotion,
  // then HELD again) so the frozen roster proves consent primacy.
  const p8: PoolBuilder = {
    aggregate: openPool({
      groupBuyId: "w3gr-prop-8",
      initiatorId: "w3gr-studio-cedar-coast",
      skuRef: "sku-demo-cards",
      proposedMinor: "1080",
      listMinor: "1200",
      minimumParticipants: 4,
      minimumUnits: 40,
      windowClosesAt: "2026-10-20T18:00:00Z",
      openedAt: "2026-10-06T09:00:00Z",
    }),
    interests: [],
  };
  recordInterest(p8, "w3gr-studio-cedar-coast", 12, "2026-10-06T09:10:00Z");
  recordInterest(p8, "w3gr-studio-tidewater", 10, "2026-10-06T10:00:00Z");
  decide(p8, "ACCEPT");
  recordInterest(p8, "w3gr-studio-granite-yard", 10, "2026-10-07T15:20:00Z");
  recordInterest(p8, "w3gr-studio-willowbrook", 12, "2026-10-08T09:30:00Z");
  withdrawInterest(p8, "w3gr-studio-willowbrook", "2026-10-09T16:00:00Z");
  recordInterest(p8, "w3gr-studio-saltmarsh", 10, "2026-10-10T09:15:00Z");
  form(p8, "1080", "2026-10-10T17:45:00Z");

  return [p1, p2, p3, p4, p5, p6, p7, p8].map((pool) => ({
    aggregate: pool.aggregate,
    interests: [...pool.interests],
  }));
}

/** Human label for each kernel lifecycle state (rendered chip text). */
export const KERNEL_STATE_LABELS: Readonly<Record<GroupBuyFormationState, string>> = {
  PENDING: "PENDING review",
  COUNTERED: "COUNTERED — awaiting buyer response",
  REJECTED: "REJECTED — with reason",
  EXPIRED: "EXPIRED — window closed",
  MONITORING: "ACCEPTED — threshold monitoring",
  HELD: "HELD — threshold met, awaiting your formation",
  FORMED: "FORMED — final terms frozen",
  CLOSED: "CLOSED",
};

/** Chip tone per kernel lifecycle state (err reserved for failures — none of these are). */
export const KERNEL_STATE_TONE: Readonly<Record<GroupBuyFormationState, "warn" | "ok" | "info" | "unknown">> = {
  PENDING: "warn",
  COUNTERED: "unknown",
  REJECTED: "warn",
  EXPIRED: "info",
  MONITORING: "warn",
  HELD: "ok",
  FORMED: "ok",
  CLOSED: "info",
};

/** "3 studios vs threshold 4 · 36 boxes vs threshold 40" — kernel-derived. */
export function thresholdSummaryOf(aggregate: GroupBuyAggregate, interests: readonly GroupBuyInterestRecord[]): string {
  const { minimumParticipants, minimumUnits } = aggregate.terms.threshold;
  const studios = interests.filter((interest) => interest.state === "EXPRESSED").length;
  const units = interests
    .filter((interest) => interest.state === "EXPRESSED")
    .reduce((total, interest) => total + interest.quantity.units, 0);
  return `${studios} studios vs threshold ${minimumParticipants} · ${units} boxes vs threshold ${minimumUnits}`;
}

/** Display id of a participant ref (customer ids verbatim, others keyed). */
export function participantIdOf(ref: GroupBuyInterestRecord["participantRef"]): string {
  return ref.kind === "CUSTOMER" ? ref.customerId : `principal:${ref.kind}`;
}
