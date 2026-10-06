/**
 * W1-004 acceptance scenario 4 — recourse primitives.
 *
 * Dispute open → evidence → resolve (accept/reject) flows are journaled end
 * to end; a chargeback FORCES the refund path without double-refund (the
 * forced amount is capped at captured − refunded, and a chargeback arriving
 * with nothing left is journaled as NO_ADDITIONAL_REFUND — the prevention
 * itself is an explicit fact); a GOODWILL refund and a POLICY refund are
 * distinguishable in the journal and every projection (refundKind + journaled
 * reason). Resolving a dispute records the decision and moves no money.
 */
import { describe, expect, it } from "vitest";
import {
  CommerceKernel,
  CommerceTwin,
  assertCanonicalEquivalence,
  assertTwinMatchesAuthoritative,
  countQuantity,
  currency,
  makeId,
  money,
  type CommandExecution,
  type PaymentIntent,
} from "../../contract.js";
import { ScriptedPaymentDouble } from "./support/payment-double.js";
import { env, mustExecute } from "./support/envelopes.js";

const usd = currency("USD");
const sku = makeId<"SkuId">("sku-headphones");
const merchant = makeId<"MerchantId">("merchant-1");
const card = { methodKind: "CARD" as const, tokenRef: "tok-recourse" };

function newKernel() {
  const paymentBoundary = new ScriptedPaymentDouble();
  const kernel = new CommerceKernel({ paymentBoundary });
  return { kernel, paymentBoundary };
}

function twinOf(kernel: CommerceKernel) {
  const twin = CommerceTwin.fromEvents(kernel.events());
  assertTwinMatchesAuthoritative(twin.snapshot(), kernel.snapshot());
  assertCanonicalEquivalence(twin.snapshot(), kernel.snapshot());
  return twin;
}

async function capturedPayment(kernel: CommerceKernel, tag: string, amountMinor: string): Promise<PaymentIntent["paymentId"]> {
  await mustExecute(kernel, env({
    type: "ADD_CART_LINE",
    cartId: makeId<"CartId">(`cart-${tag}`),
    skuId: sku,
    quantity: countQuantity(1),
    unitPrice: money(amountMinor, usd),
  }));
  await mustExecute(kernel, env({ type: "PLACE_ORDER", cartId: makeId<"CartId">(`cart-${tag}`), merchantId: merchant }));
  const order = kernel.view().allOrders().find((item) => item.cartId === makeId<"CartId">(`cart-${tag}`))!;
  await mustExecute(kernel, env({
    type: "CREATE_PAYMENT_INTENT",
    request: { amount: money(amountMinor, usd), reference: { kind: "ORDER", orderId: order.orderId }, method: card },
  }));
  const intent = kernel.view().allPaymentIntents().find((item) => item.reference.kind === "ORDER" && item.reference.orderId === order.orderId);
  const paymentId = intent!.paymentId;
  await mustExecute(kernel, env({ type: "CAPTURE_PAYMENT", paymentId }));
  return paymentId;
}

async function rejected(kernel: CommerceKernel, payload: Parameters<typeof env>[0]): Promise<CommandExecution> {
  const outcome = await kernel.execute(env(payload));
  expect(outcome.status).toBe("REJECTED");
  return outcome;
}

describe("W1-004 acceptance scenario 4 — recourse (disputes, chargebacks, goodwill vs policy refunds)", () => {
  it("dispute open → evidence → resolve (accept AND reject) is journaled at every step and twin-projected", async () => {
    const { kernel } = newKernel();
    const paymentId = await capturedPayment(kernel, "dispute", "12000");
    await mustExecute(kernel, env({
      type: "OPEN_DISPUTE",
      paymentId,
      amount: money("12000", usd),
      reason: "PRODUCT_NOT_RECEIVED",
      providerNativeStatus: "DISPUTE_OPEN",
    }));
    const disputeId = kernel.view().allDisputes()[0]!.disputeId;
    const dispute = kernel.view().dispute(disputeId);
    expect(dispute?.state).toBe("OPEN");
    expect(dispute?.providerNativeStatus).toBe("DISPUTE_OPEN");
    expect(dispute?.amount.amountMinor).toBe("12000");

    // Evidence submission: the dispute record transitions and the evidence is journaled DATA.
    await mustExecute(kernel, env({
      type: "SUBMIT_DISPUTE_EVIDENCE",
      disputeId,
      evidence: { summary: "tracking shows delivery on Oct 2; signature captured" },
    }));
    expect(kernel.view().dispute(disputeId)?.state).toBe("EVIDENCE_SUBMITTED");

    // Resolution ACCEPTED (dispute upheld): journaled decision, money untouched.
    const refundedBefore = kernel.view().refundedTotalFor(paymentId);
    await mustExecute(kernel, env({ type: "RESOLVE_DISPUTE", disputeId, outcome: "ACCEPTED" }));
    expect(kernel.view().dispute(disputeId)?.state).toBe("RESOLVED_ACCEPTED");
    expect(kernel.view().refundedTotalFor(paymentId)).toBe(refundedBefore);
    // Resolved disputes are terminal: every lifecycle command rejects.
    await rejected(kernel, { type: "SUBMIT_DISPUTE_EVIDENCE", disputeId, evidence: { summary: "late" } });
    await rejected(kernel, { type: "RESOLVE_DISPUTE", disputeId, outcome: "REJECTED" });

    // The REJECTED path on a second dispute (resolved directly from OPEN).
    const payment2 = await capturedPayment(kernel, "dispute-2", "8000");
    await mustExecute(kernel, env({ type: "OPEN_DISPUTE", paymentId: payment2, amount: money("8000", usd) }));
    const dispute2 = kernel.view().allDisputes().find((item) => item.paymentId === payment2)!.disputeId;
    await mustExecute(kernel, env({ type: "RESOLVE_DISPUTE", disputeId: dispute2, outcome: "REJECTED" }));
    expect(kernel.view().dispute(dispute2)?.state).toBe("RESOLVED_REJECTED");

    // Journal observability: every lifecycle step is a distinct immutable fact.
    const disputeEvents = kernel.events().filter((event) => event.subject.subjectType === "DISPUTE");
    expect(disputeEvents.map((event) => event.kind)).toEqual([
      "DISPUTE_OPENED",
      "DISPUTE_STATE_CHANGED",
      "DISPUTE_RESOLVED",
      "DISPUTE_OPENED",
      "DISPUTE_RESOLVED",
    ]);
    // Twin projection.
    const twin = twinOf(kernel);
    expect(twin.facts().recourse.disputesInState("RESOLVED_ACCEPTED")).toHaveLength(1);
    expect(twin.facts().recourse.disputesInState("RESOLVED_REJECTED")).toHaveLength(1);
    expect(twin.recourse.disputes.size).toBe(2);
  });

  it("a chargeback forces the refund path capped at the un-refunded captured remainder (no double refund); a late chargeback journals NO_ADDITIONAL_REFUND", async () => {
    const { kernel } = newKernel();
    const paymentId = await capturedPayment(kernel, "chargeback", "10000");
    // 6000 already refunded (policy): only 4000 remain refundable.
    await mustExecute(kernel, env({ type: "REFUND_PAYMENT", paymentId, amount: money("6000", usd) }));

    // Chargeback claims 5000 — the forced refund is capped at 4000.
    await mustExecute(kernel, env({
      type: "RECORD_CHARGEBACK",
      paymentId,
      amount: money("5000", usd),
      providerNativeStatus: "CHARGEBACK_FUNDS_REVERSED",
    }));
    const chargeback = kernel.view().allChargebacks()[0]!;
    expect(chargeback.state).toBe("FORCED_REFUND");
    expect(chargeback.amount.amountMinor).toBe("5000");
    expect(chargeback.forcedRefundAmount.amountMinor).toBe("4000");
    expect(chargeback.providerNativeStatus).toBe("CHARGEBACK_FUNDS_REVERSED");
    // Refund totals NEVER exceed captured totals (the abuse guard held).
    expect(kernel.view().refundedTotalFor(paymentId)).toBe(10000n);
    expect(kernel.view().capturedTotalFor(paymentId)).toBe(10000n);
    expect(kernel.view().paymentIntent(paymentId)?.status).toBe("REFUNDED");
    // The forced refund is a CHARGEBACK_FORCED_REFUND — distinguishable from the policy refund.
    const refunds = kernel.view().allRefunds();
    expect(refunds.find((refund) => refund.refundKind === "CHARGEBACK_FORCED_REFUND")?.amount.amountMinor).toBe("4000");
    expect(refunds.find((refund) => refund.refundKind === "POLICY_REFUND")?.amount.amountMinor).toBe("6000");
    expect(kernel.view().refund(chargeback.refundId!)?.refundKind).toBe("CHARGEBACK_FORCED_REFUND");

    // A chargeback arriving with NOTHING left: journaled, zero forced refund —
    // the double-refund prevention is explicit state, never an error swallowed.
    await mustExecute(kernel, env({ type: "RECORD_CHARGEBACK", paymentId, amount: money("3000", usd) }));
    const prevented = kernel.view().allChargebacks().at(-1)!;
    expect(prevented.state).toBe("NO_ADDITIONAL_REFUND");
    expect(prevented.forcedRefundAmount.amountMinor).toBe("0");
    expect(kernel.view().refundedTotalFor(paymentId)).toBe(10000n);

    // Twin projection: both chargeback facts and the capped math agree.
    const twin = twinOf(kernel);
    expect(twin.facts().recourse.chargebacks()).toHaveLength(2);
    expect(twin.facts().recourse.refundedTotal(paymentId)).toBe(10000n);
    expect(twin.facts().recourse.refundsOfKind("CHARGEBACK_FORCED_REFUND")).toHaveLength(1);
    // Chargebacks require captured funds.
    await rejected(kernel, { type: "RECORD_CHARGEBACK", paymentId: makeId<"PaymentId">("pay-missing"), amount: money("1", usd) });
  });

  it("a goodwill refund and a policy refund are distinguishable in the journal and projections (kind + journaled reason)", async () => {
    const { kernel } = newKernel();
    const paymentId = await capturedPayment(kernel, "goodwill", "9000");

    // Policy refund (the ordinary REFUND_PAYMENT path).
    await mustExecute(kernel, env({ type: "REFUND_PAYMENT", paymentId, amount: money("2000", usd) }));
    // Goodwill refund: an explicit merchant concession with a journaled reason.
    await mustExecute(kernel, env({
      type: "ISSUE_GOODWILL_REFUND",
      paymentId,
      amount: money("1500", usd),
      reason: "late delivery compensation — customer retention",
    }));

    const refunds = kernel.view().allRefunds();
    expect(refunds).toHaveLength(2);
    const policy = refunds.find((refund) => refund.refundKind === "POLICY_REFUND");
    const goodwill = refunds.find((refund) => refund.refundKind === "GOODWILL_REFUND");
    expect(policy?.amount.amountMinor).toBe("2000");
    expect(policy?.reason).toBeUndefined();
    expect(goodwill?.amount.amountMinor).toBe("1500");
    expect(goodwill?.reason).toBe("late delivery compensation — customer retention");
    // The JOURNAL carries the distinction: distinct payload facts on REFUND_RECORDED events.
    const refundEvents = kernel.events().filter((event) => event.kind === "REFUND_RECORDED");
    expect(refundEvents).toHaveLength(2);
    expect((refundEvents[0] as { payload: { refund: { refundKind?: string } } }).payload.refund.refundKind).toBe("POLICY_REFUND");
    expect((refundEvents[1] as { payload: { refund: { refundKind?: string } } }).payload.refund.refundKind).toBe("GOODWILL_REFUND");

    // Projections: facts classify by kind; the read model and twin agree.
    const twin = twinOf(kernel);
    expect(twin.facts().recourse.refundsOfKind("POLICY_REFUND")).toHaveLength(1);
    expect(twin.facts().recourse.refundsOfKind("GOODWILL_REFUND")).toHaveLength(1);
    expect(twin.recourse.refunds.size).toBe(2);
    expect(kernel.view().refundedTotalFor(paymentId)).toBe(3500n);

    // Goodwill refunds respect the captured bound and require a reason.
    await rejected(kernel, { type: "ISSUE_GOODWILL_REFUND", paymentId, amount: money("6000", usd), reason: "over refund" });
    await rejected(kernel, { type: "ISSUE_GOODWILL_REFUND", paymentId, amount: money("100", usd), reason: "  " });
    twinOf(kernel);
  });

  it("dispute guards: bounds, missing payments, non-order references and currency mismatches are deterministic rejections with zero events", async () => {
    const { kernel } = newKernel();
    const paymentId = await capturedPayment(kernel, "guards", "5000");
    await rejected(kernel, { type: "OPEN_DISPUTE", paymentId, amount: money("6000", usd) });
    await rejected(kernel, { type: "OPEN_DISPUTE", paymentId, amount: money("0", usd) });
    await rejected(kernel, { type: "OPEN_DISPUTE", paymentId, amount: money("1000", currency("EUR")) });
    await rejected(kernel, { type: "OPEN_DISPUTE", paymentId: makeId<"PaymentId">("pay-missing"), amount: money("1000", usd) });
    await rejected(kernel, { type: "SUBMIT_DISPUTE_EVIDENCE", disputeId: makeId<"DisputeId">("disp-missing"), evidence: { summary: "x" } });
    await rejected(kernel, { type: "RESOLVE_DISPUTE", disputeId: makeId<"DisputeId">("disp-missing"), outcome: "ACCEPTED" });
    // CHECKOUT-referenced payments cannot host disputes.
    await mustExecute(kernel, env({
      type: "CREATE_PAYMENT_INTENT",
      request: { amount: money("1000", usd), reference: { kind: "CHECKOUT", checkoutSessionId: makeId<"CheckoutSessionId">("cs-none") }, method: card },
    }));
    const checkoutRef = kernel.view().allPaymentIntents().find((intent) => intent.reference.kind === "CHECKOUT")!.paymentId;
    await rejected(kernel, { type: "OPEN_DISPUTE", paymentId: checkoutRef, amount: money("500", usd) });
    expect(kernel.view().allDisputes()).toHaveLength(0);
    twinOf(kernel);
  });
});
