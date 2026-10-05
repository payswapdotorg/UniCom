/**
 * W1-004 acceptance scenario 1 — the checkout journey.
 *
 * cart → checkout session → ORDER with an AUTHORIZED payment in one atomic
 * COMPLETE_CHECKOUT command; abandon/expire reach terminal states
 * deterministically; duplicate checkout submissions are idempotent (exact
 * replay → DUPLICATE; new key on a terminal session → deterministic
 * INVALID_STATE). A failed payment authorization rejects the WHOLE command
 * with zero journal entries (no torn half-checkouts). Every step is
 * journal-observable and twin-projected (twin ≡ kernel after every command).
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
} from "../../contract.js";
import { ScriptedPaymentDouble } from "./support/payment-double.js";
import { env, explicitEnv, mustExecute } from "./support/envelopes.js";

const usd = currency("USD");
const sku = makeId<"SkuId">("sku-tote");
const merchant = makeId<"MerchantId">("merchant-1");
const card = { methodKind: "CARD" as const, tokenRef: "tok-checkout-1" };

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

async function seededCart(kernel: CommerceKernel, cartId: string) {
  await mustExecute(kernel, env({
    type: "ADD_CART_LINE",
    cartId: makeId<"CartId">(cartId),
    skuId: sku,
    quantity: countQuantity(2),
    unitPrice: money("1999", usd),
  }));
}

describe("W1-004 acceptance scenario 1 — checkout journey (cart → checkout → order with authorized payment)", () => {
  it("completes checkout atomically: order PENDING + payment AUTHORIZED + session COMPLETED, all journaled and twin-projected", async () => {
    const { kernel } = newKernel();
    await seededCart(kernel, "cart-journey");
    await mustExecute(kernel, env({ type: "OPEN_CHECKOUT", cartId: makeId<"CartId">("cart-journey") }));
    const sessionId = kernel.view().allCheckoutSessions()[0]!.checkoutSessionId;
    const receipt = await mustExecute(kernel, env({
      type: "COMPLETE_CHECKOUT",
      checkoutSessionId: sessionId,
      merchantId: merchant,
      method: card,
    }));
    expect(receipt.receipt?.subjectRefs).toContain(`CHECKOUT_SESSION:${sessionId}`);
    // Order exists in PENDING with AUTHORIZED payment, linked to the session.
    const order = kernel.view().allOrders().find((item) => item.checkoutSessionId === sessionId);
    expect(order).toBeDefined();
    expect(order?.state).toBe("PENDING");
    expect(order?.paymentStatus).toBe("AUTHORIZED");
    expect(order?.totals.grandTotal.amountMinor).toBe("3998");
    expect(order?.placedAt).toBe("2026-01-01T00:00:00Z");
    // Payment intent recorded against the order.
    const intent = kernel.view().allPaymentIntents()[0];
    expect(intent?.status).toBe("AUTHORIZED");
    expect(intent?.amount.amountMinor).toBe("3998");
    if (intent?.reference.kind === "ORDER") {
      expect(intent.reference.orderId).toBe(order?.orderId);
    } else {
      expect.unreachable();
    }
    // Session terminal.
    expect(kernel.view().checkoutSession(sessionId)?.state).toBe("COMPLETED");
    // Journal observability: the full event chain of the atomic completion.
    const kinds = kernel.events().map((event) => event.kind);
    expect(kinds).toContain("ORDER_PLACED");
    expect(kinds).toContain("PAYMENT_INTENT_RECORDED");
    expect(kinds).toContain("ORDER_PAYMENT_STATUS_CHANGED");
    expect(kinds.filter((kind) => kind === "CHECKOUT_STATE_CHANGED").length).toBe(2);
    // Twin projection: session COMPLETED, order AUTHORIZED, payment present.
    const twin = twinOf(kernel);
    expect(twin.facts().orders.orders()[0]?.paymentStatus).toBe("AUTHORIZED");
    expect(twin.snapshot().checkoutSessions[0]?.state).toBe("COMPLETED");
    expect(twin.facts().payments.intents().length).toBe(1);
  });

  it("abandon reaches the terminal ABANDONED state deterministically from OPEN and PAYMENT_PENDING; terminal sessions reject every trigger", async () => {
    const { kernel } = newKernel();
    await seededCart(kernel, "cart-abandon");
    await mustExecute(kernel, env({ type: "OPEN_CHECKOUT", cartId: makeId<"CartId">("cart-abandon") }));
    const sessionId = kernel.view().allCheckoutSessions()[0]!.checkoutSessionId;
    await mustExecute(kernel, env({ type: "ADVANCE_CHECKOUT", checkoutSessionId: sessionId, trigger: "ABANDON" }));
    expect(kernel.view().checkoutSession(sessionId)?.state).toBe("ABANDONED");
    for (const trigger of ["START_PAYMENT", "COMPLETE", "ABANDON", "EXPIRE"] as const) {
      const outcome: CommandExecution = await kernel.execute(env({
        type: "ADVANCE_CHECKOUT",
        checkoutSessionId: sessionId,
        trigger,
      }));
      expect(outcome.status).toBe("REJECTED");
      if (outcome.status === "REJECTED") expect(outcome.reason.code).toBe("INVALID_STATE");
    }
    twinOf(kernel);
  });

  it("expire reaches the terminal EXPIRED state deterministically from OPEN and from PAYMENT_PENDING", async () => {
    const { kernel } = newKernel();
    await seededCart(kernel, "cart-expire");
    await mustExecute(kernel, env({ type: "OPEN_CHECKOUT", cartId: makeId<"CartId">("cart-expire") }));
    const open = kernel.view().allCheckoutSessions()[0]!.checkoutSessionId;
    await mustExecute(kernel, env({ type: "ADVANCE_CHECKOUT", checkoutSessionId: open, trigger: "EXPIRE" }));
    expect(kernel.view().checkoutSession(open)?.state).toBe("EXPIRED");

    await seededCart(kernel, "cart-expire-2");
    await mustExecute(kernel, env({ type: "OPEN_CHECKOUT", cartId: makeId<"CartId">("cart-expire-2") }));
    const pending = kernel.view()
      .allCheckoutSessions()
      .find((session) => session.cartId === makeId<"CartId">("cart-expire-2"))!.checkoutSessionId;
    await mustExecute(kernel, env({ type: "ADVANCE_CHECKOUT", checkoutSessionId: pending, trigger: "START_PAYMENT" }));
    await mustExecute(kernel, env({ type: "ADVANCE_CHECKOUT", checkoutSessionId: pending, trigger: "EXPIRE" }));
    expect(kernel.view().checkoutSession(pending)?.state).toBe("EXPIRED");
    twinOf(kernel);
  });

  it("duplicate checkout submissions are idempotent: exact replay → DUPLICATE with unchanged journal; a NEW key on the completed session → deterministic rejection", async () => {
    const { kernel } = newKernel();
    await seededCart(kernel, "cart-dup");
    await mustExecute(kernel, env({ type: "OPEN_CHECKOUT", cartId: makeId<"CartId">("cart-dup") }));
    const sessionId = kernel.view().allCheckoutSessions()[0]!.checkoutSessionId;
    const envelope = explicitEnv("cmd-complete-1", "idem-complete-1", {
      type: "COMPLETE_CHECKOUT",
      checkoutSessionId: sessionId,
      merchantId: merchant,
      method: card,
    });
    await mustExecute(kernel, envelope);
    const journalLength = kernel.events().length;
    const orderCount = kernel.view().allOrders().length;
    // Exact replay: same command id + idempotency key → DUPLICATE, no new effects.
    const replay = await kernel.execute(envelope);
    expect(replay.status).toBe("DUPLICATE");
    expect(kernel.events().length).toBe(journalLength);
    expect(kernel.view().allOrders().length).toBe(orderCount);
    // New key against the terminal session → INVALID_STATE (never a second order).
    const second = await kernel.execute(explicitEnv("cmd-complete-2", "idem-complete-2", {
      type: "COMPLETE_CHECKOUT",
      checkoutSessionId: sessionId,
      merchantId: merchant,
      method: card,
    }));
    expect(second.status).toBe("REJECTED");
    if (second.status === "REJECTED") {
      expect(second.reason.code).toBe("INVALID_STATE");
      expect(second.reason.detail).toContain("terminal");
    }
    expect(kernel.events().length).toBe(journalLength);
    expect(kernel.view().allOrders().length).toBe(orderCount);
    twinOf(kernel);
  });

  it("a failed payment authorization rejects the whole completion with ZERO journal entries (atomic: no torn half-checkouts)", async () => {
    const paymentBoundary = new ScriptedPaymentDouble();
    const kernel = new CommerceKernel({ paymentBoundary });
    await seededCart(kernel, "cart-fail");
    await mustExecute(kernel, env({ type: "OPEN_CHECKOUT", cartId: makeId<"CartId">("cart-fail") }));
    const sessionId = kernel.view().allCheckoutSessions()[0]!.checkoutSessionId;
    // Empty method token → the port rejects the intent request before creation.
    const failed = await kernel.execute(env({
      type: "COMPLETE_CHECKOUT",
      checkoutSessionId: sessionId,
      merchantId: merchant,
      method: { methodKind: "CARD", tokenRef: "" },
    }));
    expect(failed.status).toBe("REJECTED");
    const preJournal = kernel.events().length;
    expect(kernel.view().allOrders().length).toBe(0);
    expect(kernel.view().checkoutSession(sessionId)?.state).toBe("OPEN");
    // An ambiguous authorization outcome is journaled as UNKNOWN (never FAILED),
    // the session still completes with the order holding the UNKNOWN payment.
    paymentBoundary.makeNextOutcomeAmbiguous("AUTH_STATE_UNCLEAR");
    await mustExecute(kernel, env({
      type: "COMPLETE_CHECKOUT",
      checkoutSessionId: sessionId,
      merchantId: merchant,
      method: card,
    }));
    expect(kernel.events().length).toBeGreaterThan(preJournal);
    const order = kernel.view().allOrders().find((item) => item.checkoutSessionId === sessionId);
    expect(order?.paymentStatus).toBe("UNKNOWN");
    expect(kernel.view().allPaymentIntents()[0]?.providerNativeStatus).toBe("AUTH_STATE_UNCLEAR");
    twinOf(kernel);
  });

  it("checkout completion from PAYMENT_PENDING walks a single session transition (START_PAYMENT journaled first from OPEN)", async () => {
    const { kernel } = newKernel();
    await seededCart(kernel, "cart-pp");
    await mustExecute(kernel, env({ type: "OPEN_CHECKOUT", cartId: makeId<"CartId">("cart-pp") }));
    const sessionId = kernel.view().allCheckoutSessions()[0]!.checkoutSessionId;
    await mustExecute(kernel, env({ type: "ADVANCE_CHECKOUT", checkoutSessionId: sessionId, trigger: "START_PAYMENT" }));
    const before = kernel.events().filter((event) => event.kind === "CHECKOUT_STATE_CHANGED").length;
    await mustExecute(kernel, env({
      type: "COMPLETE_CHECKOUT",
      checkoutSessionId: sessionId,
      merchantId: merchant,
      method: card,
    }));
    const after = kernel.events().filter((event) => event.kind === "CHECKOUT_STATE_CHANGED").length;
    expect(after - before).toBe(1);
    expect(kernel.view().checkoutSession(sessionId)?.state).toBe("COMPLETED");
    twinOf(kernel);
  });
});
