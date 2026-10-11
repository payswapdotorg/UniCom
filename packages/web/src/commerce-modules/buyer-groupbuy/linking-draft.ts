/**
 * W2-015 Stage 1 — Commerce-plane linking: linked-order-draft helper.
 *
 * The single shared seam for the human-confirmed "create linked order draft"
 * affordance that renders on the formed GroupBuy surface (buyer + merchant
 * review sides) and on the executed TradeCycle leg surface (participant side).
 *
 * LAWS (decision packet §2 — all seven are binding acceptance criteria):
 *  1. Formation/execution truth is separate from downstream commitments —
 *     a formed GroupBuy / executed leg is NOT an order. The affordance only
 *     ever PREFILLS the existing ADD_CART_LINE / PLACE_ORDER command surface;
 *     it issues NO new command itself.
 *  2. Per-side-effect authorization — the draft's prefill carries the
 *     source aggregate id and the acting principal; placing still requires
 *     the existing PLACE_ORDER actor's own authority (the draft's prefill
 *     is NOT an authorization token).
 *  3. Idempotency — the draft's eventual placement uses the existing
 *     idempotency-keyed PLACE_ORDER command; the draft itself carries no key.
 *  4. Actor authority — the affordance renders only for actors whose role
 *     permits order placement (groupbuy.review-proposal for the merchant
 *     organizer; tradecycle.consent-leg / storefront.manage for the
 *     participant side — mirrors the existing role gating).
 *  5. Cancellation/compensation separation — the draft is a DRAFT: placing
 *     still requires the existing confirmation flow unchanged; cancelling the
 *     draft (or the upstream aggregate) creates NO refund/unreserve (those
 *     remain separately-authorized commands).
 *  6. UNKNOWN is not FAILED — if a downstream result is pending (e.g. a
 *     payment intent's status), it surfaces UNKNOWN through the existing
 *     payment-boundary vocabulary; the draft adds nothing here.
 *  7. Refusal must not commit other legs — the TradeCycle leg draft is per-leg;
 *     refusing to draft one leg never drafts another.
 *
 * Kill switch: LINKING_DRAFT_ENABLED is a single module-level constant.
 * Disabled = honest "linking disabled" label rendered on-surface (the
 * affordance never disappears silently).
 *
 * Demo labelling: every prefill value is DEMO-labelled (synthetic demo state
 * derived from the aggregate's own facts — never a live order).
 */
import { makeId } from "@unicom/commerce";
import type {
  GroupBuyAggregate,
  GroupBuyParticipantShare,
  Money,
  PrincipalRef,
  TradeCycleExecution,
  TradeCycleExecutionLeg,
} from "@unicom/commerce";

/** The kill switch for the entire linking-draft affordance (single constant). */
export const LINKING_DRAFT_ENABLED = true;

/** Human label rendered when the kill switch is OFF (honest "linking disabled"). */
export const LINKING_DISABLED_LABEL = "Linked-order drafting is disabled on this surface (kill switch OFF).";

/**
 * The prefill model: the aggregate's facts pre-filled for the existing
 * ADD_CART_LINE → PLACE_ORDER command path. Provenance is carried on-surface
 * (source aggregate id, acting principal, consent basis) — the existing
 * typed command contracts carry NO metadata field for this (the boundary is
 * recorded honestly in the report; the kernel contract is NOT extended).
 */
export interface LinkedOrderDraftPrefill {
  /** The source aggregate id (GroupBuy or TradeCycle), rendered on-surface. */
  readonly sourceAggregateId: string;
  /** Which kind of source aggregate (GroupBuy formation / TradeCycle leg). */
  readonly sourceKind: "GROUP_BUY_FORMED" | "TRADECYCLE_LEG_EXECUTED";
  /** The acting principal who confirmed the draft (provenance on-surface). */
  readonly actingPrincipal: PrincipalRef;
  /** The consent basis (text rendered on-surface — never an auth token). */
  readonly consentBasis: string;
  /** The sku to prefill on ADD_CART_LINE (from the aggregate's terms). */
  readonly skuRef: string;
  /** The unit price to prefill (the aggregate's frozen group / trade price). */
  readonly unitPrice: Money;
  /** The quantity to prefill (units the acting participant is due). */
  readonly units: number;
  /** The cart id minted for this draft (DEMO-labelled, never a live cart). */
  readonly cartId: string;
}

/**
 * Build the prefill from a FORMED GroupBuy aggregate and one consenting
 * participant's share (the participant who would place the linked order).
 * Pure: derives facts from the aggregate, mints a DEMO cart id, never issues
 * a command.
 */
export function groupBuyDraftPrefillOf(
  aggregate: GroupBuyAggregate,
  share: GroupBuyParticipantShare,
  actingPrincipal: PrincipalRef,
): LinkedOrderDraftPrefill {
  if (aggregate.state !== "FORMED" || aggregate.formation === undefined) {
    throw new Error(
      `linking draft refused: group buy ${aggregate.groupBuyId} is ${aggregate.state}, not FORMED — no formation truth to prefill from`,
    );
  }
  return {
    sourceAggregateId: aggregate.groupBuyId,
    sourceKind: "GROUP_BUY_FORMED",
    actingPrincipal,
    consentBasis:
      `Consented to appear in ${aggregate.groupBuyId} with a ${share.quantity.units}-unit share (formation truth, not a commitment). Placement requires a separate PLACE_ORDER under the acting principal's own authority.`,
    skuRef: aggregate.terms.skuRef,
    unitPrice: aggregate.formation.groupPrice,
    units: share.quantity.units,
    cartId: `cart-link-gb-${aggregate.groupBuyId}`,
  };
}

/**
 * Build the prefill from an EXECUTED TradeCycle leg (the leg whose item moved
 * from → to). The acting principal is the leg's RECEIVER (the participant
 * whose stated want was satisfied — they would place the linked order for the
 * item they received). Pure: derives facts from the leg, never issues a command.
 */
export function tradeCycleLegDraftPrefillOf(
  cycle: TradeCycleExecution,
  leg: TradeCycleExecutionLeg,
  actingPrincipal: PrincipalRef,
): LinkedOrderDraftPrefill {
  if (leg.consentState !== "COMMITTED") {
    throw new Error(
      `linking draft refused: leg ${leg.legIndex} of ${cycle.tradeCycleId} is ${leg.consentState}, not COMMITTED — no execution truth to prefill from`,
    );
  }
  // The trade-cycle aggregate carries no Money (items are opaque refs); the
  // draft prefill records the item ref verbatim and ZERO unit price (the
  // existing PLACE_ORDER path requires a unit price, so the human MUST fill
  // it in — the draft is a DRAFT, not a commitment, and the price is the
  // acting human's to set under their own authority). This boundary is
  // rendered on-surface and recorded in the report.
  return {
    sourceAggregateId: cycle.tradeCycleId,
    sourceKind: "TRADECYCLE_LEG_EXECUTED",
    actingPrincipal,
    consentBasis:
      `Leg ${leg.legIndex} of ${cycle.tradeCycleId} committed (the giver authorized, the cycle executed atomically). The item moved from its giver to its receiver; placement requires a separate PLACE_ORDER under the acting principal's own authority. The price is the acting human's to set (the trade-cycle aggregate carries no money).`,
    skuRef: leg.offeredItemRef,
    unitPrice: { amountMinor: "0", currency: "USD" },
    units: 1,
    cartId: `cart-link-tc-${cycle.tradeCycleId}-leg-${leg.legIndex}`,
  };
}

/** A recorded draft (the user confirmed creating it; DEMO state, never live). */
export interface RecordedDraft {
  readonly prefill: LinkedOrderDraftPrefill;
  readonly recordedAt: string;
  /** The acting principal's confirmation that they wanted the draft created. */
  readonly confirmedBy: PrincipalRef;
}

/**
 * The local demo state of recorded drafts (per-module, DEMO-labelled). This
 * is NOT kernel truth — it is the surface's record that a human confirmed the
 * prefill step. The eventual PLACE_ORDER (if the human proceeds) travels
 * through the existing kernel command path under its own idempotency key.
 */
export class LinkedDraftLedger {
  private readonly drafts = new Map<string, RecordedDraft>();
  private counter = 0;

  /** Record a confirmed draft; returns the recorded entry (DEMO state). */
  record(prefill: LinkedOrderDraftPrefill, confirmedBy: PrincipalRef, now: string): RecordedDraft {
    this.counter += 1;
    const recorded: RecordedDraft = { prefill, recordedAt: now, confirmedBy };
    this.drafts.set(prefill.cartId, recorded);
    return recorded;
  }

  /** All recorded drafts (DEMO state — never live, never kernel truth). */
  all(): readonly RecordedDraft[] {
    return [...this.drafts.values()];
  }

  /** The recorded draft for one cart id, or null. */
  forCart(cartId: string): RecordedDraft | null {
    return this.drafts.get(cartId) ?? null;
  }

  /** Reset (the demo reset path). */
  reset(): void {
    this.drafts.clear();
    this.counter = 0;
  }
}

/** A typed draft id for test selectors (DEMO-labelled, never a kernel id). */
export function draftIdOf(prefill: LinkedOrderDraftPrefill): string {
  return `w2ld-draft-${prefill.sourceAggregateId}`;
}

/** Mint a typed CartId for the prefill (re-exported for the place-order path). */
export function cartIdOf(prefill: LinkedOrderDraftPrefill): string {
  return prefill.cartId;
}

/** The typed ADD_CART_LINE payload shape the prefill would issue (for display). */
export interface AddCartLinePrefill {
  readonly type: "ADD_CART_LINE";
  readonly cartId: string;
  readonly skuRef: string;
  readonly units: number;
  readonly unitPriceMinor: string;
  readonly currency: string;
}

/** Render the ADD_CART_LINE prefill as a display object (never issues a command). */
export function addCartLinePrefillOf(prefill: LinkedOrderDraftPrefill): AddCartLinePrefill {
  return {
    type: "ADD_CART_LINE",
    cartId: prefill.cartId,
    skuRef: prefill.skuRef,
    units: prefill.units,
    unitPriceMinor: prefill.unitPrice.amountMinor,
    currency: prefill.unitPrice.currency,
  };
}

/** The typed PLACE_ORDER payload shape the prefill would issue (for display). */
export interface PlaceOrderPrefill {
  readonly type: "PLACE_ORDER";
  readonly cartId: string;
  readonly merchantId: string;
}

/** Render the PLACE_ORDER prefill as a display object (never issues a command). */
export function placeOrderPrefillOf(prefill: LinkedOrderDraftPrefill, merchantId: string): PlaceOrderPrefill {
  return {
    type: "PLACE_ORDER",
    cartId: prefill.cartId,
    merchantId,
  };
}

/** Honest "linking disabled" block (rendered when the kill switch is OFF). */
export function isLinkingDraftEnabled(): boolean {
  return LINKING_DRAFT_ENABLED;
}

/** A deterministic demo timestamp for the recorded draft (the demo clock). */
export const LINKING_DRAFT_DEMO_EPOCH = "2026-10-12T09:00:00Z";

/** Make a typed MerchantId (DEMO fixture, for the PLACE_ORDER prefill display). */
export function demoMerchantIdOf(id: string): string {
  return makeId<"MerchantId">(id);
}
