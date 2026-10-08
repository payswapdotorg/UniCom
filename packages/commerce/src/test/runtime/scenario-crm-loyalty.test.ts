/**
 * W1-007 acceptance scenario 3 — loyalty conservation: accrual/redemption/expiry
 * zero-sum property test over the full fuzz vocabulary (the W1-006
 * money-conservation pattern extended to the loyalty ledger); no hidden balances.
 *
 * The loyalty ledger follows the W1-006 conservation law: every accrual is a
 * CREDIT, every redemption/expiry is a DEBIT, and the account balance MUST equal
 * the sum of all signed ledger deltas. No hidden balances — the balance IS the
 * fold of the journal (INVARIANT 21: no hidden balance ledger).
 */
import { describe, expect, it } from "vitest";
import {
  CommerceKernel,
  assertLoyaltyConservation,
  evaluateLoyaltyTier,
  loyaltyPoints,
  makeId,
  type LoyaltyAccount,
  type LoyaltyTierPolicy,
} from "../../contract.js";
import { env, mustExecute } from "./support/envelopes.js";

function openAccount(id: string): LoyaltyAccount {
  return {
    loyaltyAccountId: makeId<"LoyaltyAccountId">(id),
    customerRecordId: makeId<"CustomerRecordId">(`cr-${id}`),
    merchantId: makeId<"MerchantId">("merchant-1"),
    status: "OPEN",
    balance: loyaltyPoints(0),
    revision: 1,
  };
}

const tierPolicy: LoyaltyTierPolicy = {
  tiers: [
    { tierId: "silver", name: "Silver", minimumPoints: loyaltyPoints(100) },
    { tierId: "gold", name: "Gold", minimumPoints: loyaltyPoints(500) },
    { tierId: "platinum", name: "Platinum", minimumPoints: loyaltyPoints(1000) },
  ],
};

describe("W1-007 scenario 3 — loyalty conservation + CRM lifecycle", () => {
  it("walks customer record open + loyalty account open + accrue + redeem + expire", async () => {
    const kernel = new CommerceKernel();

    await mustExecute(kernel, env({
      type: "OPEN_CUSTOMER_RECORD",
      record: {
        customerRecordId: makeId<"CustomerRecordId">("cr-1"),
        customerId: makeId<"CustomerId">("customer-1"),
        merchantId: makeId<"MerchantId">("merchant-1"),
        status: "ACTIVE",
        createdAt: "2026-10-08T00:00:00Z",
        revision: 1,
      },
    }));
    expect(kernel.view().merchantOps().customerRecord("cr-1")).toBeDefined();

    await mustExecute(kernel, env({ type: "OPEN_LOYALTY_ACCOUNT", account: openAccount("loy-1"), tierPolicy }));
    expect(kernel.view().merchantOps().loyaltyAccount("loy-1")?.balance).toBe(loyaltyPoints(0));

    await mustExecute(kernel, env({
      type: "ACCRUE_LOYALTY",
      loyaltyAccountId: makeId<"LoyaltyAccountId">("loy-1"),
      points: loyaltyPoints(300),
      reason: "ORDER_PURCHASE",
      orderId: makeId<"OrderId">("order-1"),
    }));
    expect(kernel.view().merchantOps().loyaltyAccount("loy-1")?.balance).toBe(loyaltyPoints(300));

    await mustExecute(kernel, env({
      type: "REDEEM_LOYALTY",
      loyaltyAccountId: makeId<"LoyaltyAccountId">("loy-1"),
      points: loyaltyPoints(100),
    }));
    expect(kernel.view().merchantOps().loyaltyAccount("loy-1")?.balance).toBe(loyaltyPoints(200));

    await mustExecute(kernel, env({
      type: "EXPIRE_LOYALTY",
      loyaltyAccountId: makeId<"LoyaltyAccountId">("loy-1"),
    }));
    expect(kernel.view().merchantOps().loyaltyAccount("loy-1")?.balance).toBe(loyaltyPoints(0));
  });

  it("rejects redemption with insufficient points (never a negative balance)", async () => {
    const kernel = new CommerceKernel();
    await mustExecute(kernel, env({ type: "OPEN_LOYALTY_ACCOUNT", account: openAccount("loy-ins"), tierPolicy }));
    await mustExecute(kernel, env({
      type: "ACCRUE_LOYALTY",
      loyaltyAccountId: makeId<"LoyaltyAccountId">("loy-ins"),
      points: loyaltyPoints(50),
      reason: "CAMPAIGN_BONUS",
    }));
    // Redeem 100 when balance is 50 → deterministic rejection.
    const outcome = await kernel.execute(env({
      type: "REDEEM_LOYALTY",
      loyaltyAccountId: makeId<"LoyaltyAccountId">("loy-ins"),
      points: loyaltyPoints(100),
    }));
    expect(outcome.status).toBe("REJECTED");
    expect(kernel.view().merchantOps().loyaltyAccount("loy-ins")?.balance).toBe(loyaltyPoints(50));
  });

  it("zero-sum conservation holds across randomized accrue/redeem/expire sequences (property-tested)", async () => {
    const kernel = new CommerceKernel();
    await mustExecute(kernel, env({ type: "OPEN_LOYALTY_ACCOUNT", account: openAccount("loy-fuzz"), tierPolicy }));

    let expectedBalance = 0n;
    const rng = mulberry32(4242);
    for (let step = 0; step < 200; step++) {
      const action = Math.floor(rng() * 4);
      if (action === 0) {
        // Accrue 1..100 points
        const pts = 1 + Math.floor(rng() * 100);
        const outcome = await kernel.execute(env({
          type: "ACCRUE_LOYALTY",
          loyaltyAccountId: makeId<"LoyaltyAccountId">("loy-fuzz"),
          points: loyaltyPoints(pts),
          reason: "ORDER_PURCHASE",
        }));
        if (outcome.status === "EXECUTED") expectedBalance += BigInt(pts);
      } else if (action === 1) {
        // Redeem 1..50 points (may reject if insufficient)
        const pts = 1 + Math.floor(rng() * 50);
        const outcome = await kernel.execute(env({
          type: "REDEEM_LOYALTY",
          loyaltyAccountId: makeId<"LoyaltyAccountId">("loy-fuzz"),
          points: loyaltyPoints(pts),
        }));
        if (outcome.status === "EXECUTED") expectedBalance -= BigInt(pts);
      } else if (action === 2) {
        // Expire (zeroes the balance)
        const account = kernel.view().merchantOps().loyaltyAccount("loy-fuzz");
        if (account && BigInt(account.balance) > 0n) {
          const outcome = await kernel.execute(env({
            type: "EXPIRE_LOYALTY",
            loyaltyAccountId: makeId<"LoyaltyAccountId">("loy-fuzz"),
          }));
          if (outcome.status === "EXECUTED") expectedBalance = 0n;
        }
      } else {
        // Adjust: accrue 1..20
        const pts = 1 + Math.floor(rng() * 20);
        const outcome = await kernel.execute(env({
          type: "ADJUST_LOYALTY",
          loyaltyAccountId: makeId<"LoyaltyAccountId">("loy-fuzz"),
          points: loyaltyPoints(pts),
          reason: "MANUAL_ADJUSTMENT",
        }));
        if (outcome.status === "EXECUTED") expectedBalance += BigInt(pts);
      }

      // Conservation check after EVERY step: balance ≡ sum of ledger deltas.
      const account = kernel.view().merchantOps().loyaltyAccount("loy-fuzz")!;
      const entries = kernel.view().merchantOps().loyaltyEntriesFor("loy-fuzz");
      const conservation = assertLoyaltyConservation(account, entries);
      expect(conservation.ok).toBe(true);
      expect(account.balance).toBe(expectedBalance.toString() as never);
    }
    // Anti-vacuity: the fuzz must have genuinely exercised accruals + redemptions.
    const entries = kernel.view().merchantOps().loyaltyEntriesFor("loy-fuzz");
    const accruals = entries.filter((e) => e.kind === "ACCRUE").length;
    const redemptions = entries.filter((e) => e.kind === "REDEEM").length;
    expect(accruals).toBeGreaterThan(10);
    expect(redemptions).toBeGreaterThan(0);
  });

  it("tier evaluation is deterministic from ledger totals + policy thresholds", async () => {
    const kernel = new CommerceKernel();
    await mustExecute(kernel, env({ type: "OPEN_LOYALTY_ACCOUNT", account: openAccount("loy-tier"), tierPolicy }));

    const account0 = kernel.view().merchantOps().loyaltyAccount("loy-tier")!;
    expect(evaluateLoyaltyTier(account0, tierPolicy)).toBeUndefined(); // 0 points → no tier

    await mustExecute(kernel, env({
      type: "ACCRUE_LOYALTY",
      loyaltyAccountId: makeId<"LoyaltyAccountId">("loy-tier"),
      points: loyaltyPoints(150),
      reason: "ORDER_PURCHASE",
    }));
    const account1 = kernel.view().merchantOps().loyaltyAccount("loy-tier")!;
    expect(evaluateLoyaltyTier(account1, tierPolicy)?.tierId).toBe("silver");

    await mustExecute(kernel, env({
      type: "ACCRUE_LOYALTY",
      loyaltyAccountId: makeId<"LoyaltyAccountId">("loy-tier"),
      points: loyaltyPoints(400),
      reason: "ORDER_PURCHASE",
    }));
    const account2 = kernel.view().merchantOps().loyaltyAccount("loy-tier")!;
    expect(evaluateLoyaltyTier(account2, tierPolicy)?.tierId).toBe("gold");

    await mustExecute(kernel, env({
      type: "ACCRUE_LOYALTY",
      loyaltyAccountId: makeId<"LoyaltyAccountId">("loy-tier"),
      points: loyaltyPoints(500),
      reason: "CAMPAIGN_BONUS",
    }));
    const account3 = kernel.view().merchantOps().loyaltyAccount("loy-tier")!;
    expect(evaluateLoyaltyTier(account3, tierPolicy)?.tierId).toBe("platinum");
  });

  it("loyalty ledger entries are journaled as immutable facts (evidence at every boundary)", async () => {
    const kernel = new CommerceKernel();
    await mustExecute(kernel, env({ type: "OPEN_LOYALTY_ACCOUNT", account: openAccount("loy-ev"), tierPolicy }));
    await mustExecute(kernel, env({
      type: "ACCRUE_LOYALTY",
      loyaltyAccountId: makeId<"LoyaltyAccountId">("loy-ev"),
      points: loyaltyPoints(100),
      reason: "ORDER_PURCHASE",
      orderId: makeId<"OrderId">("order-ev"),
      campaignId: makeId<"CampaignId">("camp-ev"),
    }));
    const entries = kernel.view().merchantOps().loyaltyEntriesFor("loy-ev");
    expect(entries).toHaveLength(1);
    expect(entries[0]!.kind).toBe("ACCRUE");
    expect(entries[0]!.reason).toBe("ORDER_PURCHASE");
    expect(entries[0]!.orderId).toBe("order-ev");
    expect(entries[0]!.campaignId).toBe("camp-ev");
    expect(entries[0]!.pointsDelta).toBe(loyaltyPoints(100));
  });
});

/** Deterministic seeded PRNG (mulberry32) — no wall clock, no unseeded randomness. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
