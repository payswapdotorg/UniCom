/**
 * Contract tests — lifecycle state machines for orders, returns,
 * subscriptions, fulfillment shipments, circular commerce and B2B, plus
 * opaque opportunity references (Worker 2's lane stays opaque).
 */
import { describe, expect, it } from "vitest";
import {
  advanceConsignment,
  advanceListing,
  advanceRental,
  advanceReturn,
  advanceSubscription,
  consignmentPayout,
  currency,
  depositReturn,
  enforceMinimumOrder,
  makeId,
  money,
  negotiatedPrice,
  orderTransition,
  returnTransition,
  shipmentTransition,
  subscriptionTransition,
  type B2BPriceList,
  type ConsignmentAgreement,
  type OrderState,
  type OpportunityReference,
  type RentalAgreement,
  type ResaleListing,
  type ReturnAuthorization,
  type Subscription,
} from "../contract.js";

const usd = currency("USD");

describe("order state machine (invalid transitions are rejections)", () => {
  const happy: readonly [OrderState, Parameters<typeof orderTransition>[1], OrderState][] = [
    ["PENDING", "PAYMENT_CONFIRMED", "PAID"],
    ["PAID", "FULFILLMENT_STARTED", "PARTIALLY_FULFILLED"],
    ["PARTIALLY_FULFILLED", "FULFILLMENT_COMPLETED", "FULFILLED"],
    ["FULFILLED", "ORDER_COMPLETED", "COMPLETED"],
  ];
  it("walks the happy path deterministically", () => {
    let state: OrderState = "PENDING";
    for (const [from, trigger, to] of happy) {
      expect(state).toBe(from);
      const next = orderTransition(state, trigger);
      expect(next).toMatchObject({ ok: true, value: to });
      state = to;
    }
    expect(state).toBe("COMPLETED");
  });

  it("rejects impossible transitions with coded errors", () => {
    expect(orderTransition("PENDING", "FULFILLMENT_STARTED")).toMatchObject({ ok: false });
    expect(orderTransition("COMPLETED", "CANCELLED")).toMatchObject({ ok: false });
    expect(orderTransition("CANCELLED", "PAYMENT_CONFIRMED")).toMatchObject({ ok: false });
    expect(orderTransition("FULFILLED", "CANCELLED")).toMatchObject({ ok: false });
  });

  it("cancellation is possible only before fulfillment", () => {
    expect(orderTransition("PENDING", "CANCELLED")).toMatchObject({ ok: true, value: "CANCELLED" });
    expect(orderTransition("PAID", "CANCELLED")).toMatchObject({ ok: true, value: "CANCELLED" });
    expect(orderTransition("PARTIALLY_FULFILLED", "CANCELLED")).toMatchObject({ ok: false });
  });
});

describe("returns and refunds", () => {
  it("walks REQUESTED → AUTHORIZED → IN_TRANSIT → RECEIVED → INSPECTED → RESOLVED", () => {
    const authorization: ReturnAuthorization = {
      returnId: makeId<"ReturnId">("ret-1"),
      orderId: makeId<"OrderId">("order-1"),
      resolution: "REFUND",
      lines: [{ skuId: makeId<"SkuId">("sku-x"), quantity: { kind: "COUNT", units: 1 }, reason: "DEFECTIVE" }],
      state: "REQUESTED",
      revision: 1,
    };
    let current = authorization;
    for (const trigger of ["AUTHORIZE", "SHIP_BACK", "RECEIVE", "INSPECT", "RESOLVE"] as const) {
      const next = advanceReturn(current, trigger);
      expect(next).toHaveProperty("ok", true);
      if (next.ok) current = next.value;
    }
    expect(current.state).toBe("RESOLVED");
    expect(current.revision).toBe(6);
  });

  it("rejects out-of-sequence return triggers", () => {
    expect(returnTransition("REQUESTED", "RECEIVE")).toMatchObject({ ok: false });
    expect(returnTransition("RESOLVED", "AUTHORIZE")).toMatchObject({ ok: false });
  });
});

describe("subscriptions", () => {
  it("preserves PAST_DUE (customer action required) instead of cancelling", () => {
    const subscription: Subscription = {
      subscriptionId: makeId<"SubscriptionId">("sub-1"),
      customerId: makeId<"CustomerId">("cust-1"),
      planId: makeId<"SubscriptionPlanId">("plan-1"),
      state: "ACTIVE",
      revision: 1,
    };
    const pastDue = advanceSubscription(subscription, "PAYMENT_FAILED");
    expect(pastDue).toMatchObject({ ok: true, value: { state: "PAST_DUE" } });
    const recovered = pastDue.ok ? advanceSubscription(pastDue.value, "PAYMENT_RECOVERED") : pastDue;
    expect(recovered).toMatchObject({ ok: true, value: { state: "ACTIVE" } });
  });

  it("rejects invalid subscription transitions", () => {
    expect(subscriptionTransition("CANCELLED", "RESUME")).toMatchObject({ ok: false });
    expect(subscriptionTransition("PENDING", "PAUSE")).toMatchObject({ ok: false });
  });
});

describe("fulfillment shipments", () => {
  it("UNKNOWN (ambiguous carrier state) resolves only through confirmation", () => {
    expect(shipmentTransition("IN_TRANSIT", "CONFIRM_DELIVERY")).toMatchObject({ ok: true, value: "DELIVERED" });
    expect(shipmentTransition("UNKNOWN", "CONFIRM_DELIVERY")).toMatchObject({ ok: true, value: "DELIVERED" });
    expect(shipmentTransition("UNKNOWN", "PACK")).toMatchObject({ ok: false });
    expect(shipmentTransition("DELIVERED", "TENDER")).toMatchObject({ ok: false });
  });
});

describe("circular commerce (resale / rental / consignment)", () => {
  it("resale listings walk DRAFT → ACTIVE → RESERVED → SOLD", () => {
    const listing: ResaleListing = {
      listingId: makeId<"ResaleListingId">("list-1"),
      sellerRef: { kind: "CUSTOMER", customerId: makeId<"CustomerId">("cust-1") },
      skuRef: makeId<"SkuId">("sku-jacket"),
      itemCondition: "GOOD",
      askingPrice: money("4500", usd),
      state: "DRAFT",
      revision: 1,
    };
    let current = listing;
    for (const trigger of ["PUBLISH", "RESERVE", "MARK_SOLD"] as const) {
      const next = advanceListing(current, trigger);
      expect(next).toHaveProperty("ok", true);
      if (next.ok) current = next.value;
    }
    expect(current.state).toBe("SOLD");
  });

  it("rental agreements preserve OVERDUE instead of failing, then complete on return", () => {
    const agreement: RentalAgreement = {
      rentalAgreementId: makeId<"RentalAgreementId">("rent-2"),
      itemSkuRef: makeId<"SkuId">("sku-drill"),
      renterRef: { kind: "CUSTOMER", customerId: makeId<"CustomerId">("cust-9") },
      period: { startsAt: "2026-10-01", endsAt: "2026-10-08" },
      ratePerPeriod: money("2500", usd),
      deposit: money("10000", usd),
      state: "ACTIVE",
      revision: 1,
    };
    const overdue = advanceRental(agreement, "MARK_OVERDUE");
    expect(overdue).toMatchObject({ ok: true, value: { state: "OVERDUE" } });
    const returned = overdue.ok ? advanceRental(overdue.value, "RETURN") : overdue;
    expect(returned).toMatchObject({ ok: true, value: { state: "RETURNED" } });
    const completed = returned.ok ? advanceRental(returned.value, "COMPLETE") : returned;
    expect(completed).toMatchObject({ ok: true, value: { state: "COMPLETED", revision: 4 } });
  });

  it("rental deposit return is exact and policy-driven", () => {
    const agreement: RentalAgreement = {
      rentalAgreementId: makeId<"RentalAgreementId">("rent-1"),
      itemSkuRef: makeId<"SkuId">("sku-drill"),
      renterRef: { kind: "CUSTOMER", customerId: makeId<"CustomerId">("cust-2") },
      period: { startsAt: "2026-10-01", endsAt: "2026-10-08" },
      ratePerPeriod: money("2500", usd),
      deposit: money("10000", usd),
      state: "RETURNED",
      revision: 3,
    };
    const wear10 = depositReturn(agreement, 1_000, "HALF_UP");
    expect(wear10).toMatchObject({
      ok: true,
      value: { withheld: { amountMinor: "1000" }, refunded: { amountMinor: "9000" } },
    });
    const full = depositReturn(agreement, 10_000, "HALF_UP");
    expect(full).toMatchObject({ ok: true, value: { refunded: { amountMinor: "0" } } });
    expect(depositReturn(agreement, 10_001, "HALF_UP")).toMatchObject({ ok: false });
  });

  it("consignment payouts split exactly by basis points", () => {
    const split = consignmentPayout(money("10000", usd), 6_000, "HALF_UP");
    expect(split).toMatchObject({
      ok: true,
      value: { consignor: { amountMinor: "6000" }, merchant: { amountMinor: "4000" } },
    });
    const agreement: ConsignmentAgreement = {
      consignmentId: makeId<"ConsignmentId">("cons-1"),
      consignorRef: { kind: "CUSTOMER", customerId: makeId<"CustomerId">("cust-3") },
      consignorShareBps: 6_000,
      state: "ACTIVE",
      revision: 1,
    };
    const settled = advanceConsignment(agreement, "SETTLE");
    expect(settled).toMatchObject({ ok: true, value: { state: "SETTLED", revision: 2 } });
    expect(advanceConsignment(settled.ok ? settled.value : agreement, "SETTLE")).toMatchObject({ ok: false });
  });
});

describe("B2B", () => {
  const list: B2BPriceList = {
    priceListId: "b2b-pl-1",
    companyAccountId: makeId<"CompanyAccountId">("co-1"),
    currency: usd,
    entries: [
      { skuId: makeId<"SkuId">("sku-flour"), negotiatedPrice: money("850", usd), minQuantity: 10 },
      { skuId: makeId<"SkuId">("sku-sugar"), negotiatedPrice: money("990", usd), minQuantity: 25 },
    ],
  };

  it("negotiated prices apply only at/above the minimum quantity", () => {
    expect(negotiatedPrice(list, makeId<"SkuId">("sku-flour"), 10)).toMatchObject({
      ok: true,
      value: { amountMinor: "850" },
    });
    expect(negotiatedPrice(list, makeId<"SkuId">("sku-flour"), 9)).toMatchObject({
      ok: false,
      error: { code: "QUANTITY_BELOW_MINIMUM" },
    });
    expect(negotiatedPrice(list, makeId<"SkuId">("sku-ghost"), 10)).toMatchObject({
      ok: false,
      error: { code: "ENTRY_NOT_FOUND" },
    });
  });

  it("minimum-order policy gates deterministically", () => {
    const policy = { minimumOrderValue: money("50000", usd) };
    expect(enforceMinimumOrder(policy, money("50000", usd))).toMatchObject({ ok: true });
    expect(enforceMinimumOrder(policy, money("49999", usd))).toMatchObject({
      ok: false,
      error: { code: "BELOW_MINIMUM_ORDER" },
    });
    expect(enforceMinimumOrder(policy, money("50000", currency("EUR")))).toMatchObject({
      ok: false,
      error: { code: "CURRENCY_MISMATCH" },
    });
  });
});

describe("opaque opportunity references (Worker 2's lane)", () => {
  it("links are opaque ids + roles — no coordination semantics leak in", () => {
    const reference: OpportunityReference = {
      kind: "GROUP_BUY",
      ref: makeId<"GroupBuyId">("gb-1"),
      role: "SATISFIES",
    };
    const asString: string = reference.ref;
    expect(asString).toBe("gb-1");
    expect(reference.role).toBe("SATISFIES");
    // The reference carries no terms/commitments — compile-time:
    // @ts-expect-error — group-buy terms belong to Worker 2's lane, not this package
    const leaked = reference.participantCommitments;
    void leaked;
  });
});
