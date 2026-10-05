/**
 * W1-002 runtime scenario 7 + acceptance scenario 5: autonomous-store
 * policy limits BLOCK out-of-policy commands at the kernel boundary.
 *
 * The policy gate runs inside dispatch, BEFORE any handler: DENY (hard
 * limit / stop condition) and REQUIRE_APPROVAL (human gate — no approval
 * path exists yet, so the kernel blocks rather than silently executing).
 * Non-autonomous actors are never gated by store policies.
 */
import { describe, expect, it } from "vitest";
import {
  CommerceKernel,
  countQuantity,
  currency,
  makeId,
  money,
  type AutonomousStorePolicy,
} from "../../contract.js";
import { ScriptedPaymentDouble } from "./support/payment-double.js";
import { autonomousStoreActor, env, mustExecute } from "./support/envelopes.js";

const usd = currency("USD");
const sku = makeId<"SkuId">("sku-olive-oil");
const storeActor = autonomousStoreActor("store-1");

const policy: AutonomousStorePolicy = {
  policyId: makeId<"AutonomousStorePolicyId">("policy-store-1"),
  autonomousStoreId: makeId<"AutonomousStoreId">("store-1"),
  revision: 1,
  policyCurrency: usd,
  marginFloorBps: 1_000,
  maxDiscountBps: 2_000,
  promotionBudget: { limitPerPeriod: money("5000", usd), period: "MONTHLY" },
  spendLimit: { limitPerPeriod: money("100000", usd), period: "MONTHLY" },
  refundApprovalThreshold: money("10000", usd),
  priceChangeApprovalThreshold: money("2000", usd),
  stopConditions: [{ kind: "RECONCILIATION_DISCREPANCY_RATE", threshold: 2500, currentlyObserved: 0 }],
};

async function kernelWithCapturedPayment(): Promise<{ kernel: CommerceKernel; paymentId: string }> {
  const kernel = new CommerceKernel({ paymentBoundary: new ScriptedPaymentDouble() });
  await mustExecute(kernel, env({
    type: "ADD_CART_LINE",
    cartId: makeId<"CartId">("cart-policy"),
    skuId: sku,
    quantity: countQuantity(4),
    unitPrice: money("2500", usd),
  }));
  await mustExecute(kernel, env({ type: "PLACE_ORDER", cartId: makeId<"CartId">("cart-policy"), merchantId: makeId<"MerchantId">("merchant-1") }));
  await mustExecute(kernel, env({
    type: "CREATE_PAYMENT_INTENT",
    request: {
      amount: money("10000", usd),
      reference: { kind: "ORDER", orderId: makeId<"OrderId">("order-1") },
      method: { methodKind: "CARD", tokenRef: "tok_1" },
    },
  }));
  await mustExecute(kernel, env({ type: "CAPTURE_PAYMENT", paymentId: makeId<"PaymentId">("pay-double-1") }));
  kernel.registerAutonomousPolicy(policy);
  return { kernel, paymentId: "pay-double-1" };
}

describe("runtime scenario 7 — autonomous policy blocks at the kernel boundary", () => {
  it("REQUIRE_APPROVAL refunds are blocked (no silent auto-refund, no silent auto-approval)", async () => {
    const { kernel, paymentId } = await kernelWithCapturedPayment();
    const outcome = await kernel.execute(env({
      type: "REFUND_PAYMENT",
      paymentId: makeId<"PaymentId">(paymentId),
      amount: money("10000", usd),
    }, storeActor));
    expect(outcome.status).toBe("REJECTED");
    if (outcome.status === "REJECTED") {
      expect(outcome.reason.code).toBe("POLICY_DENIED");
      expect(outcome.reason.policyDecision).toEqual({ decision: "REQUIRE_APPROVAL", reasons: ["APPROVAL_THRESHOLD"] });
      expect(outcome.reason.detail).toContain("blocked at the kernel boundary");
    }
    // Zero effects: no refund record, payment untouched, journal clean.
    expect(kernel.view().paymentIntent(paymentId)?.status).toBe("CAPTURED");
    expect(kernel.snapshot().refunds).toHaveLength(0);
  });

  it("small in-policy refunds pass the gate and execute", async () => {
    const { kernel, paymentId } = await kernelWithCapturedPayment();
    const outcome = await kernel.execute(env({
      type: "REFUND_PAYMENT",
      paymentId: makeId<"PaymentId">(paymentId),
      amount: money("2500", usd),
    }, storeActor));
    expect(outcome.status).toBe("EXECUTED");
    const refund = kernel.view().allRefunds()[0];
    expect(refund?.state).toBe("COMPLETED");
    expect(kernel.view().order("order-1")?.paymentStatus).toBe("PARTIALLY_REFUNDED");
  });

  it("stop conditions halt ALL autonomous action (even inventory commands)", async () => {
    const kernel = new CommerceKernel();
    kernel.registerAutonomousPolicy({
      ...policy,
      policyId: makeId<"AutonomousStorePolicyId">("policy-store-2"),
      stopConditions: [{ kind: "FRAUD_SIGNAL_RATE", threshold: 1000, currentlyObserved: 1500 }],
    });
    const outcome = await kernel.execute(env({
      type: "RECEIVE_STOCK",
      skuId: sku,
      locationId: makeId<"LocationId">("loc-1"),
      units: 5,
      reason: "RECEIVING",
    }, storeActor));
    expect(outcome.status).toBe("REJECTED");
    if (outcome.status === "REJECTED") {
      expect(outcome.reason.code).toBe("POLICY_DENIED");
      expect(outcome.reason.policyDecision).toEqual({ decision: "DENY", reasons: ["STOP_CONDITION_TRIGGERED"] });
    }
    expect(kernel.events().length).toBe(1); // only the POLICY_REVISED fact
  });

  it("merchant actors are not gated by store policies", async () => {
    const { kernel, paymentId } = await kernelWithCapturedPayment();
    const outcome = await kernel.execute(env({
      type: "REFUND_PAYMENT",
      paymentId: makeId<"PaymentId">(paymentId),
      amount: money("10000", usd),
    }));
    expect(outcome.status).toBe("EXECUTED");
    expect(kernel.view().allRefunds()[0]?.state).toBe("COMPLETED");
  });

  it("policy revisions are immutable facts and revision must increase", async () => {
    const kernel = new CommerceKernel();
    kernel.registerAutonomousPolicy(policy);
    expect(() => kernel.registerAutonomousPolicy(policy)).toThrow(TypeError);
    const revised = { ...policy, revision: 2, refundApprovalThreshold: money("5000", usd) };
    kernel.registerAutonomousPolicy(revised);
    expect(kernel.view().policyFor("store-1")?.revision).toBe(2);
    // Now even a $60 refund (6000 minor) requires approval under the revised threshold.
    const { kernel: paid, paymentId } = await kernelWithCapturedPayment();
    paid.registerAutonomousPolicy(revised);
    const outcome = await paid.execute(env({
      type: "REFUND_PAYMENT",
      paymentId: makeId<"PaymentId">(paymentId),
      amount: money("6000", usd),
    }, storeActor));
    expect(outcome.status).toBe("REJECTED");
    if (outcome.status === "REJECTED") {
      expect(outcome.reason.policyDecision?.decision).toBe("REQUIRE_APPROVAL");
    }
  });
});
