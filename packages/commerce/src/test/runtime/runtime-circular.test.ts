/**
 * W1-002 scope coverage: subscription / B2B / resale / rental / consignment
 * flows on the kernel, plus returns and exchanges. All aggregates are
 * event-sourced kernel state driven by idempotent commands through the
 * frozen deterministic state machines; B2B negotiated prices resolve at the
 * command-construction edge (pure domain function) and the kernel enforces
 * the minimum-order policy at PLACE_ORDER.
 */
import { describe, expect, it } from "vitest";
import {
  CommerceKernel,
  consignmentPayout,
  countQuantity,
  currency,
  depositReturn,
  enforceMinimumOrder,
  makeId,
  money,
  negotiatedPrice,
  type B2BPriceList,
  type ConsignmentAgreement,
  type RentalAgreement,
  type ResaleListing,
  type Subscription,
} from "../../contract.js";
import { ScriptedPaymentDouble } from "./support/payment-double.js";
import { env, mustExecute } from "./support/envelopes.js";

const usd = currency("USD");
const flour = makeId<"SkuId">("sku-flour");
const merchantId = makeId<"MerchantId">("merchant-1");

describe("circular commerce flows on the kernel — subscriptions", () => {
  it("PENDING → ACTIVE → PAST_DUE (preserved) → ACTIVE → CANCELLED, all event-sourced", async () => {
    const kernel = new CommerceKernel();
    const subscription: Subscription = {
      subscriptionId: makeId<"SubscriptionId">("sub-1"),
      customerId: makeId<"CustomerId">("cust-1"),
      planId: makeId<"SubscriptionPlanId">("plan-monthly-9"),
      state: "PENDING",
      revision: 1,
    };
    await mustExecute(kernel, env({ type: "OPEN_SUBSCRIPTION", subscription }));
    expect(kernel.view().subscription("sub-1")?.state).toBe("PENDING");
    await mustExecute(kernel, env({ type: "ADVANCE_SUBSCRIPTION", subscriptionId: makeId<"SubscriptionId">("sub-1"), trigger: "ACTIVATE" }));
    await mustExecute(kernel, env({ type: "ADVANCE_SUBSCRIPTION", subscriptionId: makeId<"SubscriptionId">("sub-1"), trigger: "PAYMENT_FAILED" }));
    expect(kernel.view().subscription("sub-1")?.state).toBe("PAST_DUE");
    await mustExecute(kernel, env({ type: "ADVANCE_SUBSCRIPTION", subscriptionId: makeId<"SubscriptionId">("sub-1"), trigger: "PAYMENT_RECOVERED" }));
    expect(kernel.view().subscription("sub-1")?.state).toBe("ACTIVE");
    await mustExecute(kernel, env({ type: "ADVANCE_SUBSCRIPTION", subscriptionId: makeId<"SubscriptionId">("sub-1"), trigger: "PAUSE" }));
    await mustExecute(kernel, env({ type: "ADVANCE_SUBSCRIPTION", subscriptionId: makeId<"SubscriptionId">("sub-1"), trigger: "RESUME" }));
    await mustExecute(kernel, env({ type: "ADVANCE_SUBSCRIPTION", subscriptionId: makeId<"SubscriptionId">("sub-1"), trigger: "CANCEL" }));
    expect(kernel.view().subscription("sub-1")).toMatchObject({ state: "CANCELLED", revision: 7 });
    const invalid = await kernel.execute(env({ type: "ADVANCE_SUBSCRIPTION", subscriptionId: makeId<"SubscriptionId">("sub-1"), trigger: "RESUME" }));
    expect(invalid.status).toBe("REJECTED");
  });
});

describe("circular commerce flows on the kernel — resale / rental / consignment", () => {
  it("resale listing walks DRAFT → ACTIVE → RESERVED → SOLD on the kernel", async () => {
    const kernel = new CommerceKernel();
    const listing: ResaleListing = {
      listingId: makeId<"ResaleListingId">("list-1"),
      sellerRef: { kind: "CUSTOMER", customerId: makeId<"CustomerId">("cust-2") },
      skuRef: makeId<"SkuId">("sku-jacket"),
      itemCondition: "GOOD",
      askingPrice: money("4500", usd),
      state: "DRAFT",
      revision: 1,
    };
    await mustExecute(kernel, env({ type: "OPEN_LISTING", listing }));
    for (const trigger of ["PUBLISH", "RESERVE", "MARK_SOLD"] as const) {
      await mustExecute(kernel, env({ type: "ADVANCE_LISTING", listingId: makeId<"ResaleListingId">("list-1"), trigger }));
    }
    expect(kernel.view().listing("list-1")).toMatchObject({ state: "SOLD", revision: 4 });
  });

  it("rental agreement preserves OVERDUE and returns the deposit exactly", async () => {
    const kernel = new CommerceKernel();
    const rental: RentalAgreement = {
      rentalAgreementId: makeId<"RentalAgreementId">("rent-1"),
      itemSkuRef: makeId<"SkuId">("sku-drill"),
      renterRef: { kind: "CUSTOMER", customerId: makeId<"CustomerId">("cust-3") },
      period: { startsAt: "2026-10-01", endsAt: "2026-10-08" },
      ratePerPeriod: money("2500", usd),
      deposit: money("10000", usd),
      state: "REQUESTED",
      revision: 1,
    };
    await mustExecute(kernel, env({ type: "OPEN_RENTAL", rental }));
    await mustExecute(kernel, env({ type: "ADVANCE_RENTAL", rentalAgreementId: makeId<"RentalAgreementId">("rent-1"), trigger: "START" }));
    await mustExecute(kernel, env({ type: "ADVANCE_RENTAL", rentalAgreementId: makeId<"RentalAgreementId">("rent-1"), trigger: "MARK_OVERDUE" }));
    expect(kernel.view().rental("rent-1")?.state).toBe("OVERDUE");
    await mustExecute(kernel, env({ type: "ADVANCE_RENTAL", rentalAgreementId: makeId<"RentalAgreementId">("rent-1"), trigger: "RETURN" }));
    await mustExecute(kernel, env({ type: "ADVANCE_RENTAL", rentalAgreementId: makeId<"RentalAgreementId">("rent-1"), trigger: "COMPLETE" }));
    expect(kernel.view().rental("rent-1")).toMatchObject({ state: "COMPLETED", revision: 5 });
    const deposit = depositReturn(kernel.view().rental("rent-1") as RentalAgreement, 1_000, "HALF_UP");
    expect(deposit).toMatchObject({ ok: true, value: { withheld: { amountMinor: "1000" }, refunded: { amountMinor: "9000" } } });
  });

  it("consignment agreement settles and splits proceeds exactly", async () => {
    const kernel = new CommerceKernel();
    const consignment: ConsignmentAgreement = {
      consignmentId: makeId<"ConsignmentId">("cons-1"),
      consignorRef: { kind: "CUSTOMER", customerId: makeId<"CustomerId">("cust-4") },
      consignorShareBps: 6_000,
      state: "PROPOSED",
      revision: 1,
    };
    await mustExecute(kernel, env({ type: "OPEN_CONSIGNMENT", consignment }));
    await mustExecute(kernel, env({ type: "ADVANCE_CONSIGNMENT", consignmentId: makeId<"ConsignmentId">("cons-1"), trigger: "ACCEPT" }));
    await mustExecute(kernel, env({ type: "ADVANCE_CONSIGNMENT", consignmentId: makeId<"ConsignmentId">("cons-1"), trigger: "SETTLE" }));
    expect(kernel.view().consignment("cons-1")).toMatchObject({ state: "SETTLED", revision: 3 });
    const split = consignmentPayout(money("10000", usd), 6_000, "HALF_UP");
    expect(split).toMatchObject({ ok: true, value: { consignor: { amountMinor: "6000" }, merchant: { amountMinor: "4000" } } });
  });
});

describe("B2B flow on the kernel — negotiated prices + minimum-order gate", () => {
  const priceList: B2BPriceList = {
    priceListId: "b2b-pl-1",
    companyAccountId: makeId<"CompanyAccountId">("co-bakery"),
    currency: usd,
    entries: [{ skuId: flour, negotiatedPrice: money("850", usd), minQuantity: 10 }],
  };

  it("an order below the B2B minimum is blocked at PLACE_ORDER", async () => {
    const kernel = new CommerceKernel({ minimumOrderPolicy: { minimumOrderValue: money("10000", usd) } });
    // Negotiated price resolves at the edge (pure domain function): min qty 10.
    expect(negotiatedPrice(priceList, flour, 9)).toMatchObject({ ok: false, error: { code: "QUANTITY_BELOW_MINIMUM" } });
    const negotiated = negotiatedPrice(priceList, flour, 10);
    if (!negotiated.ok) throw new Error("negotiation failed");
    // 10 bags at the negotiated $8.50 = $85 < $100 minimum.
    await mustExecute(kernel, env({
      type: "ADD_CART_LINE",
      cartId: makeId<"CartId">("cart-b2b"),
      skuId: flour,
      quantity: countQuantity(10),
      unitPrice: negotiated.value,
    }));
    const blocked = await kernel.execute(env({ type: "PLACE_ORDER", cartId: makeId<"CartId">("cart-b2b"), merchantId }));
    expect(blocked.status).toBe("REJECTED");
    if (blocked.status === "REJECTED") expect(blocked.reason.detail).toContain("BELOW_MINIMUM_ORDER");
    expect(enforceMinimumOrder({ minimumOrderValue: money("10000", usd) }, money("8500", usd))).toMatchObject({ ok: false });
  });

  it("an order at the minimum executes with exact negotiated totals", async () => {
    const kernel = new CommerceKernel({
      minimumOrderPolicy: { minimumOrderValue: money("10000", usd) },
      paymentBoundary: new ScriptedPaymentDouble(),
    });
    const negotiated = negotiatedPrice(priceList, flour, 12);
    if (!negotiated.ok) throw new Error("negotiation failed");
    // 12 bags at $8.50 = $102.00 ≥ $100 minimum.
    await mustExecute(kernel, env({
      type: "ADD_CART_LINE",
      cartId: makeId<"CartId">("cart-b2b-2"),
      skuId: flour,
      quantity: countQuantity(12),
      unitPrice: negotiated.value,
    }));
    await mustExecute(kernel, env({ type: "PLACE_ORDER", cartId: makeId<"CartId">("cart-b2b-2"), merchantId }));
    expect(kernel.view().order("order-1")?.totals.grandTotal).toMatchObject({ amountMinor: "10200" });
    await mustExecute(kernel, env({
      type: "CREATE_PAYMENT_INTENT",
      request: {
        amount: money("10200", usd),
        reference: { kind: "ORDER", orderId: makeId<"OrderId">("order-1") },
        method: { methodKind: "BANK_TRANSFER", tokenRef: "mandate-net30" },
      },
    }));
    await mustExecute(kernel, env({ type: "CAPTURE_PAYMENT", paymentId: makeId<"PaymentId">("pay-double-1") }));
    expect(kernel.view().order("order-1")?.paymentStatus).toBe("PAID");
  });
});

describe("returns and exchanges on the kernel", () => {
  async function paidOrder(kernel: CommerceKernel): Promise<string> {
    await mustExecute(kernel, env({
      type: "ADD_CART_LINE",
      cartId: makeId<"CartId">("cart-ret"),
      skuId: flour,
      quantity: countQuantity(2),
      unitPrice: money("1000", usd),
    }));
    await mustExecute(kernel, env({ type: "PLACE_ORDER", cartId: makeId<"CartId">("cart-ret"), merchantId }));
    await mustExecute(kernel, env({
      type: "CREATE_PAYMENT_INTENT",
      request: {
        amount: money("2000", usd),
        reference: { kind: "ORDER", orderId: makeId<"OrderId">("order-1") },
        method: { methodKind: "CARD", tokenRef: "tok_1" },
      },
    }));
    await mustExecute(kernel, env({ type: "CAPTURE_PAYMENT", paymentId: makeId<"PaymentId">("pay-double-1") }));
    return "order-1";
  }

  it("REQUEST_RETURN opens a full-order refund return and walks to RESOLVED", async () => {
    const kernel = new CommerceKernel({ paymentBoundary: new ScriptedPaymentDouble() });
    const orderId = await paidOrder(kernel);
    await mustExecute(kernel, env({ type: "REQUEST_RETURN", orderId: makeId<"OrderId">(orderId) }));
    const returnId = kernel.view().allReturns()[0]?.returnId as string;
    expect(kernel.view().returnAuthorization(returnId)).toMatchObject({
      orderId,
      resolution: "REFUND",
      state: "REQUESTED",
      revision: 1,
    });
    expect(kernel.view().returnAuthorization(returnId)?.lines).toHaveLength(1);
    for (const trigger of ["AUTHORIZE", "SHIP_BACK", "RECEIVE", "INSPECT", "RESOLVE"] as const) {
      await mustExecute(kernel, env({ type: "ADVANCE_RETURN", returnId: makeId<"ReturnId">(returnId), trigger }));
    }
    expect(kernel.view().returnAuthorization(returnId)).toMatchObject({ state: "RESOLVED", revision: 6 });
    // The refund executes through the payment boundary (a command, not a side effect).
    await mustExecute(kernel, env({
      type: "REFUND_PAYMENT",
      paymentId: makeId<"PaymentId">("pay-double-1"),
      amount: money("2000", usd),
    }));
    expect(kernel.view().allRefunds()[0]?.state).toBe("COMPLETED");
    expect(kernel.view().order(orderId)?.paymentStatus).toBe("REFUNDED");
  });

  it("OPEN_RETURN supports EXCHANGE resolution with explicit lines", async () => {
    const kernel = new CommerceKernel({ paymentBoundary: new ScriptedPaymentDouble() });
    const orderId = await paidOrder(kernel);
    await mustExecute(kernel, env({
      type: "OPEN_RETURN",
      orderId: makeId<"OrderId">(orderId),
      resolution: "EXCHANGE",
      lines: [{ skuId: flour, quantity: countQuantity(1), reason: "DEFECTIVE" }],
    }));
    const returnId = kernel.view().allReturns()[0]?.returnId as string;
    expect(kernel.view().returnAuthorization(returnId)).toMatchObject({ resolution: "EXCHANGE", state: "REQUESTED" });
    await mustExecute(kernel, env({ type: "ADVANCE_RETURN", returnId: makeId<"ReturnId">(returnId), trigger: "AUTHORIZE" }));
    expect(kernel.view().returnAuthorization(returnId)?.state).toBe("AUTHORIZED");
    const invalid = await kernel.execute(env({ type: "ADVANCE_RETURN", returnId: makeId<"ReturnId">(returnId), trigger: "INSPECT" }));
    expect(invalid.status).toBe("REJECTED");
  });
});
