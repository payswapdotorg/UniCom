/**
 * W1-014 Stage 0 — Linking Law 2 (per-side-effect authorization) + Law 4
 * (actor authority).
 *
 * BINDING LAWS (decision packet §2.2 and §2.4):
 * - Law 2: each downstream object (order, payment, reservation, recourse case)
 *   requires its own actor-authorized command with its own consent basis. A
 *   GroupBuy participant's consent to join ≠ consent to be charged; a
 *   TradeCycle leg's execution consent ≠ consent to reserve inventory.
 * - Law 4: who may create the downstream object must derive from the
 *   aggregate's own actor laws (the organizer may PROPOSE a linked order;
 *   participants consent to it; nobody else).
 *
 * Stage 0 spec against the CURRENT command surface:
 * 1. Upstream consent (interest's consentTerms, leg's authorizationRef) is
 *    TEXT/OPAQUE — it is NOT an authorization token that transfers to a
 *    downstream command. Placing an order requires a SEPARATE PLACE_ORDER
 *    command with its own actor + idempotency key; reserving inventory
 *    requires a SEPARATE RESERVE_INVENTORY command.
 * 2. Actor authority is not transferable across aggregates: a participant
 *    cannot FORM the deal (organizer-only); a giver cannot EXECUTE the cycle
 *    (initiator-only); a spoofed authorization (actor ≠ authorizingRef) is
 *    rejected at the kernel boundary.
 * 3. The downstream command's actor is INDEPENDENT of the upstream command's
 *    actor — different principals may issue the downstream command under
 *    their own authority, with no inheritance from the upstream aggregate.
 *
 * Where the future Stage 2 surface (LINK_GROUPBUY_TO_ORDER_DRAFT /
 * LINK_TRADECYCLE_LEG_TO_SETTLEMENT_DRAFT) is needed to fully express the
 * law, a precisely-documented `describe.skip` block records the gap — never
 * faked, never the kernel touched.
 */
import { describe, expect, it } from "vitest";
import {
  CommerceKernel,
  countQuantity,
  currency,
  makeId,
  money,
  principalRefKey,
  type GroupBuyAggregate,
  type PrincipalRef,
  type TradeCycleExecution,
  type TradeCycleExecutionLeg,
} from "../contract.js";
import { ScriptedPaymentDouble } from "./runtime/support/payment-double.js";
import { env, mustExecute } from "./runtime/support/envelopes.js";

const usd = currency("USD");
const NOW = "2026-10-12T09:00:00Z";

function customer(id: string): PrincipalRef {
  return { kind: "CUSTOMER", customerId: makeId<"CustomerId">(id) };
}

const ferryRoad = customer("ferry-road");
const twoHarbors = customer("two-harbors");
const quayside = customer("quayside");
const northlight = customer("northlight");
const harborLane = customer("harbor-lane");
const beaconHill = customer("beacon-hill");
const organizer: PrincipalRef = { kind: "MERCHANT", merchantId: makeId<"MerchantId">("merchant-1") };
const merchant = makeId<"MerchantId">("merchant-1");

function proposal(id: string): GroupBuyAggregate {
  return {
    groupBuyId: makeId<"GroupBuyId">(id),
    initiatorRef: ferryRoad,
    organizerRef: organizer,
    terms: {
      skuRef: makeId<"SkuId">("sku-demo-cards"),
      proposedUnitPrice: money("1080", usd),
      listUnitPrice: money("1200", usd),
      threshold: { minimumParticipants: 4, minimumUnits: 40 },
      windowClosesAt: "2026-10-20T18:00:00Z",
    },
    state: "PENDING",
    openedAt: NOW,
    participants: [],
    revision: 1,
  };
}

function interest(groupBuyId: string, participant: PrincipalRef, units: number) {
  return {
    type: "RECORD_GROUP_BUY_INTEREST" as const,
    groupBuyId: makeId<"GroupBuyId">(groupBuyId),
    participantRef: participant,
    quantity: countQuantity(units),
    consentTerms: `Explicitly agreed to appear with a ${units}-box share (interest is not a commitment).`,
  };
}

function leg(index: number, from: PrincipalRef, to: PrincipalRef, item: string): TradeCycleExecutionLeg {
  return {
    legIndex: index,
    fromRef: from,
    toRef: to,
    offeredItemRef: item,
    requiredProofLevel: "P2",
    consentState: "PENDING",
    revision: 1,
  };
}

function cycleA(id: string): TradeCycleExecution {
  return {
    tradeCycleId: makeId<"TradeCycleId">(id),
    initiatingRef: harborLane,
    legs: [
      leg(0, northlight, twoHarbors, "Photography light kit (3 heads)"),
      leg(1, twoHarbors, harborLane, "Overlock sewing machine (4-thread)"),
      leg(2, harborLane, northlight, "Wide-format A1 printer"),
    ],
    executionMode: "ATOMIC",
    bounds: { maxHops: 3, environment: "LAB" },
    state: "OPEN",
    revision: 1,
  };
}

function authorize(cycleId: string, legIndex: number, giver: PrincipalRef, authorizationRef: string) {
  return {
    type: "AUTHORIZE_TRADE_CYCLE_LEG" as const,
    cycleId: makeId<"TradeCycleId">(cycleId),
    legIndex,
    authorizingRef: giver,
    authorizationRef,
  };
}

function newKernel() {
  return new CommerceKernel({ paymentBoundary: new ScriptedPaymentDouble() });
}

async function mustReject(kernel: CommerceKernel, payload: Parameters<typeof env>[0], actor: PrincipalRef, detail: string) {
  const outcome = await kernel.execute(env(payload, actor));
  expect(outcome.status).toBe("REJECTED");
  if (outcome.status === "REJECTED") expect(outcome.reason.detail).toContain(detail);
}

describe("W1-014 linking law 2 — per-side-effect authorization (each downstream object needs its own command)", () => {
  it("a GroupBuy participant's interest consent does not authorize an order — placing an order requires a SEPARATE PLACE_ORDER command with its own idempotency key", async () => {
    const kernel = newKernel();
    await mustExecute(kernel, env({ type: "OPEN_GROUP_BUY_PROPOSAL", groupBuy: proposal("w1gb-auth-1") }, ferryRoad));
    await mustExecute(kernel, env(interest("w1gb-auth-1", ferryRoad, 16), ferryRoad));
    // The interest record carries consentTerms (text only). It is NOT an
    // order authorization: no order exists, no payment intent exists.
    const interestRecord = kernel.view().executionOps().interestOf("w1gb-auth-1", "customer:ferry-road");
    expect(interestRecord?.consentTerms).toContain("interest is not a commitment");
    expect(kernel.view().allOrders()).toEqual([]);
    expect(kernel.view().allPaymentIntents()).toEqual([]);
    // Placing an order is a SEPARATE command under its OWN actor + idempotency
    // key. The order's merchantRef comes from the PLACE_ORDER payload, NOT
    // from any group-buy formation actor or interest consent.
    await mustExecute(kernel, env({
      type: "ADD_CART_LINE",
      cartId: makeId<"CartId">("cart-auth-1"),
      skuId: makeId<"SkuId">("sku-demo-cards"),
      quantity: countQuantity(2),
      unitPrice: money("1999", usd),
    }));
    await mustExecute(kernel, env({
      type: "PLACE_ORDER",
      cartId: makeId<"CartId">("cart-auth-1"),
      merchantId: merchant,
    }));
    const order = kernel.view().allOrders()[0];
    expect(order).toBeDefined();
    expect(order?.merchantRef.merchantId).toBe(merchant);
    // The interest consent text does NOT appear on the order — the order's
    // authority basis is the PLACE_ORDER command's actor, not the interest.
    expect(JSON.stringify(order)).not.toContain("interest is not a commitment");
  });

  it("a TradeCycle leg's execution consent does not authorize inventory reservation — reserving inventory requires a SEPARATE RESERVE_INVENTORY command", async () => {
    const kernel = newKernel();
    await mustExecute(kernel, env({ type: "OPEN_TRADE_CYCLE", cycle: cycleA("w1tc-auth-1") }, harborLane));
    await mustExecute(kernel, env(authorize("w1tc-auth-1", 0, northlight, "auth-northlight-light-kit"), northlight));
    // The leg is CONSENTED with an authorizationRef, but no reservation
    // exists for the offered item — the authorizationRef is scoped to the
    // leg's execution, not to inventory.
    const leg0 = kernel.view().executionOps().tradeCycle("w1tc-auth-1")?.legs[0];
    expect(leg0?.consentState).toBe("CONSENTED");
    expect(leg0?.authorization?.authorizationRef).toBe("auth-northlight-light-kit");
    expect(kernel.view().allReservations()).toEqual([]);
    // Reserving inventory is a SEPARATE command under its OWN actor + idempotency
    // key. The reservation's id is minted by RESERVE_INVENTORY, not derived
    // from the leg's authorizationRef.
    await mustExecute(kernel, env({
      type: "RECEIVE_STOCK",
      skuId: makeId<"SkuId">("sku-demo-cards"),
      locationId: makeId<"LocationId">("loc-auth-1"),
      units: 10,
      reason: "RECEIVING",
    }));
    await mustExecute(kernel, env({
      type: "RESERVE_INVENTORY",
      reservation: {
        reservationId: makeId<"ReservationId">("resv-sep-1"),
        skuId: makeId<"SkuId">("sku-demo-cards"),
        locationId: makeId<"LocationId">("loc-auth-1"),
        units: 3,
        status: "OPEN",
        revision: 1,
      },
    }));
    const reservation = kernel.view().allReservations()[0];
    expect(reservation).toBeDefined();
    expect(reservation?.reservationId).toBe(makeId<"ReservationId">("resv-sep-1"));
    // The leg's authorizationRef does NOT appear on the reservation — the
    // reservation's authority basis is the RESERVE_INVENTORY command, not the
    // leg's execution consent.
    expect(JSON.stringify(reservation)).not.toContain("auth-northlight-light-kit");
  });
});

describe("W1-014 linking law 4 — actor authority derives from the aggregate's own actor laws (not transferable)", () => {
  it("a GroupBuy participant cannot form the deal (organizer-only) — the participant's join consent does not grant formation authority", async () => {
    const kernel = newKernel();
    await mustExecute(kernel, env({ type: "OPEN_GROUP_BUY_PROPOSAL", groupBuy: proposal("w1gb-auth-2") }, ferryRoad));
    await mustExecute(kernel, env(interest("w1gb-auth-2", ferryRoad, 16), ferryRoad));
    // Ferry Road IS a consenting participant, but formation is the
    // organizer's explicit step — the participant's consent to join does NOT
    // transfer formation authority to them.
    await mustReject(kernel, {
      type: "FORM_GROUP_BUY",
      groupBuyId: makeId<"GroupBuyId">("w1gb-auth-2"),
      groupPrice: money("1080", usd),
    }, ferryRoad, "only the organizer may form");
    // A stranger (non-participant, non-organizer) is likewise refused.
    await mustReject(kernel, {
      type: "FORM_GROUP_BUY",
      groupBuyId: makeId<"GroupBuyId">("w1gb-auth-2"),
      groupPrice: money("1080", usd),
    }, beaconHill, "only the organizer may form");
  });

  it("a TradeCycle giver cannot execute the cycle (initiator-only) — the giver's leg consent does not grant execution authority", async () => {
    const kernel = newKernel();
    await mustExecute(kernel, env({ type: "OPEN_TRADE_CYCLE", cycle: cycleA("w1tc-auth-2") }, harborLane));
    await mustExecute(kernel, env(authorize("w1tc-auth-2", 0, northlight, "auth-n"), northlight));
    await mustExecute(kernel, env(authorize("w1tc-auth-2", 1, twoHarbors, "auth-t"), twoHarbors));
    await mustExecute(kernel, env(authorize("w1tc-auth-2", 2, harborLane, "auth-h"), harborLane));
    // All legs are CONSENTED; the cycle is ALL_LEGS_AUTHORIZED. But execution
    // is the initiating principal's command only — a giver (who authorized
    // their own leg) cannot execute the whole cycle.
    expect(kernel.view().executionOps().tradeCycle("w1tc-auth-2")?.state).toBe("ALL_LEGS_AUTHORIZED");
    await mustReject(kernel, {
      type: "EXECUTE_TRADE_CYCLE",
      cycleId: makeId<"TradeCycleId">("w1tc-auth-2"),
    }, northlight, "only the initiating principal may execute");
    await mustReject(kernel, {
      type: "EXECUTE_TRADE_CYCLE",
      cycleId: makeId<"TradeCycleId">("w1tc-auth-2"),
    }, twoHarbors, "only the initiating principal may execute");
  });

  it("a spoofed authorization (actor ≠ authorizingRef) is rejected at the kernel boundary — consent cannot be forged", async () => {
    const kernel = newKernel();
    await mustExecute(kernel, env({ type: "OPEN_TRADE_CYCLE", cycle: cycleA("w1tc-auth-3") }, harborLane));
    // Two Harbors attempts to authorize leg 0 (which is Northlight's to give)
    // attributing the authorization to Northlight — a forged consent. The
    // kernel rejects this at the boundary: the actor must BE the principal
    // the authorization is attributed to.
    await mustReject(kernel, authorize("w1tc-auth-3", 0, northlight, "auth-spoofed-by-two-harbors"), twoHarbors, "the actor must be the principal the authorization is attributed to");
    // The leg stays PENDING — no consent was forged.
    expect(kernel.view().executionOps().tradeCycle("w1tc-auth-3")?.legs[0]?.consentState).toBe("PENDING");
  });

  it("a non-organizer cannot decide the proposal (organizer-only) — the initiator's open consent does not grant decision authority", async () => {
    const kernel = newKernel();
    await mustExecute(kernel, env({ type: "OPEN_GROUP_BUY_PROPOSAL", groupBuy: proposal("w1gb-auth-3") }, ferryRoad));
    // Ferry Road opened the proposal, but ACCEPT/COUNTER/REJECT are the
    // organizer's decisions — the initiator cannot decide their own proposal.
    await mustReject(kernel, {
      type: "DECIDE_GROUP_BUY_PROPOSAL",
      groupBuyId: makeId<"GroupBuyId">("w1gb-auth-3"),
      trigger: "REJECT",
      rejectionReason: "no",
    }, ferryRoad, "only the organizer may decide");
    // ACCEPT_COUNTER is the one decision the initiator may take — but ONLY
    // after the organizer has countered (the proposal must be COUNTERED).
    // The organizer counters first.
    await mustExecute(kernel, env({
      type: "DECIDE_GROUP_BUY_PROPOSAL",
      groupBuyId: makeId<"GroupBuyId">("w1gb-auth-3"),
      trigger: "COUNTER",
      counterTerms: { unitPrice: money("1160", usd), minimumUnits: 36 },
    }, organizer));
    // A stranger (not the initiator) cannot ACCEPT_COUNTER — only the
    // proposal initiator may respond to a counter. Two Harbors is not the
    // initiator; their attempt is refused.
    await mustReject(kernel, {
      type: "DECIDE_GROUP_BUY_PROPOSAL",
      groupBuyId: makeId<"GroupBuyId">("w1gb-auth-3"),
      trigger: "ACCEPT_COUNTER",
    }, twoHarbors, "only the proposal initiator may accept a counter");
  });

  it("the downstream command's actor is independent of the upstream command's actor — different principals issue the downstream command under their own authority", async () => {
    const kernel = newKernel();
    // Upstream: organizer opens and forms the GroupBuy (organizer authority).
    await mustExecute(kernel, env({ type: "OPEN_GROUP_BUY_PROPOSAL", groupBuy: proposal("w1gb-auth-4") }, ferryRoad));
    await mustExecute(kernel, env(interest("w1gb-auth-4", ferryRoad, 16), ferryRoad));
    await mustExecute(kernel, env(interest("w1gb-auth-4", twoHarbors, 12), twoHarbors));
    await mustExecute(kernel, env(interest("w1gb-auth-4", quayside, 12), quayside));
    await mustExecute(kernel, env({
      type: "DECIDE_GROUP_BUY_PROPOSAL",
      groupBuyId: makeId<"GroupBuyId">("w1gb-auth-4"),
      trigger: "ACCEPT",
    }, organizer));
    await mustExecute(kernel, env(interest("w1gb-auth-4", harborLane, 6), harborLane));
    await mustExecute(kernel, env({
      type: "FORM_GROUP_BUY",
      groupBuyId: makeId<"GroupBuyId">("w1gb-auth-4"),
      groupPrice: money("1080", usd),
    }, organizer));
    // Downstream: a CUSTOMER (Ferry Road, a participant) places an order
    // under their own authority. The order's customerRef comes from the
    // PLACE_ORDER actor, NOT from the group-buy organizer. The two authorities
    // are independent — the order is not "the organizer's order" just because
    // the organizer formed the group buy.
    await mustExecute(kernel, env({
      type: "ADD_CART_LINE",
      cartId: makeId<"CartId">("cart-auth-2"),
      skuId: makeId<"SkuId">("sku-demo-cards"),
      quantity: countQuantity(2),
      unitPrice: money("1999", usd),
    }));
    await mustExecute(kernel, env({
      type: "PLACE_ORDER",
      cartId: makeId<"CartId">("cart-auth-2"),
      merchantId: merchant,
    }, ferryRoad));
    const order = kernel.view().allOrders()[0];
    expect(order).toBeDefined();
    // The order's customerRef is the CUSTOMER who placed it (Ferry Road),
    // NOT the organizer (merchant) who formed the group buy.
    expect(order?.customerRef).toBeDefined();
    expect(principalRefKey(order?.customerRef ?? organizer)).toBe("customer:ferry-road");
    // The order's merchantRef is the merchant from the PLACE_ORDER payload —
    // independent of the group-buy formation actor.
    expect(order?.merchantRef.merchantId).toBe(merchant);
  });
});

// ============================================================================
// Stage 2+ future surface — precisely documented, NOT faked, kernel untouched.
// ============================================================================
//
// The decision packet §4 Stage 2 introduces kernel-native draft-linking
// commands (LINK_GROUPBUY_TO_ORDER_DRAFT / LINK_TRADECYCLE_LEG_TO_SETTLEMENT_DRAFT)
// with per-effect authorization records. At Stage 0 those commands do NOT
// exist on the kernel command surface — there is no command whose payload
// carries a "source GroupBuy id" or "source TradeCycle leg" that produces a
// draft order/settlement record. The full linking-law-2/4 spec for the
// LINK command (only the organizer may propose a linked draft; only the
// consenting participant may consent to the draft; a non-consenting
// participant's draft consent is refused) cannot be executed against the
// current kernel because the LINK command itself is absent. The laws ARE
// observable on the existing formation/execution surface (above) and on the
// existing downstream surface (PLACE_ORDER's actor is independent); the
// Stage-2-specific linking-authority law is recorded here as a skip with the
// exact future stage that introduces it, per the work order's "never fake a
// pass, never touch the kernel" rule.
describe.skip("W1-014 linking law 2/4 — Stage 2 LINK_GROUPBUY_TO_ORDER_DRAFT authority (future surface)", () => {
  // FUTURE STAGE: Stage 2 (decision packet §4, §7) introduces
  //   LINK_GROUPBUY_TO_ORDER_DRAFT and LINK_TRADECYCLE_LEG_TO_SETTLEMENT_DRAFT
  //   as additive kernel commands. When they exist, this block will specify:
  //   - only the organizer may propose a linked order draft from a formed
  //     GroupBuy (actor authority derives from the aggregate's organizer law);
  //   - only a consenting participant may consent to a draft derived from
  //     their group-buy share (per-side-effect authorization, law 2);
  //   - a non-consenting participant (withdrawn before formation, or never
  //     enrolled) cannot consent to a draft on their behalf (law 4);
  //   - nobody else (stranger principal) may propose or consent (law 4).
  // At Stage 0 the LINK command does not exist; running these specs would
  // require either faking a pass (forbidden) or modifying the kernel
  // (forbidden). The skip records the gap honestly; Stage 2 will replace it
  // with executable specs.
  it("FUTURE: only the organizer may propose a linked order draft from a formed GroupBuy", () => {
    expect(true).toBe(true);
  });
  it("FUTURE: only a consenting participant may consent to a draft derived from their share", () => {
    expect(true).toBe(true);
  });
  it("FUTURE: a withdrawn / never-enrolled participant cannot consent to a draft on their behalf", () => {
    expect(true).toBe(true);
  });
});
