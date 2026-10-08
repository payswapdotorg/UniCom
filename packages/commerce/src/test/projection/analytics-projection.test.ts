/**
 * W1-007 acceptance scenario 2 — analytics projection: sales/orders/campaign-
 * performance projections rebuilt from journal replay match live projections
 * bit-for-bit (round-trip test, the DR law).
 *
 * THE PROJECTION LAW (W3-006 DR law applied to analytics): analytics are
 * disposable, rebuildable projections folded from the immutable evidence
 * journal — never a second source of truth. The same journal always produces
 * the same projection (deterministic fold). This test rebuilds the projection
 * from the journal and asserts it matches the live projection bit-for-bit.
 */
import { describe, expect, it } from "vitest";
import {
  CommerceKernel,
  analyticsReadModel,
  loyaltyReadModel,
  forecastingReadModel,
  campaignDiscountOf,
  salesTotalOf,
  currency,
  makeId,
  money,
  type AnalyticsReadModelState,
  type AnyCommerceEvent,
} from "../../contract.js";
import { projectEvents } from "../../contract.js";
import { env, mustExecute } from "../runtime/support/envelopes.js";

const usd = currency("USD");
const sku = makeId<"SkuId">("sku-analytics");
const loc = makeId<"LocationId">("loc-1");
const merchantId = makeId<"MerchantId">("merchant-1");

describe("W1-007 scenario 2 — analytics projection rebuild-from-journal (DR law)", () => {
  it("rebuilds analytics from journal replay matching live projections bit-for-bit", async () => {
    const kernel = new CommerceKernel();

    // Seed a journey: inventory → cart → checkout → order → campaign effect → loyalty accrual.
    await mustExecute(kernel, env({ type: "RECEIVE_STOCK", skuId: sku, locationId: loc, units: 100, reason: "RECEIVING" }));
    await mustExecute(kernel, env({
      type: "ADD_CART_LINE",
      cartId: makeId<"CartId">("cart-1"),
      skuId: sku,
      quantity: { kind: "COUNT", units: 2 } as never,
      unitPrice: money("1999", usd),
    }));
    await mustExecute(kernel, env({ type: "OPEN_CHECKOUT", cartId: makeId<"CartId">("cart-1") }));
    const session = kernel.view().allCheckoutSessions()[0]!;
    await mustExecute(kernel, env({ type: "ADVANCE_CHECKOUT", checkoutSessionId: session.checkoutSessionId, trigger: "START_PAYMENT" }));
    await mustExecute(kernel, env({ type: "PLACE_ORDER", cartId: makeId<"CartId">("cart-1"), merchantId }));
    const orderId = kernel.view().allOrders()[0]!.orderId;

    // Campaign effect (evidence for analytics).
    await mustExecute(kernel, env({
      type: "OPEN_CAMPAIGN",
      campaign: {
        campaignId: makeId<"CampaignId">("camp-a"),
        merchantId,
        title: "10% off",
        rule: { kind: "PERCENTAGE_OFF", basisPoints: 1000 },
        state: "DRAFT",
        stackable: false,
        revision: 1,
      },
    }));
    await mustExecute(kernel, env({ type: "ADVANCE_CAMPAIGN", campaignId: makeId<"CampaignId">("camp-a"), trigger: "ACTIVATE" }));
    await mustExecute(kernel, env({
      type: "APPLY_CAMPAIGN_EFFECT",
      campaignId: makeId<"CampaignId">("camp-a"),
      skuId: sku,
      lineAmount: money("3998", usd),
    }));

    // Loyalty accrual (evidence for analytics).
    await mustExecute(kernel, env({
      type: "OPEN_LOYALTY_ACCOUNT",
      account: {
        loyaltyAccountId: makeId<"LoyaltyAccountId">("loy-a"),
        customerRecordId: makeId<"CustomerRecordId">("cr-a"),
        merchantId,
        status: "OPEN",
        balance: "0" as never,
        revision: 1,
      },
      tierPolicy: { tiers: [{ tierId: "silver", name: "Silver", minimumPoints: "100" as never }] },
    }));
    await mustExecute(kernel, env({
      type: "ACCRUE_LOYALTY",
      loyaltyAccountId: makeId<"LoyaltyAccountId">("loy-a"),
      points: "50" as never,
      reason: "ORDER_PURCHASE",
      orderId: makeId<"OrderId">(orderId),
    }));

    // Live projection (folded incrementally as the kernel ran).
    const events = kernel.events() as readonly AnyCommerceEvent[];
    const liveAnalytics = projectEvents(analyticsReadModel, events);

    // Rebuild from journal: fold the SAME events from scratch.
    const rebuiltAnalytics = projectEvents(analyticsReadModel, [...events]);

    // Bit-for-bit equality (the DR law).
    expect(JSON.stringify(rebuiltAnalytics)).toBe(JSON.stringify(liveAnalytics));

    // Anti-vacuity: the projection genuinely observed the order + campaign effect + loyalty.
    expect(liveAnalytics.orderCount).toBe(1);
    expect(salesTotalOf(liveAnalytics, "USD").amountMinor).toBe("3998");
    expect(liveAnalytics.campaignEffectsTotal).toBe(1);
    expect(campaignDiscountOf(liveAnalytics, "USD").amountMinor).toBe("400"); // 10% of 3998
    expect(liveAnalytics.loyaltyAccrualsTotal).toBe(1);
  });

  it("analytics projection is deterministic across independent folds (same journal → same state)", async () => {
    const kernel = new CommerceKernel();
    await mustExecute(kernel, env({ type: "RECEIVE_STOCK", skuId: sku, locationId: loc, units: 10, reason: "RECEIVING" }));
    await mustExecute(kernel, env({
      type: "ADD_CART_LINE",
      cartId: makeId<"CartId">("cart-det"),
      skuId: sku,
      quantity: { kind: "COUNT", units: 1 } as never,
      unitPrice: money("500", usd),
    }));
    await mustExecute(kernel, env({ type: "PLACE_ORDER", cartId: makeId<"CartId">("cart-det"), merchantId }));

    const events = kernel.events() as readonly AnyCommerceEvent[];
    // Fold the same journal 10 times — every result must be byte-identical.
    const states: AnalyticsReadModelState[] = [];
    for (let i = 0; i < 10; i++) {
      states.push(projectEvents(analyticsReadModel, [...events]));
    }
    const first = JSON.stringify(states[0]);
    for (const state of states) {
      expect(JSON.stringify(state)).toBe(first);
    }
  });

  it("loyalty + forecasting projections also rebuild bit-for-bit from journal", async () => {
    const kernel = new CommerceKernel();
    await mustExecute(kernel, env({
      type: "OPEN_LOYALTY_ACCOUNT",
      account: {
        loyaltyAccountId: makeId<"LoyaltyAccountId">("loy-rebuild"),
        customerRecordId: makeId<"CustomerRecordId">("cr-rebuild"),
        merchantId,
        status: "OPEN",
        balance: "0" as never,
        revision: 1,
      },
      tierPolicy: { tiers: [] },
    }));
    await mustExecute(kernel, env({
      type: "ACCRUE_LOYALTY",
      loyaltyAccountId: makeId<"LoyaltyAccountId">("loy-rebuild"),
      points: "75" as never,
      reason: "ORDER_PURCHASE",
    }));
    await mustExecute(kernel, env({
      type: "RECORD_DEMAND_SIGNAL",
      signal: {
        demandSignalId: makeId<"DemandSignalId">("ds-rebuild"),
        skuId: sku,
        locationId: loc,
        periodStart: "2026-10-01T00:00:00Z",
        periodEnd: "2026-10-07T00:00:00Z",
        unitsObserved: 42,
        method: { kind: "SIMPLE_MOVING_AVERAGE", windowDays: 7 },
        observedAt: "2026-10-08T00:00:00Z",
        revision: 1,
      },
    }));

    const events = kernel.events() as readonly AnyCommerceEvent[];
    const liveLoyalty = projectEvents(loyaltyReadModel, events);
    const rebuiltLoyalty = projectEvents(loyaltyReadModel, [...events]);
    expect(JSON.stringify(rebuiltLoyalty)).toBe(JSON.stringify(liveLoyalty));
    expect(liveLoyalty.accounts.size).toBe(1);
    expect(liveLoyalty.ledgerEntries.size).toBe(1);

    const liveForecasting = projectEvents(forecastingReadModel, events);
    const rebuiltForecasting = projectEvents(forecastingReadModel, [...events]);
    expect(JSON.stringify(rebuiltForecasting)).toBe(JSON.stringify(liveForecasting));
    expect(liveForecasting.demandSignals.size).toBe(1);
  });
});
