/**
 * W1-004 acceptance scenario 2 — the payment lifecycle as journal events.
 *
 * auth → capture (partial + full) → refund (partial + full, chained after
 * capture ONLY); void after capture is rejected as an INVALID TRANSITION by
 * the kernel BEFORE any port call; every step is journal-observable (capture
 * facts, refund facts with provenance) and twin-projected (twin ≡ kernel
 * after every command; the twin's capture/refund math equals the kernel's).
 * Duplicate capture submissions replay idempotently — never a double capture.
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
import { env, explicitEnv, mustExecute } from "./support/envelopes.js";

const usd = currency("USD");
const sku = makeId<"SkuId">("sku-drill");
const merchant = makeId<"MerchantId">("merchant-1");
const card = { methodKind: "CARD" as const, tokenRef: "tok-lifecycle" };

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

/** Seed an order + authorized payment of 10000 minor units; return the payment id. */
async function authorizedPayment(kernel: CommerceKernel, tag: string): Promise<PaymentIntent["paymentId"]> {
  await mustExecute(kernel, env({
    type: "ADD_CART_LINE",
    cartId: makeId<"CartId">(`cart-${tag}`),
    skuId: sku,
    quantity: countQuantity(1),
    unitPrice: money("10000", usd),
  }));
  await mustExecute(kernel, env({ type: "PLACE_ORDER", cartId: makeId<"CartId">(`cart-${tag}`), merchantId: merchant }));
  const order = kernel.view().allOrders().find((item) => item.cartId === makeId<"CartId">(`cart-${tag}`))!;
  await mustExecute(kernel, env({
    type: "CREATE_PAYMENT_INTENT",
    request: {
      amount: money("10000", usd),
      reference: { kind: "ORDER", orderId: order.orderId },
      method: card,
    },
  }));
  const intent = kernel.view().allPaymentIntents().find((item) => item.reference.kind === "ORDER" && item.reference.orderId === order.orderId);
  return intent!.paymentId;
}

async function rejectWith(kernel: CommerceKernel, payload: Parameters<typeof env>[0], code: string): Promise<void> {
  const outcome: CommandExecution = await kernel.execute(env(payload));
  expect(outcome.status).toBe("REJECTED");
  if (outcome.status === "REJECTED") {
    expect(outcome.reason.code).toBe(code);
  }
}

describe("W1-004 acceptance scenario 2 — payment lifecycle (auth → partial+full capture → partial+full refund)", () => {
  it("auth → partial capture → full capture → partial refund → full refund, exact amounts at every step, journal + twin agree", async () => {
    const { kernel } = newKernel();
    const paymentId = await authorizedPayment(kernel, "flow");

    // Partial capture of 4000 of 10000.
    await mustExecute(kernel, env({ type: "CAPTURE_PAYMENT_PARTIAL", paymentId, amount: money("4000", usd) }));
    expect(kernel.view().paymentIntent(paymentId)?.status).toBe("PARTIALLY_CAPTURED");
    expect(kernel.view().capturedTotalFor(paymentId)).toBe(4000n);
    expect(kernel.view().capturesFor(paymentId)).toHaveLength(1);
    expect(kernel.view().capturesFor(paymentId)[0]?.kind).toBe("PARTIAL");

    // Full capture = everything still authorized (the remaining 6000).
    await mustExecute(kernel, env({ type: "CAPTURE_PAYMENT", paymentId }));
    expect(kernel.view().paymentIntent(paymentId)?.status).toBe("CAPTURED");
    expect(kernel.view().capturedTotalFor(paymentId)).toBe(10000n);
    const captures = kernel.view().capturesFor(paymentId);
    expect(captures).toHaveLength(2);
    expect(captures[1]?.kind).toBe("FULL");
    expect(captures[1]?.amount.amountMinor).toBe("6000");
    // The order is PAID after full capture.
    const order = kernel.view().allOrders().at(-1)!;
    expect(order.paymentStatus).toBe("PAID");
    expect(order.state).toBe("PAID");

    // Refund BEFORE capture is impossible on a fresh payment (chained after capture only).
    const other = await authorizedPayment(kernel, "no-capture");
    await rejectWith(kernel, { type: "REFUND_PAYMENT", paymentId: other, amount: money("1000", usd) }, "INVALID_COMMAND");
    await rejectWith(kernel, { type: "ISSUE_GOODWILL_REFUND", paymentId: other, amount: money("1000", usd), reason: "too early" }, "INVALID_COMMAND");

    // Partial refund of 2500 (post-capture only).
    await mustExecute(kernel, env({ type: "REFUND_PAYMENT", paymentId, amount: money("2500", usd) }));
    expect(kernel.view().paymentIntent(paymentId)?.status).toBe("PARTIALLY_REFUNDED");
    expect(kernel.view().refundedTotalFor(paymentId)).toBe(2500n);
    expect(kernel.view().refund(kernel.view().allRefunds()[0]!.refundId)?.refundKind).toBe("POLICY_REFUND");

    // A refund that would exceed the captured total is rejected (abuse guard).
    await rejectWith(kernel, { type: "REFUND_PAYMENT", paymentId, amount: money("8000", usd) }, "INVALID_COMMAND");

    // Full refund of the remaining 7500 completes the lifecycle.
    await mustExecute(kernel, env({ type: "REFUND_PAYMENT", paymentId, amount: money("7500", usd) }));
    expect(kernel.view().paymentIntent(paymentId)?.status).toBe("REFUNDED");
    expect(kernel.view().refundedTotalFor(paymentId)).toBe(10000n);
    // Nothing left to refund.
    await rejectWith(kernel, { type: "REFUND_PAYMENT", paymentId, amount: money("1", usd) }, "INVALID_COMMAND");
    await rejectWith(kernel, { type: "ISSUE_GOODWILL_REFUND", paymentId, amount: money("1", usd), reason: "nothing left" }, "INVALID_COMMAND");

    // Journal observability: capture + refund facts with exact amounts.
    expect(kernel.events().filter((event) => event.kind === "PAYMENT_CAPTURE_RECORDED")).toHaveLength(2);
    expect(kernel.events().filter((event) => event.kind === "REFUND_RECORDED")).toHaveLength(2);

    // Twin projection: identical captured/refunded math and refund kinds.
    const twin = twinOf(kernel);
    expect(twin.facts().recourse.capturedTotal(paymentId)).toBe(10000n);
    expect(twin.facts().recourse.refundedTotal(paymentId)).toBe(10000n);
    expect(twin.facts().recourse.capturesFor(paymentId)).toHaveLength(2);
    expect(twin.facts().recourse.refundsOfKind("POLICY_REFUND")).toHaveLength(2);
    expect(twin.recourse.captures.size).toBe(2);
  });

  it("void after capture is rejected as an invalid transition BEFORE any port call; void before capture succeeds", async () => {
    const { kernel, paymentBoundary } = newKernel();
    const voidable = await authorizedPayment(kernel, "void-first");
    await mustExecute(kernel, env({ type: "VOID_PAYMENT", paymentId: voidable }));
    expect(kernel.view().paymentIntent(voidable)?.status).toBe("VOIDED");
    expect(paymentBoundary.calls.filter((call) => call.startsWith("void:"))).toHaveLength(1);

    const captured = await authorizedPayment(kernel, "void-after");
    await mustExecute(kernel, env({ type: "CAPTURE_PAYMENT", paymentId: captured }));
    const callsBefore = paymentBoundary.calls.length;
    await rejectWith(kernel, { type: "VOID_PAYMENT", paymentId: captured }, "INVALID_STATE");
    // Kernel-side guard: the port was NEVER called for the rejected void.
    expect(paymentBoundary.calls.length).toBe(callsBefore);
    expect(kernel.view().paymentIntent(captured)?.status).toBe("CAPTURED");
    twinOf(kernel);
  });

  it("partial capture bounds are enforced: over-capture, zero and negative amounts, currency mismatch and full-then-partial are all rejected", async () => {
    const { kernel } = newKernel();
    const paymentId = await authorizedPayment(kernel, "bounds");
    await rejectWith(kernel, { type: "CAPTURE_PAYMENT_PARTIAL", paymentId, amount: money("10001", usd) }, "INVALID_COMMAND");
    await rejectWith(kernel, { type: "CAPTURE_PAYMENT_PARTIAL", paymentId, amount: money("0", usd) }, "INVALID_COMMAND");
    await rejectWith(kernel, { type: "CAPTURE_PAYMENT_PARTIAL", paymentId, amount: money("-5", usd) }, "INVALID_COMMAND");
    await rejectWith(kernel, { type: "CAPTURE_PAYMENT_PARTIAL", paymentId, amount: money("500", currency("EUR")) }, "INVALID_COMMAND");
    await mustExecute(kernel, env({ type: "CAPTURE_PAYMENT", paymentId }));
    // Fully captured now — any further capture is a deterministic rejection.
    await rejectWith(kernel, { type: "CAPTURE_PAYMENT_PARTIAL", paymentId, amount: money("1", usd) }, "INVALID_STATE");
    await rejectWith(kernel, { type: "CAPTURE_PAYMENT", paymentId }, "INVALID_STATE");
    twinOf(kernel);
  });

  it("duplicate capture submissions replay idempotently — the journal never records a double capture", async () => {
    const { kernel } = newKernel();
    const paymentId = await authorizedPayment(kernel, "idem");
    const envelope = explicitEnv("cmd-cap-1", "idem-cap-1", { type: "CAPTURE_PAYMENT_PARTIAL", paymentId, amount: money("3000", usd) });
    await mustExecute(kernel, envelope);
    expect(kernel.view().capturedTotalFor(paymentId)).toBe(3000n);
    const replay = await kernel.execute(envelope);
    expect(replay.status).toBe("DUPLICATE");
    expect(kernel.view().capturedTotalFor(paymentId)).toBe(3000n);
    expect(kernel.view().capturesFor(paymentId)).toHaveLength(1);
    twinOf(kernel);
  });

  it("an ambiguous (UNKNOWN) capture records no capture fact — the retry captures cleanly and the amount never double-counts", async () => {
    const { kernel, paymentBoundary } = newKernel();
    const paymentId = await authorizedPayment(kernel, "ambiguous");
    paymentBoundary.makeNextOutcomeAmbiguous("CAPTURE_STATE_UNCLEAR");
    await mustExecute(kernel, env({ type: "CAPTURE_PAYMENT_PARTIAL", paymentId, amount: money("4000", usd) }));
    // Ambiguous capture: intent UNKNOWN, ZERO capture facts, order payment UNKNOWN.
    expect(kernel.view().paymentIntent(paymentId)?.status).toBe("UNKNOWN");
    expect(kernel.view().capturedTotalFor(paymentId)).toBe(0n);
    const order = kernel.view().allOrders().find((item) => item.paymentStatus === "UNKNOWN");
    expect(order).toBeDefined();
    // Deterministic retry: the rail now reports the definitive outcome.
    await mustExecute(kernel, env({ type: "CAPTURE_PAYMENT_PARTIAL", paymentId, amount: money("4000", usd) }));
    expect(kernel.view().paymentIntent(paymentId)?.status).toBe("PARTIALLY_CAPTURED");
    expect(kernel.view().capturedTotalFor(paymentId)).toBe(4000n);
    expect(kernel.view().capturesFor(paymentId)).toHaveLength(1);
    twinOf(kernel);
  });
});
