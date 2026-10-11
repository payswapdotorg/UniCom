/**
 * W2-015 Stage 1 — linking-draft helper unit tests.
 *
 * Covers the pure helper module: the prefill builders (GroupBuy + TradeCycle),
 * the kill switch, the ledger, and the prefill display objects. These are the
 * laws made executable at the unit level (no React rendering).
 *
 * - groupBuyDraftPrefillOf: derives the prefill from a FORMED aggregate + share;
 *   refuses (throws) if the aggregate is NOT FORMED (law 1 — formation truth
 *   is separate from downstream commitments).
 * - tradeCycleLegDraftPrefillOf: derives the prefill from a COMMITTED leg;
 *   refuses (throws) if the leg is NOT COMMITTED (law 1).
 * - LINKING_DRAFT_ENABLED: the kill switch (a single constant).
 * - LinkedDraftLedger: the local DEMO ledger (record / forCart / all / reset).
 * - addCartLinePrefillOf / placeOrderPrefillOf: display objects for the
 *   existing typed commands (never issues a command).
 */
import { describe, expect, it } from "vitest";
import {
  LINKING_DRAFT_ENABLED,
  LINKING_DISABLED_LABEL,
  LinkedDraftLedger,
  addCartLinePrefillOf,
  draftIdOf,
  groupBuyDraftPrefillOf,
  isLinkingDraftEnabled,
  placeOrderPrefillOf,
  tradeCycleLegDraftPrefillOf,
} from "./linking-draft.js";
import { countQuantity, currency, makeId, money } from "@unicom/commerce";
import type { GroupBuyAggregate, PrincipalRef, TradeCycleExecution, TradeCycleExecutionLeg } from "@unicom/commerce";

const usd = currency("USD");
const organizer: PrincipalRef = { kind: "MERCHANT", merchantId: makeId<"MerchantId">("merchant-1") };
const buyer: PrincipalRef = { kind: "CUSTOMER", customerId: makeId<"CustomerId">("harbor-lane") };
const twoHarbors: PrincipalRef = { kind: "CUSTOMER", customerId: makeId<"CustomerId">("two-harbors") };

function formedAggregate(): GroupBuyAggregate {
  return {
    groupBuyId: makeId<"GroupBuyId">("w2ld-prop-1"),
    initiatorRef: buyer,
    organizerRef: organizer,
    terms: {
      skuRef: makeId<"SkuId">("sku-demo-cards"),
      proposedUnitPrice: money("1120", usd),
      listUnitPrice: money("1275", usd),
      threshold: { minimumParticipants: 4, minimumUnits: 40 },
      windowClosesAt: "2026-10-20T18:00:00Z",
    },
    state: "FORMED",
    openedAt: "2026-10-12T09:00:00Z",
    formation: { groupPrice: money("1120", usd), poolValue: money("44800", usd), formedAt: "2026-10-12T09:05:00Z" },
    participants: [{ participantRef: buyer, quantity: countQuantity(4) }],
    revision: 6,
  };
}

function pendingAggregate(): GroupBuyAggregate {
  return { ...formedAggregate(), state: "PENDING", formation: undefined, participants: [], revision: 1 };
}

function committedCycle(): TradeCycleExecution {
  return {
    tradeCycleId: makeId<"TradeCycleId">("w2tc-cycle-a"),
    initiatingRef: buyer,
    legs: [committedLeg(0, twoHarbors, buyer, "Overlock sewing machine")],
    executionMode: "ATOMIC",
    bounds: { maxHops: 5, environment: "LAB" },
    state: "COMMITTED",
    revision: 5,
  };
}

function committedLeg(index: number, from: PrincipalRef, to: PrincipalRef, item: string): TradeCycleExecutionLeg {
  return {
    legIndex: index,
    fromRef: from,
    toRef: to,
    offeredItemRef: item,
    requiredProofLevel: "P2",
    consentState: "COMMITTED",
    revision: 2,
  };
}

function pendingLeg(): TradeCycleExecutionLeg {
  return { ...committedLeg(0, twoHarbors, buyer, "Overlock sewing machine"), consentState: "PENDING", revision: 1 };
}

describe("W2-015 linking-draft helper — prefill builders", () => {
  it("groupBuyDraftPrefillOf derives the prefill from a FORMED aggregate + share (provenance, sku, price, units, cart id)", () => {
    const aggregate = formedAggregate();
    const share = aggregate.participants[0]!;
    const prefill = groupBuyDraftPrefillOf(aggregate, share, buyer);
    expect(prefill.sourceAggregateId).toBe("w2ld-prop-1");
    expect(prefill.sourceKind).toBe("GROUP_BUY_FORMED");
    expect(prefill.actingPrincipal).toEqual(buyer);
    expect(prefill.consentBasis).toContain("Consented to appear in w2ld-prop-1");
    expect(prefill.consentBasis).toContain("4-unit share");
    expect(prefill.consentBasis).toContain("Placement requires a separate PLACE_ORDER");
    expect(prefill.skuRef).toBe("sku-demo-cards");
    expect(prefill.unitPrice.amountMinor).toBe("1120");
    expect(prefill.units).toBe(4);
    expect(prefill.cartId).toBe("cart-link-gb-w2ld-prop-1");
  });

  it("groupBuyDraftPrefillOf refuses (throws) if the aggregate is NOT FORMED — law 1: formation truth is separate", () => {
    const aggregate = pendingAggregate();
    const share = { participantRef: buyer, quantity: countQuantity(4) };
    expect(() => groupBuyDraftPrefillOf(aggregate, share, buyer)).toThrow(/not FORMED/);
  });

  it("tradeCycleLegDraftPrefillOf derives the prefill from a COMMITTED leg (item ref, units=1, price=0 — human fills price)", () => {
    const cycle = committedCycle();
    const leg = cycle.legs[0]!;
    const prefill = tradeCycleLegDraftPrefillOf(cycle, leg, buyer);
    expect(prefill.sourceAggregateId).toBe("w2tc-cycle-a");
    expect(prefill.sourceKind).toBe("TRADECYCLE_LEG_EXECUTED");
    expect(prefill.actingPrincipal).toEqual(buyer);
    expect(prefill.consentBasis).toContain("Leg 0 of w2tc-cycle-a committed");
    expect(prefill.consentBasis).toContain("the trade-cycle aggregate carries no money");
    expect(prefill.skuRef).toBe("Overlock sewing machine");
    expect(prefill.unitPrice.amountMinor).toBe("0");
    expect(prefill.units).toBe(1);
    expect(prefill.cartId).toBe("cart-link-tc-w2tc-cycle-a-leg-0");
  });

  it("tradeCycleLegDraftPrefillOf refuses (throws) if the leg is NOT COMMITTED — law 1: execution truth is separate", () => {
    const cycle = committedCycle();
    const leg = pendingLeg();
    expect(() => tradeCycleLegDraftPrefillOf(cycle, leg, buyer)).toThrow(/not COMMITTED/);
  });
});

describe("W2-015 linking-draft helper — kill switch", () => {
  it("LINKING_DRAFT_ENABLED is a boolean constant (the single kill switch)", () => {
    expect(typeof LINKING_DRAFT_ENABLED).toBe("boolean");
  });

  it("isLinkingDraftEnabled() returns the kill-switch value", () => {
    expect(isLinkingDraftEnabled()).toBe(LINKING_DRAFT_ENABLED);
  });

  it("LINKING_DISABLED_LABEL is a non-empty human label (honest 'linking disabled')", () => {
    expect(typeof LINKING_DISABLED_LABEL).toBe("string");
    expect(LINKING_DISABLED_LABEL.length).toBeGreaterThan(0);
    expect(LINKING_DISABLED_LABEL).toContain("disabled");
  });
});

describe("W2-015 linking-draft helper — ledger (local DEMO state, never kernel truth)", () => {
  it("records a confirmed draft and retrieves it by cart id", () => {
    const ledger = new LinkedDraftLedger();
    const aggregate = formedAggregate();
    const share = aggregate.participants[0]!;
    const prefill = groupBuyDraftPrefillOf(aggregate, share, buyer);
    const recorded = ledger.record(prefill, buyer, "2026-10-12T09:10:00Z");
    expect(recorded.prefill).toEqual(prefill);
    expect(recorded.confirmedBy).toEqual(buyer);
    expect(recorded.recordedAt).toBe("2026-10-12T09:10:00Z");
    expect(ledger.forCart(prefill.cartId)).toEqual(recorded);
    expect(ledger.all()).toHaveLength(1);
  });

  it("forCart returns null for an unknown cart id", () => {
    const ledger = new LinkedDraftLedger();
    expect(ledger.forCart("unknown")).toBeNull();
  });

  it("reset clears the ledger", () => {
    const ledger = new LinkedDraftLedger();
    const aggregate = formedAggregate();
    const share = aggregate.participants[0]!;
    const prefill = groupBuyDraftPrefillOf(aggregate, share, buyer);
    ledger.record(prefill, buyer, "2026-10-12T09:10:00Z");
    expect(ledger.all()).toHaveLength(1);
    ledger.reset();
    expect(ledger.all()).toHaveLength(0);
    expect(ledger.forCart(prefill.cartId)).toBeNull();
  });
});

describe("W2-015 linking-draft helper — prefill display objects (never issues a command)", () => {
  it("addCartLinePrefillOf renders the ADD_CART_LINE shape (cart, sku, units, price, currency)", () => {
    const aggregate = formedAggregate();
    const share = aggregate.participants[0]!;
    const prefill = groupBuyDraftPrefillOf(aggregate, share, buyer);
    const addCartLine = addCartLinePrefillOf(prefill);
    expect(addCartLine.type).toBe("ADD_CART_LINE");
    expect(addCartLine.cartId).toBe("cart-link-gb-w2ld-prop-1");
    expect(addCartLine.skuRef).toBe("sku-demo-cards");
    expect(addCartLine.units).toBe(4);
    expect(addCartLine.unitPriceMinor).toBe("1120");
    expect(addCartLine.currency).toBe("USD");
  });

  it("placeOrderPrefillOf renders the PLACE_ORDER shape (cart, merchant)", () => {
    const aggregate = formedAggregate();
    const share = aggregate.participants[0]!;
    const prefill = groupBuyDraftPrefillOf(aggregate, share, buyer);
    const placeOrder = placeOrderPrefillOf(prefill, "merchant-1");
    expect(placeOrder.type).toBe("PLACE_ORDER");
    expect(placeOrder.cartId).toBe("cart-link-gb-w2ld-prop-1");
    expect(placeOrder.merchantId).toBe("merchant-1");
  });

  it("draftIdOf renders a DEMO-labelled draft id", () => {
    const aggregate = formedAggregate();
    const share = aggregate.participants[0]!;
    const prefill = groupBuyDraftPrefillOf(aggregate, share, buyer);
    expect(draftIdOf(prefill)).toBe("w2ld-draft-w2ld-prop-1");
  });
});
