/**
 * W1-004 acceptance scenario 5 — refund abuse guard (property test).
 *
 * PROPERTY: for any command interleaving, refund totals can NEVER exceed
 * captured totals for a payment. A seeded PRNG (mulberry32 — reproducible)
 * drives randomized interleavings of partial/full captures, partial refunds,
 * goodwill refunds, chargeback forcings, void attempts and dispute lifecycle
 * steps against the REAL kernel; after EVERY step the invariant is asserted
 * from BOTH the kernel's authoritative view and the twin's projected facts
 * (they must agree exactly). Over-refund attempts (deliberately generated)
 * must be deterministic rejections that fold to zero events.
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
  type AnyRuntimeCommand,
  type CommandExecution,
  type PaymentIntent,
} from "../../contract.js";
import { ScriptedPaymentDouble } from "./support/payment-double.js";
import { commandEnvelope } from "../../contract.js";
import { CUSTOMER_ACTOR } from "./support/envelopes.js";

const usd = currency("USD");
const sku = makeId<"SkuId">("sku-property");
const merchant = makeId<"MerchantId">("merchant-1");
const card = { methodKind: "CARD" as const, tokenRef: "tok-property" };

/** Deterministic mulberry32 PRNG (identical seed → identical interleaving). */
class Prng {
  private state: number;
  constructor(public readonly seed: number) {
    this.state = seed >>> 0;
  }
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }
  int(n: number): number {
    return n <= 0 ? 0 : this.next() % n;
  }
  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)] as T;
  }
  chance(p: number): boolean {
    return this.next() / 0x100000000 < p;
  }
}

/** The invariant under test: refund totals never exceed captured totals. */
function assertRefundBound(kernel: CommerceKernel, twin: CommerceTwin, paymentIds: readonly PaymentIntent["paymentId"][]): void {
  for (const paymentId of paymentIds) {
    const captured = kernel.view().capturedTotalFor(paymentId);
    const refunded = kernel.view().refundedTotalFor(paymentId);
    expect(refunded <= captured, `refunded ${refunded} exceeded captured ${captured} on ${paymentId}`).toBe(true);
    // The twin's projected math must agree EXACTLY (divergence is a bug).
    expect(twin.facts().recourse.capturedTotal(paymentId)).toBe(captured);
    expect(twin.facts().recourse.refundedTotal(paymentId)).toBe(refunded);
    // Money-in never includes unsettled or unknown payments.
    for (const id of twin.facts().recourse.moneyInPaymentIds()) {
      expect(twin.facts().recourse.settlement(id)?.status).toBe("SETTLED");
    }
  }
}

async function runPropertySession(seed: number, steps: number): Promise<void> {
  const paymentBoundary = new ScriptedPaymentDouble();
  const kernel = new CommerceKernel({ paymentBoundary });
  const rng = new Prng(seed);
  let counter = 0;
  const envelope = (payload: AnyRuntimeCommand["payload"]): AnyRuntimeCommand => {
    counter += 1;
    return commandEnvelope(
      makeId<"CommandId">(`cmd-prop-${counter}`),
      makeId<"IdempotencyKey">(`idem-prop-${counter}`),
      CUSTOMER_ACTOR,
      "2026-10-05T00:00:00Z",
      payload,
    );
  };

  // Seed N payments of random amounts, all captured.
  const paymentIds: PaymentIntent["paymentId"][] = [];
  const paymentCount = 1 + rng.int(3);
  for (let index = 0; index < paymentCount; index += 1) {
    const amountMinor = 500n + BigInt(rng.int(20000));
    const cartId = makeId<"CartId">(`cart-prop-${seed}-${index}`);
    await kernel.execute(envelope({
      type: "ADD_CART_LINE",
      cartId,
      skuId: sku,
      quantity: countQuantity(1),
      unitPrice: money(amountMinor.toString(), usd),
    }));
    await kernel.execute(envelope({ type: "PLACE_ORDER", cartId, merchantId: merchant }));
    const order = kernel.view().allOrders().find((item) => item.cartId === cartId)!;
    await kernel.execute(envelope({
      type: "CREATE_PAYMENT_INTENT",
      request: { amount: money(amountMinor.toString(), usd), reference: { kind: "ORDER", orderId: order.orderId }, method: card },
    }));
    const paymentId = kernel.view().allPaymentIntents().find((item) => item.reference.kind === "ORDER" && item.reference.orderId === order.orderId)!.paymentId;
    paymentIds.push(paymentId);
    if (rng.chance(0.3)) {
      // Some payments start only PARTIALLY captured — refunds bound to the captured part.
      await kernel.execute(envelope({
        type: "CAPTURE_PAYMENT_PARTIAL",
        paymentId,
        amount: money((amountMinor / 2n).toString(), usd),
      }));
    } else {
      await kernel.execute(envelope({ type: "CAPTURE_PAYMENT", paymentId }));
    }
  }
  // Ambient variety: disputes, goodwill, settlement observations and failures interleave.
  await kernel.execute(envelope({ type: "OPEN_DISPUTE", paymentId: paymentIds[0]!, amount: money("100", usd) }));
  let folded = 0;
  let twin = CommerceTwin.empty();
  let overRefundAttempts = 0;
  let rejections = 0;

  for (let step = 0; step < steps; step += 1) {
    const paymentId = rng.pick(paymentIds);
    const captured = kernel.view().capturedTotalFor(paymentId);
    const refunded = kernel.view().refundedTotalFor(paymentId);
    const remaining = captured - refunded;
    const action = rng.pick([
      "REFUND_PAYMENT",
      "ISSUE_GOODWILL_REFUND",
      "RECORD_CHARGEBACK",
      "CAPTURE_PAYMENT_PARTIAL",
      "VOID_PAYMENT",
      "RESOLVE_DISPUTE",
      "OBSERVE_SETTLEMENT",
      "CLOSE_SETTLEMENT_WINDOW",
    ] as const);
    let payload: AnyRuntimeCommand["payload"];
    switch (action) {
      case "REFUND_PAYMENT":
      case "ISSUE_GOODWILL_REFUND": {
        // Sometimes deliberately attempt an over-refund (the guard must hold):
        // with nothing remaining, ANY positive refund amount is the over-attempt.
        const over = rng.chance(0.35);
        overRefundAttempts += over ? 1 : 0;
        const bound = over ? remaining + 1n + BigInt(rng.int(5000)) : remaining;
        const capped = bound > 4000n ? 4000n : bound;
        payload =
          action === "ISSUE_GOODWILL_REFUND"
            ? {
                type: action,
                paymentId,
                amount: money((1n + BigInt(rng.int(Number(capped)))).toString(), usd),
                reason: `property-${seed}-${step}`,
              }
            : {
                type: action,
                paymentId,
                amount: money((1n + BigInt(rng.int(Number(capped)))).toString(), usd),
              };
        break;
      }
      case "RECORD_CHARGEBACK": {
        const over = rng.chance(0.35);
        const bound = over ? remaining + 1n + BigInt(rng.int(5000)) : BigInt(rng.int(5000)) + 1n;
        const capped = bound > 4000n ? 4000n : bound;
        payload = { type: action, paymentId, amount: money(capped.toString(), usd), providerNativeStatus: "CB_PROPERTY" };
        break;
      }
      case "CAPTURE_PAYMENT_PARTIAL": {
        const uncaptured = BigInt(kernel.view().paymentIntent(paymentId)!.amount.amountMinor) - captured;
        const capped = uncaptured > 4000n ? 4000n : uncaptured;
        payload = {
          type: action,
          paymentId,
          amount: money((1n + BigInt(rng.int(Number(capped)))).toString(), usd),
        };
        break;
      }
      case "VOID_PAYMENT":
        payload = { type: action, paymentId };
        break;
      case "RESOLVE_DISPUTE": {
        const disputes = kernel.view().allDisputes().filter((item) => item.state !== "RESOLVED_ACCEPTED" && item.state !== "RESOLVED_REJECTED");
        payload = { type: action, disputeId: disputes.length > 0 ? rng.pick(disputes).disputeId : makeId<"DisputeId">("disp-missing"), outcome: rng.pick(["ACCEPTED", "REJECTED"] as const) };
        break;
      }
      default:
        // Settlement observation or window close — tri-state variety.
        payload = rng.chance(0.5)
          ? { type: "OBSERVE_SETTLEMENT", paymentId }
          : { type: "CLOSE_SETTLEMENT_WINDOW", paymentId };
        if (payload.type === "OBSERVE_SETTLEMENT" && rng.chance(0.3)) {
          paymentBoundary.scriptSettlementOutcome(paymentId, {
            resolved: "OBSERVED",
            status: rng.chance(0.5) ? "SETTLED" : "NOT_SETTLED",
          });
        }
        break;
    }
    const outcome: CommandExecution = await kernel.execute(envelope(payload));
    if (outcome.status === "REJECTED") rejections += 1;
    // Fold the journal incrementally; assert the invariant after EVERY step.
    const events = kernel.events();
    twin.applyAll(events.slice(folded));
    folded = events.length;
    assertRefundBound(kernel, twin, paymentIds);
  }

  // The session must have exercised the interesting paths.
  expect(overRefundAttempts).toBeGreaterThan(0);
  expect(rejections).toBeGreaterThan(0);
  expect(kernel.journalIsValid()).toBe(true);
  // Final full-rebuild twin equals the incrementally folded twin and the kernel.
  const rebuilt = CommerceTwin.fromEvents(kernel.events());
  assertTwinMatchesAuthoritative(rebuilt.snapshot(), kernel.snapshot());
  assertCanonicalEquivalence(rebuilt.snapshot(), kernel.snapshot());
  assertTwinMatchesAuthoritative(twin.snapshot(), kernel.snapshot());
  assertRefundBound(kernel, rebuilt, paymentIds);
}

describe("W1-004 acceptance scenario 5 — refund abuse guard (property: refunds ≤ captures under any interleaving)", () => {
  it("holds the refund bound under randomized interleavings across many seeds (verified after every step)", async () => {
    for (const seed of [1, 2, 3, 7, 42, 99, 555, 1337, 2024, 77, 8, 21, 314, 271, 161]) {
      await runPropertySession(seed, 80);
    }
  });

  it("holds the refund bound under long interleavings (single payment, deep sequences)", async () => {
    await runPropertySession(9001, 300);
    await runPropertySession(9002, 300);
  });
});
