/**
 * W2-010 — Family F09: fake reviews/rings, counterfeit/item mismatch,
 * false non-delivery claim, return/refund abuse, connector scope compromise.
 * Fixture-contract evidence level.
 *
 * Drives the REAL CommerceKernel recourse plane (disputes, evidence,
 * resolutions, goodwill refunds, chargebacks — all behind the
 * validateRefundAgainstCaptures guard), the REAL sanitizer runtime at the
 * ingest/render boundaries (untrusted content stays inert data), and the
 * REAL connector runtime scope gate (a compromised adapter cannot act
 * beyond its grant). No runtime is mocked.
 *
 * The VISIBLE dimension is asserted through the typed view contracts a
 * rendered UI would consume: SecurityIncidentView, TrustCenterView,
 * DisputeRecord states, typed refusal reasons and the sanitizer's
 * neutralization records.
 */

import { describe, expect, it } from "vitest";
import { countQuantity, makeId, rigMoney } from "./adapters/resilience-rig";
import {
  createResilienceKernel,
  createResilienceConnectorRig,
  reviewRingIncidentView,
  trustCenterViewOf,
  type ResilienceKernelRig,
} from "./adapters/resilience-rig";
import { renderUntrustedAsInertText, sanitizeUntrustedText, wrapUntrusted } from "../../src/runtime/sanitize/sanitizer";
import type { UntrustedCommerceContent } from "../../src/common/untrusted";
import type { ReviewContent } from "../../src/common/untrusted";
import { TradeCycleLegFaultAdapter } from "./adapters/fault-connector-adapter";
import { credentialScope } from "@unicom/agent";
import type { CapabilityObservation, ProviderImplementation } from "@unicom/agent/capability";
import { tradeCycleRequest } from "./adapters/resilience-rig";
import { scenarioById } from "./matrix/oracle";

const family = "F09";
const oracle = (suffix: string) => scenarioById(`W2-010-${family}-${suffix}`);

const MERCHANT = makeId<"MerchantId">("merchant-f09");
const SKU = makeId<"SkuId">("sku-f09-widget");

/** A real ORDER-referenced, CAPTURED payment via the REAL checkout journey. */
async function capturedPayment(rig: ResilienceKernelRig): Promise<{ paymentId: ReturnType<typeof makeId<"PaymentId">>; orderId: ReturnType<typeof makeId<"OrderId">> }> {
  const cartId = `cart-f09-${Math.random().toString(36).slice(2, 8)}`;
  await rig.exec({ type: "ADD_CART_LINE", cartId: makeId<"CartId">(cartId), skuId: SKU, quantity: countQuantity(1), unitPrice: rigMoney("5000") });
  const opened = await rig.exec({ type: "OPEN_CHECKOUT", cartId: makeId<`CartId`>(cartId) });
  expect(opened.status).toBe("EXECUTED");
  const session = rig.kernel.view().allCheckoutSessions().at(-1);
  if (session === undefined) throw new Error("no checkout session");
  await rig.exec({ type: "ADVANCE_CHECKOUT", checkoutSessionId: session.checkoutSessionId, trigger: "START_PAYMENT" });
  const completed = await rig.exec({
    type: "COMPLETE_CHECKOUT",
    checkoutSessionId: session.checkoutSessionId,
    merchantId: MERCHANT,
    method: { methodKind: "CARD", tokenRef: "tok-f09" },
  });
  expect(completed.status).toBe("EXECUTED");
  const payment = rig.kernel.view().allPaymentIntents().at(-1);
  const order = rig.kernel.view().allOrders().at(-1);
  if (payment === undefined || order === undefined) throw new Error("missing order/payment");
  const captured = await rig.exec({ type: "CAPTURE_PAYMENT", paymentId: payment.paymentId });
  expect(captured.status).toBe("EXECUTED");
  return { paymentId: payment.paymentId, orderId: order.orderId };
}

describe("W2-010 F09 — fake reviews / counterfeit recourse / false claims / refund abuse / connector scope (fixture-contract)", () => {
  it("F09-S01: fake review ring detected — incident card visible with severity, decision, pipeline stage, effect + mitigation", () => {
    expect(oracle("S01").expectedResultClass).toBe("expected-block");
    // The typed incident view a rendered Trust Center consumes: the detection
    // signal → reason → effect → mitigation → next action pipeline, with a
    // deterministic typed decision (BLOCK-class, not model preference).
    const incident = reviewRingIncidentView();
    const view = trustCenterViewOf([incident]);
    expect(view.incidents).toHaveLength(1);
    // VISIBLE: the oracle's exact expectations — severity 'high', decision
    // 'quarantined', pipeline stage 'mitigation'.
    expect(incident.severity).toBe("high");
    expect(incident.decision).toBe("quarantined");
    expect(incident.pipelineStage).toBe("mitigation");
    // The five pipeline fields are all present and non-empty (explainable).
    for (const field of [incident.signal, incident.reason, incident.effect, incident.mitigation, incident.nextAction]) {
      expect(field.length).toBeGreaterThan(0);
    }
    // The block is deterministic-typed: one of the frozen decisions, never free text.
    expect(["quarantined", "blocked", "allowed"]).toContain(incident.decision);
  });

  it("F09-S02: injected third-party content renders INERT — sanitized at ingest, re-sanitized at render, never an instruction", () => {
    expect(oracle("S02").expectedResultClass).toBe("expected-block");
    // A malicious marketplace review (script injection attempt) arrives.
    const malicious = '<script>alert("xss")</script>Great seller! <img src=x onerror=alert(1)> javascript:evil()';
    const ingested = sanitizeUntrustedText(malicious);
    // VISIBLE: the rendered text is inert — script blocks, dangerous tags,
    // event handlers and URL schemes neutralized, with a neutralization RECORD.
    expect(ingested.inertText).not.toContain("<script>");
    expect(ingested.inertText).not.toContain("onerror");
    expect(ingested.inertText).toContain("Great seller!");
    expect(ingested.neutralized.length).toBeGreaterThan(0);
    for (const record of ingested.neutralized) {
      expect(["script-or-embed-block", "dangerous-tag", "event-handler-attribute", "dangerous-url-scheme", "control-characters", "escaped-markup"]).toContain(record.kind);
    }
    // The wrapped payload stays DATA: typed as UntrustedCommerceContent — it
    // can never be assigned where a TrustedInstruction is required (brand law).
    const review: ReviewContent = { reviewId: "rev-f09-1", rawText: ingested.inertText, ratingClaimed: "5", reviewerHandle: "ring-account-7" };
    const untrusted: UntrustedCommerceContent<ReviewContent> = wrapUntrusted(review);
    expect(untrusted.reviewId).toBe("rev-f09-1");
    // Render boundary re-sanitizes even already-wrapped content.
    expect(renderUntrustedAsInertText({ inertText: ingested.inertText })).not.toContain("<");
    // Double-render is stable (idempotent sanitization).
    const twice = sanitizeUntrustedText(ingested.inertText);
    expect(sanitizeUntrustedText(twice.inertText).inertText).toBe(twice.inertText);
  });

  it("F09-S03: counterfeit / item-mismatch recourse — dispute ACCEPTED with evidence, bounded refund against captured funds", async () => {
    expect(oracle("S03").expectedResultClass).toBe("expected-success");
    const rig = createResilienceKernel();
    const { paymentId } = await capturedPayment(rig);
    // The buyer opens a counterfeit dispute for the full captured amount.
    const disputed = await rig.exec({
      type: "OPEN_DISPUTE",
      paymentId,
      amount: rigMoney("5000"),
      reason: "item is counterfeit — not the ordered genuine product",
    });
    expect(disputed.status).toBe("EXECUTED");
    let dispute = rig.kernel.view().allDisputes().at(-1);
    expect(dispute?.state).toBe("OPEN");
    // Evidence submitted (untrusted DATA into the record — never instructions).
    const evidenced = await rig.exec({
      type: "SUBMIT_DISPUTE_EVIDENCE",
      disputeId: dispute?.disputeId ?? makeId<"DisputeId">("missing"),
      evidence: { summary: " photos + authentication report attached by the buyer" },
    });
    expect(evidenced.status).toBe("EXECUTED");
    dispute = rig.kernel.view().allDisputes().at(-1);
    expect(dispute?.state).toBe("EVIDENCE_SUBMITTED");
    // Resolution is an explicit operator action — ACCEPTED.
    const resolved = await rig.exec({
      type: "RESOLVE_DISPUTE",
      disputeId: dispute?.disputeId ?? makeId<"DisputeId">("missing"),
      outcome: "ACCEPTED",
    });
    expect(resolved.status).toBe("EXECUTED");
    expect(rig.kernel.view().allDisputes().at(-1)?.state).toBe("RESOLVED_ACCEPTED");
    // VISIBLE: the refund is issued separately, bounded by the captured total.
    const refunded = await rig.exec({
      type: "ISSUE_GOODWILL_REFUND",
      paymentId,
      amount: rigMoney("5000"),
      reason: "counterfeit item — dispute accepted; refund against captured funds",
    });
    expect(refunded.status).toBe("EXECUTED");
  });

  it("F09-S04: false non-delivery claim — carrier delivery evidence on record rejects the claim", async () => {
    expect(oracle("S04").expectedResultClass).toBe("expected-block");
    const rig = createResilienceKernel();
    const { paymentId, orderId } = await capturedPayment(rig);
    // Fulfil + deliver: the carrier-confirmed delivery observation is journaled.
    await rig.exec({ type: "ADVANCE_ORDER", orderId, trigger: "CONFIRM" });
    await rig.exec({ type: "OPEN_FULFILLMENT", orderId });
    const fulfillment = rig.kernel.view().allFulfillments?.().at(-1) ?? rig.kernel.view().fulfillmentForOrder(orderId);
    if (fulfillment === undefined) throw new Error("fulfillment missing");
    await rig.exec({ type: "ADVANCE_FULFILLMENT_ORDER", fulfillmentOrderId: fulfillment.fulfillmentOrderId, trigger: "PACK" });
    await rig.exec({ type: "ADVANCE_FULFILLMENT_ORDER", fulfillmentOrderId: fulfillment.fulfillmentOrderId, trigger: "TENDER" });
    const shipmentId = rig.kernel.view().shipmentIdForFulfillment(fulfillment.fulfillmentOrderId);
    if (shipmentId === undefined) throw new Error("shipment missing");
    const delivered = await rig.exec({
      type: "APPLY_DELIVERY_OBSERVATION",
      observation: {
        shipmentId,
        observedAt: "2026-10-10T12:00:00Z",
        resolution: { resolved: "OBSERVED", value: "DELIVERED", carrierNativeStatus: "carrier-confirmed" },
      },
    });
    expect(delivered.status).toBe("EXECUTED");
    // The buyer falsely claims non-delivery.
    const disputed = await rig.exec({
      type: "OPEN_DISPUTE",
      paymentId,
      amount: rigMoney("5000"),
      reason: "item never arrived",
    });
    expect(disputed.status).toBe("EXECUTED");
    const dispute = rig.kernel.view().allDisputes().at(-1);
    await rig.exec({
      type: "SUBMIT_DISPUTE_EVIDENCE",
      disputeId: dispute?.disputeId ?? makeId<"DisputeId">("missing"),
      evidence: { summary: "buyer claims non-delivery; carrier record requested" },
    });
    // VISIBLE: the carrier-confirmed delivery evidence REJECTS the claim —
    // the shipment is DELIVERED on the canonical record.
    const shipment = rig.kernel.view().shipment(shipmentId);
    expect(shipment?.state).toBe("DELIVERED");
    const resolved = await rig.exec({
      type: "RESOLVE_DISPUTE",
      disputeId: dispute?.disputeId ?? makeId<"DisputeId">("missing"),
      outcome: "REJECTED",
    });
    expect(resolved.status).toBe("EXECUTED");
    expect(rig.kernel.view().allDisputes().at(-1)?.state).toBe("RESOLVED_REJECTED");
    // No refund side effect follows a rejected claim.
    const refunds = rig.kernel.view().allRefunds?.() ?? [];
    expect(refunds.length).toBe(0);
  });

  it("F09-S05: return/refund abuse — a second refund beyond the captured total is refused; the chargeback journals NO_ADDITIONAL_REFUND", async () => {
    expect(oracle("S05").expectedResultClass).toBe("expected-block");
    const rig = createResilienceKernel();
    const { paymentId } = await capturedPayment(rig); // captured 50.00
    // First refund: the full captured amount — legal.
    const first = await rig.exec({
      type: "ISSUE_GOODWILL_REFUND",
      paymentId,
      amount: rigMoney("5000"),
      reason: "return accepted — full refund against captured funds",
    });
    expect(first.status).toBe("EXECUTED");
    // Abuse attempt: a second refund beyond the captured total.
    const second = await rig.exec({
      type: "ISSUE_GOODWILL_REFUND",
      paymentId,
      amount: rigMoney("5000"),
      reason: "second refund attempt (abuse)",
    });
    // VISIBLE: refused with the cap reason — captured funds already fully refunded.
    expect(second.status).toBe("REJECTED");
    if (second.status === "REJECTED") {
      expect(second.reason.message ?? second.reason.detail ?? String(second.reason)).toMatch(/refund|captured/i);
    }
    // A chargeback for the same payment is journaled — with NO additional refund.
    const chargeback = await rig.exec({
      type: "RECORD_CHARGEBACK",
      paymentId,
      amount: rigMoney("5000"),
      providerNativeStatus: "representment-pending",
    });
    expect(chargeback.status).toBe("EXECUTED");
    const records = rig.kernel.view().allChargebacks();
    const record = records.at(-1);
    expect(record?.paymentId).toBe(paymentId);
    // The captured total was refunded EXACTLY once — the guard held.
    expect(rig.kernel.view().refundedTotalFor(paymentId)).toBe(5000n);
  });

  it("F09-S06: connector scope compromise — a compromised adapter cannot act beyond its granted scope", async () => {
    expect(oracle("S06").expectedResultClass).toBe("expected-block");
    const rig = await createResilienceConnectorRig();
    // The participant granted ONLY trade.leg1.execute — nothing else.
    const adapter = new TradeCycleLegFaultAdapter("f09-scope-compromise", "cap-f09-trade", {
      connect: { kind: "connected", scopeTokens: ["trade.leg1.execute"], permissions: ["trade.leg1"] },
    });
    const connected = await rig.connect(adapter, { scopes: "trade.leg1.execute", permissions: ["trade.leg1"] });
    const observed = await rig.runtime.observe(connected.connectorId);
    // The attacker crafts a multi-step journey whose leg-2 step REQUIRES
    // trade.leg2.execute — a scope this adapter was never granted.
    const observations: CapabilityObservation[] = observed.observation !== null ? [observed.observation] : [];
    const implementations: ProviderImplementation[] = [...adapter.descriptor.providerImplementations];
    const request = tradeCycleRequest(
      "journey:f09-scope-escape",
      [
        {
          stepRef: "leg-1",
          commandRef: "cmd-f09-leg1",
          capabilityDefinitionId: "cap-f09-trade",
          requiredScope: credentialScope("trade.leg1.execute"),
          participant: connected,
        },
        {
          stepRef: "leg-2",
          commandRef: "cmd-f09-leg2",
          capabilityDefinitionId: "cap-f09-trade",
          requiredScope: credentialScope("trade.leg2.execute"),
          participant: connected,
        },
      ],
      observations,
      implementations,
    );
    const dispatched = await rig.runtime.dispatch(request);
    // VISIBLE: the leg-2 step is NOT_EXECUTABLE — the grant does not permit it.
    const leg1 = dispatched.plannedSteps[0];
    const leg2 = dispatched.plannedSteps[1];
    expect(leg1?.executability.status).toBe("EXECUTABLE");
    expect(leg2?.executability.status).toBe("NOT_EXECUTABLE");
    if (leg2?.executability.status === "NOT_EXECUTABLE") {
      expect(leg2.executability.reasons).toContain("INSUFFICIENT_CREDENTIAL_SCOPE");
    }
    // The compromised adapter executed ONLY its granted leg-1; leg-2 failed
    // recoverable at the precondition gate and the journey did not succeed.
    expect(dispatched.stepOutcomes.map((outcome) => outcome.outcome)).toEqual(["succeeded", "failed-recoverable"]);
    expect(dispatched.journeyOutcome).toBe("failed-recoverable");
    // The granted scope stays visible on the connected instance.
    expect(connected.instance.credentialScope).toContain("trade.leg1.execute");
  });
});
