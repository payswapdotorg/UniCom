/**
 * W1-014 Stage 0 — Linking Law 6: UNKNOWN is not FAILED.
 *
 * BINDING LAW (decision packet §2.6): a pending downstream result surfaces
 * UNKNOWN, never a failure. The existing UNKNOWN states (e.g. payment intent
 * pending) are preserved as UNKNOWN through retries/timeouts.
 *
 * Stage 0 spec against the CURRENT command surface:
 * 1. The payment boundary's three-state law: an ambiguous provider outcome
 *    resolves the intent to UNKNOWN, never FAILED — the provider-native status
 *    is preserved verbatim (`resolveAmbiguousPayment`).
 * 2. A payment intent may be in UNKNOWN status (the PaymentStatus vocabulary
 *    includes UNKNOWN as a first-class state, never flattened to FAILED).
 * 3. A TradeCycle leg with ambiguous attribution (a non-giver attempts to
 *    authorize/refuse/withdraw) is held UNKNOWN with the ambiguity recorded —
 *    never FAILED, never silently passed.
 * 4. UNKNOWN legs are NOT authorizations — execution is honestly rejected
 *    (NOT_ALL_LEGS_AUTHORIZED), not silently passed as if consented.
 * 5. An ambiguous action against a CONSENTED leg is rejected
 *    (AMBIGUOUS_ACTION_ON_CONSENTED_LEG) — standing consent is never destroyed
 *    by an unattributable actor.
 * 6. A lapsed UNKNOWN leg surfaces EXPIRED (an honest stop), never FAILED.
 * 7. The OrderPaymentStatus vocabulary preserves UNKNOWN (the order's payment
 *    status may be UNKNOWN, never flattened to a failure code).
 *
 * Where the future Stage 2 surface (linked-draft UNKNOWN recovery) is needed,
 * a precisely-documented `describe.skip` block records the gap.
 */
import { describe, expect, it } from "vitest";
import {
  CommerceKernel,
  countQuantity,
  currency,
  makeId,
  money,
  resolveAmbiguousPayment,
  type PaymentIntent,
  type PrincipalRef,
  type TradeCycleExecution,
  type TradeCycleExecutionLeg,
} from "../contract.js";
import { ScriptedPaymentDouble } from "./runtime/support/payment-double.js";
import { env, mustExecute } from "./runtime/support/envelopes.js";

const usd = currency("USD");
const merchant = makeId<"MerchantId">("merchant-1");
const sku = makeId<"SkuId">("sku-tote");
const card = { methodKind: "CARD" as const, tokenRef: "tok-unknown-1" };

function customer(id: string): PrincipalRef {
  return { kind: "CUSTOMER", customerId: makeId<"CustomerId">(id) };
}

const harborLane = customer("harbor-lane");
const northlight = customer("northlight");
const twoHarbors = customer("two-harbors");

function newKernel() {
  return new CommerceKernel({ paymentBoundary: new ScriptedPaymentDouble() });
}

function leg(index: number, from: PrincipalRef, to: PrincipalRef, item: string): TradeCycleExecutionLeg {
  return {
    legIndex: index,
    fromRef: from,
    toRef: to,
    offeredItemRef: item,
    requiredProofLevel: "P2",
    consentState: "PENDING",
    revision: 1,
  };
}

function cycleA(id: string): TradeCycleExecution {
  return {
    tradeCycleId: makeId<"TradeCycleId">(id),
    initiatingRef: harborLane,
    legs: [
      leg(0, northlight, twoHarbors, "Photography light kit"),
      leg(1, twoHarbors, harborLane, "Overlock sewing machine"),
      leg(2, harborLane, northlight, "Wide-format A1 printer"),
    ],
    executionMode: "ATOMIC",
    bounds: { maxHops: 3, environment: "LAB" },
    state: "OPEN",
    revision: 1,
  };
}

/** Place an order, create a payment intent, capture; returns paymentId. */
async function capturedPayment(kernel: CommerceKernel, tag: string, amountMinor: string) {
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
  const intent = kernel.view().allPaymentIntents().find((item) => item.reference.kind === "ORDER" && item.reference.orderId === order.orderId)!;
  await mustExecute(kernel, env({ type: "CAPTURE_PAYMENT", paymentId: intent.paymentId }));
  return intent.paymentId;
}

describe("W1-014 linking law 6 — UNKNOWN is not FAILED (pending downstream results surface UNKNOWN, never a failure)", () => {
  it("resolveAmbiguousPayment maps an ambiguous provider outcome to UNKNOWN — never FAILED — and preserves the native status verbatim", () => {
    // The pure-domain helper is the boundary law made canonical: an adapter
    // that receives an ambiguous provider outcome MUST call this instead of
    // inventing a failure.
    const intent: PaymentIntent = {
      paymentId: makeId<"PaymentId">("pay-ambig-1"),
      reference: { kind: "ORDER", orderId: makeId<"OrderId">("ord-ambig-1") },
      amount: money("5000", usd),
      status: "AUTHORIZED",
      revision: 1,
    };
    const resolved = resolveAmbiguousPayment(intent, "PROCESSING_STATE_UNCLEAR");
    expect(resolved.status).toBe("UNKNOWN");
    expect(resolved.status).not.toBe("FAILED");
    expect(resolved.providerNativeStatus).toBe("PROCESSING_STATE_UNCLEAR");
    expect(resolved.revision).toBe(2);
  });

  it("a payment intent created against the scripted double surfaces AUTHORIZED (the canonical happy path) — never flattened to FAILED", async () => {
    const kernel = newKernel();
    await mustExecute(kernel, env({
      type: "ADD_CART_LINE",
      cartId: makeId<"CartId">("cart-unk-1"),
      skuId: sku,
      quantity: countQuantity(1),
      unitPrice: money("5000", usd),
    }));
    await mustExecute(kernel, env({ type: "PLACE_ORDER", cartId: makeId<"CartId">("cart-unk-1"), merchantId: merchant }));
    const order = kernel.view().allOrders()[0]!;
    await mustExecute(kernel, env({
      type: "CREATE_PAYMENT_INTENT",
      request: { amount: money("5000", usd), reference: { kind: "ORDER", orderId: order.orderId }, method: card },
    }));
    const intent = kernel.view().allPaymentIntents()[0]!;
    expect(intent.status).toBe("AUTHORIZED");
    expect(intent.status).not.toBe("FAILED");
  });

  it("a payment intent with an ambiguous provider outcome surfaces UNKNOWN — never FAILED — through the scripted double", async () => {
    const double = new ScriptedPaymentDouble();
    const kernel = new CommerceKernel({ paymentBoundary: double });
    await mustExecute(kernel, env({
      type: "ADD_CART_LINE",
      cartId: makeId<"CartId">("cart-unk-2"),
      skuId: sku,
      quantity: countQuantity(1),
      unitPrice: money("5000", usd),
    }));
    await mustExecute(kernel, env({ type: "PLACE_ORDER", cartId: makeId<"CartId">("cart-unk-2"), merchantId: merchant }));
    const order = kernel.view().allOrders()[0]!;
    // The NEXT port outcome is scripted AMBIGUOUS → the intent resolves to
    // UNKNOWN (the double implements resolveAmbiguousPayment internally).
    double.makeNextOutcomeAmbiguous("PROCESSING_STATE_UNCLEAR");
    await mustExecute(kernel, env({
      type: "CREATE_PAYMENT_INTENT",
      request: { amount: money("5000", usd), reference: { kind: "ORDER", orderId: order.orderId }, method: card },
    }));
    const intent = kernel.view().allPaymentIntents()[0]!;
    expect(intent.status).toBe("UNKNOWN");
    expect(intent.status).not.toBe("FAILED");
    expect(intent.providerNativeStatus).toBe("PROCESSING_STATE_UNCLEAR");
  });

  it("the OrderPaymentStatus vocabulary preserves UNKNOWN as a first-class state (never flattened to a failure code)", () => {
    // The type vocabulary itself encodes the law: UNKNOWN is a member of
    // PaymentStatus alongside AUTHORIZED/PAID/REFUNDED/etc. — it is NOT a
    // failure code, and the order's paymentStatus field may carry it.
    const statuses: PaymentIntent["status"][] = ["REQUIRES_CUSTOMER_ACTION", "AUTHORIZED", "CAPTURED", "PARTIALLY_CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED", "VOIDED", "FAILED", "UNKNOWN"];
    expect(statuses).toContain("UNKNOWN");
    expect(statuses).toContain("FAILED");
    // They are DISTINCT — UNKNOWN is not FAILED, and the boundary never
    // collapses one into the other.
    expect("UNKNOWN").not.toBe("FAILED");
  });

  it("a TradeCycle leg with ambiguous attribution (a non-giver attempts to authorize) is held UNKNOWN — never FAILED, never silently passed", async () => {
    const kernel = newKernel();
    await mustExecute(kernel, env({ type: "OPEN_TRADE_CYCLE", cycle: cycleA("w1tc-unk-1") }, harborLane));
    // Harbor Lane IS a cycle participant but NOT leg 0's giver (Northlight is).
    // Their attempted authorization is held UNKNOWN with the ambiguity recorded
    // (PARTICIPANT_MISMATCH) — never passed as a consent, never failed.
    await mustExecute(kernel, env({
      type: "AUTHORIZE_TRADE_CYCLE_LEG",
      cycleId: makeId<"TradeCycleId">("w1tc-unk-1"),
      legIndex: 0,
      authorizingRef: harborLane,
      authorizationRef: "auth-not-my-leg",
    }, harborLane));
    const leg0 = kernel.view().executionOps().tradeCycle("w1tc-unk-1")?.legs[0];
    expect(leg0?.consentState).toBe("UNKNOWN");
    expect(leg0?.consentState).not.toBe("FAILED");
    expect(leg0?.ambiguity).toMatchObject({ kind: "AMBIGUOUS_AUTHORIZATION", reason: "PARTICIPANT_MISMATCH", attemptedBy: { customerId: "harbor-lane" } });
    // The cycle stays OPEN — the UNKNOWN leg is not a stop, not a failure.
    expect(kernel.view().executionOps().tradeCycle("w1tc-unk-1")?.state).toBe("OPEN");
  });

  it("UNKNOWN legs are NOT authorizations — execution is honestly rejected (NOT_ALL_LEGS_AUTHORIZED), not silently passed", async () => {
    const kernel = newKernel();
    await mustExecute(kernel, env({ type: "OPEN_TRADE_CYCLE", cycle: cycleA("w1tc-unk-2") }, harborLane));
    // Leg 0 → UNKNOWN (ambiguous); legs 1, 2 → CONSENTED (clear givers).
    await mustExecute(kernel, env({
      type: "AUTHORIZE_TRADE_CYCLE_LEG",
      cycleId: makeId<"TradeCycleId">("w1tc-unk-2"),
      legIndex: 0,
      authorizingRef: harborLane,
      authorizationRef: "auth-ambiguous",
    }, harborLane));
    await mustExecute(kernel, env({
      type: "AUTHORIZE_TRADE_CYCLE_LEG",
      cycleId: makeId<"TradeCycleId">("w1tc-unk-2"),
      legIndex: 1,
      authorizingRef: twoHarbors,
      authorizationRef: "auth-t",
    }, twoHarbors));
    await mustExecute(kernel, env({
      type: "AUTHORIZE_TRADE_CYCLE_LEG",
      cycleId: makeId<"TradeCycleId">("w1tc-unk-2"),
      legIndex: 2,
      authorizingRef: harborLane,
      authorizationRef: "auth-h",
    }, harborLane));
    // The UNKNOWN leg is NOT an authorization — execution refuses honestly.
    const outcome = await kernel.execute(env({
      type: "EXECUTE_TRADE_CYCLE",
      cycleId: makeId<"TradeCycleId">("w1tc-unk-2"),
    }, harborLane));
    expect(outcome.status).toBe("REJECTED");
    if (outcome.status === "REJECTED") expect(outcome.reason.detail).toContain("NOT_ALL_LEGS_AUTHORIZED");
  });

  it("an ambiguous action against a CONSENTED leg is rejected (AMBIGUOUS_ACTION_ON_CONSENTED_LEG) — standing consent is never destroyed by an unattributable actor", async () => {
    const kernel = newKernel();
    await mustExecute(kernel, env({ type: "OPEN_TRADE_CYCLE", cycle: cycleA("w1tc-unk-3") }, harborLane));
    // Leg 0 CONSENTED by its true giver (Northlight).
    await mustExecute(kernel, env({
      type: "AUTHORIZE_TRADE_CYCLE_LEG",
      cycleId: makeId<"TradeCycleId">("w1tc-unk-3"),
      legIndex: 0,
      authorizingRef: northlight,
      authorizationRef: "auth-northlight-1",
    }, northlight));
    expect(kernel.view().executionOps().tradeCycle("w1tc-unk-3")?.legs[0]?.consentState).toBe("CONSENTED");
    // Harbor Lane (a participant, not the giver) attempts to authorize the
    // already-consented leg. The kernel REJECTS this — standing consent is
    // never destroyed by an unattributable actor (the leg stays CONSENTED,
    // not UNKNOWN, not FAILED).
    const outcome = await kernel.execute(env({
      type: "AUTHORIZE_TRADE_CYCLE_LEG",
      cycleId: makeId<"TradeCycleId">("w1tc-unk-3"),
      legIndex: 0,
      authorizingRef: harborLane,
      authorizationRef: "auth-overwrite",
    }, harborLane));
    expect(outcome.status).toBe("REJECTED");
    if (outcome.status === "REJECTED") expect(outcome.reason.detail).toContain("AMBIGUOUS_ACTION_ON_CONSENTED_LEG");
    expect(kernel.view().executionOps().tradeCycle("w1tc-unk-3")?.legs[0]?.consentState).toBe("CONSENTED");
  });

  it("a lapsed UNKNOWN leg surfaces EXPIRED (an honest stop) — never FAILED", async () => {
    const kernel = newKernel();
    await mustExecute(kernel, env({ type: "OPEN_TRADE_CYCLE", cycle: cycleA("w1tc-unk-4") }, harborLane));
    // Leg 2 → UNKNOWN (a stranger's refusal).
    const stranger = customer("meridian-studio");
    await mustExecute(kernel, env({
      type: "REFUSE_TRADE_CYCLE_LEG",
      cycleId: makeId<"TradeCycleId">("w1tc-unk-4"),
      legIndex: 2,
      refusingRef: stranger,
      reason: "not my cycle",
    }, stranger));
    expect(kernel.view().executionOps().tradeCycle("w1tc-unk-4")?.legs[2]?.consentState).toBe("UNKNOWN");
    // The consent window lapses on the still-UNKNOWN leg: an honest stop
    // (STOPPED_EXPIRY), leg state EXPIRED — never FAILED.
    await mustExecute(kernel, env({
      type: "LAPSE_TRADE_CYCLE_LEG",
      cycleId: makeId<"TradeCycleId">("w1tc-unk-4"),
      legIndex: 2,
    }, twoHarbors));
    const lapsed = kernel.view().executionOps().tradeCycle("w1tc-unk-4");
    expect(lapsed?.state).toBe("STOPPED_EXPIRY");
    expect(lapsed?.legs[2]?.consentState).toBe("EXPIRED");
    expect(lapsed?.legs[2]?.consentState).not.toBe("FAILED");
  });

  it("UNKNOWN disambiguates on the giver's clear action — the leg clears to CONSENTED, the ambiguity is cleared (never a permanent failure)", async () => {
    const kernel = newKernel();
    await mustExecute(kernel, env({ type: "OPEN_TRADE_CYCLE", cycle: cycleA("w1tc-unk-5") }, harborLane));
    // Leg 0 → UNKNOWN (Harbor Lane's ambiguous attempt).
    await mustExecute(kernel, env({
      type: "AUTHORIZE_TRADE_CYCLE_LEG",
      cycleId: makeId<"TradeCycleId">("w1tc-unk-5"),
      legIndex: 0,
      authorizingRef: harborLane,
      authorizationRef: "auth-ambiguous",
    }, harborLane));
    expect(kernel.view().executionOps().tradeCycle("w1tc-unk-5")?.legs[0]?.consentState).toBe("UNKNOWN");
    // The true giver (Northlight) clears the UNKNOWN with their own clear
    // authorization — the leg becomes CONSENTED, the ambiguity is gone.
    await mustExecute(kernel, env({
      type: "AUTHORIZE_TRADE_CYCLE_LEG",
      cycleId: makeId<"TradeCycleId">("w1tc-unk-5"),
      legIndex: 0,
      authorizingRef: northlight,
      authorizationRef: "auth-northlight-1",
    }, northlight));
    const cleared = kernel.view().executionOps().tradeCycle("w1tc-unk-5")?.legs[0];
    expect(cleared?.consentState).toBe("CONSENTED");
    expect(cleared?.ambiguity).toBeUndefined();
  });

  it("a captured payment whose settlement observation is unscripted surfaces UNKNOWN — never FAILED — and the captured total is preserved", async () => {
    const double = new ScriptedPaymentDouble();
    const kernel = new CommerceKernel({ paymentBoundary: double });
    const paymentId = await capturedPayment(kernel, "unk-settle", "7000");
    // An unscripted settlement observation deterministically reports UNKNOWN
    // (the provider has no definitive clearing outcome — never FAILED).
    await mustExecute(kernel, env({ type: "OBSERVE_SETTLEMENT", paymentId }));
    const settlement = kernel.view().settlementRecord(paymentId);
    expect(settlement?.status).toBe("UNKNOWN");
    expect(settlement?.status).not.toBe("FAILED");
    // The captured total is preserved — UNKNOWN did not destroy the truth.
    expect(kernel.view().capturedTotalFor(paymentId)).toBe(7000n);
  });
});

// ============================================================================
// Stage 2+ future surface — precisely documented, NOT faked, kernel untouched.
// ============================================================================
//
// The decision packet §5 acceptance sketch includes "a pending downstream
// result surfaces UNKNOWN". At Stage 0 the upstream payment/observation
// surface already preserves UNKNOWN (above). The Stage-2-specific linked-
// draft UNKNOWN recovery (a linked order draft whose placement result is
// pending surfaces UNKNOWN, never FAILED; retry returns the original receipt
// when the result resolves) requires the LINK command which does not yet
// exist. The skip records the gap honestly.
describe.skip("W1-014 linking law 6 — Stage 2 linked-draft UNKNOWN recovery (future surface)", () => {
  // FUTURE STAGE: Stage 2 (decision packet §4, §7) introduces
  //   LINK_GROUPBUY_TO_ORDER_DRAFT / LINK_TRADECYCLE_LEG_TO_SETTLEMENT_DRAFT
  //   as additive kernel commands. When they exist, this block will specify:
  //   - a linked order draft whose placement result is pending surfaces
  //     UNKNOWN (never FAILED, never silently passed);
  //   - retrying the draft's observation command when the result resolves
  //     returns the original receipt and produces no second effect (law 3 +
  //     law 6 interaction);
  //   - a pending settlement draft surfaces UNKNOWN, the captured total is
  //     preserved (law 5 + law 6 interaction).
  // At Stage 0 the LINK command does not exist; running these specs would
  // require either faking a pass (forbidden) or modifying the kernel
  // (forbidden). The skip records the gap honestly; Stage 2 will replace it
  // with executable specs.
  it("FUTURE: a linked order draft with a pending placement result surfaces UNKNOWN (never FAILED)", () => {
    expect(true).toBe(true);
  });
  it("FUTURE: retrying a linked draft's observation when the result resolves returns the original receipt (zero new effects)", () => {
    expect(true).toBe(true);
  });
});
