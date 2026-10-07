/**
 * W1-007 acceptance scenario 5 — full journey: campaign → cart → checkout →
 * order → loyalty accrual → analytics reflects it → forecast signal → reorder
 * opportunity — one continuous certified journey with evidence at every
 * boundary.
 *
 * This is the end-to-end merchant-parity journey exercising all four areas
 * (marketing, analytics, CRM/loyalty, forecasting) as one deterministic kernel
 * session. Every consequential step is a journaled kernel command; every effect
 * is an immutable fact; the analytics projection reflects the journey; the
 * forecast signal produces an advisory reorder proposal (never auto-mutation).
 */
import { describe, expect, it } from "vitest";
import {
  CommerceKernel,
  analyticsReadModel,
  campaignDiscountOf,
  salesTotalOf,
  currency,
  makeId,
  money,
  projectEvents,
  type AnyCommerceEvent,
} from "../../contract.js";
import { env, mustExecute } from "./support/envelopes.js";
import { ScriptedPaymentDouble } from "./support/payment-double.js";

const usd = currency("USD");
const sku = makeId<"SkuId">("sku-journey");
const loc = makeId<"LocationId">("loc-journey");
const merchantId = makeId<"MerchantId">("merchant-journey");

describe("W1-007 scenario 5 — full merchant journey (campaign → order → loyalty → analytics → forecast)", () => {
  it("walks one continuous certified journey with evidence at every boundary", async () => {
    const paymentBoundary = new ScriptedPaymentDouble();
    const kernel = new CommerceKernel({ paymentBoundary });

    // 1. Inventory: receive 100 units.
    await mustExecute(kernel, env({ type: "RECEIVE_STOCK", skuId: sku, locationId: loc, units: 100, reason: "RECEIVING" }));
    expect(kernel.view().level(sku, loc)?.onHand).toBe(100);

    // 2. Campaign: open + activate a 15% off campaign scoped to the journey SKU.
    await mustExecute(kernel, env({
      type: "OPEN_CAMPAIGN",
      campaign: {
        campaignId: makeId<"CampaignId">("camp-journey"),
        merchantId,
        title: "Journey campaign 15% off",
        rule: { kind: "PERCENTAGE_OFF", basisPoints: 1500 },
        state: "DRAFT",
        appliesToSkuIds: [sku],
        stackable: false,
        revision: 1,
      },
    }));
    await mustExecute(kernel, env({ type: "ADVANCE_CAMPAIGN", campaignId: makeId<"CampaignId">("camp-journey"), trigger: "ACTIVATE" }));
    expect(kernel.view().merchantOps().campaign("camp-journey")?.state).toBe("ACTIVE");

    // 3. Campaign effect: apply the 15% discount to a $20 line (evidence).
    await mustExecute(kernel, env({
      type: "APPLY_CAMPAIGN_EFFECT",
      campaignId: makeId<"CampaignId">("camp-journey"),
      skuId: sku,
      lineAmount: money("2000", usd),
    }));
    const effects = kernel.view().merchantOps().allCampaignEffects();
    expect(effects).toHaveLength(1);
    expect(effects[0]!.discount.amountMinor).toBe("300"); // 15% of 2000

    // 4. Cart + checkout + order: 2 units × $19.99.
    await mustExecute(kernel, env({
      type: "ADD_CART_LINE",
      cartId: makeId<"CartId">("cart-journey"),
      skuId: sku,
      quantity: { kind: "COUNT", units: 2 } as never,
      unitPrice: money("1999", usd),
    }));
    await mustExecute(kernel, env({ type: "OPEN_CHECKOUT", cartId: makeId<"CartId">("cart-journey") }));
    const session = kernel.view().allCheckoutSessions()[0]!;
    await mustExecute(kernel, env({ type: "ADVANCE_CHECKOUT", checkoutSessionId: session.checkoutSessionId, trigger: "START_PAYMENT" }));
    await mustExecute(kernel, env({ type: "PLACE_ORDER", cartId: makeId<"CartId">("cart-journey"), merchantId }));
    const orderId = kernel.view().allOrders()[0]!.orderId;
    expect(kernel.view().order(orderId)?.totals.grandTotal.amountMinor).toBe("3998");

    // 5. CRM: open a customer record + loyalty account.
    await mustExecute(kernel, env({
      type: "OPEN_CUSTOMER_RECORD",
      record: {
        customerRecordId: makeId<"CustomerRecordId">("cr-journey"),
        customerId: makeId<"CustomerId">("customer-journey"),
        merchantId,
        status: "ACTIVE",
        createdAt: "2026-10-08T00:00:00Z",
        revision: 1,
      },
    }));
    await mustExecute(kernel, env({
      type: "OPEN_LOYALTY_ACCOUNT",
      account: {
        loyaltyAccountId: makeId<"LoyaltyAccountId">("loy-journey"),
        customerRecordId: makeId<"CustomerRecordId">("cr-journey"),
        merchantId,
        status: "OPEN",
        balance: "0" as never,
        revision: 1,
      },
      tierPolicy: { tiers: [{ tierId: "bronze", name: "Bronze", minimumPoints: "50" as never }] },
    }));

    // 6. Loyalty accrual: 10 points per dollar spent (3998 cents = $39.98 → 399 points).
    await mustExecute(kernel, env({
      type: "ACCRUE_LOYALTY",
      loyaltyAccountId: makeId<"LoyaltyAccountId">("loy-journey"),
      points: "399" as never,
      reason: "ORDER_PURCHASE",
      orderId: makeId<"OrderId">(orderId),
      campaignId: makeId<"CampaignId">("camp-journey"),
    }));
    expect(kernel.view().merchantOps().loyaltyAccount("loy-journey")?.balance).toBe("399" as never);

    // 7. Analytics projection: reflects the order, the campaign effect, the loyalty accrual.
    const events = kernel.events() as readonly AnyCommerceEvent[];
    const analytics = projectEvents(analyticsReadModel, events);
    expect(analytics.orderCount).toBe(1);
    expect(salesTotalOf(analytics, "USD").amountMinor).toBe("3998");
    expect(analytics.campaignEffectsTotal).toBe(1);
    expect(campaignDiscountOf(analytics, "USD").amountMinor).toBe("300");
    expect(analytics.loyaltyAccrualsTotal).toBe(1);

    // 8. Forecast: record a demand signal + propose a reorder (advisory, never auto-mutates).
    await mustExecute(kernel, env({
      type: "RECORD_DEMAND_SIGNAL",
      signal: {
        demandSignalId: makeId<"DemandSignalId">("ds-journey"),
        skuId: sku,
        locationId: loc,
        periodStart: "2026-10-01T00:00:00Z",
        periodEnd: "2026-10-07T00:00:00Z",
        unitsObserved: 30,
        method: { kind: "SIMPLE_MOVING_AVERAGE", windowDays: 7 },
        observedAt: "2026-10-08T00:00:00Z",
        revision: 1,
      },
    }));
    await mustExecute(kernel, env({
      type: "PROPOSE_REORDER",
      sourceDemandSignalId: makeId<"DemandSignalId">("ds-journey"),
      skuId: sku,
      locationId: loc,
      forecast: { kind: "OBSERVED", value: 5 } as never,
      currentOnHand: 98, // 100 received − 2 sold
      leadTimeDays: 3,
      safetyStockUnits: 10,
    }));
    const proposals = kernel.view().merchantOps().allReorderProposals();
    expect(proposals).toHaveLength(1);
    expect(proposals[0]!.status).toBe("PROPOSED");
    expect(proposals[0]!.suggestedReorderPoint).toBe(25); // 5 × 3 + 10
    // Advisory never mutates inventory:
    expect(kernel.view().level(sku, loc)?.onHand).toBe(100); // unchanged (we didn't reserve/commit)

    // 9. The journal is valid (sequence law holds across all subjects).
    expect(kernel.journalIsValid()).toBe(true);
    // Anti-vacuity: the journey produced a non-trivial journal.
    expect(kernel.events().length).toBeGreaterThan(10);
  });
});
